# app.py
import json
import os
import sys
from pathlib import Path

# Add current directory to path to resolve causal_agent imports
sys.path.insert(0, str(Path(__file__).parent))

import streamlit as st
from dotenv import load_dotenv

from causal_agent.config import AppConfig
from causal_agent.llm import OpenAIResponsesLLM
from causal_agent.planner import PlanService
from causal_agent.rag import LocalRAG
from causal_agent.schemas import ExperimentInputs, ExperimentSpec
from causal_agent.critic import CriticService
from causal_agent.report import ReportRenderer
from causal_agent.codegen import AnalysisCodegen
from causal_agent.utils import ensure_dir, to_pretty_json

load_dotenv()

st.set_page_config(page_title="Causal Agent", layout="wide")

st.title("Causal Agent")
st.caption("Experiment design copilot: schema-validated plan + power + report + analysis scaffold")

cfg = AppConfig.from_env()

with st.sidebar:
    st.header("Settings")
    st.write("LLM provider: OpenAI Responses API")
    use_llm = st.toggle("Enable LLM (planner + critic)", value=bool(cfg.openai_api_key))
    use_rag = st.toggle("Enable local RAG (docs/)", value=True)
    model = st.text_input("Model", value=cfg.openai_model)
    temperature = st.slider("Temperature", 0.0, 1.0, float(cfg.openai_temperature), 0.1)
    max_output_tokens = st.number_input("Max output tokens", min_value=256, max_value=8192, value=int(cfg.openai_max_output_tokens), step=256)
    st.divider()
    out_dir = st.text_input("Output dir", value=str(cfg.output_dir))
    st.caption("Artifacts: report.md + analysis.py + spec.json")

col1, col2 = st.columns([1, 1], gap="large")

with col1:
    st.subheader("1) Describe your experiment")
    goal = st.text_area(
        "Goal / context (natural language)",
        value="Test whether a new onboarding flow increases paid conversion for new users.",
        height=120,
    )

    st.subheader("2) Key assumptions")
    baseline_rate = st.number_input("Baseline conversion rate p0", min_value=0.0001, max_value=0.9999, value=0.06, step=0.005, format="%.4f")
    mde_abs = st.number_input("MDE (absolute lift, e.g., 0.01 = +1pp)", min_value=0.0001, max_value=0.5, value=0.01, step=0.001, format="%.4f")
    alpha = st.number_input("Alpha (two-sided)", min_value=0.0001, max_value=0.2, value=0.05, step=0.01, format="%.4f")
    target_power = st.number_input("Target power", min_value=0.5, max_value=0.99, value=0.8, step=0.05, format="%.2f")

    traffic_per_day = st.number_input("Eligible units per day (rough)", min_value=0, max_value=10_000_000, value=30000, step=1000)
    allocation = st.selectbox("Traffic allocation", ["50/50", "90/10", "80/20", "70/30"], index=0)

    st.subheader("3) Experiment design details")
    randomization_unit = st.selectbox("Randomization unit", ["user_id", "session_id", "device_id", "account_id"], index=0)
    primary_metric = st.text_input("Primary metric name", value="paid_conversion")
    metric_window_days = st.number_input("Metric window (days)", min_value=1, max_value=60, value=7, step=1)

    guardrails = st.text_area("Guardrails (one per line)", value="crash_rate\ncheckout_error_rate\nrefund_rate", height=90)
    segments = st.text_area("Segments to analyze (one per line)", value="platform\ngeo\nnew_vs_returning", height=90)

    st.subheader("4) Generate")
    run_btn = st.button("Generate plan + report + code", type="primary")

with col2:
    st.subheader("Outputs")
    status_box = st.empty()
    spec_box = st.empty()
    report_box = st.empty()
    code_box = st.empty()
    downloads_box = st.empty()

def parse_allocation(s: str) -> tuple[float, float]:
    a, b = s.split("/")
    return float(a) / 100.0, float(b) / 100.0

if run_btn:
    if use_llm and not cfg.openai_api_key:
        st.error("OPENAI_API_KEY is missing. Disable LLM or set it in .env / environment.")
        st.stop()

    status_box.info("Building inputs...")

    alloc_t, alloc_c = parse_allocation(allocation)

    inputs = ExperimentInputs(
        goal=goal.strip(),
        baseline_rate=float(baseline_rate),
        mde_abs=float(mde_abs),
        alpha=float(alpha),
        target_power=float(target_power),
        traffic_per_day=int(traffic_per_day),
        allocation_treatment=alloc_t,
        allocation_control=alloc_c,
        randomization_unit=randomization_unit,
        primary_metric=primary_metric.strip(),
        metric_window_days=int(metric_window_days),
        guardrails=[x.strip() for x in guardrails.splitlines() if x.strip()],
        segments=[x.strip() for x in segments.splitlines() if x.strip()],
    )

    rag = None
    if use_rag:
        rag = LocalRAG.from_docs_dir(Path("docs"))

    llm = None
    if use_llm:
        llm = OpenAIResponsesLLM(
            model=model,
            temperature=float(temperature),
            max_output_tokens=int(max_output_tokens),
        )

    planner = PlanService(rag=rag, llm=llm)
    critic = CriticService(rag=rag, llm=llm)

    try:
        status_box.info("Planning (schema validated)...")
        spec: ExperimentSpec = planner.build_spec(inputs)

        status_box.info("Critiquing and improving...")
        spec = critic.review_and_improve(inputs, spec)

        status_box.info("Rendering report + generating analysis scaffold...")
        report_md = ReportRenderer().render(spec)
        analysis_py = AnalysisCodegen().generate(spec)

        outp = Path(out_dir)
        ensure_dir(outp)
        (outp / "spec.json").write_text(to_pretty_json(spec.model_dump()), encoding="utf-8")
        (outp / "report.md").write_text(report_md, encoding="utf-8")
        (outp / "analysis.py").write_text(analysis_py, encoding="utf-8")

        status_box.success(f"Done. Wrote artifacts to: {outp}")

        spec_box.code(to_pretty_json(spec.model_dump()), language="json")
        report_box.code(report_md, language="markdown")
        code_box.code(analysis_py, language="python")

        downloads_box.download_button(
            "Download report.md",
            data=report_md.encode("utf-8"),
            file_name="report.md",
            mime="text/markdown",
        )
        downloads_box.download_button(
            "Download analysis.py",
            data=analysis_py.encode("utf-8"),
            file_name="analysis.py",
            mime="text/x-python",
        )
        downloads_box.download_button(
            "Download spec.json",
            data=json.dumps(spec.model_dump(), indent=2).encode("utf-8"),
            file_name="spec.json",
            mime="application/json",
        )
    except Exception as e:
        status_box.error(f"Error: {e}")
