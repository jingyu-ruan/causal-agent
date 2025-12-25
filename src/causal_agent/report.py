from __future__ import annotations

from datetime import date
from .schemas import ExperimentContext, ExperimentPlan


def render_report_md(ctx: ExperimentContext, plan: ExperimentPlan) -> str:
    guardrails = "\n".join([f"- {g}" for g in plan.guardrails]) or "- (none)"
    risks = "\n".join([f"- {r}" for r in plan.risks]) or "- (none)"
    analysis = "\n".join([f"- {a}" for a in plan.analysis_outline]) or "- (none)"
    metrics = "\n".join([f"- {m}" for m in plan.metric_definitions]) or "- (none)"
    segments = "\n".join([f"- {s}" for s in ctx.segments]) if ctx.segments else "- (none provided)"

    return f"""# Experiment Plan

{plan.title}

Generated on: {date.today().isoformat()}

## 1) Goal and hypothesis

**Hypothesis:** {plan.hypothesis}

**Variants:**
{chr(10).join([f"- {v}" for v in plan.variants])}

## 2) Experiment design

**Randomization:** {plan.randomization}

**Primary metric and definitions**
{metrics}

**Guardrails**
{guardrails}

**Suggested segments (for exploration, after the main decision)**
{segments}

## 3) Power and Sample Size

- Baseline rate: {ctx.baseline_rate:.3%}
- MDE (absolute): {ctx.mde_abs:.3%}
- Required n per group: {plan.n_per_group}
- Total required sample size: {plan.sample_size}
- Estimated duration (days): {plan.estimated_duration_days} (based on eligible traffic {ctx.daily_traffic}/day)

## 4) Analysis outline

{analysis}

## 5) Risks and mitigations

{risks}

## Notes

{ctx.notes if ctx.notes.strip() else "(none)"}
"""


class ReportRenderer:
    """Small adapter that takes an ExperimentSpec and renders markdown."""
    def render(self, spec: "ExperimentSpec") -> str:
        # convert inputs back to ExperimentContext expected by render_report_md
        from .schemas import ExperimentContext

        inputs = spec.inputs
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
        return render_report_md(ctx, spec.plan)
