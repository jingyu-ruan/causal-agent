from __future__ import annotations

import hashlib
import json
import math
from collections.abc import Iterable, Sequence
from typing import Any

import numpy as np
import pandas as pd
from scipy import stats

from .schemas import (
    AnalysisOptions,
    CleaningPlanExecution,
    ColumnMapping,
    ConsistencyTest,
    DatasetSnapshot,
    DecisionOutcome,
    DecisionStatus,
    Diagnostic,
    DiagnosticStatus,
    DimensionAnalysis,
    EventStudyPoint,
    MetricDirection,
    MetricEstimate,
    MetricKind,
    MetricSpec,
    StudyAnalysisResult,
    StudyDesignArtifact,
    StudyDesignType,
    SubgroupEstimate,
    TimeValue,
    TraceEvent,
    TransformationLogEntry,
)


def _python_scalar(value: Any) -> Any:
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, (pd.Timestamp, pd.Timedelta)):
        return str(value)
    return value


def _dataset_hash(df: pd.DataFrame) -> str:
    """Hash schema and unordered row content without serializing raw values to an LLM."""

    columns = sorted(df.columns, key=str)
    canonical = df.loc[:, columns]
    try:
        row_hashes = pd.util.hash_pandas_object(canonical, index=False, categorize=True).to_numpy()
    except TypeError:
        stringified = canonical.apply(lambda column: column.map(repr))
        row_hashes = pd.util.hash_pandas_object(
            stringified, index=False, categorize=True
        ).to_numpy()
    # pandas 3 may expose this buffer as read-only; np.sort returns a new array.
    row_hashes = np.sort(row_hashes)
    schema = [(str(column), str(canonical[column].dtype)) for column in columns]
    digest = hashlib.sha256()
    digest.update(json.dumps(schema, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
    digest.update(row_hashes.tobytes())
    digest.update(str(len(df)).encode("ascii"))
    return digest.hexdigest()


def _diagnostic(
    code: str,
    status: DiagnosticStatus,
    message: str,
    **details: Any,
) -> Diagnostic:
    return Diagnostic(code=code, status=status, message=message, details=details)


def _normalise_group(series: pd.Series) -> pd.Series:
    return series.map(lambda value: str(_python_scalar(value)) if not pd.isna(value) else None)


def _binary_values_are_valid(series: pd.Series) -> bool:
    valid_tokens = {"0", "1", "0.0", "1.0", "False", "True", "false", "true"}
    return all(str(_python_scalar(value)) in valid_tokens for value in series.dropna().unique())


def _post_mask(series: pd.Series, treatment_start: TimeValue) -> pd.Series:
    numeric = pd.to_numeric(series, errors="coerce")
    try:
        numeric_start = float(treatment_start)
    except (TypeError, ValueError):
        numeric_start = math.nan
    if numeric.notna().all() and math.isfinite(numeric_start):
        return numeric >= numeric_start
    parsed = pd.to_datetime(series, errors="coerce", format="mixed")
    try:
        parsed_start = pd.to_datetime(treatment_start, format="mixed")
    except (TypeError, ValueError):
        parsed_start = pd.NaT
    if parsed.notna().all() and not pd.isna(parsed_start):
        return parsed >= parsed_start
    raise ValueError("time values and treatment_start must be numeric or parseable datetimes")


def _sorted_time_values(series: pd.Series) -> list[Any]:
    values = list(pd.unique(series))
    numeric = pd.to_numeric(pd.Series(values), errors="coerce")
    if numeric.notna().all():
        return [
            value
            for _, value in sorted(
                zip(numeric.tolist(), values, strict=True), key=lambda pair: pair[0]
            )
        ]
    parsed = pd.to_datetime(pd.Series(values), errors="coerce", format="mixed")
    if parsed.notna().all():
        return [
            value for _, value in sorted(zip(parsed, values, strict=True), key=lambda pair: pair[0])
        ]
    raise ValueError("time values must be numeric or parseable datetimes")


def _required_actual_columns(
    artifact: StudyDesignArtifact, mapping: ColumnMapping
) -> tuple[list[str], list[str]]:
    logical_metrics = [
        artifact.contract.primary_metric.name,
        *(metric.name for metric in artifact.contract.guardrails),
    ]
    mapping_errors = [name for name in logical_metrics if name not in mapping.metric_cols]
    required = [mapping.unit_col, mapping.treatment_col]
    required.extend(
        mapping.metric_cols[name] for name in logical_metrics if name in mapping.metric_cols
    )
    if artifact.design.design_type == StudyDesignType.DIFFERENCE_IN_DIFFERENCES:
        if mapping.time_col is None:
            mapping_errors.append("time")
        else:
            required.append(mapping.time_col)
    if artifact.design.cuped_covariate is not None:
        covariate = artifact.design.cuped_covariate
        if covariate not in mapping.covariate_cols:
            mapping_errors.append(covariate)
        else:
            required.append(mapping.covariate_cols[covariate])
    return list(dict.fromkeys(required)), mapping_errors


def _mapped_columns(artifact: StudyDesignArtifact, mapping: ColumnMapping) -> set[str]:
    required, _ = _required_actual_columns(artifact, mapping)
    return {
        *required,
        *mapping.covariate_cols.values(),
        *mapping.dimension_cols,
    }


def _metric_columns(artifact: StudyDesignArtifact, mapping: ColumnMapping) -> tuple[str, ...]:
    metrics = (artifact.contract.primary_metric, *artifact.contract.guardrails)
    return tuple(mapping.metric_cols[metric.name] for metric in metrics if metric.name in mapping.metric_cols)


def _apply_cleaning_plan(
    df: pd.DataFrame,
    artifact: StudyDesignArtifact,
    mapping: ColumnMapping,
    plan: CleaningPlanExecution | None,
    existing: Sequence[TransformationLogEntry],
) -> tuple[pd.DataFrame, list[TransformationLogEntry]]:
    """Execute only confirmed, allow-listed transformations on a copy of the upload."""

    working = df.copy(deep=True)
    transformations = list(existing)
    if transformations and transformations[-1].rows_after != len(working):
        return working, transformations
    if plan is None:
        return working, transformations

    mapped = _mapped_columns(artifact, mapping)
    required, mapping_errors = _required_actual_columns(artifact, mapping)
    if mapping_errors:
        return working, transformations
    metric_columns = _metric_columns(artifact, mapping)

    for request in plan.operations:
        requested_columns = tuple(dict.fromkeys(request.columns))
        if any(column not in working.columns for column in requested_columns):
            raise ValueError("cleaning plan references a column that is not in the upload")
        if any(column not in mapped for column in requested_columns):
            raise ValueError("cleaning plan may only transform mapped analysis columns")

        rows_before = len(working)
        affected_rows = 0
        columns = requested_columns

        if request.operation == "trim_string_values":
            columns = columns or tuple(
                column
                for column in (mapping.unit_col, mapping.treatment_col, *mapping.dimension_cols)
                if column in working.columns
            )
            for column in columns:
                original = working[column]
                trimmed = original.map(lambda value: value.strip() if isinstance(value, str) else value)
                affected_rows += int((original.fillna("<NA>") != trimmed.fillna("<NA>")).sum())
                working[column] = trimmed
        elif request.operation == "drop_exact_duplicates":
            duplicated = working.duplicated(keep="first")
            affected_rows = int(duplicated.sum())
            working = working.loc[~duplicated].copy()
            columns = ()
        elif request.operation == "drop_missing_required":
            columns = columns or tuple(required)
            if any(column not in required for column in columns):
                raise ValueError("drop_missing_required may only use required analysis columns")
            missing = working.loc[:, list(columns)].isna().any(axis=1)
            affected_rows = int(missing.sum())
            working = working.loc[~missing].copy()
        elif request.operation == "drop_invalid_metric_values":
            columns = columns or metric_columns
            if any(column not in metric_columns for column in columns):
                raise ValueError("drop_invalid_metric_values may only use mapped metrics")
            invalid = pd.Series(False, index=working.index)
            metric_by_column = {
                mapping.metric_cols[metric.name]: metric
                for metric in (artifact.contract.primary_metric, *artifact.contract.guardrails)
                if metric.name in mapping.metric_cols
            }
            for column in columns:
                converted = pd.to_numeric(working[column], errors="coerce")
                column_invalid = converted.isna() | ~np.isfinite(converted.to_numpy(dtype=float))
                metric = metric_by_column[column]
                if metric.kind == MetricKind.BINARY:
                    column_invalid |= ~converted.isin([0.0, 1.0])
                invalid |= column_invalid
            affected_rows = int(invalid.sum())
            working = working.loc[~invalid].copy()
        elif request.operation == "fill_missing_dimensions":
            columns = columns or mapping.dimension_cols
            if any(column not in mapping.dimension_cols for column in columns):
                raise ValueError("fill_missing_dimensions may only use selected dimensions")
            for column in columns:
                missing = working[column].isna()
                affected_rows += int(missing.sum())
                working.loc[missing, column] = "(missing)"

        transformations.append(
            TransformationLogEntry(
                sequence=len(transformations) + 1,
                operation=request.operation,
                columns=columns,
                rows_before=rows_before,
                rows_after=len(working),
                persisted=True,
                details={
                    "affected_rows": affected_rows,
                    "raw_upload_unchanged": True,
                    "agent_proposed": True,
                    "user_confirmed": True,
                },
            )
        )
    return working.reset_index(drop=True), transformations


def _base_validations(
    df: pd.DataFrame, artifact: StudyDesignArtifact, mapping: ColumnMapping
) -> tuple[list[Diagnostic], bool]:
    diagnostics: list[Diagnostic] = []
    required, mapping_errors = _required_actual_columns(artifact, mapping)
    if mapping_errors:
        diagnostics.append(
            _diagnostic(
                "column_mapping",
                DiagnosticStatus.FAIL,
                "The column mapping is missing required logical roles.",
                missing_roles=mapping_errors,
            )
        )
        return diagnostics, False
    else:
        diagnostics.append(
            _diagnostic(
                "column_mapping",
                DiagnosticStatus.PASS,
                "All required logical roles have column mappings.",
            )
        )
    missing_columns = [column for column in required if column not in df.columns]
    if missing_columns:
        diagnostics.append(
            _diagnostic(
                "required_columns",
                DiagnosticStatus.FAIL,
                "The dataset is missing required columns.",
                missing_columns=missing_columns,
            )
        )
        return diagnostics, False
    diagnostics.append(
        _diagnostic(
            "required_columns",
            DiagnosticStatus.PASS,
            "All mapped columns are present in the dataset.",
        )
    )
    if df.empty:
        diagnostics.append(
            _diagnostic("non_empty_dataset", DiagnosticStatus.FAIL, "The dataset has no rows.")
        )
        return diagnostics, False
    diagnostics.append(
        _diagnostic(
            "non_empty_dataset", DiagnosticStatus.PASS, "The dataset contains observations."
        )
    )

    missing_counts = {column: int(df[column].isna().sum()) for column in required}
    missing_counts = {column: count for column, count in missing_counts.items() if count}
    if missing_counts:
        diagnostics.append(
            _diagnostic(
                "missing_required_values",
                DiagnosticStatus.FAIL,
                "Required analysis fields contain missing values; no silent row dropping is allowed.",
                missing_counts=missing_counts,
            )
        )
        return diagnostics, False
    diagnostics.append(
        _diagnostic(
            "missing_required_values",
            DiagnosticStatus.PASS,
            "Required analysis fields contain no missing values.",
        )
    )

    if artifact.design.design_type == StudyDesignType.DIFFERENCE_IN_DIFFERENCES:
        try:
            _post_mask(df[mapping.time_col], artifact.design.treatment_start)
            _sorted_time_values(df[mapping.time_col])
            time_values_valid = True
        except (TypeError, ValueError):
            time_values_valid = False
        diagnostics.append(
            _diagnostic(
                "time_values",
                DiagnosticStatus.PASS if time_values_valid else DiagnosticStatus.FAIL,
                (
                    "Time values and treatment start share a numeric or datetime scale."
                    if time_values_valid
                    else "Time values and treatment start must be numeric or parseable datetimes."
                ),
            )
        )
        if not time_values_valid:
            return diagnostics, False

    invalid_numeric: list[str] = []
    invalid_binary: list[str] = []
    non_finite: list[str] = []
    metrics = (artifact.contract.primary_metric, *artifact.contract.guardrails)
    for metric in metrics:
        column = mapping.metric_cols[metric.name]
        converted = pd.to_numeric(df[column], errors="coerce")
        if converted.isna().any():
            invalid_numeric.append(column)
        elif not np.isfinite(converted.to_numpy(dtype=float)).all():
            non_finite.append(column)
        elif metric.kind == MetricKind.BINARY and not _binary_values_are_valid(df[column]):
            invalid_binary.append(column)
    if invalid_numeric:
        diagnostics.append(
            _diagnostic(
                "numeric_metric_values",
                DiagnosticStatus.FAIL,
                "Outcome metrics must contain only numeric values.",
                invalid_columns=invalid_numeric,
            )
        )
    else:
        diagnostics.append(
            _diagnostic(
                "numeric_metric_values",
                DiagnosticStatus.PASS,
                "All outcome metrics are numeric.",
            )
        )
    if non_finite:
        diagnostics.append(
            _diagnostic(
                "finite_metric_values",
                DiagnosticStatus.FAIL,
                "Outcome metrics must not contain positive or negative infinity.",
                invalid_columns=non_finite,
            )
        )
    else:
        diagnostics.append(
            _diagnostic(
                "finite_metric_values",
                DiagnosticStatus.PASS,
                "All outcome metrics contain finite values.",
            )
        )
    if invalid_binary:
        diagnostics.append(
            _diagnostic(
                "binary_metric_values",
                DiagnosticStatus.FAIL,
                "Binary metrics must contain only 0/1 values.",
                invalid_columns=invalid_binary,
            )
        )
    else:
        diagnostics.append(
            _diagnostic(
                "binary_metric_values",
                DiagnosticStatus.PASS,
                "All binary metrics contain only 0/1 values.",
            )
        )

    expected_labels = {allocation.label for allocation in artifact.design.allocations}
    actual_labels = set(_normalise_group(df[mapping.treatment_col]).dropna())
    if actual_labels != expected_labels:
        diagnostics.append(
            _diagnostic(
                "treatment_values",
                DiagnosticStatus.FAIL,
                "Treatment values must exactly match the frozen control and treatment labels.",
                expected=sorted(expected_labels),
                actual=sorted(actual_labels),
            )
        )
    else:
        diagnostics.append(
            _diagnostic(
                "treatment_values",
                DiagnosticStatus.PASS,
                "Treatment values match the frozen design.",
            )
        )
    valid = not any(item.status == DiagnosticStatus.FAIL for item in diagnostics)
    return diagnostics, valid


def _rct_validations(
    df: pd.DataFrame, artifact: StudyDesignArtifact, mapping: ColumnMapping
) -> list[Diagnostic]:
    diagnostics: list[Diagnostic] = []
    duplicate_count = int(df[mapping.unit_col].duplicated(keep=False).sum())
    if duplicate_count:
        diagnostics.append(
            _diagnostic(
                "unit_grain",
                DiagnosticStatus.FAIL,
                "RCT data must contain exactly one row per randomized unit.",
                duplicate_rows=duplicate_count,
            )
        )
    else:
        diagnostics.append(
            _diagnostic(
                "unit_grain",
                DiagnosticStatus.PASS,
                "Each randomized unit appears exactly once.",
            )
        )

    groups = _normalise_group(df[mapping.treatment_col])
    observed: list[int] = []
    expected: list[float] = []
    counts: dict[str, int] = {}
    for allocation in artifact.design.allocations:
        count = int((groups == allocation.label).sum())
        observed.append(count)
        expected.append(len(df) * allocation.fraction)
        counts[allocation.label] = count
    if all(value > 0 for value in expected):
        _, p_value = stats.chisquare(observed, f_exp=expected)
        p_value = float(p_value)
    else:
        p_value = 0.0
    srm_status = (
        DiagnosticStatus.FAIL if p_value < artifact.design.srm_alpha else DiagnosticStatus.PASS
    )
    diagnostics.append(
        _diagnostic(
            "sample_ratio_mismatch",
            srm_status,
            (
                "Observed allocation matches the frozen allocation."
                if srm_status == DiagnosticStatus.PASS
                else "Sample ratio mismatch detected against the frozen expected allocation."
            ),
            observed=counts,
            expected={
                allocation.label: len(df) * allocation.fraction
                for allocation in artifact.design.allocations
            },
            p_value=p_value,
            threshold=artifact.design.srm_alpha,
        )
    )
    minimum_observed = min(observed) if observed else 0
    if minimum_observed < 2:
        group_status = DiagnosticStatus.FAIL
        group_message = "Each group needs at least two observations."
    elif minimum_observed < artifact.design.minimum_group_size:
        group_status = DiagnosticStatus.WARN
        group_message = "At least one group is below the recommended minimum size."
    else:
        group_status = DiagnosticStatus.PASS
        group_message = "Both groups satisfy the minimum analysis size."
    diagnostics.append(
        _diagnostic(
            "group_sample_size",
            group_status,
            group_message,
            counts=counts,
            recommended_minimum=artifact.design.minimum_group_size,
        )
    )
    if artifact.design.required_total_sample_size is not None:
        achieved = len(df) >= artifact.design.required_total_sample_size
        diagnostics.append(
            _diagnostic(
                "planned_sample_size",
                DiagnosticStatus.PASS if achieved else DiagnosticStatus.WARN,
                (
                    "The frozen planned sample size was reached."
                    if achieved
                    else "The analysis is below the frozen planned sample size."
                ),
                observed=len(df),
                required=artifact.design.required_total_sample_size,
            )
        )

    if artifact.design.cuped_covariate is not None:
        column = mapping.covariate_cols[artifact.design.cuped_covariate]
        numeric = pd.to_numeric(df[column], errors="coerce")
        valid = (
            numeric.notna().all()
            and np.isfinite(numeric.to_numpy(dtype=float)).all()
            and math.isfinite(float(numeric.var(ddof=1)))
            and float(numeric.var(ddof=1)) > 0.0
        )
        diagnostics.append(
            _diagnostic(
                "cuped_covariate",
                DiagnosticStatus.PASS if valid else DiagnosticStatus.FAIL,
                (
                    "The pre-specified CUPED covariate is numeric, complete, and non-constant."
                    if valid
                    else "The pre-specified CUPED covariate must be numeric, complete, and non-constant."
                ),
                column=column,
            )
        )
    return diagnostics


def _two_sample_estimate(
    control: np.ndarray,
    treatment: np.ndarray,
    metric: MetricSpec,
    alpha: float,
    method: str,
    *,
    cuped_applied: bool = False,
    details: dict[str, Any] | None = None,
) -> MetricEstimate:
    n_control = len(control)
    n_treatment = len(treatment)
    control_mean = float(np.mean(control))
    treatment_mean = float(np.mean(treatment))
    effect = treatment_mean - control_mean

    if metric.kind == MetricKind.BINARY and not cuped_applied:
        variance_control = control_mean * (1.0 - control_mean) / n_control
        variance_treatment = treatment_mean * (1.0 - treatment_mean) / n_treatment
        standard_error = math.sqrt(max(0.0, variance_control + variance_treatment))
        pooled = float((control.sum() + treatment.sum()) / (n_control + n_treatment))
        null_se = math.sqrt(
            max(0.0, pooled * (1.0 - pooled) * (1.0 / n_control + 1.0 / n_treatment))
        )
        critical = float(stats.norm.ppf(1.0 - alpha / 2.0))
        if null_se == 0.0:
            p_value = 1.0 if effect == 0.0 else 0.0
        else:
            p_value = float(2.0 * stats.norm.sf(abs(effect / null_se)))
    else:
        variance_control = float(np.var(control, ddof=1))
        variance_treatment = float(np.var(treatment, ddof=1))
        standard_error = math.sqrt(
            max(0.0, variance_control / n_control + variance_treatment / n_treatment)
        )
        numerator = (variance_control / n_control + variance_treatment / n_treatment) ** 2
        denominator = 0.0
        if n_control > 1:
            denominator += (variance_control / n_control) ** 2 / (n_control - 1)
        if n_treatment > 1:
            denominator += (variance_treatment / n_treatment) ** 2 / (n_treatment - 1)
        degrees_freedom = numerator / denominator if denominator > 0.0 else math.inf
        critical = (
            float(stats.t.ppf(1.0 - alpha / 2.0, degrees_freedom))
            if math.isfinite(degrees_freedom)
            else float(stats.norm.ppf(1.0 - alpha / 2.0))
        )
        if standard_error == 0.0:
            p_value = 1.0 if effect == 0.0 else 0.0
        else:
            p_value = float(2.0 * stats.t.sf(abs(effect / standard_error), degrees_freedom))

    ci_lower = effect - critical * standard_error
    ci_upper = effect + critical * standard_error
    relative_lift = effect / abs(control_mean) if control_mean != 0.0 else None
    return MetricEstimate(
        metric_name=metric.name,
        metric_kind=metric.kind,
        method=method,
        effect=float(effect),
        standard_error=float(standard_error),
        ci_lower=float(ci_lower),
        ci_upper=float(ci_upper),
        p_value=float(p_value),
        control_mean=control_mean,
        treatment_mean=treatment_mean,
        relative_lift=float(relative_lift) if relative_lift is not None else None,
        n_control=n_control,
        n_treatment=n_treatment,
        cuped_applied=cuped_applied,
        details=details or {},
    )


def _estimate_rct_metric(
    df: pd.DataFrame,
    artifact: StudyDesignArtifact,
    mapping: ColumnMapping,
    metric: MetricSpec,
    *,
    apply_cuped: bool,
) -> MetricEstimate:
    labels = [allocation.label for allocation in artifact.design.allocations]
    control_label, treatment_label = labels
    groups = _normalise_group(df[mapping.treatment_col])
    outcomes = pd.to_numeric(df[mapping.metric_cols[metric.name]], errors="raise").astype(float)
    control_mask = groups == control_label
    treatment_mask = groups == treatment_label
    details: dict[str, Any] = {}
    method = "difference_in_proportions" if metric.kind == MetricKind.BINARY else "welch_t"
    if apply_cuped:
        covariate_name = artifact.design.cuped_covariate
        covariate = pd.to_numeric(
            df[mapping.covariate_cols[covariate_name]], errors="raise"
        ).astype(float)
        covariance = float(np.cov(outcomes, covariate, ddof=1)[0, 1])
        variance = float(np.var(covariate, ddof=1))
        theta = covariance / variance
        raw_control_mean = float(outcomes[control_mask].mean())
        raw_treatment_mean = float(outcomes[treatment_mask].mean())
        outcomes = outcomes - theta * (covariate - float(covariate.mean()))
        details = {
            "theta": theta,
            "covariate": covariate_name,
            "raw_control_mean": raw_control_mean,
            "raw_treatment_mean": raw_treatment_mean,
        }
        method = "cuped_adjusted_welch_t"
    return _two_sample_estimate(
        outcomes[control_mask].to_numpy(),
        outcomes[treatment_mask].to_numpy(),
        metric,
        artifact.design.alpha,
        method,
        cuped_applied=apply_cuped,
        details=details,
    )


def _dummy_matrix(values: pd.Series, ordered_levels: Sequence[Any]) -> np.ndarray:
    if len(ordered_levels) <= 1:
        return np.empty((len(values), 0), dtype=float)
    return np.column_stack(
        [(values.to_numpy() == level).astype(float) for level in ordered_levels[1:]]
    )


def _cluster_ols(
    x: np.ndarray, y: np.ndarray, clusters: np.ndarray
) -> tuple[np.ndarray, np.ndarray, int, np.ndarray]:
    beta = np.linalg.pinv(x) @ y
    residuals = y - x @ beta
    bread = np.linalg.pinv(x.T @ x)
    meat = np.zeros((x.shape[1], x.shape[1]), dtype=float)
    unique_clusters = sorted(pd.unique(clusters), key=str)
    for cluster in unique_clusters:
        mask = clusters == cluster
        score = x[mask].T @ residuals[mask]
        meat += np.outer(score, score)
    n = x.shape[0]
    rank = int(np.linalg.matrix_rank(x))
    cluster_count = len(unique_clusters)
    correction = 1.0
    if cluster_count > 1 and n > rank:
        correction = (cluster_count / (cluster_count - 1.0)) * ((n - 1.0) / (n - rank))
    covariance = correction * bread @ meat @ bread
    covariance = (covariance + covariance.T) / 2.0
    return beta, covariance, cluster_count - 1, residuals


def _fe_design(
    df: pd.DataFrame,
    unit_col: str,
    time_col: str,
    extra_columns: Iterable[np.ndarray],
) -> np.ndarray:
    units = sorted(pd.unique(df[unit_col]), key=str)
    times = _sorted_time_values(df[time_col])
    blocks = [
        np.ones((len(df), 1), dtype=float),
        _dummy_matrix(df[unit_col], units),
        _dummy_matrix(df[time_col], times),
    ]
    blocks.extend(np.asarray(column, dtype=float).reshape(-1, 1) for column in extra_columns)
    return np.column_stack(blocks)


def _did_validations(
    df: pd.DataFrame, artifact: StudyDesignArtifact, mapping: ColumnMapping
) -> tuple[list[Diagnostic], pd.Series, list[Any], int]:
    diagnostics: list[Diagnostic] = []
    time_col = mapping.time_col
    duplicated = int(df.duplicated([mapping.unit_col, time_col], keep=False).sum())
    diagnostics.append(
        _diagnostic(
            "unit_time_grain",
            DiagnosticStatus.FAIL if duplicated else DiagnosticStatus.PASS,
            (
                "Each unit-time pair is unique."
                if not duplicated
                else "DiD data must contain at most one row per unit-time pair."
            ),
            duplicate_rows=duplicated,
        )
    )
    groups = _normalise_group(df[mapping.treatment_col])
    label_map = {
        artifact.design.allocations[0].label: 0,
        artifact.design.allocations[1].label: 1,
    }
    treatment = groups.map(label_map).astype(int)
    per_unit_variation = treatment.groupby(df[mapping.unit_col]).nunique()
    unstable_units = [
        _python_scalar(value) for value in per_unit_variation[per_unit_variation > 1].index
    ]
    diagnostics.append(
        _diagnostic(
            "stable_treatment_assignment",
            DiagnosticStatus.FAIL if unstable_units else DiagnosticStatus.PASS,
            (
                "Treatment assignment is constant within each unit."
                if not unstable_units
                else "Treatment assignment changes within units and is invalid for this DiD contract."
            ),
            unstable_units=unstable_units,
        )
    )

    times = _sorted_time_values(df[time_col])
    unique_time_frame = pd.DataFrame({"time": times})
    unique_post = _post_mask(unique_time_frame["time"], artifact.design.treatment_start)
    pre_count = int((~unique_post).sum())
    post_count = int(unique_post.sum())
    support_ok = pre_count >= artifact.design.minimum_pre_periods and post_count >= 1
    diagnostics.append(
        _diagnostic(
            "panel_time_support",
            DiagnosticStatus.PASS if support_ok else DiagnosticStatus.FAIL,
            (
                "The panel has sufficient pre- and post-treatment periods."
                if support_ok
                else "The panel lacks the frozen minimum pre-periods or any post-period."
            ),
            pre_periods=pre_count,
            post_periods=post_count,
            required_pre_periods=artifact.design.minimum_pre_periods,
        )
    )
    overlap = pd.crosstab(df[time_col], treatment)
    missing_overlap_times = [
        _python_scalar(time_value)
        for time_value in times
        if time_value not in overlap.index
        or 0 not in overlap.columns
        or 1 not in overlap.columns
        or int(overlap.loc[time_value, 0]) == 0
        or int(overlap.loc[time_value, 1]) == 0
    ]
    overlap_ok = not missing_overlap_times
    diagnostics.append(
        _diagnostic(
            "time_group_overlap",
            DiagnosticStatus.PASS if overlap_ok else DiagnosticStatus.FAIL,
            (
                "Control and treatment units are observed in every analysis period."
                if overlap_ok
                else "Every analysis period must contain both control and treatment observations."
            ),
            periods_without_overlap=missing_overlap_times,
        )
    )

    rank_ok = False
    base_rank = 0
    main_rank = 0
    event_rank = 0
    expected_event_increment = max(0, len(times) - 1)
    if support_ok and overlap_ok:
        post = _post_mask(df[time_col], artifact.design.treatment_start).astype(int)
        treated_post = treatment.to_numpy(dtype=float) * post.to_numpy(dtype=float)
        base_x = _fe_design(df, mapping.unit_col, time_col, [])
        main_x = _fe_design(df, mapping.unit_col, time_col, [treated_post])
        reference_index = pre_count - 1
        event_columns = [
            treatment.to_numpy(dtype=float)
            * (df[time_col].to_numpy() == times[index]).astype(float)
            for index in range(len(times))
            if index != reference_index
        ]
        event_x = _fe_design(df, mapping.unit_col, time_col, event_columns)
        base_rank = int(np.linalg.matrix_rank(base_x))
        main_rank = int(np.linalg.matrix_rank(main_x))
        event_rank = int(np.linalg.matrix_rank(event_x))
        rank_ok = main_rank == base_rank + 1 and event_rank == base_rank + expected_event_increment
    diagnostics.append(
        _diagnostic(
            "identification_rank",
            DiagnosticStatus.PASS if rank_ok else DiagnosticStatus.FAIL,
            (
                "Treatment and event-study effects add the expected identifying rank."
                if rank_ok
                else "The DiD treatment or event-study design is rank deficient."
            ),
            base_rank=base_rank,
            main_rank=main_rank,
            event_rank=event_rank,
            expected_event_increment=expected_event_increment,
        )
    )
    unit_counts = treatment.groupby(df[mapping.unit_col]).first().value_counts().to_dict()
    minimum_units = min(unit_counts.get(0, 0), unit_counts.get(1, 0))
    if minimum_units < 2:
        unit_status = DiagnosticStatus.FAIL
        unit_message = "Each DiD group needs at least two units for clustered inference."
    elif minimum_units < artifact.design.minimum_group_size:
        unit_status = DiagnosticStatus.WARN
        unit_message = "At least one DiD group is below the recommended number of units."
    else:
        unit_status = DiagnosticStatus.PASS
        unit_message = "Both DiD groups satisfy the recommended unit count."
    diagnostics.append(
        _diagnostic(
            "group_unit_count",
            unit_status,
            unit_message,
            control_units=int(unit_counts.get(0, 0)),
            treatment_units=int(unit_counts.get(1, 0)),
            recommended_minimum=artifact.design.minimum_group_size,
        )
    )
    expected_cells = int(df[mapping.unit_col].nunique() * len(times))
    balanced = len(df) == expected_cells
    diagnostics.append(
        _diagnostic(
            "balanced_panel",
            DiagnosticStatus.PASS if balanced else DiagnosticStatus.WARN,
            (
                "The unit-time panel is balanced."
                if balanced
                else "The panel is unbalanced; fixed effects remain valid under stronger assumptions."
            ),
            observed_cells=len(df),
            expected_cells=expected_cells,
        )
    )
    return diagnostics, treatment, times, pre_count


def _estimate_did_metric(
    df: pd.DataFrame,
    artifact: StudyDesignArtifact,
    mapping: ColumnMapping,
    treatment: pd.Series,
    metric: MetricSpec,
) -> MetricEstimate:
    post = _post_mask(df[mapping.time_col], artifact.design.treatment_start).astype(int)
    treated_post = treatment.to_numpy(dtype=float) * post.to_numpy(dtype=float)
    x = _fe_design(df, mapping.unit_col, mapping.time_col, [treated_post])
    y = pd.to_numeric(df[mapping.metric_cols[metric.name]], errors="raise").to_numpy(dtype=float)
    beta, covariance, cluster_df, _ = _cluster_ols(x, y, df[mapping.unit_col].to_numpy())
    coefficient_index = x.shape[1] - 1
    effect = float(beta[coefficient_index])
    standard_error = math.sqrt(max(0.0, float(covariance[coefficient_index, coefficient_index])))
    critical = float(stats.t.ppf(1.0 - artifact.design.alpha / 2.0, cluster_df))
    p_value = (
        float(2.0 * stats.t.sf(abs(effect / standard_error), cluster_df))
        if standard_error > 0.0
        else (1.0 if effect == 0.0 else 0.0)
    )
    control_mask = treatment == 0
    treated_mask = treatment == 1
    outcome = pd.Series(y, index=df.index)
    control_post = float(outcome[control_mask & (post == 1)].mean())
    treatment_post = float(outcome[treated_mask & (post == 1)].mean())
    raw_cells = {
        "control_pre": float(outcome[control_mask & (post == 0)].mean()),
        "control_post": control_post,
        "treatment_pre": float(outcome[treated_mask & (post == 0)].mean()),
        "treatment_post": treatment_post,
    }
    return MetricEstimate(
        metric_name=metric.name,
        metric_kind=metric.kind,
        method="two_way_fixed_effects_unit_clustered_se",
        effect=effect,
        standard_error=standard_error,
        ci_lower=effect - critical * standard_error,
        ci_upper=effect + critical * standard_error,
        p_value=p_value,
        control_mean=control_post,
        treatment_mean=treatment_post,
        relative_lift=None,
        n_control=int(control_mask.sum()),
        n_treatment=int(treated_mask.sum()),
        details={"cluster_degrees_freedom": cluster_df, "raw_cells": raw_cells},
    )


def _event_study(
    df: pd.DataFrame,
    artifact: StudyDesignArtifact,
    mapping: ColumnMapping,
    treatment: pd.Series,
    times: Sequence[Any],
    pre_count: int,
) -> tuple[tuple[EventStudyPoint, ...], Diagnostic]:
    reference_index = pre_count - 1
    included_indices = [index for index in range(len(times)) if index != reference_index]
    event_columns = [
        treatment.to_numpy(dtype=float)
        * (df[mapping.time_col].to_numpy() == times[index]).astype(float)
        for index in included_indices
    ]
    x = _fe_design(df, mapping.unit_col, mapping.time_col, event_columns)
    y = pd.to_numeric(
        df[mapping.metric_cols[artifact.contract.primary_metric.name]], errors="raise"
    ).to_numpy(dtype=float)
    beta, covariance, cluster_df, _ = _cluster_ols(x, y, df[mapping.unit_col].to_numpy())
    first_event_index = x.shape[1] - len(event_columns)
    critical = float(stats.t.ppf(1.0 - artifact.design.alpha / 2.0, cluster_df))
    coefficient_by_time = {
        time_index: first_event_index + offset for offset, time_index in enumerate(included_indices)
    }
    points: list[EventStudyPoint] = []
    for index, time_value in enumerate(times):
        relative_period = index - pre_count
        if index == reference_index:
            points.append(
                EventStudyPoint(
                    time_value=_python_scalar(time_value),
                    relative_period=relative_period,
                    is_reference=True,
                    effect=0.0,
                )
            )
            continue
        coefficient_index = coefficient_by_time[index]
        effect = float(beta[coefficient_index])
        standard_error = math.sqrt(
            max(0.0, float(covariance[coefficient_index, coefficient_index]))
        )
        p_value = (
            float(2.0 * stats.t.sf(abs(effect / standard_error), cluster_df))
            if standard_error > 0.0
            else (1.0 if effect == 0.0 else 0.0)
        )
        points.append(
            EventStudyPoint(
                time_value=_python_scalar(time_value),
                relative_period=relative_period,
                effect=effect,
                standard_error=standard_error,
                ci_lower=effect - critical * standard_error,
                ci_upper=effect + critical * standard_error,
                p_value=p_value,
            )
        )

    pre_indices = [
        coefficient_by_time[index] for index in included_indices if index < reference_index
    ]
    if not pre_indices:
        p_value = 0.0
        status = DiagnosticStatus.FAIL
        message = "No non-reference pre-treatment coefficient is available for a pre-trend test."
    else:
        pre_beta = beta[pre_indices]
        pre_covariance = covariance[np.ix_(pre_indices, pre_indices)]
        if np.allclose(pre_covariance, 0.0, atol=1e-14):
            p_value = 1.0 if np.allclose(pre_beta, 0.0, atol=1e-10) else 0.0
        else:
            statistic = float(pre_beta.T @ np.linalg.pinv(pre_covariance) @ pre_beta)
            p_value = float(stats.chi2.sf(statistic, len(pre_indices)))
        status = (
            DiagnosticStatus.FAIL
            if p_value < artifact.design.pretrend_alpha
            else DiagnosticStatus.PASS
        )
        message = (
            "The joint event-study pre-trend test did not reject parallel trends."
            if status == DiagnosticStatus.PASS
            else "The joint event-study pre-trend test rejected parallel trends."
        )
    diagnostic = _diagnostic(
        "parallel_trends",
        status,
        message,
        p_value=p_value,
        threshold=artifact.design.pretrend_alpha,
        tested_coefficients=len(pre_indices),
        reference_relative_period=-1,
    )
    return tuple(points), diagnostic


def _metric_safety(metric: MetricSpec, estimate: MetricEstimate) -> tuple[bool, bool]:
    """Return (confidently_safe, confidently_harmful) for a guardrail."""

    margin = metric.harm_tolerance
    if metric.direction == MetricDirection.HIGHER_IS_BETTER:
        return estimate.ci_lower >= -margin, estimate.ci_upper < -margin
    return estimate.ci_upper <= margin, estimate.ci_lower > margin


def _primary_state(metric: MetricSpec, estimate: MetricEstimate) -> tuple[bool, bool]:
    if metric.direction == MetricDirection.HIGHER_IS_BETTER:
        return estimate.ci_lower >= metric.minimum_effect, estimate.ci_upper < 0.0
    return estimate.ci_upper <= -metric.minimum_effect, estimate.ci_lower > 0.0


def _make_decision(
    artifact: StudyDesignArtifact,
    diagnostics: Sequence[Diagnostic],
    primary: MetricEstimate | None,
    guardrails: Sequence[MetricEstimate],
) -> DecisionOutcome:
    blocking = tuple(
        diagnostic.code for diagnostic in diagnostics if diagnostic.status == DiagnosticStatus.FAIL
    )
    if blocking or primary is None:
        return DecisionOutcome(
            status=DecisionStatus.INSUFFICIENT_EVIDENCE,
            summary="The evidence gate failed; no causal rollout decision is supported.",
            rationale=(
                "At least one pre-specified data-quality or identification diagnostic failed.",
                "Resolve the blocking diagnostics and create a new analysis run.",
            ),
            blocking_diagnostics=blocking or ("estimate_unavailable",),
        )

    guardrail_states = [
        (metric, estimate, *_metric_safety(metric, estimate))
        for metric, estimate in zip(artifact.contract.guardrails, guardrails, strict=True)
    ]
    harmful_guardrails = [metric.name for metric, _, _, harmful in guardrail_states if harmful]
    if harmful_guardrails:
        return DecisionOutcome(
            status=DecisionStatus.STOP,
            summary="Stop: at least one guardrail shows harm beyond its frozen tolerance.",
            rationale=(f"Harmful guardrails: {', '.join(harmful_guardrails)}.",),
        )

    primary_meets, primary_harmful = _primary_state(artifact.contract.primary_metric, primary)
    if primary_harmful:
        return DecisionOutcome(
            status=DecisionStatus.STOP,
            summary="Stop: the primary metric shows statistically credible harm.",
            rationale=("The primary confidence interval lies entirely in the harmful direction.",),
        )

    warning_codes = tuple(
        diagnostic.code for diagnostic in diagnostics if diagnostic.status == DiagnosticStatus.WARN
    )
    if artifact.design.decision_policy.require_all_diagnostics and warning_codes:
        return DecisionOutcome(
            status=DecisionStatus.HOLD,
            summary="Hold: one or more frozen diagnostics remain warnings.",
            rationale=(
                "Resolve or explicitly redesign the study for warning diagnostics: "
                + ", ".join(warning_codes)
                + ".",
            ),
        )

    all_guardrails_safe = all(safe for _, _, safe, _ in guardrail_states)
    if primary_meets and all_guardrails_safe:
        return DecisionOutcome(
            status=DecisionStatus.GO,
            summary="Go: the primary threshold is met and all guardrails are non-inferior.",
            rationale=(
                "The primary confidence interval clears the frozen minimum effect.",
                "Every guardrail confidence interval clears its frozen harm tolerance.",
            ),
        )
    reasons = ["The primary confidence interval does not yet clear the frozen minimum effect."]
    if not all_guardrails_safe:
        reasons.append("At least one guardrail remains inconclusive against its harm tolerance.")
    return DecisionOutcome(
        status=DecisionStatus.HOLD,
        summary="Hold: the analysis is valid, but the frozen GO criteria are not all met.",
        rationale=tuple(reasons),
    )


def _holm_adjust(p_values: Sequence[float]) -> list[float]:
    count = len(p_values)
    adjusted = [1.0] * count
    running_max = 0.0
    for rank, index in enumerate(sorted(range(count), key=lambda item: p_values[item])):
        candidate = min(1.0, (count - rank) * p_values[index])
        running_max = max(running_max, candidate)
        adjusted[index] = running_max
    return adjusted


def _subgroup_direction(metric: MetricSpec, effect: float) -> str:
    if math.isclose(effect, 0.0, abs_tol=1e-12):
        return "neutral"
    beneficial = effect > 0.0 if metric.direction == MetricDirection.HIGHER_IS_BETTER else effect < 0.0
    return "favorable" if beneficial else "harmful"


def _subgroup_recommendation(direction: str, significant: bool) -> str:
    if not significant:
        return "No statistically reliable subgroup difference after multiplicity adjustment."
    if direction == "favorable":
        return "Favorable subgroup signal; use it for monitored rollout prioritization, not as a replacement for the overall decision."
    if direction == "harmful":
        return "Significant adverse subgroup signal; investigate before broad rollout."
    return "No directional subgroup effect."


def _consistency_test(
    estimates: Sequence[MetricEstimate], alpha: float
) -> ConsistencyTest | None:
    usable = [
        estimate
        for estimate in estimates
        if estimate.standard_error > 0.0
        and math.isfinite(estimate.standard_error)
        and math.isfinite(estimate.effect)
    ]
    if len(usable) < 3:
        return None
    weights = np.array([1.0 / estimate.standard_error**2 for estimate in usable])
    effects = np.array([estimate.effect for estimate in usable])
    pooled = float(np.sum(weights * effects) / np.sum(weights))
    statistic = float(np.sum(weights * (effects - pooled) ** 2))
    degrees_freedom = len(usable) - 1
    p_value = float(stats.chi2.sf(statistic, degrees_freedom))
    consistent = p_value >= alpha
    interpretation = (
        "Cochran’s Q did not detect effect heterogeneity across the estimable, mutually exclusive subgroups. This is not proof that effects are identical."
        if consistent
        else "Cochran’s Q detected effect heterogeneity across the estimable, mutually exclusive subgroups. Review subgroup estimates before rollout."
    )
    return ConsistencyTest(
        statistic=statistic,
        degrees_freedom=degrees_freedom,
        p_value=p_value,
        alpha=alpha,
        consistent=consistent,
        interpretation=interpretation,
    )


def _dimension_analyses(
    df: pd.DataFrame,
    artifact: StudyDesignArtifact,
    mapping: ColumnMapping,
) -> tuple[DimensionAnalysis, ...]:
    analyses: list[DimensionAnalysis] = []
    primary_metric = artifact.contract.primary_metric

    for dimension in mapping.dimension_cols:
        if dimension not in df.columns:
            analyses.append(
                DimensionAnalysis(
                    dimension=dimension,
                    skipped_reason="The selected dimension column is not present in the analyzed dataset.",
                )
            )
            continue
        levels = sorted(pd.unique(df[dimension].dropna()), key=lambda value: str(value))
        if len(levels) < 2:
            analyses.append(
                DimensionAnalysis(
                    dimension=dimension,
                    skipped_reason="At least two observed levels are required for a dimension analysis.",
                )
            )
            continue
        if len(levels) > 20:
            analyses.append(
                DimensionAnalysis(
                    dimension=dimension,
                    skipped_reason="The dimension has more than 20 levels and was skipped to avoid unstable, high-cardinality fishing.",
                )
            )
            continue

        if artifact.design.design_type == StudyDesignType.DIFFERENCE_IN_DIFFERENCES:
            per_unit_levels = df.groupby(mapping.unit_col)[dimension].nunique(dropna=False)
            if bool((per_unit_levels > 1).any()):
                analyses.append(
                    DimensionAnalysis(
                        dimension=dimension,
                        skipped_reason="The dimension changes within analysis units, so mutually exclusive DiD subgroup effects are not identified.",
                    )
                )
                continue

        raw: list[tuple[str, MetricEstimate]] = []
        skipped_levels: list[str] = []
        for level in levels:
            subset = df.loc[df[dimension] == level].copy()
            level_label = str(_python_scalar(level))
            try:
                if artifact.design.design_type == StudyDesignType.RANDOMIZED_AB:
                    labels = [allocation.label for allocation in artifact.design.allocations]
                    groups = _normalise_group(subset[mapping.treatment_col])
                    if any(int((groups == label).sum()) < 2 for label in labels):
                        skipped_levels.append(level_label)
                        continue
                    estimate = _estimate_rct_metric(
                        subset,
                        artifact,
                        mapping,
                        primary_metric,
                        apply_cuped=False,
                    )
                else:
                    diagnostics, treatment, _, _ = _did_validations(subset, artifact, mapping)
                    fatal_codes = {
                        "unit_time_grain",
                        "stable_treatment_assignment",
                        "panel_time_support",
                        "time_group_overlap",
                        "identification_rank",
                        "group_unit_count",
                    }
                    if any(
                        item.status == DiagnosticStatus.FAIL and item.code in fatal_codes
                        for item in diagnostics
                    ):
                        skipped_levels.append(level_label)
                        continue
                    estimate = _estimate_did_metric(
                        subset, artifact, mapping, treatment, primary_metric
                    )
            except (KeyError, TypeError, ValueError, np.linalg.LinAlgError):
                skipped_levels.append(level_label)
                continue
            raw.append((level_label, estimate))

        adjusted = _holm_adjust([estimate.p_value for _, estimate in raw])
        subgroups = tuple(
            SubgroupEstimate(
                dimension=dimension,
                level=level,
                estimate=estimate,
                adjusted_p_value=adjusted_p,
                significant=adjusted_p < artifact.design.alpha,
                direction=(direction := _subgroup_direction(primary_metric, estimate.effect)),
                recommendation=_subgroup_recommendation(
                    direction, adjusted_p < artifact.design.alpha
                ),
            )
            for (level, estimate), adjusted_p in zip(raw, adjusted, strict=True)
        )
        consistency = _consistency_test([estimate for _, estimate in raw], artifact.design.alpha)
        reasons: list[str] = []
        if skipped_levels:
            reasons.append("Unestimable levels: " + ", ".join(skipped_levels))
        if consistency is None:
            reasons.append("Cochran’s Q requires at least three subgroup estimates with non-zero standard errors.")
        analyses.append(
            DimensionAnalysis(
                dimension=dimension,
                consistency=consistency,
                subgroups=subgroups,
                skipped_reason=" ".join(reasons) or None,
            )
        )
    return tuple(analyses)


def _trace(
    design_type: StudyDesignType,
    diagnostics: Sequence[Diagnostic],
    transformations: Sequence[TransformationLogEntry],
    dimensions: Sequence[DimensionAnalysis],
) -> tuple[TraceEvent, ...]:
    failed = [item.code for item in diagnostics if item.status == DiagnosticStatus.FAIL]
    estimator = (
        "deterministic_rct_estimator"
        if design_type == StudyDesignType.RANDOMIZED_AB
        else "two_way_fixed_effects_clustered_estimator"
    )
    cleaning_operations = [
        item for item in transformations if item.details.get("user_confirmed") is True
    ]
    events: list[TraceEvent] = []
    if cleaning_operations:
        events.append(
            TraceEvent(
                sequence=len(events) + 1,
                stage="data",
                action="execute_confirmed_cleaning_plan",
                message="Executed the user-confirmed, allow-listed cleaning plan on a working copy and recorded every operation.",
                details={"operations": [item.operation for item in cleaning_operations]},
            )
        )
    events.append(
        TraceEvent(
            sequence=len(events) + 1,
            stage="data",
            action="snapshot_dataset",
            message="Hashed the analyzed working dataset and preserved the complete transformation lineage.",
        )
    )
    events.extend([
        TraceEvent(
            sequence=len(events) + 1,
            stage="diagnostics",
            action="run_frozen_evidence_gates",
            message="Ran deterministic data-quality and identification diagnostics.",
            details={"failed": failed},
        ),
        TraceEvent(
            sequence=len(events) + 2,
            stage="estimation",
            action=estimator,
            message="Executed the estimator declared by the frozen design.",
        )]
    )
    if dimensions:
        events.append(
            TraceEvent(
                sequence=len(events) + 1,
                stage="estimation",
                action="subgroup_consistency_analysis",
                message="Estimated exploratory subgroup effects, applied Holm multiplicity adjustment, and used inverse-variance Cochran’s Q where at least three subgroup estimates were available.",
                details={"dimensions": [item.dimension for item in dimensions]},
            )
        )
    events.append(
        TraceEvent(
            sequence=len(events) + 1,
            stage="decision",
            action="apply_frozen_thresholds",
            message="Applied the pre-committed primary and guardrail decision rules.",
        )
    )
    return tuple(events)


def analyze_study(
    df: pd.DataFrame,
    artifact: StudyDesignArtifact,
    mapping: ColumnMapping,
    options: AnalysisOptions | None = None,
) -> StudyAnalysisResult:
    """Run the frozen study design after executing any confirmed cleaning plan."""

    if not isinstance(df, pd.DataFrame):
        raise TypeError("df must be a pandas DataFrame")
    # ``model_copy(update=...)`` intentionally bypasses Pydantic validation. Revalidate
    # at the trust boundary so an in-memory hash/contract mismatch cannot reach an estimator.
    artifact = StudyDesignArtifact.model_validate_json(artifact.model_dump_json())
    options = options or AnalysisOptions()
    working, transformations = _apply_cleaning_plan(
        df,
        artifact,
        mapping,
        options.cleaning_plan,
        options.transformation_log,
    )
    snapshot = DatasetSnapshot(
        sha256=_dataset_hash(working),
        row_count=len(working),
        column_count=len(working.columns),
        transformations=tuple(transformations),
    )
    diagnostics, structurally_valid = _base_validations(working, artifact, mapping)
    lineage_valid = not transformations or transformations[-1].rows_after == len(working)
    diagnostics.append(
        _diagnostic(
            "transformation_lineage",
            DiagnosticStatus.PASS if lineage_valid else DiagnosticStatus.FAIL,
            (
                "The transformation log terminates at the analyzed dataset row count."
                if lineage_valid
                else "The transformation log does not terminate at the analyzed dataset row count."
            ),
            final_logged_rows=transformations[-1].rows_after if transformations else len(working),
            analyzed_rows=len(working),
        )
    )
    structurally_valid = structurally_valid and lineage_valid
    event_study: tuple[EventStudyPoint, ...] = ()
    dimension_analyses: tuple[DimensionAnalysis, ...] = ()
    primary: MetricEstimate | None = None
    guardrails: tuple[MetricEstimate, ...] = ()

    if structurally_valid and artifact.design.design_type == StudyDesignType.RANDOMIZED_AB:
        rct_diagnostics = _rct_validations(working, artifact, mapping)
        diagnostics.extend(rct_diagnostics)
        fatal_codes = {"unit_grain", "group_sample_size", "cuped_covariate"}
        fatal = any(
            diagnostic.status == DiagnosticStatus.FAIL and diagnostic.code in fatal_codes
            for diagnostic in rct_diagnostics
        )
        if not fatal:
            cuped = artifact.design.cuped_covariate is not None
            primary = _estimate_rct_metric(
                working,
                artifact,
                mapping,
                artifact.contract.primary_metric,
                apply_cuped=cuped,
            )
            guardrails = tuple(
                _estimate_rct_metric(working, artifact, mapping, metric, apply_cuped=False)
                for metric in artifact.contract.guardrails
            )
            if cuped:
                transformations.append(
                    TransformationLogEntry(
                        sequence=len(transformations) + 1,
                        operation="cuped_adjustment",
                        columns=(
                            mapping.metric_cols[artifact.contract.primary_metric.name],
                            mapping.covariate_cols[artifact.design.cuped_covariate],
                        ),
                        rows_before=len(working),
                        rows_after=len(working),
                        persisted=False,
                        details={"raw_dataset_unchanged": True},
                    )
                )
                snapshot = snapshot.model_copy(update={"transformations": tuple(transformations)})

    elif structurally_valid:
        did_diagnostics, treatment, times, pre_count = _did_validations(working, artifact, mapping)
        diagnostics.extend(did_diagnostics)
        fatal_codes = {
            "unit_time_grain",
            "stable_treatment_assignment",
            "panel_time_support",
            "time_group_overlap",
            "identification_rank",
            "group_unit_count",
        }
        fatal = any(
            diagnostic.status == DiagnosticStatus.FAIL and diagnostic.code in fatal_codes
            for diagnostic in did_diagnostics
        )
        if not fatal:
            event_study, pretrend = _event_study(
                working, artifact, mapping, treatment, times, pre_count
            )
            diagnostics.append(pretrend)
            primary = _estimate_did_metric(
                working, artifact, mapping, treatment, artifact.contract.primary_metric
            )
            guardrails = tuple(
                _estimate_did_metric(working, artifact, mapping, treatment, metric)
                for metric in artifact.contract.guardrails
            )

    if primary is not None and mapping.dimension_cols:
        dimension_analyses = _dimension_analyses(working, artifact, mapping)

    decision = _make_decision(artifact, diagnostics, primary, guardrails)
    return StudyAnalysisResult(
        study_id=artifact.study_id,
        design_type=artifact.design.design_type,
        dataset=snapshot,
        diagnostics=tuple(diagnostics),
        primary_estimate=primary,
        guardrail_estimates=guardrails,
        event_study=event_study,
        dimension_analyses=dimension_analyses,
        decision=decision,
        trace=_trace(
            artifact.design.design_type,
            diagnostics,
            transformations,
            dimension_analyses,
        ),
    )
