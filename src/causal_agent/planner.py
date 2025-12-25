from __future__ import annotations

import math
from pydantic import TypeAdapter

from .config import Settings
from .llm import LLMConfig, call_llm_json
from .power import two_proportion_sample_size
from .schemas import ExperimentContext, ExperimentPlan, PowerRequest


def _heuristic_plan(ctx: ExperimentContext) -> ExperimentPlan:
    power_res = two_proportion_sample_size(
        PowerRequest(
            baseline_rate=ctx.baseline_rate,
            mde_abs=ctx.mde_abs,
            alpha=0.05,
            power=0.8,
            two_sided=True,
        )
    )

    # Duration: if daily_traffic is per day eligible units and we split 50/50
    if ctx.daily_traffic <= 0:
        duration_days = 0
    else:
        duration_days = int(math.ceil(power_res.total_n / max(ctx.daily_traffic, 1)))

    title = f"{ctx.product_area}: A/B test on {ctx.primary_metric}"
    hypothesis = (
        f"Variant B improves {ctx.primary_metric} by at least {ctx.mde_abs:.3%} "
        f"absolute over baseline ({ctx.baseline_rate:.3%})."
    )

    metric_defs = [
        f"Primary metric: {ctx.primary_metric} (binary). Define numerator and denominator clearly.",
        f"Unit: {ctx.unit}. Ensure consistent assignment for the whole experiment.",
    ]

    guardrails = ctx.guardrails or [
        "Error rate / crash-free sessions",
        "Latency (p95)",
        "Revenue per user (if applicable)",
    ]

    risks = [
        "Insufficient traffic or seasonality effects",
        "Sample ratio mismatch (SRM) due to bucketing bugs",
        "Metric instrumentation changes during the test",
        "Novelty effects and learning curves",
    ]

    analysis = [
        "Sanity checks: exposure logging, SRM, baseline balance",
        "Compute conversion by group; two-proportion z-test + CI",
        "Optional: logistic regression adjustment with covariates",
        "Segment deep dives only after primary decision (avoid p-hacking)",
        "Decision rule: ship if lift is positive and statistically + practically meaningful",
    ]

    return ExperimentPlan(
        title=title,
        hypothesis=hypothesis,
        variants=["Control (A)", "Treatment (B)"],
        randomization=f"Randomize at the {ctx.unit} level, 50/50 split, sticky assignment.",
        metric_definitions=metric_defs,
        guardrails=guardrails,
        sample_size=power_res.total_n,
        n_per_group=power_res.n_per_group,
        estimated_duration_days=duration_days,
        risks=risks,
        analysis_outline=analysis,
    )


def build_plan(ctx: ExperimentContext, settings: Settings) -> ExperimentPlan:
    """Build an experiment plan.

    If OPENAI_API_KEY is set, we ask the model to refine the heuristic plan into clearer language.
    We still rely on our own power calculation, to keep the output stable and reproducible.
    """
    base_plan = _heuristic_plan(ctx)

    if not settings.openai_api_key:
        return base_plan

    schema_hint = ExperimentPlan.model_json_schema()
    prompt = (
        "Improve the following experiment plan: make it more specific and pragmatic. "
        "Do not change sample sizes or duration numbers. "
        "Keep it concise, bullet-like, and product-oriented.\n\n"
        f"Context: {ctx.model_dump()}\n\n"
        f"Draft plan: {base_plan.model_dump()}"
    )

    data = call_llm_json(
    LLMConfig(
        api_key=settings.openai_api_key,
        model=settings.openai_model,
        base_url=settings.openai_base_url,
    ),
    prompt=prompt,
    schema_hint=schema_hint,
)


    # Validate: if model messes up, fall back.
    try:
        return TypeAdapter(ExperimentPlan).validate_python(data)
    except Exception:
        return base_plan


class PlanService:
    """Backwards-compatible thin service to build an ExperimentSpec from ExperimentInputs.

    The real planning logic lives in _heuristic_plan/build_plan; tests expect a
    PlanService with a .build_spec(inputs) method, so we provide that here.
    """
    def __init__(self, rag: object | None = None, llm: object | None = None):
        self.rag = rag
        self.llm = llm

    def build_spec(self, inputs: "ExperimentInputs") -> "ExperimentSpec":
        # Local import to avoid circular imports at module import time
        from .schemas import ExperimentContext, ExperimentSpec, ExperimentInputs as _EI

        if not isinstance(inputs, _EI):
            # pydantic will coerce/validate if a dict-like is passed
            inputs = _EI(**dict(inputs)) if isinstance(inputs, dict) else _EI.parse_obj(inputs)

        ctx = ExperimentContext(
            product_area=inputs.primary_metric,
            primary_metric=inputs.primary_metric,
            unit=inputs.randomization_unit,
            baseline_rate=inputs.baseline_rate,
            mde_abs=inputs.mde_abs,
            daily_traffic=inputs.traffic_per_day,
            guardrails=inputs.guardrails,
            segments=inputs.segments,
            notes=inputs.goal,
        )

        # Use the heuristic plan (deterministic, lightweight)
        plan = _heuristic_plan(ctx)

        return ExperimentSpec(inputs=inputs, plan=plan)
