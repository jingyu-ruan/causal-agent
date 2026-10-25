from __future__ import annotations

import hashlib
import json
import uuid
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel, ValidationError
from sqlmodel import Session, select

from causal_agent.lifecycle import (
    AnalysisOptions,
    ColumnMapping,
    MetricDirection,
    MetricKind,
    MetricSpec,
    StudyDesignArtifact,
    StudyDesignRequest,
    StudyDesignType,
    analyze_study,
    create_study_design,
)

from .data_preparation import DatasetPreparationProfile, profile_dataset
from .database import get_session
from .models import StudyRecord, StudyRunRecord, utc_now
from .uploads import parse_analysis_frame, read_upload_bytes

router = APIRouter(prefix="/studies", tags=["studies"])


class SyntheticDatasetRequest(BaseModel):
    """Optional numeric context used to make the generated demo realistic."""

    baseline_value: float | None = None
    outcome_standard_deviation: float | None = None


def _validation_detail(exc: ValidationError) -> list[dict[str, Any]]:
    return exc.errors(include_url=False, include_input=False)


def _effect_payload(result: dict[str, Any] | None) -> dict[str, Any] | None:
    if not result or not result.get("primary_estimate"):
        return None
    estimate = result["primary_estimate"]
    return {
        "estimate": estimate.get("effect"),
        "ci_lower": estimate.get("ci_lower"),
        "ci_upper": estimate.get("ci_upper"),
        "p_value": estimate.get("p_value"),
        "relative_lift": estimate.get("relative_lift"),
        "standard_error": estimate.get("standard_error"),
        "control_mean": estimate.get("control_mean"),
        "treatment_mean": estimate.get("treatment_mean"),
        "estimand": estimate.get("method"),
    }


def _study_payload(
    record: StudyRecord,
    *,
    runs: list[StudyRunRecord] | None = None,
) -> dict[str, Any]:
    artifact = json.loads(record.artifact_json)
    result = json.loads(record.latest_result_json) if record.latest_result_json else None
    design = artifact["design"]
    contract = artifact["contract"]
    trace = list(artifact.get("trace", []))
    if result:
        trace.extend(result.get("trace", []))
    payload: dict[str, Any] = {
        **artifact,
        "id": record.id,
        "name": record.title,
        "status": record.status,
        "mode": "retrospective" if contract.get("retrospective") else "prospective",
        "design_type": record.design_type,
        "created_at": record.created_at.isoformat(),
        "updated_at": record.updated_at.isoformat(),
        "causal_contract": contract,
        "design_spec": design,
        "sample_size": {
            "required_total": design.get("required_total_sample_size"),
            "allocations": design.get("allocations", []),
        },
        "required_sample_size": design.get("required_total_sample_size"),
        "estimated_duration_days": design.get("estimated_duration_days"),
        "analysis": result,
        "diagnostics": result.get("diagnostics", []) if result else [],
        "effect": _effect_payload(result),
        "decision": result.get("decision") if result else None,
        "decision_memo": result.get("decision", {}).get("summary") if result else None,
        "trace": trace,
    }
    if runs is not None:
        payload["runs"] = [
            {
                "id": run.id,
                "filename": run.filename,
                "dataset_sha256": run.dataset_sha256,
                "row_count": run.row_count,
                "created_at": run.created_at.isoformat(),
                "result": json.loads(run.result_json),
            }
            for run in runs
        ]
    return payload


def _persist_artifact(session: Session, artifact: StudyDesignArtifact) -> StudyRecord:
    existing = session.get(StudyRecord, artifact.study_id)
    if existing is not None:
        return existing
    record = StudyRecord(
        id=artifact.study_id,
        title=artifact.contract.title,
        design_type=artifact.design.design_type.value,
        status="designed",
        artifact_json=artifact.model_dump_json(),
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return record


def _get_record(session: Session, study_id: str) -> StudyRecord:
    record = session.get(StudyRecord, study_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Study not found")
    return record


def _contract_field(artifact: StudyDesignArtifact, role: str) -> str:
    for field in artifact.data_contract.fields:
        if field.role == role:
            return field.logical_name
    raise ValueError(f"The frozen contract does not declare a {role} field")


def _binary_probability(value: float) -> float:
    return float(np.clip(value, 0.02, 0.98))


def _metric_values(
    metric: MetricSpec,
    size: int,
    mean: float,
    rng: np.random.Generator,
    standard_deviation: float,
) -> np.ndarray:
    if metric.kind == MetricKind.BINARY:
        return rng.binomial(1, _binary_probability(mean), size=size).astype(int)
    return rng.normal(loc=mean, scale=max(standard_deviation, 0.01), size=size)


def _synthetic_time_values(artifact: StudyDesignArtifact) -> list[int | float | str]:
    treatment_start = artifact.design.treatment_start
    if treatment_start is None:
        raise ValueError("A DiD design must declare treatment_start before generating data")
    pre_periods = max(artifact.design.minimum_pre_periods, 3)
    post_periods = max(pre_periods, 5)
    try:
        numeric_start = float(treatment_start)
    except (TypeError, ValueError):
        numeric_start = float("nan")
    if np.isfinite(numeric_start):
        start = int(numeric_start) if numeric_start.is_integer() else numeric_start
        return [start + offset for offset in range(-pre_periods, post_periods)]

    parsed_start = pd.to_datetime(treatment_start, errors="coerce")
    if pd.isna(parsed_start):
        raise ValueError("treatment_start must be numeric or parseable as a date")
    step_days = max(1, artifact.contract.observation_window_days)
    return [
        (parsed_start + pd.Timedelta(days=offset * step_days)).strftime("%Y-%m-%d")
        for offset in range(-pre_periods, post_periods)
    ]


def _synthetic_rct_frame(
    artifact: StudyDesignArtifact,
    payload: SyntheticDatasetRequest,
) -> pd.DataFrame:
    unit_col = _contract_field(artifact, "unit")
    treatment_col = _contract_field(artifact, "treatment")
    primary = artifact.contract.primary_metric
    metrics = (primary, *artifact.contract.guardrails)
    requested_counts = [allocation.required_n or 200 for allocation in artifact.design.allocations]
    requested_total = sum(requested_counts)
    max_rows = 100_000
    target_total = max(40, min(requested_total, max_rows))
    control_count = max(20, round(target_total * artifact.design.allocations[0].fraction))
    treatment_count = max(20, target_total - control_count)
    rng = np.random.default_rng(artifact.design.fixed_random_seed)
    labels = [allocation.label for allocation in artifact.design.allocations]
    groups = np.array([labels[0]] * control_count + [labels[1]] * treatment_count, dtype=object)
    frame = pd.DataFrame(
        {
            unit_col: [f"synthetic_{index:07d}" for index in range(len(groups))],
            treatment_col: groups,
        }
    )

    default_primary_baseline = 0.20 if primary.kind == MetricKind.BINARY else 10.0
    primary_baseline = (
        payload.baseline_value
        if payload.baseline_value is not None
        else default_primary_baseline
    )
    primary_effect = primary.minimum_effect * 1.5
    primary_sign = 1.0 if primary.direction == MetricDirection.HIGHER_IS_BETTER else -1.0
    for metric_index, metric in enumerate(metrics):
        is_primary = metric.name == primary.name
        if is_primary:
            baseline = primary_baseline
            effect = primary_sign * primary_effect
        else:
            baseline = 0.05 if metric.kind == MetricKind.BINARY else 1.0
            effect = 0.0
        standard_deviation = (
            payload.outcome_standard_deviation
            if is_primary and payload.outcome_standard_deviation is not None
            else max(abs(metric.minimum_effect), 0.5) if metric.kind == MetricKind.CONTINUOUS else 1.0
        )
        control_values = _metric_values(metric, control_count, baseline, rng, standard_deviation)
        treatment_values = _metric_values(
            metric,
            treatment_count,
            baseline + effect,
            rng,
            standard_deviation,
        )
        frame[metric.name] = np.concatenate([control_values, treatment_values])
        if metric_index == 0 and artifact.design.cuped_covariate:
            covariate = rng.normal(0.0, 1.0, size=len(frame))
            frame[artifact.design.cuped_covariate] = covariate

    if artifact.design.cuped_covariate and artifact.design.cuped_covariate not in frame:
        frame[artifact.design.cuped_covariate] = rng.normal(0.0, 1.0, size=len(frame))
    return frame.iloc[rng.permutation(len(frame))].reset_index(drop=True)


def _synthetic_did_frame(
    artifact: StudyDesignArtifact,
    payload: SyntheticDatasetRequest,
) -> pd.DataFrame:
    unit_col = _contract_field(artifact, "unit")
    treatment_col = _contract_field(artifact, "treatment")
    time_col = _contract_field(artifact, "time")
    primary = artifact.contract.primary_metric
    metrics = (primary, *artifact.contract.guardrails)
    times = _synthetic_time_values(artifact)
    pre_periods = max(artifact.design.minimum_pre_periods, 3)
    units_per_group = max(artifact.design.minimum_group_size, 20)
    labels = [allocation.label for allocation in artifact.design.allocations]
    primary_baseline = payload.baseline_value
    if primary_baseline is None:
        primary_baseline = 0.28 if primary.kind == MetricKind.BINARY else 10.0
    primary_effect = primary.minimum_effect * 1.5
    primary_sign = 1.0 if primary.direction == MetricDirection.HIGHER_IS_BETTER else -1.0
    standard_deviation = payload.outcome_standard_deviation or max(
        abs(primary.minimum_effect) * 0.35,
        0.20,
    )
    rng = np.random.default_rng(artifact.design.fixed_random_seed)
    rows: list[dict[str, int | float | str]] = []
    for group_index, label in enumerate(labels):
        for unit_index in range(units_per_group):
            unit_number = group_index * units_per_group + unit_index
            for period_index, time_value in enumerate(times):
                post = period_index >= pre_periods
                row: dict[str, int | float | str] = {
                    unit_col: f"synthetic_unit_{unit_number:04d}",
                    treatment_col: label,
                    time_col: time_value,
                }
                for metric in metrics:
                    is_primary = metric.name == primary.name
                    baseline = primary_baseline if is_primary else (
                        0.08 if metric.kind == MetricKind.BINARY else 1.0
                    )
                    treatment_effect = (
                        primary_sign * primary_effect
                        if is_primary and group_index == 1 and post
                        else 0.0
                    )
                    trend = 0.005 * period_index if metric.kind == MetricKind.BINARY else 0.30 * period_index
                    unit_offset = 0.002 * unit_index if metric.kind == MetricKind.BINARY else 0.20 * unit_index
                    mean = baseline + trend + unit_offset + treatment_effect
                    value = _metric_values(metric, 1, mean, rng, standard_deviation)[0]
                    row[metric.name] = int(value) if metric.kind == MetricKind.BINARY else float(value)
                rows.append(row)
    return pd.DataFrame(rows)


def _synthetic_frame(
    artifact: StudyDesignArtifact,
    payload: SyntheticDatasetRequest,
) -> pd.DataFrame:
    if artifact.design.design_type == StudyDesignType.RANDOMIZED_AB:
        return _synthetic_rct_frame(artifact, payload)
    return _synthetic_did_frame(artifact, payload)


def _decision_memo(record: StudyRecord) -> str:
    artifact = json.loads(record.artifact_json)
    if not record.latest_result_json:
        raise HTTPException(status_code=409, detail="Analyze a dataset before exporting a memo")
    result = json.loads(record.latest_result_json)
    contract = artifact["contract"]
    design = artifact["design"]
    decision = result["decision"]
    estimate = result.get("primary_estimate")

    lines = [
        f"# Decision memo — {contract['title']}",
        "",
        f"- Study ID: `{record.id}`",
        f"- Design: `{design['design_type']}`",
        f"- Design hash: `{design['spec_hash']}`",
        f"- Dataset hash: `{result['dataset']['sha256']}`",
        "",
        "## Decision",
        "",
        f"**{decision['status'].replace('_', ' ').upper()}** — {decision['summary']}",
        "",
    ]
    if decision.get("rationale"):
        lines.extend(f"- {reason}" for reason in decision["rationale"])
        lines.append("")
    lines.extend(
        [
            "## Causal contract",
            "",
            f"- Question: {contract['business_question']}",
            f"- Hypothesis: {contract['hypothesis']}",
            f"- Population: {contract['population']}",
            f"- Intervention: {contract['intervention']}",
            f"- Comparator: {contract['comparator']}",
            f"- Estimand: `{contract['estimand']}`",
            "",
            "## Primary estimate",
            "",
        ]
    )
    if estimate:
        lines.extend(
            [
                f"- Metric: `{estimate['metric_name']}`",
                f"- Method: `{estimate['method']}`",
                f"- Effect: `{estimate['effect']:.6g}`",
                f"- Confidence interval: `[{estimate['ci_lower']:.6g}, {estimate['ci_upper']:.6g}]`",
                f"- p-value: `{estimate['p_value']:.6g}`",
            ]
        )
    else:
        lines.append("No estimate was produced because an evidence gate blocked estimation.")
    lines.extend(["", "## Diagnostics", "", "| Check | Status | Message |", "| --- | --- | --- |"])
    for diagnostic in result["diagnostics"]:
        message = str(diagnostic["message"]).replace("|", "\\|")
        lines.append(f"| `{diagnostic['code']}` | **{diagnostic['status']}** | {message} |")
    lines.extend(
        [
            "",
            "---",
            "Generated from deterministic lifecycle artifacts; no numerical value was authored by an LLM.",
            "",
        ]
    )
    return "\n".join(lines)


@router.post("/design")
def create_design(
    payload: StudyDesignRequest,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    artifact = create_study_design(payload)
    record = _persist_artifact(session, artifact)
    return _study_payload(record)


@router.get("")
def list_studies(session: Session = Depends(get_session)) -> list[dict[str, Any]]:
    statement = select(StudyRecord).order_by(StudyRecord.updated_at.desc())
    return [_study_payload(record) for record in session.exec(statement).all()]


def _demo_frame(artifact: StudyDesignArtifact, scenario: str = "go") -> pd.DataFrame:
    allocations = artifact.design.allocations
    control_n = allocations[0].required_n or 2000
    treatment_n = allocations[1].required_n or 2000
    rng = np.random.default_rng(artifact.design.fixed_random_seed)

    def binary_vector(size: int, rate: float) -> np.ndarray:
        values = np.zeros(size, dtype=int)
        values[: round(size * rate)] = 1
        rng.shuffle(values)
        return values

    def categorical_vector(size: int, levels: tuple[str, ...]) -> np.ndarray:
        return np.array([levels[index % len(levels)] for index in range(size)], dtype=object)

    def stratified_binary_vector(
        size: int,
        levels: tuple[str, ...],
        rates: dict[str, float],
    ) -> np.ndarray:
        values = np.zeros(size, dtype=int)
        for index, level in enumerate(levels):
            positions = np.arange(index, size, len(levels))
            values[positions] = binary_vector(len(positions), rates[level])
        return values

    groups = np.array([allocations[0].label] * control_n + [allocations[1].label] * treatment_n)
    audience_levels = ("New users", "Returning users", "Power users")
    platform_levels = ("Web", "iOS", "Android", "Other")
    audience = np.concatenate([
        categorical_vector(control_n, audience_levels),
        categorical_vector(treatment_n, audience_levels),
    ])
    platform = np.concatenate([
        categorical_vector(control_n, platform_levels),
        categorical_vector(treatment_n, platform_levels),
    ])
    control_rates = {
        "New users": 0.18,
        "Returning users": 0.20,
        "Power users": 0.22,
    }
    treatment_rates = {
        "New users": 0.205,
        "Returning users": 0.225,
        "Power users": 0.245,
    }
    if scenario == "hold":
        treatment_rates = {level: rate - 0.020 for level, rate in treatment_rates.items()}
    activation = np.concatenate([
        stratified_binary_vector(
            control_n,
            audience_levels,
            control_rates,
        ),
        stratified_binary_vector(
            treatment_n,
            audience_levels,
            treatment_rates,
        ),
    ])
    support = np.concatenate([
        stratified_binary_vector(
            control_n,
            platform_levels,
            {"Web": 0.04, "iOS": 0.05, "Android": 0.06, "Other": 0.05},
        ),
        stratified_binary_vector(
            treatment_n,
            platform_levels,
            {"Web": 0.04, "iOS": 0.05, "Android": 0.06, "Other": 0.05},
        ),
    ])
    frame = pd.DataFrame(
        {
            "user_id": [f"demo_{index:06d}" for index in range(control_n + treatment_n)],
            "variant": groups,
            "activated_within_7d": activation,
            "support_contact_rate": support,
            "audience": audience,
            "platform": platform,
        }
    )
    frame = frame.sample(frac=1.0, random_state=artifact.design.fixed_random_seed).reset_index(
        drop=True
    )
    if scenario == "insufficient_evidence":
        frame.loc[1, "user_id"] = frame.loc[0, "user_id"]
    return frame


def _demo_rct_request(scenario: str) -> StudyDesignRequest:
    labels = {
        "go": "Verified guided onboarding demo",
        "hold": "Verified onboarding hold demo",
        "insufficient_evidence": "Verified evidence gate demo",
    }
    notes = {
        "go": "Verified demo includes audience and platform drilldowns.",
        "hold": "Verified demo shows a valid result that does not clear the frozen rollout threshold.",
        "insufficient_evidence": "Verified demo shows a duplicate-unit evidence gate before estimation.",
    }
    return StudyDesignRequest(
        title=labels[scenario],
        business_question="Should guided onboarding roll out to all eligible new users?",
        hypothesis="Guided onboarding increases activation without increasing support contacts.",
        population="Eligible new users",
        intervention="Guided onboarding checklist",
        comparator="Current onboarding",
        primary_metric=MetricSpec(
            name="activated_within_7d",
            kind=MetricKind.BINARY,
            direction=MetricDirection.HIGHER_IS_BETTER,
            minimum_effect=0.01,
        ),
        guardrails=(
            MetricSpec(
                name="support_contact_rate",
                kind=MetricKind.BINARY,
                direction=MetricDirection.LOWER_IS_BETTER,
                harm_tolerance=0.01,
            ),
        ),
        design_type=StudyDesignType.RANDOMIZED_AB,
        unit="user_id",
        notes=notes[scenario],
        baseline_value=0.20,
        expected_control_allocation=0.5,
        expected_treatment_allocation=0.5,
        expected_daily_units=5000,
        observation_window_days=7,
    )


def _did_demo_frame() -> pd.DataFrame:
    rng = np.random.default_rng(20250802)
    rows: list[dict[str, float | int | str]] = []
    for unit in range(40):
        group = "treatment" if unit < 20 else "control"
        for period in range(10):
            outcome = 10.0 + 0.2 * unit + 0.3 * period
            if group == "treatment" and period >= 5:
                outcome += 2.0
            rows.append({
                "region_id": unit,
                "period": period,
                "group": group,
                "outcome": outcome + rng.normal(scale=0.2),
            })
    return pd.DataFrame(rows)


def _materialize_demo(
    session: Session,
    artifact: StudyDesignArtifact,
    frame: pd.DataFrame,
    mapping: ColumnMapping,
) -> dict[str, Any]:
    existing = session.get(StudyRecord, artifact.study_id)
    if existing is not None and existing.latest_result_json:
        return _study_payload(existing)
    result = analyze_study(frame, artifact, mapping)
    record = _persist_artifact(session, artifact)
    record.status = result.decision.status.value
    record.latest_result_json = result.model_dump_json()
    record.updated_at = utc_now()
    session.add(record)
    session.commit()
    session.refresh(record)
    return _study_payload(record)


@router.get("/demo/rct")
def verified_rct_demo(session: Session = Depends(get_session)) -> dict[str, Any]:
    return verified_rct_demo_case("go", session)


@router.get("/demo/rct/{scenario}")
def verified_rct_demo_case(
    scenario: str,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    if scenario not in {"go", "hold", "insufficient_evidence"}:
        raise HTTPException(status_code=404, detail="Unknown RCT demo scenario")
    artifact = create_study_design(_demo_rct_request(scenario))
    return _materialize_demo(
        session,
        artifact,
        _demo_frame(artifact, scenario),
        ColumnMapping(
            unit_col="user_id",
            treatment_col="variant",
            metric_cols={
                "activated_within_7d": "activated_within_7d",
                "support_contact_rate": "support_contact_rate",
            },
            dimension_cols=("audience", "platform"),
        ),
    )


@router.get("/demo/did")
def verified_did_demo(session: Session = Depends(get_session)) -> dict[str, Any]:
    artifact = create_study_design(
        StudyDesignRequest(
            title="Verified regional rollout DiD demo",
            business_question="Did the regional rollout improve the target outcome?",
            hypothesis="The rollout increases the outcome after adoption without violating pre-trends.",
            population="Eligible regions",
            intervention="New product rollout",
            comparator="Business as usual",
            primary_metric=MetricSpec(
                name="outcome",
                kind=MetricKind.CONTINUOUS,
                direction=MetricDirection.HIGHER_IS_BETTER,
                minimum_effect=1.0,
            ),
            design_type=StudyDesignType.DIFFERENCE_IN_DIFFERENCES,
            unit="region_id",
            estimand="att",
            treatment_start=5,
            minimum_pre_periods=3,
            observation_window_days=1,
            notes="Verified demo includes an event-study view and a parallel-trends gate.",
        )
    )
    return _materialize_demo(
        session,
        artifact,
        _did_demo_frame(),
        ColumnMapping(
            unit_col="region_id",
            treatment_col="group",
            time_col="period",
            metric_cols={"outcome": "outcome"},
        ),
    )


@router.post("/{study_id}/synthetic-data")
def generate_synthetic_dataset(
    study_id: str,
    payload: SyntheticDatasetRequest | None = None,
    session: Session = Depends(get_session),
) -> Response:
    record = _get_record(session, study_id)
    artifact = StudyDesignArtifact.model_validate_json(record.artifact_json)
    try:
        frame = _synthetic_frame(artifact, payload or SyntheticDatasetRequest())
    except (TypeError, ValueError, KeyError) as exc:
        raise HTTPException(
            status_code=422,
            detail="The frozen design could not produce a valid synthetic dataset",
        ) from exc
    filename = f"{study_id}-synthetic.csv"
    return Response(
        content=frame.to_csv(index=False),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Synthetic-Row-Count": str(len(frame)),
            "X-Synthetic-Source": "frozen-design-contract",
        },
    )


@router.get("/{study_id}/artifact")
def download_design_artifact(study_id: str, session: Session = Depends(get_session)) -> Response:
    record = _get_record(session, study_id)
    return Response(
        content=record.artifact_json,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{study_id}-design.json"'},
    )


@router.get("/{study_id}/memo")
def download_decision_memo(study_id: str, session: Session = Depends(get_session)) -> Response:
    record = _get_record(session, study_id)
    return Response(
        content=_decision_memo(record),
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{study_id}-memo.md"'},
    )


@router.get("/{study_id}")
def get_study(study_id: str, session: Session = Depends(get_session)) -> dict[str, Any]:
    record = _get_record(session, study_id)
    statement = (
        select(StudyRunRecord)
        .where(StudyRunRecord.study_id == study_id)
        .order_by(StudyRunRecord.created_at.desc())
        .limit(20)
    )
    runs = list(session.exec(statement).all())
    return _study_payload(record, runs=runs)


def _parse_json_model(model: type[BaseModel], raw: str, label: str) -> BaseModel:
    try:
        decoded = json.loads(raw)
        return model.model_validate(decoded)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail=f"{label} must be valid JSON") from exc
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=_validation_detail(exc)) from exc


@router.post("/{study_id}/profile", response_model=DatasetPreparationProfile)
async def profile_uploaded_study(
    study_id: str,
    file: UploadFile = File(...),
    mapping_json: str = Form(...),
    session: Session = Depends(get_session),
) -> DatasetPreparationProfile:
    record = _get_record(session, study_id)
    mapping = _parse_json_model(ColumnMapping, mapping_json, "mapping_json")
    content = await read_upload_bytes(file)
    frame = parse_analysis_frame(file.filename, content)
    artifact = StudyDesignArtifact.model_validate_json(record.artifact_json)
    return profile_dataset(frame, content, artifact, mapping)


@router.post("/{study_id}/analyze")
async def analyze_uploaded_study(
    study_id: str,
    file: UploadFile = File(...),
    mapping_json: str = Form(...),
    options_json: str = Form("{}"),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    record = _get_record(session, study_id)

    mapping = _parse_json_model(ColumnMapping, mapping_json, "mapping_json")
    options = _parse_json_model(AnalysisOptions, options_json, "options_json")
    content = await read_upload_bytes(file)
    frame = parse_analysis_frame(file.filename, content)
    artifact = StudyDesignArtifact.model_validate_json(record.artifact_json)
    source_sha256 = hashlib.sha256(content).hexdigest()
    if options.cleaning_plan and options.cleaning_plan.source_sha256 != source_sha256:
        raise HTTPException(
            status_code=409,
            detail="The uploaded file changed after profiling; review a new cleaning plan before analysis",
        )
    try:
        result = analyze_study(frame, artifact, mapping, options)
    except (TypeError, ValueError, KeyError) as exc:
        raise HTTPException(
            status_code=422,
            detail="The dataset could not be analyzed against the frozen contract",
        ) from exc

    run = StudyRunRecord(
        id=f"run_{uuid.uuid4().hex}",
        study_id=study_id,
        filename=Path(file.filename or "upload").name,
        dataset_sha256=source_sha256,
        row_count=result.dataset.row_count,
        result_json=result.model_dump_json(),
    )
    record.latest_result_json = result.model_dump_json()
    record.status = result.decision.status.value
    record.updated_at = utc_now()
    session.add(run)
    session.add(record)
    session.commit()
    session.refresh(record)
    return _study_payload(record, runs=[run])
