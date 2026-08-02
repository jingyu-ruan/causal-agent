from __future__ import annotations

from collections.abc import Generator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import agent as agent_module
from backend.agent import router


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    app = FastAPI()
    app.include_router(router, prefix="/api")
    with TestClient(app) as test_client:
        yield test_client


def test_intake_requires_a_deepseek_key(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(agent_module, "_server_api_key", lambda: None)

    response = client.post("/api/agent/intake", json={})

    assert response.status_code == 401
    assert "DeepSeek API key" in response.json()["detail"]


def test_agent_never_sends_an_openai_key_to_deepseek(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "openai-key-must-not-be-reused")

    response = client.post("/api/agent/intake", json={})

    assert response.status_code == 401


def test_intake_returns_validated_interactive_blocks(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        agent_module,
        "_safe_model_call",
        lambda **_: {
            "message": "I understand that this is a prospective study. What decision should it support?",
            "draft_patch": {"mode": "prospective"},
            "blocks": [
                {
                    "type": "form",
                    "id": "decision-question",
                    "title": "Decision context",
                    "submit_label": "Continue",
                    "fields": [
                        {
                            "id": "business_question",
                            "label": "What decision should this study support?",
                            "control": "textarea",
                            "required": True,
                            "options": [],
                        }
                    ],
                }
            ],
            "next_action": "collect",
        },
    )

    response = client.post(
        "/api/agent/intake",
        headers={"X-DeepSeek-API-Key": "test-key"},
        json={
            "messages": [{"role": "user", "content": "I am planning before outcomes."}],
            "draft": {},
            "captured_fields": [],
            "model": "deepseek-v4-pro",
        },
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["draft_patch"]["mode"] == "prospective"
    assert "business_question" not in payload["draft_patch"]
    assert "mode" in payload["captured_fields"]
    assert "business_question" in payload["missing_fields"]
    assert payload["blocks"][0]["fields"][0]["id"] == "business_question"
    assert payload["ready_to_freeze"] is False


def test_server_independently_decides_when_draft_is_ready(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        agent_module,
        "_safe_model_call",
        lambda **_: {
            "message": "The causal contract is ready for your review.",
            "draft_patch": {},
            "blocks": [],
            "next_action": "review",
        },
    )
    draft = {
        "mode": "prospective",
        "business_question": "Should guided onboarding be rolled out?",
        "hypothesis": "Guidance helps users reach value sooner.",
        "population": "Eligible new users",
        "intervention": "Guided onboarding",
        "comparison": "Current onboarding",
        "primary_metric": "activation_rate",
        "metric_type": "binary",
        "success_threshold": 0.01,
        "guardrails": [],
        "design_type": "rct",
        "randomization_unit": "user_id",
        "baseline_rate": 0.20,
        "traffic_per_day": 1000,
        "metric_window_days": 7,
    }
    response = client.post(
        "/api/agent/intake",
        headers={"X-DeepSeek-API-Key": "test-key"},
        json={
            "draft": draft,
            "captured_fields": list(draft),
            "model": "deepseek-v4-pro",
        },
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["ready_to_freeze"] is True
    assert payload["next_action"] == "review"
    assert payload["missing_fields"] == []
    assert payload["blocks"] == []


def test_agent_derives_a_title_without_treating_defaults_as_confirmed(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        agent_module,
        "_safe_model_call",
        lambda **_: {
            "message": "I captured the decision. Now tell me why the change should work.",
            "draft_patch": {
                "business_question": "Should we roll out guided onboarding?",
            },
            "blocks": [],
            "next_action": "collect",
        },
    )

    response = client.post(
        "/api/agent/intake",
        headers={"X-DeepSeek-API-Key": "test-key"},
        json={
            "draft": {
                "mode": "prospective",
                "design_type": "rct",
                "baseline_rate": 0.1,
            },
            "captured_fields": ["mode"],
        },
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["draft_patch"]["name"] == "Should we roll out guided onboarding"
    assert "name" in payload["captured_fields"]
    assert "design_type" not in payload["captured_fields"]
    assert "baseline_rate" not in payload["captured_fields"]


def test_malformed_model_form_falls_back_without_losing_confirmed_values(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        agent_module,
        "_safe_model_call",
        lambda **_: {
            "message": "Invalid block",
            "draft_patch": {},
            "blocks": [{"type": "form", "id": "broken", "fields": []}],
        },
    )
    draft = {
        "mode": "prospective",
        "business_question": "Should we launch the new homepage?",
        "hypothesis": "Recommendations increase engagement.",
        "population": "Active users",
        "intervention": "New homepage",
        "comparison": "Current homepage",
        "primary_metric": "click_rate",
        "metric_type": "continuous",
        "success_threshold": 0.02,
        "design_type": "rct",
        "randomization_unit": "user",
        "baseline_rate": 0.4,
        "outcome_standard_deviation": 0.2,
        "traffic_per_day": 10000,
        "metric_window_days": 7,
    }

    response = client.post(
        "/api/agent/intake",
        headers={"X-DeepSeek-API-Key": "test-key"},
        json={
            "draft": draft,
            "captured_fields": list(draft),
            "model": "deepseek-v4-flash",
            "locale": "zh-CN",
        },
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["draft_patch"]["name"] == "Should we launch the new homepage"
    assert payload["missing_fields"] == ["guardrails"]
    assert payload["blocks"][0]["fields"][0]["id"] == "guardrails"
    assert "没有丢失" in payload["message"]


def test_guardrail_form_is_always_presented_as_natural_language(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        agent_module,
        "_safe_model_call",
        lambda **_: {
            "message": "请使用 JSON 数组提供护栏。",
            "draft_patch": {},
            "blocks": [
                {
                    "type": "form",
                    "id": "guardrail-json",
                    "title": "护栏 JSON",
                    "description": "填写机器字段。",
                    "submit_label": "继续",
                    "fields": [
                        {
                            "id": "guardrails",
                            "label": "JSON 数组",
                            "control": "textarea",
                            "required": True,
                            "placeholder": '[{"name":"crash_rate"}]',
                            "options": [],
                        }
                    ],
                }
            ],
            "next_action": "collect",
        },
    )
    draft = {
        "mode": "prospective",
        "business_question": "Should we launch the new homepage?",
        "hypothesis": "Recommendations increase engagement.",
        "population": "Active users",
        "intervention": "New homepage",
        "comparison": "Current homepage",
        "primary_metric": "click_rate",
        "metric_type": "binary",
        "success_threshold": 0.02,
        "design_type": "rct",
        "randomization_unit": "user",
        "baseline_rate": 0.4,
        "traffic_per_day": 10000,
        "metric_window_days": 7,
    }

    response = client.post(
        "/api/agent/intake",
        headers={"X-DeepSeek-API-Key": "test-key"},
        json={
            "draft": draft,
            "captured_fields": list(draft),
            "model": "deepseek-v4-flash",
            "locale": "zh-CN",
        },
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    field = payload["blocks"][0]["fields"][0]
    visible_copy = " ".join(
        str(value)
        for value in (
            payload["message"],
            payload["blocks"][0]["title"],
            payload["blocks"][0]["description"],
            field["label"],
            field["placeholder"],
            field["helper_text"],
        )
    )
    assert field["control"] == "textarea"
    assert field["options"] == []
    assert "JSON" not in visible_copy
    assert "自然语言" in visible_copy


def test_agent_converts_natural_language_guardrails_to_structured_rules(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        agent_module,
        "_safe_model_call",
        lambda **_: {
            "message": "护栏已转换，研究方案可以检查了。",
            "draft_patch": {
                "guardrails": [
                    {
                        "name": "crash_rate",
                        "kind": "binary",
                        "direction": "increase",
                        "tolerance": 0.002,
                    }
                ]
            },
            "blocks": [],
            "next_action": "review",
        },
    )
    draft = {
        "mode": "prospective",
        "business_question": "Should we launch the new homepage?",
        "hypothesis": "Recommendations increase engagement.",
        "population": "Active users",
        "intervention": "New homepage",
        "comparison": "Current homepage",
        "primary_metric": "click_rate",
        "metric_type": "binary",
        "success_threshold": 0.02,
        "design_type": "rct",
        "randomization_unit": "user",
        "baseline_rate": 0.4,
        "traffic_per_day": 10000,
        "metric_window_days": 7,
    }

    response = client.post(
        "/api/agent/intake",
        headers={"X-DeepSeek-API-Key": "test-key"},
        json={
            "messages": [
                {
                    "role": "user",
                    "content": "崩溃率不能上升超过 0.2 个百分点。",
                }
            ],
            "draft": draft,
            "captured_fields": list(draft),
            "model": "deepseek-v4-flash",
            "locale": "zh-CN",
        },
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["draft_patch"]["guardrails"] == [
        {
            "name": "crash_rate",
            "kind": "binary",
            "direction": "increase",
            "tolerance": 0.002,
        }
    ]
    assert "guardrails" in payload["captured_fields"]
    assert payload["ready_to_freeze"] is True
