import numpy as np
import pandas as pd
import pytest

from causal_agent.analysis import MetricType, auto_drill_down
from causal_agent.causal import DifferenceInDifferences, HTELearner, SyntheticControl


def test_did():
    # Mock data for DiD
    # Treat group: 0, 1
    # Post period: >= 5
    # Effect: +2 for Treat in Post
    data = []
    for t in range(10):
        for unit in range(10):
            is_treat = 1 if unit < 5 else 0
            is_post = 1 if t >= 5 else 0
            
            # Baseline + Unit FE + Time FE + Effect
            y = 10 + unit + t + (2 * is_treat * is_post) + np.random.normal(0, 0.1)
            data.append({
                "time": t,
                "unit": unit,
                "treat": is_treat,
                "y": y
            })
    
    df = pd.DataFrame(data)
    
    did = DifferenceInDifferences()
    result = did.fit(df, unit_col="unit", time_col="time", treatment_col="treat", outcome_col="y", post_period_start=5)
    
    assert result.effect == pytest.approx(2.0, abs=0.2)
    assert result.method == "Difference-in-Differences (OLS)"

def test_scm():
    # Mock data for SCM
    # Unit 0 is treated at t=8
    # Unit 1, 2, 3 are controls
    # Y0 = 0.5*Y1 + 0.5*Y2
    data = []
    for t in range(10):
        y1 = np.sin(t)
        y2 = np.cos(t)
        y3 = np.random.normal()
        
        y0 = 0.5 * y1 + 0.5 * y2
        if t >= 8:
            y0 += 3 # Effect
            
        data.append({"time": t, "unit": "u0", "y": y0})
        data.append({"time": t, "unit": "u1", "y": y1})
        data.append({"time": t, "unit": "u2", "y": y2})
        data.append({"time": t, "unit": "u3", "y": y3})
            
    df = pd.DataFrame(data)
    
    scm = SyntheticControl(method="ols")
    result = scm.fit(df, unit_col="unit", time_col="time", outcome_col="y", treated_unit="u0", intervention_time=8)
    
    # Effect should be around 3
    assert result.effect == pytest.approx(3.0, abs=0.5)

def test_hte():
    # Mock data for HTE
    # Effect is 5 if x > 0.5 else 1
    data = []
    for _ in range(100):
        x = np.random.random()
        treat = np.random.randint(0, 2)
        effect = 5 if x > 0.5 else 1
        y = 10 + 2*x + effect*treat + np.random.normal(0, 0.1)
        data.append({"x": x, "treat": treat, "y": y})
        
    df = pd.DataFrame(data)
    
    learner = HTELearner()
    res_df = learner.fit_predict(df, feature_cols=["x"], treatment_col="treat", outcome_col="y")
    
    # Check if estimated CATE is somewhat correlated
    high_cate = res_df[res_df['x'] > 0.6]['cate'].mean()
    low_cate = res_df[res_df['x'] < 0.4]['cate'].mean()
    
    assert high_cate > low_cate

def test_auto_drill_down():
    # Mock data with a segment effect
    # OS: Android, iOS
    # Overall: no effect
    # iOS: +10% lift
    # Android: -10% lift
    
    data = []
    for _ in range(200):
        # iOS
        data.append({"os": "iOS", "variant": "A", "conv": 0.5})
        data.append({"os": "iOS", "variant": "B", "conv": 0.6}) # Lift
        # Android
        data.append({"os": "Android", "variant": "A", "conv": 0.5})
        data.append({"os": "Android", "variant": "B", "conv": 0.4}) # Drop
        
    df = pd.DataFrame(data)
    
    insights = auto_drill_down(df, "conv", "variant", "A", ["os"], MetricType.CONTINUOUS)
    
    assert len(insights) > 0
    found_ios = any("iOS" in i['message'] for i in insights)
    assert found_ios
