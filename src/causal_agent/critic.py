from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from causal_agent.rag import LocalRAG
from causal_agent.schemas import ExperimentInputs, ExperimentSpec

_SYSTEM = """You are a strict reviewer of experiment plans.
Return ONLY valid JSON with keys: edits (list), risks_add (list), questions_add (list), improved_fields (object).
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
  "questions_add": ["open questions to add"],
  "improved_fields": {{
     "hypothesis": "optional string",
     "design.ramp_plan": "optional string",
     "analysis.srm_check": "optional string",
     "analysis.segment_policy": "optional string",
     "analysis.stopping_rule": "optional string"
  }}
}}
"""

        out = self.llm.generate_json(_SYSTEM, prompt)

        improved = spec.model_copy(deep=True)

        fields = out.get("improved_fields", {}) or {}
        if isinstance(fields, dict):
            if "hypothesis" in fields and isinstance(fields["hypothesis"], str):
                improved.hypothesis = fields["hypothesis"].strip()

            if "design.ramp_plan" in fields and isinstance(fields["design.ramp_plan"], str):
                improved.design.ramp_plan = fields["design.ramp_plan"].strip()

            if "analysis.srm_check" in fields and isinstance(fields["analysis.srm_check"], str):
                improved.analysis.srm_check = fields["analysis.srm_check"].strip()

            if "analysis.segment_policy" in fields and isinstance(fields["analysis.segment_policy"], str):
                improved.analysis.segment_policy = fields["analysis.segment_policy"].strip()

            if "analysis.stopping_rule" in fields and isinstance(fields["analysis.stopping_rule"], str):
                improved.analysis.stopping_rule = fields["analysis.stopping_rule"].strip()

        risks_add = out.get("risks_add", [])
        if isinstance(risks_add, list):
            improved.risks.extend([str(x) for x in risks_add if str(x).strip()])

        q_add = out.get("questions_add", [])
        if isinstance(q_add, list):
            improved.open_questions.extend([str(x) for x in q_add if str(x).strip()])

        # de-dup
        improved.risks = list(dict.fromkeys([r.strip() for r in improved.risks if r.strip()]))
        improved.open_questions = list(dict.fromkeys([q.strip() for q in improved.open_questions if q.strip()]))

        return improved
