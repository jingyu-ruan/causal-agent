from __future__ import annotations

import hashlib
import json
import uuid
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlmodel import Session, select

from .database import get_session
from .models import ConversationRecord, utc_now

router = APIRouter(prefix="/conversations", tags=["conversations"])

MAX_STATE_BYTES = 1_000_000
MAX_CONVERSATIONS = 100


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ConversationCreate(StrictModel):
    title: str = Field(default="New conversation", min_length=1, max_length=160)
    status: str = Field(default="intake", min_length=1, max_length=40)
    model: str = Field(default="deepseek-v4-pro", min_length=1, max_length=120)
    study_id: str | None = Field(default=None, max_length=160)
    state: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_state_size(self) -> ConversationCreate:
        _encode_state(self.state)
        return self


class ConversationUpdate(StrictModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    status: str | None = Field(default=None, min_length=1, max_length=40)
    model: str | None = Field(default=None, min_length=1, max_length=120)
    study_id: str | None = Field(default=None, max_length=160)
    state: dict[str, Any] | None = None

    @model_validator(mode="after")
    def validate_state_size(self) -> ConversationUpdate:
        if self.state is not None:
            _encode_state(self.state)
        return self


def _encode_state(state: dict[str, Any]) -> str:
    encoded = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
    if len(encoded.encode("utf-8")) > MAX_STATE_BYTES:
        raise ValueError("Conversation state exceeds the 1 MB limit")
    return encoded


def _workspace_hash(workspace_key: str | None) -> str:
    key = (workspace_key or "").strip()
    if not key:
        raise HTTPException(status_code=401, detail="A workspace key is required.")
    if not 16 <= len(key) <= 200 or any(character.isspace() for character in key):
        raise HTTPException(status_code=401, detail="The workspace key format is invalid.")
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def _owned_record(session: Session, conversation_id: str, workspace_hash: str) -> ConversationRecord:
    record = session.get(ConversationRecord, conversation_id)
    if record is None or record.workspace_hash != workspace_hash:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return record


def _summary(record: ConversationRecord) -> dict[str, Any]:
    return {
        "id": record.id,
        "title": record.title,
        "status": record.status,
        "model": record.model,
        "study_id": record.study_id,
        "created_at": record.created_at.isoformat(),
        "updated_at": record.updated_at.isoformat(),
    }


def _detail(record: ConversationRecord) -> dict[str, Any]:
    return {**_summary(record), "state": json.loads(record.state_json)}


@router.post("")
def create_conversation(
    payload: ConversationCreate,
    workspace_key: str | None = Header(default=None, alias="X-Workspace-Key"),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    record = ConversationRecord(
        id=f"conv_{uuid.uuid4().hex}",
        workspace_hash=_workspace_hash(workspace_key),
        title=payload.title,
        status=payload.status,
        model=payload.model,
        study_id=payload.study_id,
        state_json=_encode_state(payload.state),
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return _detail(record)


@router.get("")
def list_conversations(
    workspace_key: str | None = Header(default=None, alias="X-Workspace-Key"),
    session: Session = Depends(get_session),
) -> list[dict[str, Any]]:
    workspace_hash = _workspace_hash(workspace_key)
    statement = (
        select(ConversationRecord)
        .where(ConversationRecord.workspace_hash == workspace_hash)
        .order_by(ConversationRecord.updated_at.desc())
        .limit(MAX_CONVERSATIONS)
    )
    return [_summary(record) for record in session.exec(statement).all()]


@router.get("/{conversation_id}")
def get_conversation(
    conversation_id: str,
    workspace_key: str | None = Header(default=None, alias="X-Workspace-Key"),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    record = _owned_record(session, conversation_id, _workspace_hash(workspace_key))
    return _detail(record)


@router.put("/{conversation_id}")
def update_conversation(
    conversation_id: str,
    payload: ConversationUpdate,
    workspace_key: str | None = Header(default=None, alias="X-Workspace-Key"),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    record = _owned_record(session, conversation_id, _workspace_hash(workspace_key))
    fields = payload.model_fields_set
    if "title" in fields and payload.title is not None:
        record.title = payload.title
    if "status" in fields and payload.status is not None:
        record.status = payload.status
    if "model" in fields and payload.model is not None:
        record.model = payload.model
    if "study_id" in fields:
        record.study_id = payload.study_id
    if "state" in fields and payload.state is not None:
        record.state_json = _encode_state(payload.state)
    record.updated_at = utc_now()
    session.add(record)
    session.commit()
    session.refresh(record)
    return _detail(record)


@router.delete("/{conversation_id}", status_code=204)
def delete_conversation(
    conversation_id: str,
    workspace_key: str | None = Header(default=None, alias="X-Workspace-Key"),
    session: Session = Depends(get_session),
) -> None:
    record = _owned_record(session, conversation_id, _workspace_hash(workspace_key))
    session.delete(record)
    session.commit()
