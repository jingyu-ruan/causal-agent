from causal_agent.config import load_settings
from causal_agent.planner import build_plan
from causal_agent.schemas import ExperimentContext


def test_build_plan_smoke():
    settings = load_settings()
    ctx = ExperimentContext(
        product_area="Signup",
        primary_metric="conversion",
        unit="user",
        baseline_rate=0.1,
        mde_abs=0.01,
        daily_traffic=1000,
        guardrails=[],
        segments=[],
        notes="",
    )
    plan = build_plan(ctx, settings)
    assert plan.sample_size > 0
    assert plan.n_per_group > 0
