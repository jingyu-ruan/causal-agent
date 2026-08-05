from __future__ import annotations

import hashlib
import json
from collections.abc import Generator

import numpy as np
import pandas as pd
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from backend.database import get_session
from backend.studies import router


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)

    def session_override() -> Generator[Session, None, None]:
        with Session(engine) as session:
            yield session

    app = FastAPI()
    app.include_router(router, prefix="/api")
    app.dependency_overrides[get_session] = session_override
    with TestClient(app) as test_client:
        yield test_client


def _rct_payload() -> dict[str, object]:
    return {
        "title": "Activation RCT",
        "business_question": "Should we roll out guided onboarding?",
        "hypothesis": "Guided onboarding increases activation.",
        "population": "Eligible new users",
        "intervention": "Guided onboarding",
        "comparator": "Current onboarding",
        "primary_metric": {
            "name": "activation",
            "kind": "binary",
            "direction": "higher_is_better",
            "minimum_effect": 0.01,
            "harm_tolerance": 0.0,
        },
        "guardrails": [],
        "design_type": "randomized_ab",
        "unit": "user_id",
        "retrospective": False,
        "baseline_value": 0.20,
        "alpha": 0.05,
        "power": 0.8,
        "expected_control_allocation": 0.5,
        "expected_treatment_allocation": 0.5,
        "expected_daily_units": 5000,
        "observation_window_days": 7,
        "notes": "Freeze this context with the design.",
    }


def test_design_freezes_contract_and_planning_fields(client: TestClient) -> None:
    response = client.post("/api/studies/design", json=_rct_payload())

    assert response.status_code == 200, response.text
    study = response.json()
    assert study["id"].startswith("study_")
    assert study["causal_contract"]["hypothesis"] == "Guided onboarding increases activation."
    assert study["causal_contract"]["notes"] == "Freeze this context with the design."
    assert study["causal_contract"]["observation_window_days"] == 7
    assert study["design_spec"]["is_frozen"] is True
    assert study["required_sample_size"] > 0
    assert study["estimated_duration_days"] > 0


def test_uploaded_analysis_is_persisted_with_provenance(client: TestClient) -> None:
    created = client.post("/api/studies/design", json=_rct_payload()).json()
    frame = pd.DataFrame(
        {
            "user_id": [f"user_{index}" for index in range(200)],
            "variant": ["control"] * 100 + ["treatment"] * 100,
            "activation": [0] * 80 + [1] * 20 + [0] * 60 + [1] * 40,
        }
    )
    mapping = {
        "unit_col": "user_id",
        "treatment_col": "variant",
        "metric_cols": {"activation": "activation"},
    }

    response = client.post(
        f"/api/studies/{created['id']}/analyze",
        files={"file": ("analysis.csv", frame.to_csv(index=False), "text/csv")},
        data={"mapping_json": json.dumps(mapping), "options_json": "{}"},
    )

    assert response.status_code == 200, response.text
    analyzed = response.json()
    assert analyzed["decision"]["status"] == "hold"
    assert analyzed["effect"]["estimate"] == pytest.approx(0.20)
    assert len(analyzed["runs"][0]["dataset_sha256"]) == 64
    assert analyzed["analysis"]["dataset"]["row_count"] == 200

    detail = client.get(f"/api/studies/{created['id']}")
    assert detail.status_code == 200
    assert len(detail.json()["runs"]) == 1

    artifact = client.get(f"/api/studies/{created['id']}/artifact")
    assert artifact.status_code == 200
    assert artifact.json()["design"]["is_frozen"] is True
    assert "attachment" in artifact.headers["content-disposition"]

    memo = client.get(f"/api/studies/{created['id']}/memo")
    assert memo.status_code == 200
    assert "**HOLD**" in memo.text
    assert "Dataset hash" in memo.text
    assert "no numerical value was authored by an LLM" in memo.text


def test_profile_proposes_confirmable_cleaning_and_dimensions_without_raw_samples(
    client: TestClient,
) -> None:
    created = client.post("/api/studies/design", json=_rct_payload()).json()
    frame = pd.DataFrame(
        {
            "user_id": [f"private_user_{index}" for index in range(180)],
            "variant": ["control"] * 90 + ["treatment"] * 90,
            "activation": [0, 1] * 90,
            "region": ["east", "north", "west"] * 60,
        }
    )
    frame.loc[0, "activation"] = np.nan
    frame = pd.concat([frame, frame.iloc[[1]]], ignore_index=True)
    content = frame.to_csv(index=False).encode()
    mapping = {
        "unit_col": "user_id",
        "treatment_col": "variant",
        "metric_cols": {"activation": "activation"},
        "covariate_cols": {},
    }

    response = client.post(
        f"/api/studies/{created['id']}/profile",
        files={"file": ("analysis.csv", content, "text/csv")},
        data={"mapping_json": json.dumps(mapping)},
    )

    assert response.status_code == 200, response.text
    profile = response.json()
    assert profile["source_sha256"] == hashlib.sha256(content).hexdigest()
    assert profile["suggested_dimensions"] == ["region"]
    assert {item["operation"] for item in profile["operations"]} == {
        "drop_exact_duplicates",
        "drop_missing_required",
    }
    assert profile["blocking_issues"] == []
    assert "private_user_" not in response.text


def test_analysis_requires_profile_hash_and_executes_confirmed_plan(client: TestClient) -> None:
    created = client.post("/api/studies/design", json=_rct_payload()).json()
    frame = pd.DataFrame(
        {
            "user_id": [f"user_{index}" for index in range(180)],
            "variant": ["control"] * 90 + ["treatment"] * 90,
            "activation": [0, 1] * 45 + [0, 1] * 45,
            "region": ["east", "north", "west"] * 60,
        }
    )
    frame.loc[0, "activation"] = np.nan
    frame = pd.concat([frame, frame.iloc[[1]]], ignore_index=True)
    content = frame.to_csv(index=False).encode()
    mapping = {
        "unit_col": "user_id",
        "treatment_col": "variant",
        "metric_cols": {"activation": "activation"},
        "covariate_cols": {},
        "dimension_cols": ["region"],
    }
    operations = [
        {"operation": "drop_exact_duplicates", "columns": []},
        {
            "operation": "drop_missing_required",
            "columns": ["user_id", "variant", "activation"],
        },
    ]

    mismatch = client.post(
        f"/api/studies/{created['id']}/analyze",
        files={"file": ("analysis.csv", content, "text/csv")},
        data={
            "mapping_json": json.dumps(mapping),
            "options_json": json.dumps(
                {
                    "transformation_log": [],
                    "cleaning_plan": {"source_sha256": "0" * 64, "operations": operations},
                }
            ),
        },
    )
    assert mismatch.status_code == 409

    response = client.post(
        f"/api/studies/{created['id']}/analyze",
        files={"file": ("analysis.csv", content, "text/csv")},
        data={
            "mapping_json": json.dumps(mapping),
            "options_json": json.dumps(
                {
                    "transformation_log": [],
                    "cleaning_plan": {
                        "source_sha256": hashlib.sha256(content).hexdigest(),
                        "operations": operations,
                    },
                }
            ),
        },
    )

    assert response.status_code == 200, response.text
    result = response.json()
    assert result["analysis"]["dataset"]["row_count"] == 179
    assert result["runs"][0]["row_count"] == 179
    assert [item["operation"] for item in result["analysis"]["dataset"]["transformations"]] == [
        "drop_exact_duplicates",
        "drop_missing_required",
    ]
    assert result["analysis"]["dimension_analyses"][0]["dimension"] == "region"


def test_did_rejects_rct_only_fields_instead_of_ignoring_them(client: TestClient) -> None:
    payload = _rct_payload()
    payload.update(
        {
            "design_type": "difference_in_differences",
            "estimand": "att",
            "treatment_start": 4,
            "minimum_pre_periods": 3,
        }
    )

    response = client.post("/api/studies/design", json=payload)

    assert response.status_code == 422
    assert "RCT-only fields are not valid" in response.text


def test_did_design_and_uploaded_panel_complete_the_api_lifecycle(client: TestClient) -> None:
    design = {
        "title": "Regional rollout",
        "business_question": "Did the regional rollout improve the target outcome?",
        "hypothesis": "The rollout increases the outcome by at least one point.",
        "design_type": "difference_in_differences",
        "population": "Eligible regions",
        "unit": "region_id",
        "intervention": "New product rollout",
        "comparator": "Business as usual",
        "primary_metric": {
            "name": "outcome",
            "kind": "continuous",
            "direction": "higher_is_better",
            "minimum_effect": 1.0,
        },
        "estimand": "att",
        "observation_window_days": 7,
        "treatment_start": 5,
        "minimum_pre_periods": 3,
    }
    created = client.post("/api/studies/design", json=design)
    assert created.status_code == 200, created.text

    rng = np.random.default_rng(20250802)
    rows: list[dict[str, float | int | str]] = []
    for unit in range(40):
        group = "treatment" if unit < 20 else "control"
        for period in range(10):
            outcome = 10.0 + 0.2 * unit + 0.3 * period
            if group == "treatment" and period >= 5:
                outcome += 2.0
            rows.append(
                {
                    "region_id": unit,
                    "period": period,
                    "group": group,
                    "outcome": outcome + rng.normal(scale=0.2),
                }
            )
    frame = pd.DataFrame(rows)
    mapping = {
        "unit_col": "region_id",
        "treatment_col": "group",
        "time_col": "period",
        "metric_cols": {"outcome": "outcome"},
        "covariate_cols": {},
    }

    response = client.post(
        f"/api/studies/{created.json()['id']}/analyze",
        files={"file": ("panel.csv", frame.to_csv(index=False), "text/csv")},
        data={"mapping_json": json.dumps(mapping), "options_json": "{}"},
    )

    assert response.status_code == 200, response.text
    result = response.json()
    assert result["decision"]["status"] == "go"
    assert result["effect"]["estimate"] == pytest.approx(2.0, abs=0.12)
    assert any(item["code"] == "parallel_trends" for item in result["diagnostics"])
