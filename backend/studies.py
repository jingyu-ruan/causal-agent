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


def _demo_frame(artifact: StudyDesignArtifact) -> pd.DataFrame:
    allocations = artifact.design.allocations
    control_n = allocations[0].required_n or 2000
    treatment_n = allocations[1].required_n or 2000
    rng = np.random.default_rng(artifact.design.fixed_random_seed)

    def binary_vector(size: int, rate: float) -> np.ndarray:
        values = np.zeros(size, dtype=int)
        values[: round(size * rate)] = 1
        rng.shuffle(values)
        return values

    groups = np.array([allocations[0].label] * control_n + [allocations[1].label] * treatment_n)
    activation = np.concatenate([binary_vector(control_n, 0.20), binary_vector(treatment_n, 0.225)])
    support = np.concatenate([binary_vector(control_n, 0.05), binary_vector(treatment_n, 0.05)])
    frame = pd.DataFrame(
        {
            "user_id": [f"demo_{index:06d}" for index in range(control_n + treatment_n)],
            "variant": groups,
            "activated_within_7d": activation,
            "support_contact_rate": support,
        }
    )
    return frame.sample(frac=1.0, random_state=artifact.design.fixed_random_seed).reset_index(
        drop=True
    )


@router.get("/demo/rct")
def verified_rct_demo(session: Session = Depends(get_session)) -> dict[str, Any]:
    request = StudyDesignRequest(
        title="Verified guided onboarding demo",
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
        baseline_value=0.20,
        expected_control_allocation=0.5,
        expected_treatment_allocation=0.5,
        expected_daily_units=5000,
        observation_window_days=7,
    )
    artifact = create_study_design(request)
    existing = session.get(StudyRecord, artifact.study_id)
    if existing is not None and existing.latest_result_json:
        return _study_payload(existing)
    frame = _demo_frame(artifact)
    result = analyze_study(
        frame,
        artifact,
        ColumnMapping(
            unit_col="user_id",
            treatment_col="variant",
            metric_cols={
                "activated_within_7d": "activated_within_7d",
                "support_contact_rate": "support_contact_rate",
            },
        ),
    )
    record = _persist_artifact(session, artifact)
    record.status = result.decision.status.value
    record.latest_result_json = result.model_dump_json()
    record.updated_at = utc_now()
    session.add(record)
    session.commit()
    session.refresh(record)
    return _study_payload(record)


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
