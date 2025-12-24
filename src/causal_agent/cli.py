from __future__ import annotations

import argparse
from pathlib import Path

from causal_agent.codegen import AnalysisCodegen
from causal_agent.config import AppConfig
from causal_agent.critic import CriticService
from causal_agent.llm import OpenAIResponsesLLM
from causal_agent.planner import PlanService
from causal_agent.rag import LocalRAG
from causal_agent.report import ReportRenderer
from causal_agent.schemas import ExperimentInputs
from causal_agent.utils import ensure_dir, to_pretty_json

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--goal", required=True)
    ap.add_argument("--baseline", type=float, required=True)
    ap.add_argument("--mde", type=float, required=True)
    ap.add_argument("--alpha", type=float, default=0.05)
    ap.add_argument("--power", type=float, default=0.8)
    ap.add_argument("--traffic", type=int, default=0)
    ap.add_argument("--unit", default="user_id")
    ap.add_argument("--metric", default="paid_conversion")
    ap.add_argument("--window", type=int, default=7)
    ap.add_argument("--out", default="out")
    ap.add_argument("--no-llm", action="store_true")
    args = ap.parse_args()

    cfg = AppConfig.from_env()
    out_dir = Path(args.out)
    ensure_dir(out_dir)

    inputs = ExperimentInputs(
        goal=args.goal,
        baseline_rate=args.baseline,
        mde_abs=args.mde,
        alpha=args.alpha,
        target_power=args.power,
        traffic_per_day=args.traffic,
        allocation_treatment=0.5,
        allocation_control=0.5,
        randomization_unit=args.unit,
        primary_metric=args.metric,
        metric_window_days=args.window,
        guardrails=[],
        segments=[],
    )

    rag = LocalRAG.from_docs_dir(Path("docs"))

    llm = None
    if not args.no_llm and cfg.openai_api_key:
        llm = OpenAIResponsesLLM(
            model=cfg.openai_model,
            temperature=cfg.openai_temperature,
            max_output_tokens=cfg.openai_max_output_tokens,
        )

    planner = PlanService(rag=rag, llm=llm)
    critic = CriticService(rag=rag, llm=llm)

    spec = planner.build_spec(inputs)
    spec = critic.review_and_improve(inputs, spec)

    (out_dir / "spec.json").write_text(to_pretty_json(spec.model_dump()), encoding="utf-8")
    (out_dir / "report.md").write_text(ReportRenderer().render(spec), encoding="utf-8")
    (out_dir / "analysis.py").write_text(AnalysisCodegen().generate(spec), encoding="utf-8")

    print(f"Wrote artifacts to {out_dir}")

if __name__ == "__main__":
    main()
