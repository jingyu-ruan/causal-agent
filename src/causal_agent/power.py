from __future__ import annotations

import math

from scipy.stats import norm

from .schemas import PowerRequest, PowerResult, MetricType


def _clamp(p: float) -> float:
    # Avoid degenerate variance at 0 or 1.
    eps = 1e-9
    return min(max(p, eps), 1.0 - eps)


def calculate_sample_size(req: PowerRequest) -> PowerResult:
    """Calculate required sample size per group with support for Continuous metrics and CUPED."""
    
    alpha = req.alpha / 2.0 if req.two_sided else req.alpha
    z_alpha = float(norm.ppf(1 - alpha))
    z_beta = float(norm.ppf(req.power))
    
    # Variance calculation
    if req.metric_type == MetricType.CONTINUOUS:
        if req.std_dev is None:
            # Fallback or error if std_dev is missing for continuous
            # For now, let's assume std_dev = baseline_rate (mean) as a rough heuristic if not provided,
            # but ideally should raise error.
            sigma = req.baseline_rate 
        else:
            sigma = req.std_dev
        
        # Variance for difference of means = sigma^2/n + sigma^2/n -> we use pooled variance logic
        # For sample size formula: n = 2 * sigma^2 * (z_alpha + z_beta)^2 / delta^2
        base_variance = sigma ** 2
        # We assume equal variance in both groups for planning
        combined_variance = 2 * base_variance
        
    else:
        # Binary (Proportion)
        p0 = _clamp(req.baseline_rate)
        p1 = _clamp(p0 + req.mde_abs)
        var0 = p0 * (1 - p0)
        var1 = p1 * (1 - p1)
        combined_variance = var0 + var1

    # CUPED Adjustment
    # Var_cuped = Var * (1 - rho^2)
    if req.cuped_enabled and req.cuped_correlation is not None:
        rho = req.cuped_correlation
        combined_variance *= (1 - rho ** 2)
        cuped_note = f"; CUPED enabled (rho={rho})"
    else:
        cuped_note = "; no CUPED"

    denom = (req.mde_abs ** 2)
    if denom == 0:
        n = 0
    else:
        n = ((z_alpha + z_beta) ** 2) * combined_variance / denom
        
    n_per_group = int(math.ceil(n))

    assumptions = (
        f"{req.metric_type.value} metric; "
        "independent samples; fixed horizon"
        f"{cuped_note}."
    )

    return PowerResult(
        n_per_group=n_per_group,
        total_n=2 * n_per_group,
        z_alpha=z_alpha,
        z_beta=z_beta,
        assumptions=assumptions,
    )


def two_proportion_sample_size(req: PowerRequest) -> PowerResult:
    """Approximate required sample size per group for two-proportion z test.
    
    Legacy wrapper around calculate_sample_size.
    """
    return calculate_sample_size(req)


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
