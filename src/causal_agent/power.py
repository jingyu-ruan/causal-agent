from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from scipy.stats import norm

@dataclass(frozen=True)
class PowerResult:
    n_per_group: int
    total_n: int

def ztest_n_per_group(baseline_rate: float, mde_abs: float, alpha: float, power: float) -> PowerResult:
    """
    Approximate sample size per group for two-proportion z-test (two-sided alpha).
    Uses pooled variance approximation.
    """
    p0 = baseline_rate
    delta = mde_abs
    if not (0.0 < p0 < 1.0):
        raise ValueError("baseline_rate must be in (0,1)")
    if delta <= 0 or delta >= 1:
        raise ValueError("mde_abs must be in (0,1)")
    if not (0.0 < alpha < 0.5):
        raise ValueError("alpha must be in (0,0.5)")
    if not (0.0 < power < 1.0):
        raise ValueError("power must be in (0,1)")

    z_alpha = norm.ppf(1 - alpha / 2.0)
    z_beta = norm.ppf(power)

    p1 = min(max(p0 + delta, 1e-9), 1 - 1e-9)
    p_bar = (p0 + p1) / 2.0
    var = 2.0 * p_bar * (1 - p_bar)
    n = (z_alpha + z_beta) ** 2 * var / (delta**2)
    n_int = int(math.ceil(n))
    return PowerResult(n_per_group=n_int, total_n=2 * n_int)

def estimate_days(total_n: int, traffic_per_day: int, allocation_treatment: float, allocation_control: float) -> int | None:
    if traffic_per_day <= 0:
        return None
    # total_n counts both groups; effective daily eligible assumed equals traffic_per_day
    return int(math.ceil(total_n / traffic_per_day))

def simulate_power_two_proportion(
    n_per_group: int,
    baseline_rate: float,
    mde_abs: float,
    alpha: float,
    iters: int = 2000,
    seed: int = 7,
) -> float:
    """
    Monte Carlo power estimate under p1 = p0 + delta, using two-sided z-test with pooled SE.
    """
    rng = np.random.default_rng(seed)
    p0 = baseline_rate
    p1 = min(max(p0 + mde_abs, 1e-9), 1 - 1e-9)
    rejections = 0
    z_alpha = norm.ppf(1 - alpha / 2.0)

    for _ in range(iters):
        x0 = rng.binomial(n_per_group, p0)
        x1 = rng.binomial(n_per_group, p1)
        phat0 = x0 / n_per_group
        phat1 = x1 / n_per_group
        p_pool = (x0 + x1) / (2 * n_per_group)
        se = math.sqrt(max(p_pool * (1 - p_pool) * (2.0 / n_per_group), 1e-12))
        z = (phat1 - phat0) / se
        if abs(z) >= z_alpha:
            rejections += 1

    return rejections / iters
