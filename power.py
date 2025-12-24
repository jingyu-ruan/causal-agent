from __future__ import annotations

from math import ceil, sqrt
from scipy.stats import norm

from schemas import ProblemSpec, PowerResult


def compute_binary_sample_size(spec: ProblemSpec) -> PowerResult:
    """
    Two-sided two-proportion z-test sample size (normal approximation).
    Returns required sample size per group for detecting delta = mde_abs.
    """
    spec.validate_cross_fields()

    p0 = spec.baseline_rate
    p1 = p0 + spec.mde_abs
    delta = abs(p1 - p0)

    z_alpha = norm.ppf(1.0 - spec.alpha / 2.0)  # two-sided
    z_beta = norm.ppf(spec.power)               # 1 - beta

    p_bar = (p0 + p1) / 2.0

    term1 = z_alpha * sqrt(2.0 * p_bar * (1.0 - p_bar))
    term2 = z_beta * sqrt(p0 * (1.0 - p0) + p1 * (1.0 - p1))

    n = ((term1 + term2) ** 2) / (delta ** 2)
    n_per_group = max(1, int(ceil(n)))

    per_group_per_day = spec.traffic_per_day / float(spec.num_variants)
    duration_days = int(ceil(n_per_group / per_group_per_day))
    total_n = n_per_group * spec.num_variants

    return PowerResult(
        p0=p0,
        p1=p1,
        delta=delta,
        n_per_group=n_per_group,
        total_n=total_n,
        duration_days=max(1, duration_days),
        per_group_per_day=per_group_per_day,
    )
