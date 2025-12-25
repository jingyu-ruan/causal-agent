# src/causal_agent/llm.py
from __future__ import annotations

import json
import re
from dataclasses import dataclass

from openai import OpenAI

_JSON_RE = re.compile(r"\{.*\}", re.DOTALL)

@dataclass(frozen=True)
class LLMConfig:
    api_key: str
    model: str
    base_url: str

def call_llm_json(cfg: LLMConfig, prompt: str, schema_hint: dict) -> dict:
    client = OpenAI(api_key=cfg.api_key, base_url=cfg.base_url)

    system = (
        "You are a careful experiment design assistant. "
        "Return ONLY valid JSON that matches the requested schema. No markdown."
    )

    # DeepSeek 支持 JSON Output / response_format 这个参数在它的 Chat Completion 文档里有。 :contentReference[oaicite:2]{index=2}
    resp = client.chat.completions.create(
        model=cfg.model,
        messages=[
            {"role": "system", "content": system},
            {
                "role": "user",
                "content": (
                    "Schema (hint):\n"
                    f"{json.dumps(schema_hint, ensure_ascii=False)}\n\n"
                    "Task:\n"
                    f"{prompt}"
                ),
            },
        ],
        response_format={"type": "json_object"},
    )

    text = (resp.choices[0].message.content or "").strip()

    try:
        return json.loads(text)
    except Exception:
        m = _JSON_RE.search(text)
        if not m:
            raise
        return json.loads(m.group(0))
