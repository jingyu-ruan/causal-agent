import pytest
from causal_agent.schemas import ExperimentInputs

def test_allocation_sum():
    with pytest.raises(ValueError):
        ExperimentInputs(
            goal="abcde",
            baseline_rate=0.1,
            mde_abs=0.01,
            alpha=0.05,
            target_power=0.8,
            traffic_per_day=0,
            allocation_treatment=0.6,
            allocation_control=0.6,
            randomization_unit="user_id",
            primary_metric="conv",
            metric_window_days=7,
            guardrails=[],
            segments=[],
        )
