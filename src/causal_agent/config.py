import os
from dataclasses import dataclass
from pathlib import Path

@dataclass(frozen=True)
class AppConfig:
    openai_api_key: str | None
    openai_model: str
    openai_temperature: float
    openai_max_output_tokens: int
    output_dir: Path

    @staticmethod
    def from_env() -> "AppConfig":
        api_key = os.getenv("OPENAI_API_KEY") or None
        model = os.getenv("OPENAI_MODEL", "deepseek-chat")
        temperature = float(os.getenv("OPENAI_TEMPERATURE", "0.2"))
        max_out = int(os.getenv("OPENAI_MAX_OUTPUT_TOKENS", "1200"))
        out_dir = Path(os.getenv("CAUSAL_AGENT_OUTPUT_DIR", "out"))
        return AppConfig(
            openai_api_key=api_key,
            openai_model=model,
            openai_temperature=temperature,
            openai_max_output_tokens=max_out,
            output_dir=out_dir,
        )
