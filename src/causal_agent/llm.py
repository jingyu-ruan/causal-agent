from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from typing import Any

from openai import OpenAI

_JSON_RE = re.compile(r"\{.*\}", re.DOTALL)

class LLMError(RuntimeError):
    pass

def _extract_json(text: str) -> dict[str, Any]:
    text = text.strip()
    try:
        return json.loads(text)
    except Exception:
        m = _JSON_RE.search(text)
        if not m:
            raise LLMError("Model output is not valid JSON.")
        return json.loads(m.group(0))

@dataclass
class OpenAIResponsesLLM:
    model: str = "gpt-5.2"
    temperature: float = 0.2
    max_output_tokens: int = 1200

    def __post_init__(self) -> None:
        self.client = OpenAI()
        if not os.getenv("OPENAI_API_KEY"):
            raise LLMError("OPENAI_API_KEY is not set.")

    def generate_json(self, system: str, user: str) -> dict[str, Any]:
        resp = self.client.responses.create(
            model=self.model,
            input=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=self.temperature,
            max_output_tokens=self.max_output_tokens,
        )
        text = getattr(resp, "output_text", None)
        if not text:
            # defensive fallback
            try:
                text = resp.output[0].content[0].text  # type: ignore[attr-defined]
            except Exception as e:
                raise LLMError(f"Could not read response text: {e}") from e
        return _extract_json(text)
