from __future__ import annotations

import math

from scipy.stats import norm

from .schemas import PowerRequest, PowerResult


def _clamp(p: float) -> float:
    # Avoid degenerate variance at 0 or 1.
    eps = 1e-9
    return min(max(p, eps), 1.0 - eps)


def two_proportion_sample_size(req: PowerRequest) -> PowerResult:
    """Approximate required sample size per group for two-proportion z test.

    This is a planning heuristic (normal approximation). It's good enough for an MVP.
    """
    p0 = _clamp(req.baseline_rate)
    p1 = _clamp(p0 + req.mde_abs)

    alpha = req.alpha / 2.0 if req.two_sided else req.alpha
    z_alpha = float(norm.ppf(1 - alpha))
    z_beta = float(norm.ppf(req.power))

    # Pooled variance planning formula (common approximation)
    var0 = p0 * (1 - p0)
    var1 = p1 * (1 - p1)

    denom = (req.mde_abs ** 2)
    n = ((z_alpha + z_beta) ** 2) * (var0 + var1) / denom
    n_per_group = int(math.ceil(n))

    return PowerResult(
        n_per_group=n_per_group,
        total_n=2 * n_per_group,
        z_alpha=z_alpha,
        z_beta=z_beta,
        assumptions=(
            "Two-proportion z-test normal approximation; "
            "independent samples; fixed horizon; no CUPED/variance reduction."
        ),
    )


def ztest_n_per_group(*, baseline_rate: float, mde_abs: float, alpha: float = 0.05, power: float = 0.8, two_sided: bool = True) -> PowerResult:
    """Backward-compatible wrapper that mirrors the old public API used by tests.

    Accepts keyword args and builds a PowerRequest to call the primary implementation.
    """
    req = PowerRequest(
        baseline_rate=baseline_rate,
        mde_abs=mde_abs,
        alpha=alpha,
        power=power,
        two_sided=two_sided,
    )
    return two_proportion_sample_size(req)


def simulate_power_two_proportion(n_per_group: int, baseline_rate: float, mde_abs: float, alpha: float = 0.05, iters: int = 1000, seed: int | None = None, two_sided: bool = True) -> float:
    """Monte-carlo simulate empirical power for two-proportion z-test.

    This is a simple (but adequate for tests) simulation using binomial draws.
    """
    import math
    import random

    random.seed(seed)
    p0 = _clamp(baseline_rate)
    p1 = _clamp(baseline_rate + mde_abs)
    rejections = 0

    for _ in range(iters):
        x0 = sum(random.random() < p0 for _ in range(n_per_group))
        x1 = sum(random.random() < p1 for _ in range(n_per_group))

        p_hat0 = x0 / n_per_group
        p_hat1 = x1 / n_per_group

        # pooled variance for z-test
        p_pool = (x0 + x1) / (2 * n_per_group)
        se = math.sqrt(2 * p_pool * (1 - p_pool) / n_per_group)
        if se == 0:
            continue

        z = (p_hat1 - p_hat0) / se
        if two_sided:
            pval = 2 * (1 - norm.cdf(abs(z)))
        else:
            pval = 1 - norm.cdf(z)

        if pval < alpha:
            rejections += 1

    return rejections / max(1, iters)
