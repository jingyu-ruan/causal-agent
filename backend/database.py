from __future__ import annotations

import os
from collections.abc import Generator

from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine


def _database_url() -> str:
    url = os.environ.get("DATABASE_URL", "sqlite:///./local.db")
    # Render and a few older providers still expose the deprecated scheme.
    if url.startswith("postgres://"):
        return "postgresql://" + url.removeprefix("postgres://")
    return url


DATABASE_URL = _database_url()
_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, pool_pre_ping=True, connect_args=_connect_args)


def create_db_and_tables() -> None:
    # Importing registers every table on SQLModel.metadata before create_all.
    from . import models as _models  # noqa: F401

    SQLModel.metadata.create_all(engine)


def check_database() -> None:
    with Session(engine) as session:
        session.exec(text("SELECT 1"))


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
