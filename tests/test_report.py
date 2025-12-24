from causal_agent.planner import PlanService
from causal_agent.schemas import ExperimentInputs
from causal_agent.report import ReportRenderer

def test_report_renders():
    inputs = ExperimentInputs(
        goal="Test new onboarding increases paid conversion",
        baseline_rate=0.06,
        mde_abs=0.01,
        alpha=0.05,
        target_power=0.8,
        traffic_per_day=10000,
        allocation_treatment=0.5,
        allocation_control=0.5,
        randomization_unit="user_id",
        primary_metric="paid_conversion",
        metric_window_days=7,
        guardrails=["crash_rate"],
        segments=["platform"],
    )
    spec = PlanService(llm=None, rag=None).build_spec(inputs)
    md = ReportRenderer().render(spec)
    assert "# Experiment Plan" in md
    assert "Power and Sample Size" in md
