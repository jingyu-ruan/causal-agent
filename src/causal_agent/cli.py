from __future__ import annotations

import argparse
from pathlib import Path

from .codegen import render_analysis_py
from .config import load_settings
from .planner import build_plan
from .report import render_report_md
from .schemas import ExperimentContext


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate an experiment plan + analysis scaffold.")
    parser.add_argument("--product-area", required=True)
    parser.add_argument("--primary-metric", default="conversion rate")
    parser.add_argument("--unit", default="user")
    parser.add_argument("--baseline-rate", type=float, required=True)
    parser.add_argument("--mde-abs", type=float, required=True)
    parser.add_argument("--daily-traffic", type=int, default=0)
    parser.add_argument("--outdir", default="outputs")
    args = parser.parse_args()

    ctx = ExperimentContext(
        product_area=args.product_area,
        primary_metric=args.primary_metric,
        unit=args.unit,
        baseline_rate=args.baseline_rate,
        mde_abs=args.mde_abs,
        daily_traffic=args.daily_traffic,
        guardrails=[],
        segments=[],
        notes="Generated from CLI.",
    )

    settings = load_settings()
    plan = build_plan(ctx, settings)

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    (outdir / "report.md").write_text(render_report_md(ctx, plan), encoding="utf-8")
    (outdir / "analysis.py").write_text(render_analysis_py(plan), encoding="utf-8")

    print(f"Wrote: {outdir / 'report.md'}")
    print(f"Wrote: {outdir / 'analysis.py'}")
