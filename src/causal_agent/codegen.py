from __future__ import annotations

from dataclasses import dataclass

from causal_agent.schemas import ExperimentSpec

@dataclass
class AnalysisCodegen:
    def generate(self, spec: ExperimentSpec) -> str:
        # The generated script is deliberately simple and editable.
        return f'''"""
Auto-generated analysis scaffold.

Spec title: {spec.title}
Primary metric: {spec.primary_metric.name}
Randomization unit: {spec.design.randomization_unit}

Expected input CSV columns (minimum):
- unit_id: randomization unit id
- variant: "control" or "treatment"
- converted: 0/1 for primary metric within window
"""

from __future__ import annotations

import math
import argparse
import pandas as pd
import numpy as np
from scipy.stats import norm, chi2_contingency


def srm_chi_square(df: pd.DataFrame) -> dict:
    counts = df["variant"].value_counts().to_dict()
    # Expect 50/50 unless you change allocation; update expected ratios if needed.
    variants = ["control", "treatment"]
    observed = np.array([counts.get(v, 0) for v in variants], dtype=float)
    if observed.sum() == 0:
        return {{"ok": False, "reason": "No rows"}}
    expected = np.array([0.5, 0.5]) * observed.sum()
    chi2, p, _, _ = chi2_contingency([observed, expected])
    return {{"ok": True, "chi2": float(chi2), "p_value": float(p), "counts": counts}}


def two_proportion_ztest(x1: int, n1: int, x0: int, n0: int, alpha: float = {spec.power.alpha}) -> dict:
    p1 = x1 / n1
    p0 = x0 / n0
    p_pool = (x1 + x0) / (n1 + n0)
    se = math.sqrt(max(p_pool * (1 - p_pool) * (1 / n1 + 1 / n0), 1e-12))
    z = (p1 - p0) / se
    p_value = 2 * (1 - norm.cdf(abs(z)))

    # 95% CI for difference using unpooled SE (common reporting choice)
    zcrit = norm.ppf(1 - alpha / 2)
    se_unpooled = math.sqrt(max(p1*(1-p1)/n1 + p0*(1-p0)/n0, 1e-12))
    diff = p1 - p0
    ci_low = diff - zcrit * se_unpooled
    ci_high = diff + zcrit * se_unpooled

    return {{
        "p0": p0,
        "p1": p1,
        "diff": diff,
        "rel_lift": (diff / p0) if p0 > 0 else float("nan"),
        "z": float(z),
        "p_value": float(p_value),
        "ci_low": float(ci_low),
        "ci_high": float(ci_high),
    }}


def main(path: str) -> None:
    df = pd.read_csv(path)

    required = ["unit_id", "variant", "converted"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"Missing columns: {{missing}}")

    # Basic cleaning
    df = df[df["variant"].isin(["control", "treatment"])].copy()
    df["converted"] = df["converted"].astype(int)

    print("Rows:", len(df))
    print("SRM check:")
    print(srm_chi_square(df))

    grp = df.groupby("variant")["converted"].agg(["sum", "count"])
    x0 = int(grp.loc["control", "sum"])
    n0 = int(grp.loc["control", "count"])
    x1 = int(grp.loc["treatment", "sum"])
    n1 = int(grp.loc["treatment", "count"])

    res = two_proportion_ztest(x1, n1, x0, n0, alpha={spec.power.alpha})
    print("\\nPrimary metric result:")
    for k, v in res.items():
        print(f"{{k}}: {{v}}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, help="Path to CSV with unit_id, variant, converted")
    args = ap.parse_args()
    main(args.data)
'''
