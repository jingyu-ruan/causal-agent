from __future__ import annotations

from pathlib import Path

import streamlit as st

from causal_agent.config import load_settings
from causal_agent.planner import build_plan
from causal_agent.report import render_report_md
from causal_agent.codegen import render_analysis_py
from causal_agent.schemas import ExperimentContext


def main() -> None:
    settings = load_settings()
    st.set_page_config(page_title=settings.app_title, layout="centered")
    st.title(settings.app_title)

    st.caption("Heuristic first, AI optional. Generates outputs/report.md and outputs/analysis.py")

    with st.form("inputs"):
        product_area = st.text_input("Product area", value="Signup flow")
        primary_metric = st.text_input("Primary metric", value="Signup conversion rate")
        unit = st.selectbox("Randomization unit", ["user", "session", "account"], index=0)

        baseline_rate = st.number_input("Baseline conversion rate (p0)", min_value=0.0, max_value=1.0, value=0.10, step=0.01)
        mde_abs = st.number_input("MDE (absolute)", min_value=0.0001, max_value=1.0, value=0.01, step=0.001, format="%.4f")
        daily_traffic = st.number_input("Eligible traffic per day (units/day)", min_value=0, value=20000, step=1000)

        guardrails_raw = st.text_area("Guardrails (one per line)", value="Crash-free sessions\np95 latency\nRevenue per user")
        segments_raw = st.text_area("Segments (one per line, optional)", value="New vs returning\nMobile vs desktop")

        notes = st.text_area("Extra notes (optional)", value="")

        submitted = st.form_submit_button("Generate plan")

    if not submitted:
        return

    ctx = ExperimentContext(
        product_area=product_area.strip(),
        primary_metric=primary_metric.strip(),
        unit=unit,
        baseline_rate=float(baseline_rate),
        mde_abs=float(mde_abs),
        daily_traffic=int(daily_traffic),
        guardrails=[x.strip() for x in guardrails_raw.splitlines() if x.strip()],
        segments=[x.strip() for x in segments_raw.splitlines() if x.strip()],
        notes=notes.strip(),
    )

    with st.spinner("Building plan..."):
        plan = build_plan(ctx, settings)
        report_md = render_report_md(ctx, plan)
        analysis_py = render_analysis_py(plan)

    st.subheader("Experiment plan (preview)")
    st.markdown(report_md)

    st.subheader("Download outputs")
    outdir = Path("outputs")
    outdir.mkdir(parents=True, exist_ok=True)
    (outdir / "report.md").write_text(report_md, encoding="utf-8")
    (outdir / "analysis.py").write_text(analysis_py, encoding="utf-8")

    st.download_button("Download report.md", data=report_md, file_name="report.md")
    st.download_button("Download analysis.py", data=analysis_py, file_name="analysis.py")

    st.info("Tip: If you set OPENAI_API_KEY, the wording gets more tailored. The numbers come from deterministic power calculation.")


if __name__ == "__main__":
    main()
