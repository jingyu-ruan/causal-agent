from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from causal_agent.schemas import ExperimentInputs, ExperimentSpec

if TYPE_CHECKING:
    from causal_agent.rag import LocalRAG

_SYSTEM = """You are a strict reviewer of experiment plans.
Return ONLY valid JSON with keys: edits (list), risks_add (list), improved_fields (object).
No markdown. No extra keys.
"""

@dataclass
class CriticService:
    rag: LocalRAG | None = None
    llm: Any | None = None

    def review_and_improve(self, inputs: ExperimentInputs, spec: ExperimentSpec) -> ExperimentSpec:
        if self.llm is None:
            return spec

        ctx = ""
        if self.rag is not None:
            ctx = "\n\n".join(self.rag.retrieve(inputs.goal, k=3))

        prompt = f"""Review this experiment spec for issues and propose minimal edits.

Goal:
{inputs.goal}

Context:
{ctx}

Spec JSON:
{spec.model_dump()}

Return JSON:
{{
  "edits": ["short bullets describing what you changed"],
  "risks_add": ["risk strings to add"],
  "improved_fields": {{
     "hypothesis": "optional string"
  }}
}}
"""

        out = self.llm.generate_json(_SYSTEM, prompt)

        improved = spec.model_copy(deep=True)

        fields = out.get("improved_fields", {}) or {}
        if isinstance(fields, dict):
            if "hypothesis" in fields and isinstance(fields["hypothesis"], str):
                improved.plan.hypothesis = fields["hypothesis"].strip()

        risks_add = out.get("risks_add", [])
        if isinstance(risks_add, list):
            improved.plan.risks.extend([str(x) for x in risks_add if str(x).strip()])

        # de-dup
        improved.plan.risks = list(
            dict.fromkeys(r.strip() for r in improved.plan.risks if r.strip())
        )

        return improved
