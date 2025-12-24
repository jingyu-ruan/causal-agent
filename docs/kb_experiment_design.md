# Experiment design checklist (internal KB)

## Hypothesis
- State a clear causal hypothesis: "Treatment causes metric to increase/decrease."

## Randomization
- Choose a stable unit (user_id preferred) to avoid interference.
- Use consistent assignment and avoid re-randomization.

## Metrics
- Primary metric: directly tied to the goal.
- Guardrails: protect user experience and business risk.
- Metric window: pick a window that captures delayed effects.

## Validity risks
- SRM (sample ratio mismatch) checks.
- Novelty effect: consider ramp and holdout.
- Instrumentation: logging completeness and event definitions.

## Analysis
- Two-sided test unless a one-sided decision rule is justified.
- Report effect size and confidence intervals.
- Segment reads are exploratory unless pre-registered.
