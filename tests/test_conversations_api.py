from __future__ import annotations

from collections.abc import Generator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from backend.conversations import router
from backend.database import get_session


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


def test_conversations_require_a_workspace_key(client: TestClient) -> None:
    response = client.get("/api/conversations")

    assert response.status_code == 401


def test_conversation_snapshot_round_trip(client: TestClient) -> None:
    headers = {"X-Workspace-Key": "workspace-key-for-browser-one"}
    created = client.post(
        "/api/conversations",
        headers=headers,
        json={
            "title": "Recommendation click-rate study",
            "model": "deepseek-v4-flash",
            "state": {"stage": "intake", "messages": [{"role": "user", "text": "Hello"}]},
        },
    )

    assert created.status_code == 200, created.text
    conversation = created.json()
    assert conversation["id"].startswith("conv_")
    assert conversation["state"]["messages"][0]["text"] == "Hello"

    updated = client.put(
        f"/api/conversations/{conversation['id']}",
        headers=headers,
        json={
            "title": "Updated title",
            "status": "review",
            "study_id": "study_123",
            "state": {"stage": "review", "messages": conversation["state"]["messages"]},
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["status"] == "review"
    assert updated.json()["study_id"] == "study_123"

    listed = client.get("/api/conversations", headers=headers)
    assert listed.status_code == 200
    assert listed.json()[0]["title"] == "Updated title"
    assert "state" not in listed.json()[0]

    loaded = client.get(f"/api/conversations/{conversation['id']}", headers=headers)
    assert loaded.status_code == 200
    assert loaded.json()["state"]["stage"] == "review"


def test_conversations_are_isolated_by_workspace(client: TestClient) -> None:
    first_headers = {"X-Workspace-Key": "workspace-key-for-browser-one"}
    second_headers = {"X-Workspace-Key": "workspace-key-for-browser-two"}
    created = client.post("/api/conversations", headers=first_headers, json={}).json()

    assert client.get("/api/conversations", headers=second_headers).json() == []
    hidden = client.get(f"/api/conversations/{created['id']}", headers=second_headers)
    assert hidden.status_code == 404


def test_conversation_can_be_renamed_and_deleted(client: TestClient) -> None:
    headers = {"X-Workspace-Key": "workspace-key-for-browser-one"}
    created = client.post("/api/conversations", headers=headers, json={}).json()

    renamed = client.put(
        f"/api/conversations/{created['id']}",
        headers=headers,
        json={"title": "Renamed conversation"},
    )
    assert renamed.status_code == 200
    assert renamed.json()["title"] == "Renamed conversation"

    deleted = client.delete(f"/api/conversations/{created['id']}", headers=headers)
    assert deleted.status_code == 204
    assert client.get(f"/api/conversations/{created['id']}", headers=headers).status_code == 404
