from __future__ import annotations

import hashlib

import numpy as np
import pandas as pd
from pydantic import BaseModel, ConfigDict, Field

from causal_agent.lifecycle import ColumnMapping, MetricKind, StudyDesignArtifact, StudyDesignType


class PreparationModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DatasetColumnProfile(PreparationModel):
    name: str
    dtype: str
    missing_count: int = Field(ge=0)
    missing_rate: float = Field(ge=0.0, le=1.0)
    unique_count: int = Field(ge=0)


class CleaningPlanOperation(PreparationModel):
    id: str
    operation: str
    columns: list[str] = Field(default_factory=list)
    reason: str
    affected_rows: int = Field(ge=0)
    requires_confirmation: bool = True


class DatasetPreparationProfile(PreparationModel):
    source_sha256: str
    row_count: int = Field(ge=0)
    column_count: int = Field(ge=0)
    columns: list[DatasetColumnProfile]
    exact_duplicate_rows: int = Field(ge=0)
    duplicate_grain_rows: int = Field(ge=0)
    suggested_dimensions: list[str]
    operations: list[CleaningPlanOperation]
    blocking_issues: list[str]
    agent_summary: str


def _required_columns(
    artifact: StudyDesignArtifact, mapping: ColumnMapping
) -> tuple[list[str], list[str]]:
    logical_metrics = [
        artifact.contract.primary_metric.name,
        *(metric.name for metric in artifact.contract.guardrails),
    ]
    missing_roles = [name for name in logical_metrics if name not in mapping.metric_cols]
    required = [mapping.unit_col, mapping.treatment_col]
    required.extend(
        mapping.metric_cols[name] for name in logical_metrics if name in mapping.metric_cols
    )
    if artifact.design.design_type == StudyDesignType.DIFFERENCE_IN_DIFFERENCES:
        if not mapping.time_col:
            missing_roles.append("time")
        else:
            required.append(mapping.time_col)
    if artifact.design.cuped_covariate:
        covariate = artifact.design.cuped_covariate
        if covariate not in mapping.covariate_cols:
            missing_roles.append(covariate)
        else:
            required.append(mapping.covariate_cols[covariate])
    return list(dict.fromkeys(required)), missing_roles


def _candidate_dimensions(
    frame: pd.DataFrame, artifact: StudyDesignArtifact, mapping: ColumnMapping
) -> list[str]:
    required, _ = _required_columns(artifact, mapping)
    excluded = {
        *required,
        *mapping.metric_cols.values(),
        *mapping.covariate_cols.values(),
    }
    candidates: list[tuple[int, str]] = []
    for raw_column in frame.columns:
        column = str(raw_column)
        if column in excluded:
            continue
        unique = int(frame[column].nunique(dropna=True))
        if unique < 2 or unique > 12:
            continue
        normalized = column.lower()
        if normalized == "id" or normalized.endswith("_id") or "timestamp" in normalized:
            continue
        candidates.append((unique, column))
    return [column for _, column in sorted(candidates, key=lambda item: (item[0], item[1]))[:6]]


def profile_dataset(
    frame: pd.DataFrame,
    content: bytes,
    artifact: StudyDesignArtifact,
    mapping: ColumnMapping,
) -> DatasetPreparationProfile:
    """Create a metadata-only profile and an explicit, confirmable cleaning proposal."""

    required, missing_roles = _required_columns(artifact, mapping)
    missing_columns = [column for column in required if column not in frame.columns]
    suggested_dimensions = _candidate_dimensions(frame, artifact, mapping)
    columns = [
        DatasetColumnProfile(
            name=str(column),
            dtype=str(frame[column].dtype),
            missing_count=int(frame[column].isna().sum()),
            missing_rate=float(frame[column].isna().mean()),
            unique_count=int(frame[column].nunique(dropna=True)),
        )
        for column in frame.columns
    ]

    operations: list[CleaningPlanOperation] = []
    exact_duplicate_rows = int(frame.duplicated(keep="first").sum())
    if exact_duplicate_rows:
        operations.append(
            CleaningPlanOperation(
                id="drop-exact-duplicates",
                operation="drop_exact_duplicates",
                reason="Exact duplicate rows would count the same observation more than once.",
                affected_rows=exact_duplicate_rows,
            )
        )

    present_required = [column for column in required if column in frame.columns]
    missing_required_rows = (
        int(frame[present_required].isna().any(axis=1).sum()) if present_required else 0
    )
    if missing_required_rows:
        operations.append(
            CleaningPlanOperation(
                id="drop-missing-required",
                operation="drop_missing_required",
                columns=present_required,
                reason=(
                    "Required causal fields contain missing values. Complete-case removal is proposed; "
                    "the Agent never imputes primary outcomes."
                ),
                affected_rows=missing_required_rows,
            )
        )

    metrics = (artifact.contract.primary_metric, *artifact.contract.guardrails)
    invalid_metric_rows = pd.Series(False, index=frame.index)
    invalid_metric_columns: list[str] = []
    for metric in metrics:
        column = mapping.metric_cols.get(metric.name)
        if not column or column not in frame.columns:
            continue
        converted = pd.to_numeric(frame[column], errors="coerce")
        invalid = frame[column].notna() & (
            converted.isna() | ~np.isfinite(converted.to_numpy(dtype=float))
        )
        if metric.kind == MetricKind.BINARY:
            invalid |= frame[column].notna() & ~converted.isin([0.0, 1.0])
        if bool(invalid.any()):
            invalid_metric_columns.append(column)
            invalid_metric_rows |= invalid
    if bool(invalid_metric_rows.any()):
        operations.append(
            CleaningPlanOperation(
                id="drop-invalid-metrics",
                operation="drop_invalid_metric_values",
                columns=invalid_metric_columns,
                reason="These rows contain non-numeric, non-finite, or invalid binary metric values.",
                affected_rows=int(invalid_metric_rows.sum()),
            )
        )

    string_columns = [
        column
        for column in dict.fromkeys(
            [mapping.unit_col, mapping.treatment_col, *suggested_dimensions]
        )
        if column in frame.columns
    ]
    whitespace_rows = pd.Series(False, index=frame.index)
    whitespace_columns: list[str] = []
    for column in string_columns:
        original = frame[column]
        changed = original.map(
            lambda value: isinstance(value, str) and value != value.strip()
        )
        if bool(changed.any()):
            whitespace_columns.append(column)
            whitespace_rows |= changed
    if bool(whitespace_rows.any()):
        operations.insert(
            0,
            CleaningPlanOperation(
                id="trim-string-values",
                operation="trim_string_values",
                columns=whitespace_columns,
                reason="Leading or trailing whitespace can split otherwise identical groups.",
                affected_rows=int(whitespace_rows.sum()),
            ),
        )

    missing_dimension_columns = [
        column for column in suggested_dimensions if bool(frame[column].isna().any())
    ]
    if missing_dimension_columns:
        missing_dimension_rows = int(
            frame[missing_dimension_columns].isna().any(axis=1).sum()
        )
        operations.append(
            CleaningPlanOperation(
                id="fill-missing-dimensions",
                operation="fill_missing_dimensions",
                columns=missing_dimension_columns,
                reason="Keep missing dimension membership visible as an explicit '(missing)' level.",
                affected_rows=missing_dimension_rows,
            )
        )

    deduplicated = frame.drop_duplicates()
    grain_columns = [mapping.unit_col]
    if artifact.design.design_type == StudyDesignType.DIFFERENCE_IN_DIFFERENCES and mapping.time_col:
        grain_columns.append(mapping.time_col)
    duplicate_grain_rows = 0
    if all(column in deduplicated.columns for column in grain_columns):
        duplicate_grain_rows = int(
            deduplicated.duplicated(grain_columns, keep=False).sum()
        )

    blocking_issues: list[str] = []
    if missing_roles:
        blocking_issues.append("Missing logical mappings: " + ", ".join(missing_roles))
    if missing_columns:
        blocking_issues.append("Missing mapped columns: " + ", ".join(missing_columns))
    if duplicate_grain_rows:
        grain = " + ".join(grain_columns)
        blocking_issues.append(
            f"{duplicate_grain_rows} non-identical rows share the required {grain} grain; choose an upstream aggregation rule before analysis."
        )

    if blocking_issues:
        summary = "The Agent found blocking schema or grain issues. No analysis should run until they are resolved."
    elif operations:
        summary = (
            f"The Agent proposes {len(operations)} explicit cleaning operation(s). "
            "Review and confirm them before deterministic execution."
        )
    else:
        summary = "The Agent found no cleaning operation to propose; the dataset can proceed unchanged after confirmation."

    return DatasetPreparationProfile(
        source_sha256=hashlib.sha256(content).hexdigest(),
        row_count=len(frame),
        column_count=len(frame.columns),
        columns=columns,
        exact_duplicate_rows=exact_duplicate_rows,
        duplicate_grain_rows=duplicate_grain_rows,
        suggested_dimensions=suggested_dimensions,
        operations=operations,
        blocking_issues=blocking_issues,
        agent_summary=summary,
    )
