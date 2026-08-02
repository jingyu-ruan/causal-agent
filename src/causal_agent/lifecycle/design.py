from __future__ import annotations

import math

from scipy import stats

from .schemas import (
    AllocationSpec,
    CausalContract,
    DataContract,
    DataFieldSpec,
    DecisionPolicy,
    DesignSpec,
    MetricDirection,
    MetricKind,
    StudyDesignArtifact,
    StudyDesignRequest,
    StudyDesignType,
    TraceEvent,
    _canonical_payload_hash,
)


def _required_rct_sample_size(request: StudyDesignRequest) -> tuple[int, int, int]:
    """Return deterministic normal-approximation sample sizes for unequal allocation."""

    control_fraction = request.expected_control_allocation
    treatment_fraction = request.expected_treatment_allocation
    delta = request.primary_metric.minimum_effect
    z_alpha = float(stats.norm.ppf(1.0 - request.alpha / 2.0))
    z_power = float(stats.norm.ppf(request.power))

    if request.primary_metric.kind == MetricKind.BINARY:
        control_mean = float(request.baseline_value)
        signed_delta = (
            delta
            if request.primary_metric.direction == MetricDirection.HIGHER_IS_BETTER
            else -delta
        )
        treatment_mean = control_mean + signed_delta
        variance_control = control_mean * (1.0 - control_mean)
        variance_treatment = treatment_mean * (1.0 - treatment_mean)
    else:
        variance_control = float(request.outcome_standard_deviation) ** 2
        variance_treatment = variance_control

    variance_multiplier = 1.0
    if request.cuped_covariate is not None and request.cuped_expected_correlation is not None:
        variance_multiplier = 1.0 - request.cuped_expected_correlation**2

    total_float = (
        (z_alpha + z_power) ** 2
        * (variance_control / control_fraction + variance_treatment / treatment_fraction)
        * variance_multiplier
        / delta**2
    )
    total = max(4, math.ceil(total_float))
    control_n = max(2, math.ceil(total * control_fraction))
    treatment_n = max(2, math.ceil(total * treatment_fraction))
    return control_n + treatment_n, control_n, treatment_n


def _build_data_contract(request: StudyDesignRequest) -> DataContract:
    fields: list[DataFieldSpec] = [
        DataFieldSpec(
            logical_name=request.unit,
            role="unit",
            dtype="identifier",
            description="Stable analysis-unit identifier.",
        ),
        DataFieldSpec(
            logical_name="treatment",
            role="treatment",
            dtype="binary_group",
            allowed_values=(request.control_group, request.treatment_group),
            description="Pre-assigned treatment group; never impute or rewrite this field.",
        ),
    ]
    if request.design_type == StudyDesignType.DIFFERENCE_IN_DIFFERENCES:
        fields.append(
            DataFieldSpec(
                logical_name="time",
                role="time",
                dtype="time",
                description="Observation period for a unit-by-time panel.",
            )
        )
    for metric in (request.primary_metric, *request.guardrails):
        fields.append(
            DataFieldSpec(
                logical_name=metric.name,
                role="metric",
                dtype="binary" if metric.kind == MetricKind.BINARY else "numeric",
                allowed_values=("0", "1") if metric.kind == MetricKind.BINARY else (),
                description="Pre-specified outcome metric.",
            )
        )
    if request.cuped_covariate is not None:
        fields.append(
            DataFieldSpec(
                logical_name=request.cuped_covariate,
                role="covariate",
                dtype="numeric",
                description="Pre-treatment CUPED covariate; outcome-derived values are forbidden.",
            )
        )
    grain = (
        f"one row per {request.unit}"
        if request.design_type == StudyDesignType.RANDOMIZED_AB
        else f"one row per {request.unit} x time period"
    )
    return DataContract(expected_grain=grain, fields=tuple(fields))


def create_study_design(request: StudyDesignRequest) -> StudyDesignArtifact:
    """Compile a validated request into a persisted, frozen analysis contract."""

    contract = CausalContract(
        title=request.title,
        business_question=request.business_question,
        hypothesis=request.hypothesis,
        population=request.population,
        intervention=request.intervention,
        comparator=request.comparator,
        unit=request.unit,
        estimand=request.estimand,
        assignment_mechanism=request.design_type,
        primary_metric=request.primary_metric,
        guardrails=request.guardrails,
        retrospective=request.retrospective,
        notes=request.notes,
        observation_window_days=request.observation_window_days,
    )
    decision_policy = DecisionPolicy(
        alpha=request.alpha,
        primary_metric=request.primary_metric,
        guardrails=request.guardrails,
    )

    required_total: int | None = None
    estimated_duration_days: int | None = None
    allocations: tuple[AllocationSpec, ...]
    if request.design_type == StudyDesignType.RANDOMIZED_AB:
        required_total, control_n, treatment_n = _required_rct_sample_size(request)
        estimated_duration_days = math.ceil(required_total / request.expected_daily_units)
        allocations = (
            AllocationSpec(
                label=request.control_group,
                fraction=request.expected_control_allocation,
                required_n=control_n,
            ),
            AllocationSpec(
                label=request.treatment_group,
                fraction=request.expected_treatment_allocation,
                required_n=treatment_n,
            ),
        )
        analysis_steps = (
            "validate_unit_grain_and_required_values",
            "check_expected_allocation_srm",
            "apply_prespecified_cuped_if_configured",
            "estimate_primary_and_guardrail_effects",
            "apply_frozen_decision_policy",
        )
    else:
        allocations = (
            AllocationSpec(label=request.control_group, fraction=0.5),
            AllocationSpec(label=request.treatment_group, fraction=0.5),
        )
        analysis_steps = (
            "validate_unit_time_panel_and_required_values",
            "validate_treatment_stability_and_panel_support",
            "run_event_study_and_parallel_trend_gate",
            "estimate_two_way_fixed_effects_with_unit_clustered_se",
            "apply_frozen_decision_policy",
        )

    design_payload = {
        "version": "1.0",
        "is_frozen": True,
        "design_type": request.design_type.value,
        "alpha": request.alpha,
        "power": request.power,
        "confidence_level": 1.0 - request.alpha,
        "allocations": [allocation.model_dump(mode="json") for allocation in allocations],
        "required_total_sample_size": required_total,
        "expected_daily_units": request.expected_daily_units,
        "estimated_duration_days": estimated_duration_days,
        "cuped_covariate": request.cuped_covariate,
        "cuped_expected_correlation": request.cuped_expected_correlation,
        "treatment_start": request.treatment_start,
        "minimum_pre_periods": request.minimum_pre_periods,
        "srm_alpha": 0.001,
        "pretrend_alpha": request.alpha,
        "minimum_group_size": 20,
        "fixed_random_seed": 20250802,
        "analysis_steps": list(analysis_steps),
        "decision_policy": decision_policy.model_dump(mode="json"),
    }
    spec_hash = _canonical_payload_hash(design_payload)
    design = DesignSpec(**design_payload, spec_hash=spec_hash)
    data_contract = _build_data_contract(request)

    request_hash = _canonical_payload_hash(request.model_dump(mode="json"))
    study_id = f"study_{request_hash[:16]}"
    trace = (
        TraceEvent(
            sequence=1,
            stage="intake",
            action="validate_request",
            message="Validated the structured business question and design-specific inputs.",
        ),
        TraceEvent(
            sequence=2,
            stage="contract",
            action="create_causal_contract",
            message="Created the estimand, metric, guardrail, and assignment contract.",
        ),
        TraceEvent(
            sequence=3,
            stage="design",
            action="freeze_design_spec",
            message="Computed and froze the pre-analysis design.",
            details={"spec_hash": spec_hash, "version": design.version},
        ),
        TraceEvent(
            sequence=4,
            stage="data_contract",
            action="declare_expected_schema",
            message="Declared required roles, grain, types, and allowed values.",
        ),
    )
    return StudyDesignArtifact(
        study_id=study_id,
        contract=contract,
        design=design,
        data_contract=data_contract,
        trace=trace,
    )
