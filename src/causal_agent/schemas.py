from __future__ import annotations

from pydantic import BaseModel, Field, model_validator


class PowerRequest(BaseModel):
    baseline_rate: float = Field(..., ge=0.0, le=1.0, description="Baseline conversion rate p0")
    mde_abs: float = Field(..., gt=0.0, le=1.0, description="Minimum detectable effect (absolute), e.g. 0.01")
    alpha: float = Field(0.05, gt=0.0, lt=1.0)
    power: float = Field(0.8, gt=0.0, lt=1.0)
    two_sided: bool = True


class PowerResult(BaseModel):
    n_per_group: int
    total_n: int
    z_alpha: float
    z_beta: float
    assumptions: str


class ExperimentContext(BaseModel):
    product_area: str = Field(..., description="e.g., signup, checkout, recommendations")
    primary_metric: str = Field(..., description="e.g., conversion rate")
    unit: str = Field("user", description="randomization unit: user / session / account")
    baseline_rate: float = Field(..., ge=0.0, le=1.0)
    mde_abs: float = Field(..., gt=0.0, le=1.0)
    daily_traffic: int = Field(..., ge=0, description="eligible units per day")
    guardrails: list[str] = Field(default_factory=list)
    segments: list[str] = Field(default_factory=list)
    notes: str = ""


class ExperimentPlan(BaseModel):
    title: str
    hypothesis: str
    variants: list[str]
    randomization: str
    metric_definitions: list[str]
    guardrails: list[str]
    sample_size: int
    n_per_group: int
    estimated_duration_days: int
    risks: list[str]
    analysis_outline: list[str]


class ExperimentInputs(BaseModel):
    goal: str
    baseline_rate: float
    mde_abs: float
    alpha: float = 0.05
    target_power: float = 0.8
    traffic_per_day: int
    allocation_treatment: float
    allocation_control: float
    randomization_unit: str
    primary_metric: str
    metric_window_days: int
    guardrails: list[str] = Field(default_factory=list)
    segments: list[str] = Field(default_factory=list)
    notes: str = ""

    @model_validator(mode="after")
    def allocations_sum_to_one(self):
        a = self.allocation_treatment
        b = self.allocation_control
        if round(float(a) + float(b), 6) != 1.0:
            raise ValueError("allocation_treatment + allocation_control must equal 1.0")
        return self


class ExperimentSpec(BaseModel):
    inputs: ExperimentInputs
    plan: ExperimentPlan
