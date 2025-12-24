from __future__ import annotations

import os
from dataclasses import dataclass
from dotenv import load_dotenv


@dataclass(frozen=True)
class Settings:
    openai_api_key: str | None
    openai_model: str
    openai_base_url: str
    app_title: str = "Causal Agent - Experiment Design MVP"


def load_settings() -> Settings:
    load_dotenv(override=False)
    return Settings(
        openai_api_key=os.getenv("OPENAI_API_KEY"),
        openai_model=os.getenv("OPENAI_MODEL", "deepseek-chat"),
        openai_base_url=os.getenv("OPENAI_BASE_URL", "https://api.deepseek.com"),
    )
