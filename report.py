from __future__ import annotations

from schemas import ExperimentPlan


def render_markdown(plan: ExperimentPlan) -> str:
    s = plan.spec
    p = plan.power

    split_str = ", ".join([f"{x:.0%}" for x in plan.split])

    md = f"""# Experiment Plan (MVP)

## 1. Objective
- **Objective**: {s.objective}
- **Unit of randomization**: {s.unit}
- **Variants**: {s.num_variants}
- **Traffic per day (total eligible units)**: {s.traffic_per_day}
- **Split**: {split_str}

## 2. Primary Metric
- **Type**: Binary conversion
- **Baseline rate (p0)**: {p.p0:.4f}
- **Target detectable lift (absolute MDE)**: {p.delta:.4f}  (p1 = {p.p1:.4f})

## 3. Power and Duration (Approx.)
- **Alpha (two-sided)**: {s.alpha}
- **Power**: {s.power}
- **Required sample per group**: {p.n_per_group:,}
- **Total sample (all variants)**: {p.total_n:,}
- **Estimated per-group traffic per day**: {p.per_group_per_day:,.1f}
- **Estimated duration**: {p.duration_days} day(s)

## 4. Analysis Plan
- **Primary**: {plan.analysis_method}
- **Reporting**:
  - Conversion rates by variant
  - Absolute lift and relative lift
  - p-value and 95% CI (approx.)

## 5. Validity Checks
{_bullets(plan.validity_checks)}

## 6. Guardrails
{_bullets(s.guardrails) if s.guardrails else "- None provided"}

## 7. Notes
{_bullets(plan.notes)}

## 8. Generated Artifacts
- `analysis.py`: runnable analysis scaffold
- Expected input data: `data.csv` with columns `variant` (0..k-1) and `outcome` (0/1)
"""
    return md


def _bullets(items: list[str]) -> str:
    if not items:
        return "- None"
    return "\n".join([f"- {x}" for x in items])
