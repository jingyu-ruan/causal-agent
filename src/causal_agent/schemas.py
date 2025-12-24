from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

class ExperimentInputs(BaseModel):
    goal: str = Field(..., min_length=5)
    baseline_rate: float = Field(..., gt=0.0, lt=1.0)
    mde_abs: float = Field(..., gt=0.0, lt=1.0)
    alpha: float = Field(..., gt=0.0, lt=0.5)
    target_power: float = Field(..., gt=0.0, lt=1.0)

    traffic_per_day: int = Field(..., ge=0)
    allocation_treatment: float = Field(..., gt=0.0, lt=1.0)
    allocation_control: float = Field(..., gt=0.0, lt=1.0)

    randomization_unit: str
    primary_metric: str = Field(..., min_length=1)
    metric_window_days: int = Field(..., ge=1, le=60)

    guardrails: list[str] = Field(default_factory=list)
    segments: list[str] = Field(default_factory=list)

    @field_validator("allocation_control")
    @classmethod
    def _alloc_sums_to_1(cls, v, info):
        t = info.data.get("allocation_treatment")
        if t is not None and abs((t + v) - 1.0) > 1e-6:
            raise ValueError("allocation_treatment + allocation_control must be 1.0")
        return v


class MetricSpec(BaseModel):
    name: str
    definition: str
    direction: str = Field(..., description="increase or decrease")
    window_days: int = Field(..., ge=1, le=60)


class ExperimentDesign(BaseModel):
    randomization_unit: str
    population: str
    exclusions: list[str] = Field(default_factory=list)
    assignment: str = Field(..., description="How treatment is assigned and persisted")
    ramp_plan: str
    duration_days: int = Field(..., ge=1, le=365)


class PowerPlan(BaseModel):
    test: str = Field(default="two_proportion_z_test")
    alpha: float
    power: float
    baseline_rate: float
    mde_abs: float
    n_per_group: int
    total_n: int
    estimated_days: int | None = None
    notes: str = ""


class AnalysisPlan(BaseModel):
    srm_check: str
    primary_test: str
    effect_reporting: str
    multiple_testing_note: str
    segment_policy: str
    stopping_rule: str


class ExperimentSpec(BaseModel):
    title: str
    hypothesis: str
    inputs: ExperimentInputs

    primary_metric: MetricSpec
    guardrail_metrics: list[MetricSpec] = Field(default_factory=list)

    design: ExperimentDesign
    power: PowerPlan
    analysis: AnalysisPlan

    risks: list[str] = Field(default_factory=list)
    open_questions: list[str] = Field(default_factory=list)

    @field_validator("title")
    @classmethod
    def _title_nonempty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("title cannot be empty")
        return v.strip()
