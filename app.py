from __future__ import annotations

import streamlit as st

from schemas import ProblemSpec
from planner import build_plan
from report import render_markdown
from codegen import generate_analysis_py


st.set_page_config(page_title="Experiment Design Agent MVP", layout="centered")

st.title("Experiment Design Agent (MVP)")
st.caption("MVP: Binary conversion A/B plan generator with power heuristic + report + analysis scaffold")

with st.form("spec_form"):
    objective = st.text_input("Objective", value="Increase signup conversion")
    baseline_rate = st.number_input("Baseline conversion rate p0", min_value=0.0001, max_value=0.9999, value=0.10, step=0.01)
    mde_abs = st.number_input("Absolute MDE (e.g. 0.01 for +1pp)", min_value=0.0001, max_value=0.5, value=0.01, step=0.005)
    alpha = st.number_input("Alpha (two-sided)", min_value=0.0001, max_value=0.5, value=0.05, step=0.01)
    power = st.number_input("Power", min_value=0.5, max_value=0.99, value=0.8, step=0.05)
    traffic_per_day = st.number_input("Traffic per day (total eligible units)", min_value=1, value=20000, step=1000)
    unit = st.selectbox("Randomization unit", options=["user", "session", "device"], index=0)
    num_variants = st.selectbox("Number of variants", options=[2, 3, 4, 5], index=0)
    guardrails_raw = st.text_area("Guardrails (comma-separated, optional)", value="refund_rate, support_tickets")

    submitted = st.form_submit_button("Generate plan")

if submitted:
    try:
        guardrails = [x.strip() for x in guardrails_raw.split(",") if x.strip()]
        spec = ProblemSpec(
            objective=objective,
            baseline_rate=float(baseline_rate),
            mde_abs=float(mde_abs),
            alpha=float(alpha),
            power=float(power),
            traffic_per_day=int(traffic_per_day),
            unit=unit,
            num_variants=int(num_variants),
            guardrails=guardrails,
        )
        # extra cross-field checks
        spec.validate_cross_fields()

        plan = build_plan(spec)
        md = render_markdown(plan)
        analysis_py = generate_analysis_py(plan)

        st.success("Generated successfully")

        st.subheader("Plan report (Markdown)")
        st.markdown(md)

        st.subheader("Downloads")
        st.download_button("Download report.md", data=md.encode("utf-8"), file_name="report.md", mime="text/markdown")
        st.download_button("Download analysis.py", data=analysis_py.encode("utf-8"), file_name="analysis.py", mime="text/x-python")

        st.subheader("Expected data.csv format")
        st.code("variant,outcome\n0,1\n1,0\n0,0\n1,1\n...", language="text")

    except Exception as e:
        st.error(f"Error: {e}")
