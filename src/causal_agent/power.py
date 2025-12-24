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
