from __future__ import annotations

from schemas import ProblemSpec, ExperimentPlan
from power import compute_binary_sample_size


def build_plan(spec: ProblemSpec) -> ExperimentPlan:
    # MVP: only supports binary conversion
    power_res = compute_binary_sample_size(spec)

    split = [1.0 / spec.num_variants] * spec.num_variants

    analysis_method = "Two-proportion z-test (primary); logistic regression as robustness check"

    validity_checks = [
        "SRM check (chi-square) on variant assignment counts",
        "A/A test recommendation before shipping big changes",
        "Logging coverage check for exposure and outcome events",
        "Interference/spillover risk review (especially if unit is session, consider user-level)",
        "Novelty effect monitoring (early-day uplift might decay)",
    ]

    notes = [
        "Sample size uses normal approximation; if baseline is very low/high, consider exact methods or simulation.",
        "If you have strong pre-period covariates, consider CUPED to reduce variance (not implemented in MVP).",
    ]

    if spec.guardrails:
        notes.append(f"Guardrails: {', '.join(spec.guardrails)}")

    return ExperimentPlan(
        spec=spec,
        split=split,
        power=power_res,
        analysis_method=analysis_method,
        validity_checks=validity_checks,
        notes=notes,
    )
