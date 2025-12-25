from __future__ import annotations
import pandas as pd
import numpy as np
from scipy import stats
from pydantic import BaseModel
from typing import List, Dict, Any
from .schemas import MetricType, AnalysisType
from .causal import DifferenceInDifferences, SyntheticControl, CausalResult

class AnalysisResult(BaseModel):
    variant: str
    sample_size: int
    mean: float
    std_dev: float | None
    lift: float | None = None # relative to control
    p_value: float | None = None
    ci_lower: float | None = None
    ci_upper: float | None = None
    prob_beat_control: float | None = None # Bayesian
    is_significant: bool = False
    srm_p_value: float | None = None

class ExperimentAnalysis(BaseModel):
    control_variant: str
    results: List[AnalysisResult]
    srm_warning: bool
    warnings: List[str]

def check_srm(df: pd.DataFrame, variant_col: str) -> float:
    # Chi-square test for SRM
    counts = df[variant_col].value_counts()
    # assume equal split expected
    expected = [len(df) / len(counts)] * len(counts)
    
    chisq, p = stats.chisquare(counts, f_exp=expected)
    return float(p)

def apply_cuped(df: pd.DataFrame, metric_col: str, covariate_col: str) -> pd.Series:
    # theta = cov(Y, X) / var(X)
    # Y_cuped = Y - theta * (X - mean(X))
    y = df[metric_col]
    x = df[covariate_col]
    
    # drop na
    valid = df[[metric_col, covariate_col]].dropna()
    if len(valid) < 2:
        return y
        
    y_valid = valid[metric_col]
    x_valid = valid[covariate_col]
    
    covariance = np.cov(y_valid, x_valid)[0, 1]
    variance = np.var(x_valid)
    
    if variance == 0:
        return y
        
    theta = covariance / variance
    x_mean = np.mean(x_valid)
    
    return y - theta * (x - x_mean)

def analyze_experiment(
    df: pd.DataFrame,
    metric_col: str,
    variant_col: str,
    metric_type: MetricType,
    control_label: str,
    covariate_col: str | None = None,
    analysis_type: AnalysisType = AnalysisType.FREQUENTIST
) -> ExperimentAnalysis:
    
    warnings = []
    
    # SRM Check
    srm_p = check_srm(df, variant_col)
    srm_warning = srm_p < 0.001
    if srm_warning:
        warnings.append(f"SRM Detected (p={srm_p:.4f}). Sample ratios are significantly different from equal split.")

    # CUPED
    analysis_metric = metric_col
    if covariate_col and covariate_col in df.columns:
        try:
            df["cuped_metric"] = apply_cuped(df, metric_col, covariate_col)
            analysis_metric = "cuped_metric"
        except Exception as e:
            warnings.append(f"CUPED failed: {e}")
    
    # Split by variant
    variants = df[variant_col].unique()
    results = []
    
    # Get Control stats
    control_df = df[df[variant_col] == control_label]
    if control_df.empty:
        # Fallback if control label not found, pick first
        if len(variants) > 0:
            control_label = variants[0]
            control_df = df[df[variant_col] == control_label]
        else:
            return ExperimentAnalysis(control_variant="", results=[], srm_warning=False, warnings=["No data found"])
        
    control_n = len(control_df)
    control_mean = float(control_df[analysis_metric].mean())
    control_std = float(control_df[analysis_metric].std())
    
    for v in variants:
        v_df = df[df[variant_col] == v]
        n = len(v_df)
        mean = float(v_df[analysis_metric].mean())
        std = float(v_df[analysis_metric].std())
        
        res = AnalysisResult(
            variant=str(v),
            sample_size=n,
            mean=mean,
            std_dev=std,
            srm_p_value=srm_p if v != control_label else None
        )
        
        if v == control_label:
            results.append(res)
            continue
            
        # Compare with control
        if control_mean != 0:
            res.lift = (mean - control_mean) / abs(control_mean)
        else:
            res.lift = 0.0
        
        if analysis_type == AnalysisType.BAYESIAN:
            # Simple Bayesian Simulation
            if metric_type == MetricType.BINARY:
                # Beta-Bernoulli
                # Prior: Beta(1, 1)
                alpha_c = 1 + control_df[analysis_metric].sum()
                beta_c = 1 + control_n - control_df[analysis_metric].sum()
                alpha_t = 1 + v_df[analysis_metric].sum()
                beta_t = 1 + n - v_df[analysis_metric].sum()
                
                sim_c = np.random.beta(alpha_c, beta_c, 10000)
                sim_t = np.random.beta(alpha_t, beta_t, 10000)
                res.prob_beat_control = float(np.mean(sim_t > sim_c))
            else:
                # Normal-Normal with unknown variance (T-distribution approx)
                if control_std > 0 and std > 0:
                    sim_c = stats.t.rvs(df=control_n-1, loc=control_mean, scale=control_std/np.sqrt(control_n), size=10000)
                    sim_t = stats.t.rvs(df=n-1, loc=mean, scale=std/np.sqrt(n), size=10000)
                    res.prob_beat_control = float(np.mean(sim_t > sim_c))
                else:
                    res.prob_beat_control = 0.5 # unsure
                
        else:
            # Frequentist
            # Welch's t-test
            try:
                t_stat, p_val = stats.ttest_ind(v_df[analysis_metric].dropna(), control_df[analysis_metric].dropna(), equal_var=False)
                res.p_value = float(p_val)
                res.is_significant = p_val < 0.05
                
                # CI for difference
                se_diff = np.sqrt(std**2/n + control_std**2/control_n)
                diff = mean - control_mean
                z_crit = 1.96
                res.ci_lower = diff - z_crit * se_diff
                res.ci_upper = diff + z_crit * se_diff
            except Exception as e:
                warnings.append(f"Test failed for {v}: {e}")
            
        results.append(res)
        
    return ExperimentAnalysis(control_variant=control_label, results=results, srm_warning=srm_warning, warnings=warnings)

def auto_drill_down(
    df: pd.DataFrame,
    metric_col: str,
    variant_col: str,
    control_label: str,
    segment_cols: List[str],
    metric_type: MetricType = MetricType.CONTINUOUS
) -> List[Dict[str, Any]]:
    """
    Automatically checks segments if the overall result is not satisfactory.
    """
    insights = []
    
    # Iterate over segments
    for seg_col in segment_cols:
        if seg_col not in df.columns:
            continue
            
        segments = df[seg_col].unique()
        for seg_val in segments:
            seg_df = df[df[seg_col] == seg_val]
            if len(seg_df) < 10: # skip small segments
                continue
                
            try:
                # We reuse analyze_experiment for the segment
                res = analyze_experiment(
                    seg_df, metric_col, variant_col, metric_type, control_label
                )
                
                # Check for significant results in segment
                for r in res.results:
                    if r.variant != control_label:
                        # Check if significant or if direction is different from main (e.g. Simpson's paradox)
                        if r.is_significant:
                             insights.append({
                                 "segment_col": seg_col,
                                 "segment_value": str(seg_val),
                                 "variant": r.variant,
                                 "lift": r.lift,
                                 "p_value": r.p_value,
                                 "message": f"Significant effect found in {seg_col}={seg_val} (Lift: {r.lift:.2%})"
                             })
                         
            except Exception:
                continue
                
    return insights

def analyze_observational(
    df: pd.DataFrame,
    method: str,
    **kwargs
) -> CausalResult:
    if method == "did":
        model = DifferenceInDifferences()
        return model.fit(df, **kwargs)
    elif method == "scm":
        model = SyntheticControl()
        return model.fit(df, **kwargs)
    else:
        raise ValueError(f"Unknown method: {method}")
