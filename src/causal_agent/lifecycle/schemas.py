from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from enum import Enum
from types import MappingProxyType
from typing import Any, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_serializer,
    field_validator,
    model_serializer,
    model_validator,
)


def _canonical_payload_hash(payload: object) -> str:
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _freeze_json(value: Any) -> Any:
    if isinstance(value, Mapping):
        return MappingProxyType({str(key): _freeze_json(item) for key, item in value.items()})
    if isinstance(value, (list, tuple)):
        return tuple(_freeze_json(item) for item in value)
    return value


def _thaw_json(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {str(key): _thaw_json(item) for key, item in value.items()}
    if isinstance(value, tuple):
        return [_thaw_json(item) for item in value]
    return value


class StrictModel(BaseModel):
    """Base model for lifecycle boundaries.

    Lifecycle payloads deliberately reject unknown fields. Silent field dropping is
    especially dangerous for a pre-analysis plan because it can make the persisted
    design differ from the design a user believed they approved.
    """

    model_config = ConfigDict(extra="forbid", allow_inf_nan=False, str_strip_whitespace=True)


class FrozenStrictModel(StrictModel):
    model_config = ConfigDict(
        extra="forbid", allow_inf_nan=False, str_strip_whitespace=True, frozen=True
    )


class StudyDesignType(str, Enum):
    RANDOMIZED_AB = "randomized_ab"
    DIFFERENCE_IN_DIFFERENCES = "difference_in_differences"


class MetricKind(str, Enum):
    BINARY = "binary"
    CONTINUOUS = "continuous"


class MetricDirection(str, Enum):
    HIGHER_IS_BETTER = "higher_is_better"
    LOWER_IS_BETTER = "lower_is_better"


class Estimand(str, Enum):
    ATE = "ate"
    ATT = "att"


class DiagnosticStatus(str, Enum):
    PASS = "pass"
    WARN = "warn"
    FAIL = "fail"


class DecisionStatus(str, Enum):
    GO = "go"
    HOLD = "hold"
    STOP = "stop"
    INSUFFICIENT_EVIDENCE = "insufficient_evidence"


TimeValue = int | float | str


class MetricSpec(FrozenStrictModel):
    """A metric and its pre-committed business thresholds.

    ``minimum_effect`` is a non-negative magnitude in the beneficial direction.
    ``harm_tolerance`` is a non-negative magnitude in the harmful direction. The
    primary metric uses the former for GO; guardrails use the latter for safety.
    """

    name: str = Field(min_length=1)
    kind: MetricKind
    direction: MetricDirection = MetricDirection.HIGHER_IS_BETTER
    minimum_effect: float = Field(default=0.0, ge=0.0)
    harm_tolerance: float = Field(default=0.0, ge=0.0)


class StudyDesignRequest(StrictModel):
    title: str = Field(min_length=1)
    business_question: str = Field(min_length=1)
    hypothesis: str = Field(min_length=1)
    design_type: StudyDesignType
    population: str = Field(min_length=1)
    unit: str = Field(min_length=1)
    intervention: str = Field(min_length=1)
    comparator: str = Field(min_length=1)
    primary_metric: MetricSpec
    guardrails: tuple[MetricSpec, ...] = ()
    estimand: Estimand = Estimand.ATE
    retrospective: bool = False
    notes: str = ""
    observation_window_days: int = Field(ge=1)
    expected_daily_units: int | None = Field(default=None, ge=1)

    control_group: str = Field(default="control", min_length=1)
    treatment_group: str = Field(default="treatment", min_length=1)
    expected_control_allocation: float = Field(default=0.5, gt=0.0, lt=1.0)
    expected_treatment_allocation: float = Field(default=0.5, gt=0.0, lt=1.0)
    baseline_value: float | None = None
    outcome_standard_deviation: float | None = Field(default=None, gt=0.0)
    alpha: float = Field(default=0.05, gt=0.0, lt=1.0)
    power: float = Field(default=0.8, gt=0.0, lt=1.0)
    cuped_covariate: str | None = Field(default=None, min_length=1)
    cuped_expected_correlation: float | None = Field(default=None, ge=0.0, lt=1.0)

    treatment_start: TimeValue | None = None
    minimum_pre_periods: int = Field(default=3, ge=2)

    @model_validator(mode="after")
    def validate_design_inputs(self) -> StudyDesignRequest:
        metric_names = [self.primary_metric.name, *(metric.name for metric in self.guardrails)]
        if len(metric_names) != len(set(metric_names)):
            raise ValueError("primary and guardrail metric names must be unique")
        if self.primary_metric.harm_tolerance != 0.0:
            raise ValueError(
                "primary_metric.harm_tolerance is not used; define primary harm through a guardrail"
            )
        guardrails_with_primary_thresholds = [
            metric.name for metric in self.guardrails if metric.minimum_effect != 0.0
        ]
        if guardrails_with_primary_thresholds:
            raise ValueError(
                "guardrail minimum_effect is not used; use harm_tolerance for: "
                + ", ".join(guardrails_with_primary_thresholds)
            )
        if self.control_group == self.treatment_group:
            raise ValueError("control_group and treatment_group must be different")

        if self.design_type == StudyDesignType.RANDOMIZED_AB:
            if self.estimand != Estimand.ATE:
                raise ValueError("randomized_ab currently estimates only the ATE")
            allocation = self.expected_control_allocation + self.expected_treatment_allocation
            if abs(allocation - 1.0) > 1e-9:
                raise ValueError("expected control and treatment allocations must sum to 1")
            if self.baseline_value is None:
                raise ValueError("baseline_value is required for randomized_ab planning")
            if self.expected_daily_units is None:
                raise ValueError("expected_daily_units is required for randomized_ab planning")
            if self.primary_metric.minimum_effect <= 0:
                raise ValueError(
                    "primary_metric.minimum_effect must be positive for power planning"
                )
            if self.primary_metric.kind == MetricKind.BINARY:
                if not 0.0 < self.baseline_value < 1.0:
                    raise ValueError("binary baseline_value must be strictly between 0 and 1")
                signed_effect = (
                    self.primary_metric.minimum_effect
                    if self.primary_metric.direction == MetricDirection.HIGHER_IS_BETTER
                    else -self.primary_metric.minimum_effect
                )
                treatment_rate = self.baseline_value + signed_effect
                if not 0.0 < treatment_rate < 1.0:
                    raise ValueError("binary baseline plus the planned effect must be in (0, 1)")
            elif self.outcome_standard_deviation is None:
                raise ValueError(
                    "outcome_standard_deviation is required for a continuous randomized_ab metric"
                )
            if self.treatment_start is not None:
                raise ValueError("treatment_start is only valid for difference_in_differences")
        else:
            if self.estimand != Estimand.ATT:
                raise ValueError("difference_in_differences currently estimates only the ATT")
            rct_only_fields = {
                "baseline_value",
                "outcome_standard_deviation",
                "expected_daily_units",
                "expected_control_allocation",
                "expected_treatment_allocation",
                "cuped_covariate",
                "cuped_expected_correlation",
            }
            supplied_rct_fields = sorted(rct_only_fields & self.model_fields_set)
            if supplied_rct_fields:
                raise ValueError(
                    "RCT-only fields are not valid for difference_in_differences: "
                    + ", ".join(supplied_rct_fields)
                )
            if self.treatment_start is None:
                raise ValueError("treatment_start is required for difference_in_differences")

        if self.cuped_expected_correlation is not None and self.cuped_covariate is None:
            raise ValueError("cuped_covariate is required when a CUPED correlation is supplied")
        return self

    @model_serializer(mode="wrap")
    def serialize_design_request(self, handler: Any) -> dict[str, Any]:
        """Omit inapplicable defaults so a valid DiD request round-trips cleanly."""

        data = handler(self)
        if self.design_type == StudyDesignType.DIFFERENCE_IN_DIFFERENCES:
            for field in (
                "baseline_value",
                "outcome_standard_deviation",
                "expected_daily_units",
                "expected_control_allocation",
                "expected_treatment_allocation",
                "cuped_covariate",
                "cuped_expected_correlation",
            ):
                data.pop(field, None)
        return data


class AllocationSpec(FrozenStrictModel):
    label: str
    fraction: float = Field(gt=0.0, lt=1.0)
    required_n: int | None = Field(default=None, ge=2)


class DecisionPolicy(FrozenStrictModel):
    alpha: float = Field(gt=0.0, lt=1.0)
    primary_metric: MetricSpec
    guardrails: tuple[MetricSpec, ...] = ()
    require_all_diagnostics: bool = True


class CausalContract(FrozenStrictModel):
    title: str
    business_question: str
    hypothesis: str
    population: str
    intervention: str
    comparator: str
    unit: str
    estimand: Estimand
    assignment_mechanism: StudyDesignType
    primary_metric: MetricSpec
    guardrails: tuple[MetricSpec, ...] = ()
    retrospective: bool = False
    notes: str = ""
    observation_window_days: int = Field(ge=1)


class DesignSpec(FrozenStrictModel):
    version: str = "1.0"
    is_frozen: Literal[True] = True
    design_type: StudyDesignType
    alpha: float
    power: float
    confidence_level: float
    allocations: tuple[AllocationSpec, ...]
    required_total_sample_size: int | None = Field(default=None, ge=4)
    expected_daily_units: int | None = Field(default=None, ge=1)
    estimated_duration_days: int | None = Field(default=None, ge=1)
    cuped_covariate: str | None = None
    cuped_expected_correlation: float | None = None
    treatment_start: TimeValue | None = None
    minimum_pre_periods: int = Field(default=3, ge=2)
    srm_alpha: float = Field(default=0.001, gt=0.0, lt=1.0)
    pretrend_alpha: float = Field(default=0.05, gt=0.0, lt=1.0)
    minimum_group_size: int = Field(default=20, ge=2)
    fixed_random_seed: int = 20250802
    analysis_steps: tuple[str, ...]
    decision_policy: DecisionPolicy
    spec_hash: str = Field(pattern=r"^[0-9a-f]{64}$")

    @model_validator(mode="after")
    def verify_frozen_hash_and_invariants(self) -> DesignSpec:
        expected_hash = _canonical_payload_hash(self.model_dump(mode="json", exclude={"spec_hash"}))
        if self.spec_hash != expected_hash:
            raise ValueError("spec_hash does not match the frozen DesignSpec payload")
        if not abs(self.confidence_level - (1.0 - self.alpha)) < 1e-12:
            raise ValueError("confidence_level must equal 1 - alpha")
        if self.decision_policy.alpha != self.alpha:
            raise ValueError("decision policy alpha must match DesignSpec alpha")
        if len(self.allocations) != 2:
            raise ValueError("exactly two control/treatment allocations are required")
        if len({allocation.label for allocation in self.allocations}) != 2:
            raise ValueError("allocation labels must be unique")
        if abs(sum(allocation.fraction for allocation in self.allocations) - 1.0) > 1e-9:
            raise ValueError("allocation fractions must sum to 1")
        if self.design_type == StudyDesignType.RANDOMIZED_AB:
            if (
                self.required_total_sample_size is None
                or self.expected_daily_units is None
                or self.estimated_duration_days is None
            ):
                raise ValueError("RCT designs require sample size, daily units, and duration")
        elif (
            self.required_total_sample_size is not None or self.estimated_duration_days is not None
        ):
            raise ValueError("DiD designs do not use RCT sample-size or duration fields")
        return self


class DataFieldSpec(FrozenStrictModel):
    logical_name: str
    role: Literal["unit", "treatment", "time", "metric", "covariate"]
    dtype: Literal["identifier", "binary_group", "time", "binary", "numeric"]
    required: bool = True
    nullable: bool = False
    allowed_values: tuple[str, ...] = ()
    description: str = ""


class DataContract(FrozenStrictModel):
    expected_grain: str
    fields: tuple[DataFieldSpec, ...]
    reject_duplicate_grain: bool = True
    reject_missing_required_values: bool = True


class TraceEvent(FrozenStrictModel):
    sequence: int = Field(ge=1)
    stage: str
    action: str
    message: str
    details: Mapping[str, Any] = Field(default_factory=dict)

    @field_validator("details", mode="after")
    @classmethod
    def freeze_details(cls, value: Mapping[str, Any]) -> Mapping[str, Any]:
        return _freeze_json(value)

    @field_serializer("details")
    def serialize_details(self, value: Mapping[str, Any]) -> dict[str, Any]:
        return _thaw_json(value)


class StudyDesignArtifact(FrozenStrictModel):
    study_id: str = Field(pattern=r"^study_[0-9a-f]{16}$")
    contract: CausalContract
    design: DesignSpec
    data_contract: DataContract
    trace: tuple[TraceEvent, ...]

    @model_validator(mode="after")
    def verify_cross_object_invariants(self) -> StudyDesignArtifact:
        if self.contract.assignment_mechanism != self.design.design_type:
            raise ValueError("contract assignment mechanism must match DesignSpec type")
        policy = self.design.decision_policy
        if policy.primary_metric != self.contract.primary_metric:
            raise ValueError("contract primary metric must match the frozen decision policy")
        if policy.guardrails != self.contract.guardrails:
            raise ValueError("contract guardrails must match the frozen decision policy")
        treatment_fields = [
            field for field in self.data_contract.fields if field.role == "treatment"
        ]
        expected_labels = tuple(allocation.label for allocation in self.design.allocations)
        if len(treatment_fields) != 1 or treatment_fields[0].allowed_values != expected_labels:
            raise ValueError("data-contract treatment labels must match DesignSpec allocations")
        return self


class ColumnMapping(StrictModel):
    unit_col: str = Field(min_length=1)
    treatment_col: str = Field(min_length=1)
    metric_cols: dict[str, str]
    time_col: str | None = None
    covariate_cols: dict[str, str] = Field(default_factory=dict)
    dimension_cols: tuple[str, ...] = Field(default=(), max_length=6)

    @field_validator("dimension_cols")
    @classmethod
    def validate_dimension_columns(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        if len(set(value)) != len(value):
            raise ValueError("dimension_cols must be unique")
        return value


CleaningOperationType = Literal[
    "trim_string_values",
    "drop_exact_duplicates",
    "drop_missing_required",
    "drop_invalid_metric_values",
    "fill_missing_dimensions",
]


class CleaningOperationRequest(StrictModel):
    operation: CleaningOperationType
    columns: tuple[str, ...] = ()


class CleaningPlanExecution(StrictModel):
    source_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    operations: tuple[CleaningOperationRequest, ...] = ()


class TransformationLogEntry(FrozenStrictModel):
    sequence: int = Field(ge=1)
    operation: str = Field(min_length=1)
    columns: tuple[str, ...] = ()
    rows_before: int = Field(ge=0)
    rows_after: int = Field(ge=0)
    persisted: bool = True
    details: Mapping[str, Any] = Field(default_factory=dict)

    @field_validator("details", mode="after")
    @classmethod
    def freeze_details(cls, value: Mapping[str, Any]) -> Mapping[str, Any]:
        return _freeze_json(value)

    @field_serializer("details")
    def serialize_details(self, value: Mapping[str, Any]) -> dict[str, Any]:
        return _thaw_json(value)


class AnalysisOptions(StrictModel):
    transformation_log: tuple[TransformationLogEntry, ...] = ()
    cleaning_plan: CleaningPlanExecution | None = None

    @model_validator(mode="after")
    def validate_log_sequence(self) -> AnalysisOptions:
        expected = tuple(range(1, len(self.transformation_log) + 1))
        actual = tuple(entry.sequence for entry in self.transformation_log)
        if actual != expected:
            raise ValueError("transformation_log sequence must start at 1 and be contiguous")
        for previous, current in zip(
            self.transformation_log, self.transformation_log[1:], strict=False
        ):
            if previous.rows_after != current.rows_before:
                raise ValueError(
                    "each transformation rows_before must match the previous rows_after"
                )
        return self


class DatasetSnapshot(FrozenStrictModel):
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    row_count: int = Field(ge=0)
    column_count: int = Field(ge=0)
    transformations: tuple[TransformationLogEntry, ...] = ()


class Diagnostic(FrozenStrictModel):
    code: str
    status: DiagnosticStatus
    message: str
    details: Mapping[str, Any] = Field(default_factory=dict)

    @field_validator("details", mode="after")
    @classmethod
    def freeze_details(cls, value: Mapping[str, Any]) -> Mapping[str, Any]:
        return _freeze_json(value)

    @field_serializer("details")
    def serialize_details(self, value: Mapping[str, Any]) -> dict[str, Any]:
        return _thaw_json(value)


class MetricEstimate(FrozenStrictModel):
    metric_name: str
    metric_kind: MetricKind
    method: str
    effect: float
    standard_error: float
    ci_lower: float
    ci_upper: float
    p_value: float
    control_mean: float
    treatment_mean: float
    relative_lift: float | None = None
    n_control: int
    n_treatment: int
    cuped_applied: bool = False
    details: Mapping[str, Any] = Field(default_factory=dict)

    @field_validator("details", mode="after")
    @classmethod
    def freeze_details(cls, value: Mapping[str, Any]) -> Mapping[str, Any]:
        return _freeze_json(value)

    @field_serializer("details")
    def serialize_details(self, value: Mapping[str, Any]) -> dict[str, Any]:
        return _thaw_json(value)


class EventStudyPoint(FrozenStrictModel):
    time_value: TimeValue
    relative_period: int
    is_reference: bool = False
    effect: float
    standard_error: float | None = None
    ci_lower: float | None = None
    ci_upper: float | None = None
    p_value: float | None = None


class ConsistencyTest(FrozenStrictModel):
    method: Literal["cochran_q_heterogeneity"] = "cochran_q_heterogeneity"
    statistic: float
    degrees_freedom: int = Field(ge=1)
    p_value: float
    alpha: float = Field(gt=0.0, lt=1.0)
    consistent: bool
    interpretation: str


class SubgroupEstimate(FrozenStrictModel):
    dimension: str
    level: str
    estimate: MetricEstimate
    adjusted_p_value: float
    significant: bool
    direction: Literal["favorable", "harmful", "neutral"]
    recommendation: str


class DimensionAnalysis(FrozenStrictModel):
    dimension: str
    consistency: ConsistencyTest | None = None
    subgroups: tuple[SubgroupEstimate, ...] = ()
    skipped_reason: str | None = None


class DecisionOutcome(FrozenStrictModel):
    status: DecisionStatus
    summary: str
    rationale: tuple[str, ...]
    blocking_diagnostics: tuple[str, ...] = ()


class StudyAnalysisResult(FrozenStrictModel):
    study_id: str
    design_type: StudyDesignType
    dataset: DatasetSnapshot
    diagnostics: tuple[Diagnostic, ...]
    primary_estimate: MetricEstimate | None = None
    guardrail_estimates: tuple[MetricEstimate, ...] = ()
    event_study: tuple[EventStudyPoint, ...] = ()
    dimension_analyses: tuple[DimensionAnalysis, ...] = ()
    decision: DecisionOutcome
    trace: tuple[TraceEvent, ...]
