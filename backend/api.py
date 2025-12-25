import sys
import os
import json
from fastapi import APIRouter
from openai import OpenAI

# Add src to path
sys.path.append(os.path.join(os.path.dirname(__file__), "../src"))

from causal_agent.schemas import ExperimentInputs, ExperimentPlan, PowerRequest, PowerResult, ExperimentSpec, ExperimentContext
from causal_agent.planner import build_plan
from causal_agent.power import two_proportion_sample_size
from causal_agent.critic import CriticService
from causal_agent.config import load_settings, Settings

router = APIRouter()
settings = load_settings()

class LLMAdapter:
    def __init__(self, settings: Settings):
        self.client = OpenAI(api_key=settings.openai_api_key, base_url=settings.openai_base_url)
        self.model = settings.openai_model

    def generate_json(self, system_prompt: str, user_prompt: str) -> dict:
        try:
            resp = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                response_format={"type": "json_object"},
            )
            text = resp.choices[0].message.content or "{}"
            return json.loads(text)
        except Exception as e:
            print(f"LLM Error: {e}")
            return {}

# Initialize services
llm_adapter = LLMAdapter(settings) if settings.openai_api_key else None
critic_service = CriticService(llm=llm_adapter)

@router.post("/design/plan", response_model=ExperimentPlan)
def design_plan(inputs: ExperimentInputs):
    ctx = ExperimentContext(
        product_area="Experiment", 
        primary_metric=inputs.primary_metric,
        unit=inputs.randomization_unit,
        baseline_rate=inputs.baseline_rate,
        mde_abs=inputs.mde_abs,
        daily_traffic=inputs.traffic_per_day,
        guardrails=inputs.guardrails,
        segments=inputs.segments,
        notes=inputs.notes or inputs.goal,
    )
    return build_plan(ctx, settings)

@router.post("/design/power", response_model=PowerResult)
def design_power(req: PowerRequest):
    return two_proportion_sample_size(req)

@router.post("/design/critique", response_model=ExperimentSpec)
def design_critique(spec: ExperimentSpec):
    return critic_service.review_and_improve(spec.inputs, spec)
