from __future__ import annotations

from schemas import ExperimentPlan


def generate_analysis_py(plan: ExperimentPlan) -> str:
    k = plan.spec.num_variants
    alpha = plan.spec.alpha

    return f'''"""
Auto-generated analysis scaffold (MVP)
- Input: data.csv with columns:
  - variant: int in [0, {k - 1}]
  - outcome: 0/1 conversion
- Output: prints conversion rates, z-test p-value, SRM check result

Install deps:
  pip install pandas scipy
"""

from __future__ import annotations

import pandas as pd
from math import sqrt
from scipy.stats import norm, chi2


ALPHA = {alpha}


def two_proportion_z_test(x1, n1, x2, n2):
    # pooled proportion
    p_pool = (x1 + x2) / (n1 + n2)
    se = sqrt(p_pool * (1 - p_pool) * (1 / n1 + 1 / n2))
    if se == 0:
        return 0.0, 1.0
    z = (x2 / n2 - x1 / n1) / se
    pval = 2 * (1 - norm.cdf(abs(z)))  # two-sided
    return z, pval


def srm_chi_square(counts, expected_probs):
    # counts: list of observed counts per variant
    # expected_probs: list of expected proportions per variant
    total = sum(counts)
    expected = [total * p for p in expected_probs]
    stat = sum((o - e) ** 2 / e for o, e in zip(counts, expected) if e > 0)
    df = len(counts) - 1
    pval = 1 - chi2.cdf(stat, df)
    return stat, pval


def main():
    df = pd.read_csv("data.csv")
    if "variant" not in df.columns or "outcome" not in df.columns:
        raise ValueError("data.csv must contain columns: variant, outcome")

    df["variant"] = df["variant"].astype(int)
    df["outcome"] = df["outcome"].astype(int)

    # basic sanity
    if df["variant"].min() < 0 or df["variant"].max() > {k - 1}:
        raise ValueError("variant values out of range")
    if not set(df["outcome"].unique()).issubset({{0, 1}}):
        raise ValueError("outcome must be 0/1")

    # SRM check
    counts = df["variant"].value_counts().reindex(range({k}), fill_value=0).tolist()
    expected_probs = [{", ".join([str(1.0 / k)] * k)}]
    srm_stat, srm_p = srm_chi_square(counts, expected_probs)
    print("SRM check")
    print("  counts:", counts)
    print("  chi2_stat:", round(srm_stat, 4), "pval:", srm_p)
    if srm_p < 0.01:
        print("  WARNING: possible SRM (sample ratio mismatch). Investigate assignment/logging.")

    # Primary comparison: variant 0 (control) vs variant 1 (treatment) if exists
    if {k} < 2:
        raise ValueError("Need at least 2 variants for comparison")

    c = df[df["variant"] == 0]
    t = df[df["variant"] == 1]

    x1, n1 = int(c["outcome"].sum()), int(len(c))
    x2, n2 = int(t["outcome"].sum()), int(len(t))

    p1 = x1 / n1 if n1 else 0.0
    p2 = x2 / n2 if n2 else 0.0

    print("\\nConversion rates")
    print("  control:", x1, "/", n1, "=", round(p1, 6))
    print("  treat  :", x2, "/", n2, "=", round(p2, 6))
    print("  abs lift:", round(p2 - p1, 6))

    z, pval = two_proportion_z_test(x1, n1, x2, n2)
    print("\\nTwo-proportion z-test (two-sided)")
    print("  z:", round(z, 4), "pval:", pval)
    print("  alpha:", ALPHA)
    if pval < ALPHA:
        print("  RESULT: statistically significant at alpha")
    else:
        print("  RESULT: not statistically significant at alpha")


if __name__ == "__main__":
    main()
'''
