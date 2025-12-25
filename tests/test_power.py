from causal_agent.power import simulate_power_two_proportion, ztest_n_per_group


def test_power_n_positive():
    res = ztest_n_per_group(baseline_rate=0.05, mde_abs=0.01, alpha=0.05, power=0.8)
    assert res.n_per_group > 0
    assert res.total_n == 2 * res.n_per_group

def test_simulated_power_reasonable():
    res = ztest_n_per_group(baseline_rate=0.05, mde_abs=0.01, alpha=0.05, power=0.8)
    p = simulate_power_two_proportion(res.n_per_group, 0.05, 0.01, 0.05, iters=500, seed=1)
    assert 0.6 <= p <= 0.95
