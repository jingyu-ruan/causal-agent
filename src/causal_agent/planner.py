from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from causal_agent.power import estimate_days, ztest_n_per_group
from causal_agent.rag import LocalRAG
from causal_agent.schemas import (
    AnalysisPlan,
    ExperimentDesign,
    ExperimentInputs,
    ExperimentSpec,
    MetricSpec,
    PowerPlan,
)

_SYSTEM = """You are an experiment design copilot.
Return ONLY valid JSON.
No markdown. No extra keys.
Be concrete, actionable, and consistent with inputs.
"""

def _default_title(goal: str) -> str:
    g = goal.strip().split("\n")[0]
    return (g[:72] + "...") if len(g) > 75 else g

@dataclass
class PlanService:
    rag: LocalRAG | None = None
    llm: Any | None = None

    def build_spec(self, inputs: ExperimentInputs) -> ExperimentSpec:
        # Always compute power deterministically
        power_res = ztest_n_per_group(
            baseline_rate=inputs.baseline_rate,
            mde_abs=inputs.mde_abs,
            alpha=inputs.alpha,
            power=inputs.target_power,
        )
        days = estimate_days(power_res.total_n, inputs.traffic_per_day, inputs.allocation_treatment, inputs.allocation_control)

        power_plan = PowerPlan(
            alpha=inputs.alpha,
            power=inputs.target_power,
            baseline_rate=inputs.baseline_rate,
            mde_abs=inputs.mde_abs,
            n_per_group=power_res.n_per_group,
            total_n=power_res.total_n,
            estimated_days=days,
            notes="Approximate two-proportion z-test sizing using pooled variance.",
        )

        if self.llm is None:
            return self._fallback_spec(inputs, power_plan)

        ctx = ""
        if self.rag is not None:
            retrieved = self.rag.retrieve(inputs.goal, k=4)
            ctx = "\n\n".join(retrieved)

        user = {
            "inputs": inputs.model_dump(),
            "power_plan": power_plan.model_dump(),
            "rag_context": ctx,
            "required_json_schema": {
                "title": "string",
                "hypothesis": "string",
                "population": "string",
                "exclusions": ["string"],
                "assignment": "string",
                "ramp_plan": "string",
                "duration_days": "int",
                "primary_metric_definition": "string",
                "primary_metric_direction": "increase|decrease",
                "guardrail_metric_definitions": [{"name": "string", "definition": "string", "direction": "increase|decrease"}],
                "analysis": {
                    "srm_check": "string",
                    "primary_test": "string",
                    "effect_reporting": "string",
                    "multiple_testing_note": "string",
                    "segment_policy": "string",
                    "stopping_rule": "string",
                },
                "risks": ["string"],
                "open_questions": ["string"],
            },
        }

        prompt = f"""Create a practical A/B test plan as JSON.

Goal:
{inputs.goal}

Use this context if helpful:
{ctx}

Constraints:
- Randomization unit: {inputs.randomization_unit}
- Primary metric: {inputs.primary_metric}, window_days: {inputs.metric_window_days}
- Guardrails: {inputs.guardrails}
- Segments: {inputs.segments}

Power plan is fixed (do not modify numbers):
{power_plan.model_dump()}

Return JSON with required fields only.
"""

        out = self.llm.generate_json(_SYSTEM, prompt)

        spec = ExperimentSpec(
            title=out.get("title") or _default_title(inputs.goal),
            hypothesis=out["hypothesis"],
            inputs=inputs,
            primary_metric=MetricSpec(
                name=inputs.primary_metric,
                definition=out.get("primary_metric_definition", "Define the metric clearly in analytics terms."),
                direction=out.get("primary_metric_direction", "increase"),
                window_days=inputs.metric_window_days,
            ),
            guardrail_metrics=[
                MetricSpec(
                    name=g.get("name", "guardrail"),
                    definition=g.get("definition", "Define guardrail clearly."),
                    direction=g.get("direction", "decrease"),
                    window_days=inputs.metric_window_days,
                )
                for g in out.get("guardrail_metric_definitions", [])
            ],
            design=ExperimentDesign(
                randomization_unit=inputs.randomization_unit,
                population=out.get("population", "Eligible users in the target funnel."),
                exclusions=out.get("exclusions", []),
                assignment=out.get("assignment", f"Assign {inputs.randomization_unit} to treatment/control persistently."),
                ramp_plan=out.get("ramp_plan", "Start 10%, monitor guardrails, ramp to 50/50."),
                duration_days=int(out.get("duration_days", max(days or 14, 14))),
            ),
            power=power_plan,
            analysis=AnalysisPlan(**out["analysis"]),
            risks=out.get("risks", []),
            open_questions=out.get("open_questions", []),
        )
        return spec

    def _fallback_spec(self, inputs: ExperimentInputs, power_plan: PowerPlan) -> ExperimentSpec:
        days = power_plan.estimated_days or 14
        duration = max(days, 14)
        return ExperimentSpec(
            title=_default_title(inputs.goal),
            hypothesis=f"Treatment will increase {inputs.primary_metric} within {inputs.metric_window_days} days.",
            inputs=inputs,
            primary_metric=MetricSpec(
                name=inputs.primary_metric,
                definition=f"Fraction of {inputs.randomization_unit} that converts within {inputs.metric_window_days} days.",
                direction="increase",
                window_days=inputs.metric_window_days,
            ),
            guardrail_metrics=[
                MetricSpec(
                    name=g,
                    definition=f"Monitor {g} for regressions during the experiment window.",
                    direction="decrease",
                    window_days=inputs.metric_window_days,
                )
                for g in inputs.guardrails
            ],
            design=ExperimentDesign(
                randomization_unit=inputs.randomization_unit,
                population="Eligible units entering the target funnel.",
                exclusions=["Internal traffic", "Bots/fraud", "Users already converted (if applicable)"],
                assignment="Persistent bucketing by hash(randomization_unit).",
                ramp_plan="Ramp 10% -> 25% -> 50% with guardrail checks each step.",
                duration_days=duration,
            ),
            power=power_plan,
            analysis=AnalysisPlan(
                srm_check="Run SRM chi-square on assignment counts daily and at experiment end.",
                primary_test="Two-proportion z-test (two-sided) on conversion rates.",
                effect_reporting="Report absolute lift, relative lift, and 95% CI.",
                multiple_testing_note="Treat segment reads as exploratory unless pre-registered; control FDR if many segments.",
                segment_policy="Report overall first. Then segments only if sample sizes are adequate and interpretations are cautious.",
                stopping_rule="Do not peek early unless you have a pre-defined sequential rule; otherwise analyze at planned end.",
            ),
            risks=["Novelty effect", "Instrumentation changes", "Interference between users if unit is not stable"],
            open_questions=["Any known seasonality or calendar events during the run?", "Any ramp constraints from infra?"],
        )
