from __future__ import annotations

from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Experiment(SQLModel, table=True):
    """Legacy dashboard record kept while the old API is phased out."""

    __table_args__ = {"extend_existing": True}

    id: int | None = Field(default=None, primary_key=True)
    name: str
    owner: str
    status: str
    metric: str
    progress: int = 0


class StudyRecord(SQLModel, table=True):
    """Persisted design artifact for the end-to-end causal workflow."""

    id: str = Field(primary_key=True)
    title: str
    design_type: str = Field(index=True)
    status: str = Field(default="designed", index=True)
    artifact_json: str
    latest_result_json: str | None = None
    created_at: datetime = Field(default_factory=utc_now, index=True)
    updated_at: datetime = Field(default_factory=utc_now)


class StudyRunRecord(SQLModel, table=True):
    """Immutable provenance record for one uploaded dataset analysis."""

    id: str = Field(primary_key=True)
    study_id: str = Field(foreign_key="studyrecord.id", index=True)
    filename: str
    dataset_sha256: str
    row_count: int
    result_json: str
    created_at: datetime = Field(default_factory=utc_now, index=True)


class ConversationRecord(SQLModel, table=True):
    """Server-owned conversation snapshot scoped to one anonymous workspace."""

    id: str = Field(primary_key=True)
    workspace_hash: str = Field(index=True)
    title: str
    status: str = Field(default="intake", index=True)
    model: str = Field(default="deepseek-v4-pro")
    study_id: str | None = Field(default=None, index=True)
    state_json: str = Field(default="{}")
    created_at: datetime = Field(default_factory=utc_now, index=True)
    updated_at: datetime = Field(default_factory=utc_now, index=True)
