from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from causal_agent.schemas import ExperimentSpec

@dataclass
class ReportRenderer:
    def render(self, spec: ExperimentSpec) -> str:
        today = date.today().isoformat()
        gms = "\n".join([f"- {m.name}: {m.definition} (direction: {m.direction})" for m in spec.guardrail_metrics]) or "- (none)"
        risks = "\n".join([f"- {r}" for r in spec.risks]) or "- (none)"
        qs = "\n".join([f"- {q}" for q in spec.open_questions]) or "- (none)"
        segs = "\n".join([f"- {s}" for s in spec.inputs.segments]) or "- (none)"

        days_str = f"{spec.power.estimated_days} day(s)" if spec.power.estimated_days is not None else "N/A (traffic not provided)"
        return f"""# Experiment Plan

Generated: {today}

## Title
{spec.title}

## Goal
{spec.inputs.goal}

## Hypothesis
{spec.hypothesis}

## Design
- Randomization unit: `{spec.design.randomization_unit}`
- Population: {spec.design.population}
- Exclusions:
{_bullets(spec.design.exclusions)}
- Assignment: {spec.design.assignment}
- Ramp plan: {spec.design.ramp_plan}
- Planned duration: {spec.design.duration_days} day(s)

## Metrics
### Primary
- Name: `{spec.primary_metric.name}`
- Definition: {spec.primary_metric.definition}
- Direction: {spec.primary_metric.direction}
- Window: {spec.primary_metric.window_days} day(s)

### Guardrails
{gms}

### Segments (exploratory unless pre-registered)
{segs}

## Power and Sample Size
- Test: {spec.power.test}
- Baseline rate: {spec.power.baseline_rate:.4f}
- MDE (absolute): {spec.power.mde_abs:.4f}
- Alpha (two-sided): {spec.power.alpha:.4f}
- Target power: {spec.power.power:.2f}
- Required n per group: {spec.power.n_per_group}
- Total n: {spec.power.total_n}
- Estimated calendar time: {days_str}
- Notes: {spec.power.notes}

## Analysis Plan
- SRM check: {spec.analysis.srm_check}
- Primary test: {spec.analysis.primary_test}
- Effect reporting: {spec.analysis.effect_reporting}
- Multiple testing: {spec.analysis.multiple_testing_note}
- Segment policy: {spec.analysis.segment_policy}
- Stopping rule: {spec.analysis.stopping_rule}

## Risks
{risks}

## Open Questions
{qs}
"""

def _bullets(xs: list[str]) -> str:
    if not xs:
        return "- (none)"
    return "\n".join([f"- {x}" for x in xs])
