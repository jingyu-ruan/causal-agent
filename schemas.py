from __future__ import annotations

from math import isfinite
from pydantic import BaseModel, Field, field_validator


class ProblemSpec(BaseModel):
    objective: str = Field(min_length=3, description="Business objective")
    baseline_rate: float = Field(gt=0.0, lt=1.0, description="Baseline conversion rate p0")
    mde_abs: float = Field(gt=0.0, description="Absolute MDE, e.g. 0.01 means +1pp")
    alpha: float = Field(default=0.05, gt=0.0, lt=1.0)
    power: float = Field(default=0.8, gt=0.0, lt=1.0)
    traffic_per_day: int = Field(gt=0, description="Total eligible units per day")
    unit: str = Field(default="user", description="Randomization unit, e.g. user/session")
    num_variants: int = Field(default=2, ge=2, le=5)
    guardrails: list[str] = Field(default_factory=list)

    @field_validator("mde_abs")
    @classmethod
    def mde_reasonable(cls, v: float, info):
        # Additional checks depend on baseline_rate, done in model validator style below
        if not isfinite(v):
            raise ValueError("mde_abs must be finite")
        return v

    @field_validator("objective")
    @classmethod
    def objective_strip(cls, v: str) -> str:
        return v.strip()

    @field_validator("guardrails")
    @classmethod
    def guardrails_strip(cls, v: list[str]) -> list[str]:
        return [x.strip() for x in v if x and x.strip()]

    @field_validator("baseline_rate")
    @classmethod
    def baseline_finite(cls, v: float) -> float:
        if not isfinite(v):
            raise ValueError("baseline_rate must be finite")
        return v

    @field_validator("power")
    @classmethod
    def power_finite(cls, v: float) -> float:
        if not isfinite(v):
            raise ValueError("power must be finite")
        return v

    @field_validator("alpha")
    @classmethod
    def alpha_finite(cls, v: float) -> float:
        if not isfinite(v):
            raise ValueError("alpha must be finite")
        return v

    @field_validator("num_variants")
    @classmethod
    def variants_ok(cls, v: int) -> int:
        if v < 2:
            raise ValueError("num_variants must be >= 2")
        return v

    @field_validator("traffic_per_day")
    @classmethod
    def traffic_ok(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("traffic_per_day must be > 0")
        return v

    def validate_cross_fields(self) -> None:
        p1 = self.baseline_rate
        p2 = p1 + self.mde_abs
        if p2 >= 1.0:
            raise ValueError("baseline_rate + mde_abs must be < 1.0")
        if p2 <= 0.0:
            raise ValueError("baseline_rate + mde_abs must be > 0.0")


class PowerResult(BaseModel):
    p0: float
    p1: float
    delta: float
    n_per_group: int
    total_n: int
    duration_days: int
    per_group_per_day: float


class ExperimentPlan(BaseModel):
    spec: ProblemSpec
    split: list[float]  # e.g. [0.5, 0.5]
    power: PowerResult
    analysis_method: str
    validity_checks: list[str]
    notes: list[str]
