import sys
import os
import json
import io
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from openai import OpenAI
import pandas as pd

# Add src to path
sys.path.append(os.path.join(os.path.dirname(__file__), "../src"))

from causal_agent.schemas import ExperimentInputs, ExperimentPlan, PowerRequest, PowerResult, ExperimentSpec, ExperimentContext, MetricType, AnalysisType
from causal_agent.planner import build_plan
from causal_agent.power import calculate_sample_size
from causal_agent.critic import CriticService
from causal_agent.config import load_settings, Settings
from causal_agent.rag import LocalRAG
from causal_agent.analysis import analyze_experiment, ExperimentAnalysis

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

# Initialize RAG (Global singleton)
# We assume docs are in ../docs relative to src or root
docs_path = Path(__file__).parent.parent / "docs"
rag_service = LocalRAG(settings)
if docs_path.exists():
    try:
        rag_service.load_docs(docs_path)
    except Exception as e:
        print(f"Warning: Failed to load RAG docs: {e}")

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
    # Index this experiment for future RAG
    # In a real app we'd save to DB and index asynchronously
    # Here we just index the goal and hypothesis
    try:
        rag_service.index_experiment(
            exp_id=f"exp_{inputs.goal[:10]}", 
            content=f"Goal: {inputs.goal}\nMetric: {inputs.primary_metric}\nPlan: {inputs.notes}", 
            metadata={"metric": inputs.primary_metric}
        )
    except Exception:
        pass # don't fail plan generation if RAG fails

    return build_plan(ctx, settings)

@router.post("/design/power", response_model=PowerResult)
def design_power(req: PowerRequest):
    return calculate_sample_size(req)

@router.post("/design/critique", response_model=ExperimentSpec)
def design_critique(spec: ExperimentSpec):
    return critic_service.review_and_improve(spec.inputs, spec)

@router.post("/analysis/upload", response_model=ExperimentAnalysis)
async def analysis_upload(
    file: UploadFile = File(...),
    metric_col: str = Form(...),
    variant_col: str = Form(...),
    metric_type: str = Form(...), # "binary" or "continuous"
    control_label: str = Form(...),
    covariate_col: str | None = Form(None),
    analysis_type: str = Form("frequentist")
):
    try:
        contents = await file.read()
        # Handle both CSV and JSON if needed, but CSV is standard
        df = pd.read_csv(io.BytesIO(contents))
        
        m_type = MetricType(metric_type)
        a_type = AnalysisType(analysis_type)
        
        result = analyze_experiment(
            df=df,
            metric_col=metric_col,
            variant_col=variant_col,
            metric_type=m_type,
            control_label=control_label,
            covariate_col=covariate_col,
            analysis_type=a_type
        )
        return result
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e)) from e

