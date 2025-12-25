from __future__ import annotations
import pandas as pd
import numpy as np
from sklearn.linear_model import LinearRegression, Ridge, Lasso
from sklearn.ensemble import RandomForestRegressor
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

class CausalResult(BaseModel):
    effect: float
    ci_lower: Optional[float] = None
    ci_upper: Optional[float] = None
    p_value: Optional[float] = None
    method: str
    details: Dict[str, Any] = {}

class DifferenceInDifferences:
    """
    Implements Difference-in-Differences (DiD) logic.
    Assumes parallel trends assumption holds.
    """
    def __init__(self):
        self.model = LinearRegression()

    def fit(self, df: pd.DataFrame, 
            unit_col: str, 
            time_col: str, 
            treatment_col: str, 
            outcome_col: str,
            post_period_start: Any) -> CausalResult:
        """
        Fits a standard DiD model: Y = alpha + beta*Treat + gamma*Post + delta*(Treat*Post) + epsilon
        delta is the DiD estimator.
        """
        data = df.copy()
        
        # Create Post dummy
        data['Post'] = (data[time_col] >= post_period_start).astype(int)
        
        # Create Interaction term
        data['Treat_Post'] = data[treatment_col] * data['Post']
        
        # X = [Treat, Post, Treat_Post]
        X = data[[treatment_col, 'Post', 'Treat_Post']]
        y = data[outcome_col]
        
        self.model.fit(X, y)
        
        # The coefficient for Treat_Post is the effect
        effect = self.model.coef_[2]
        
        # Simple standard error approximation (assuming i.i.d errors, which is naive for panel data but okay for MVP)
        # Ideally we would use clustered standard errors
        
        return CausalResult(
            effect=effect,
            method="Difference-in-Differences (OLS)",
            details={
                "coefficients": {
                    "treatment": self.model.coef_[0],
                    "post": self.model.coef_[1],
                    "interaction": self.model.coef_[2],
                    "intercept": self.model.intercept_
                }
            }
        )

class SyntheticControl:
    """
    Implements Synthetic Control Method (SCM) using Lasso/Ridge/LinearRegression 
    to construct a synthetic counterfactual.
    """
    def __init__(self, method: str = "ridge"):
        if method == "lasso":
            self.model = Lasso(alpha=0.1)
        elif method == "ols":
            self.model = LinearRegression()
        else:
            self.model = Ridge(alpha=1.0)
            
    def fit(self, df: pd.DataFrame,
            unit_col: str,
            time_col: str,
            outcome_col: str,
            treated_unit: str,
            intervention_time: Any) -> CausalResult:
        """
        Constructs a synthetic control for the treated unit using other units.
        """
        # Pivot data to wide format: Index=Time, Columns=Units, Values=Outcome
        pivoted = df.pivot(index=time_col, columns=unit_col, values=outcome_col)
        
        # Split into pre-intervention and post-intervention
        pre_period = pivoted.index < intervention_time
        post_period = pivoted.index >= intervention_time
        
        if not any(pre_period):
            raise ValueError("No pre-intervention data available")
            
        # Training data (Pre-intervention)
        X_train = pivoted.loc[pre_period].drop(columns=[treated_unit])
        y_train = pivoted.loc[pre_period, treated_unit]
        
        # Fit model to learn weights of control units
        self.model.fit(X_train, y_train)
        
        # Predict counterfactual for the treated unit (Post-intervention)
        X_post = pivoted.loc[post_period].drop(columns=[treated_unit])
        y_post_actual = pivoted.loc[post_period, treated_unit]
        y_post_synthetic = self.model.predict(X_post)
        
        # Average Treatment Effect on the Treated (ATT)
        att = (y_post_actual - y_post_synthetic).mean()
        
        return CausalResult(
            effect=att,
            method="Synthetic Control Method",
            details={
                "weights": dict(zip(X_train.columns, self.model.coef_)),
                "actual_post": y_post_actual.tolist(),
                "synthetic_post": y_post_synthetic.tolist()
            }
        )

class HTELearner:
    """
    Implements Heterogeneous Treatment Effects (HTE) estimation.
    Uses T-Learner approach:
    - Train M0 on control group
    - Train M1 on treatment group
    - CATE(x) = M1(x) - M0(x)
    """
    def __init__(self, model_class=RandomForestRegressor):
        self.m0 = model_class()
        self.m1 = model_class()
        
    def fit_predict(self, df: pd.DataFrame,
                   feature_cols: List[str],
                   treatment_col: str,
                   outcome_col: str) -> pd.DataFrame:
        
        control_df = df[df[treatment_col] == 0]
        treated_df = df[df[treatment_col] == 1]
        
        if control_df.empty or treated_df.empty:
            raise ValueError("Both treatment and control groups must be present")
            
        # Train models
        self.m0.fit(control_df[feature_cols], control_df[outcome_col])
        self.m1.fit(treated_df[feature_cols], treated_df[outcome_col])
        
        # Predict CATE for all units
        cate_pred = self.m1.predict(df[feature_cols]) - self.m0.predict(df[feature_cols])
        
        result_df = df.copy()
        result_df['cate'] = cate_pred
        
        return result_df

    def find_sensitive_segments(self, df: pd.DataFrame, cate_col: str = 'cate', top_n: int = 3):
        """
        Identifies segments with highest/lowest treatment effects.
        This is a heuristic approach by grouping by categorical features.
        """
        # Find categorical columns
        cat_cols = df.select_dtypes(include=['object', 'category']).columns.tolist()
        insights = []
        
        for col in cat_cols:
            group_means = df.groupby(col)[cate_col].mean().sort_values(ascending=False)
            insights.append({
                "feature": col,
                "best_group": group_means.index[0],
                "best_effect": group_means.iloc[0],
                "worst_group": group_means.index[-1],
                "worst_effect": group_means.iloc[-1]
            })
            
        return insights
