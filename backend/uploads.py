from __future__ import annotations

import io
import os
from pathlib import Path

import pandas as pd
from fastapi import HTTPException, UploadFile

MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_BYTES", str(25 * 1024 * 1024)))
MAX_ANALYSIS_ROWS = int(os.environ.get("MAX_ANALYSIS_ROWS", "500000"))


async def read_upload_bytes(file: UploadFile) -> bytes:
    """Read an upload into memory without allowing an unbounded request body."""

    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)} MB upload limit",
        )
    if not content:
        raise HTTPException(status_code=422, detail="The uploaded file is empty")
    return content


def parse_analysis_frame(filename: str | None, content: bytes) -> pd.DataFrame:
    """Parse the intentionally narrow CSV/Parquet data surface."""

    safe_name = Path(filename or "upload.csv").name
    suffix = Path(safe_name).suffix.lower()
    try:
        if suffix == ".csv":
            frame = pd.read_csv(io.BytesIO(content))
        elif suffix in {".parquet", ".pq"}:
            frame = pd.read_parquet(io.BytesIO(content))
        else:
            raise HTTPException(
                status_code=415,
                detail="Study analysis accepts CSV or Parquet files",
            )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Could not parse {suffix or 'the uploaded file'}",
        ) from exc

    if len(frame) > MAX_ANALYSIS_ROWS:
        raise HTTPException(
            status_code=413,
            detail=f"Dataset exceeds the {MAX_ANALYSIS_ROWS:,} row analysis limit",
        )
    if frame.empty:
        raise HTTPException(status_code=422, detail="The uploaded dataset has no rows")
    if frame.columns.duplicated().any():
        duplicates = frame.columns[frame.columns.duplicated()].tolist()
        raise HTTPException(
            status_code=422,
            detail=f"Dataset contains duplicate column names: {', '.join(map(str, duplicates))}",
        )
    return frame
