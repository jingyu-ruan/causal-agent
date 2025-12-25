from __future__ import annotations

import textwrap

from .schemas import ExperimentPlan


def render_analysis_py(plan: ExperimentPlan) -> str:
    """Generate a runnable analysis scaffold.

    It assumes you have a CSV with:
    - group column: 'variant' with values 'A' or 'B'
    - outcome column: 'converted' as 0/1
    """
    return textwrap.dedent(f'''
    """Auto-generated analysis scaffold.

    Plan: {plan.title}
    """

    import pandas as pd
    import numpy as np
    from scipy.stats import norm


    def two_proportion_ztest(x_a, n_a, x_b, n_b, two_sided=True):
        p_a = x_a / n_a
        p_b = x_b / n_b
        p_pool = (x_a + x_b) / (n_a + n_b)
        se = np.sqrt(p_pool * (1 - p_pool) * (1/n_a + 1/n_b))
        z = (p_b - p_a) / se
        if two_sided:
            pval = 2 * (1 - norm.cdf(abs(z)))
        else:
            pval = 1 - norm.cdf(z)
        return z, pval, p_a, p_b


    def main(path="data.csv"):
        df = pd.read_csv(path)

        # Expected columns:
        # - variant: 'A' or 'B'
        # - converted: 0/1
        if "variant" not in df.columns or "converted" not in df.columns:
            raise ValueError("CSV must contain columns: variant, converted")

        a = df.loc[df["variant"] == "A", "converted"].dropna().astype(int)
        b = df.loc[df["variant"] == "B", "converted"].dropna().astype(int)

        x_a, n_a = int(a.sum()), int(a.shape[0])
        x_b, n_b = int(b.sum()), int(b.shape[0])

        z, pval, p_a, p_b = two_proportion_ztest(x_a, n_a, x_b, n_b, two_sided=True)
        lift = p_b - p_a

        print("A: n=", n_a, "conv=", p_a)
        print("B: n=", n_b, "conv=", p_b)
        print("Lift (abs)=", lift)
        print("z=", z, "p-value=", pval)

        # Quick CI (Wald):
        se = np.sqrt(p_a*(1-p_a)/n_a + p_b*(1-p_b)/n_b)
        ci = (lift - 1.96*se, lift + 1.96*se)
        print("95% CI for lift:", ci)


    if __name__ == "__main__":
        main()
    ''').strip() + "\n"
