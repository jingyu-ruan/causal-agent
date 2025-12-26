import io
import json
import os
import random
import sys
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from openai import OpenAI
from pydantic import BaseModel

# Add src to path
sys.path.append(os.path.join(os.path.dirname(__file__), "../src"))

from causal_agent.analysis import ExperimentAnalysis, analyze_experiment, analyze_observational
from causal_agent.causal import CausalResult
from causal_agent.config import Settings, load_settings
from causal_agent.critic import CriticService
from causal_agent.planner import build_plan
from causal_agent.power import calculate_sample_size
from causal_agent.rag import LocalRAG
from causal_agent.schemas import (
    AnalysisType,
    ExperimentContext,
    ExperimentInputs,
    ExperimentPlan,
    ExperimentSpec,
    MetricType,
    PowerRequest,
    PowerResult,
)

router = APIRouter()
settings = load_settings()

# --- Mock Database ---
class ExperimentSummary(BaseModel):
    id: int
    name: str
    owner: str
    status: str
    metric: str
    progress: int

class DashboardStats(BaseModel):
    total_experiments: int
    active_experiments: int
    drafting_experiments: int
    concluded_experiments: int

MOCK_EXPERIMENTS = [
    {"id": 1, "name": "Checkout Flow v2", "owner": "Alice", "status": "Running", "metric": "Conversion", "progress": 65},
    {"id": 2, "name": "New Pricing Tier", "owner": "Bob", "status": "Drafting", "metric": "Revenue", "progress": 0},
    {"id": 3, "name": "Homepage Hero", "owner": "Charlie", "status": "Analyzing", "metric": "Click-through", "progress": 100},
    {"id": 4, "name": "Recommendation Algo", "owner": "Alice", "status": "Concluded", "metric": "Retention", "progress": 100},
    {"id": 5, "name": "Dark Mode", "owner": "Dave", "status": "Running", "metric": "Engagement", "progress": 23},
]

class BrainRequest(BaseModel):
    query: str

class BrainResponse(BaseModel):
    answer: str

class PreviewResponse(BaseModel):
    columns: list[str]
    preview: list[dict[str, Any]]

# --- LLM Adapter ---
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

# --- Endpoints ---

@router.get("/experiments/list", response_model=list[ExperimentSummary])
def list_experiments():
    return MOCK_EXPERIMENTS

@router.get("/dashboard/stats", response_model=DashboardStats)
def get_dashboard_stats():
    total = len(MOCK_EXPERIMENTS)
    active = sum(1 for e in MOCK_EXPERIMENTS if e["status"] == "Running")
    drafting = sum(1 for e in MOCK_EXPERIMENTS if e["status"] == "Drafting")
    concluded = sum(1 for e in MOCK_EXPERIMENTS if e["status"] == "Concluded")
    
    return DashboardStats(
        total_experiments=total,
        active_experiments=active,
        drafting_experiments=drafting,
        concluded_experiments=concluded
    )

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

@router.post("/brain/ask", response_model=BrainResponse)
async def brain_ask(
    query: str = Form(...),
    file: UploadFile = File(None)
):
    if not llm_adapter:
        return BrainResponse(answer="LLM not configured. Please check your settings.")
    
    context = ""
    try:
        results = rag_service.query(query)
        context = "\n".join([r['document'] for r in results])
    except Exception:
        pass
        
    file_context = ""
    if file:
        try:
            content = await file.read()
            if file.filename.endswith('.csv'):
                 df = pd.read_csv(io.BytesIO(content), nrows=10)
                 file_context = f"\nUploaded File Preview:\n{df.to_markdown()}"
            elif file.filename.endswith('.xlsx'):
                 df = pd.read_excel(io.BytesIO(content), nrows=10)
                 file_context = f"\nUploaded File Preview:\n{df.to_markdown()}"
            elif file.filename.endswith('.md'):
                 text = content.decode('utf-8')
                 file_context = f"\nUploaded File Content:\n{text[:2000]}"
            elif file.filename.endswith('.docx'):
                  import docx
                  doc = docx.Document(io.BytesIO(content))
                  text = "\n".join([para.text for para in doc.paragraphs])
                  file_context = f"\nUploaded File Content:\n{text[:2000]}"
            elif file.filename.endswith('.pdf'):
                from pypdf import PdfReader
                reader = PdfReader(io.BytesIO(content))
                text = ""
                for page in reader.pages[:5]: # Limit to first 5 pages to avoid token limits
                    text += page.extract_text() + "\n"
                file_context = f"\nUploaded File Content:\n{text[:2000]}"
            else:
                try:
                    text = content.decode('utf-8')
                    file_context = f"\nUploaded File Content:\n{text[:2000]}"
                except Exception:
                    file_context = "\nUploaded File: (Binary content not shown)"
        except Exception as e:
            file_context = f"\nError reading file: {e}"

    prompt = f"Context:\n{context}\n{file_context}\n\nQuestion: {query}\nAnswer:"
    
    try:
        resp = llm_adapter.client.chat.completions.create(
            model=llm_adapter.model,
            messages=[
                {"role": "system", "content": "You are a helpful data science assistant."},
                {"role": "user", "content": prompt}
            ]
        )
        content = resp.choices[0].message.content
        return BrainResponse(answer=content if content else "I couldn't generate an answer.")
    except Exception as e:
        return BrainResponse(answer=f"Error: {str(e)}")


@router.post("/common/preview", response_model=PreviewResponse)
async def common_preview(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        if file.filename and file.filename.endswith('.xlsx'):
            df = pd.read_excel(io.BytesIO(contents), nrows=5)
        else:
            df = pd.read_csv(io.BytesIO(contents), nrows=5)
            
        # Replace NaN with None for JSON serialization
        df = df.where(pd.notnull(df), None)
            
        return PreviewResponse(
            columns=df.columns.tolist(),
            preview=df.to_dict(orient='records')
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e)) from e

@router.get("/common/generate_data")
def generate_data(type: str, method: str | None = None):
    # Generate random data
    if type == "observational":
        if method == "scm":
            # Synthetic Control Method Data
            # Unit: City, Time: Year (int)
            # Treated unit: "City_A"
            # Intervention: 2023
            data = []
            cities = ["City_A", "City_B", "City_C", "City_D", "City_E"]
            years = range(2015, 2026)
            
            for city in cities:
                # Base trend + city effect
                city_effect = random.randint(10, 50)
                for year in years:
                    trend = (year - 2015) * 2
                    noise = random.gauss(0, 2)
                    y = 100 + city_effect + trend + noise
                    
                    # Treatment effect for City_A after 2023
                    if city == "City_A" and year >= 2023:
                        y += 25 # lift
                        
                    data.append({
                        "unit": city,
                        "time": year,
                        "y": round(y, 2),
                        "treated_unit": "City_A", # Helper col
                        "intervention_time": 2023 # Helper col
                    })
            df = pd.DataFrame(data)
            
        else:
            # Default to DiD style data
            data = []
            for _ in range(100):
                unit = random.randint(1, 20)
                time = random.randint(2020, 2025)
                # Treatment assignment (unit level)
                treat = 1 if unit > 10 else 0
                # Post period (time level)
                post = 1 if time >= 2023 else 0
                
                # Outcome = 100 + unit_fe + time_fe + treat*20 + post*10 + treat*post*ATT + noise
                y = 100 + unit*2 + (time-2020)*5 + treat*10 + post*5 + treat*post*30 + random.gauss(0, 5)
                data.append({
                    "unit": unit,
                    "time": time,
                    "treat": treat,
                    "y": round(y, 2)
                })
            df = pd.DataFrame(data)
            
    else:
        # A/B Test data
        data = []
        for _ in range(100):
            group = "Treatment" if random.random() > 0.5 else "Control"
            # Random conversion rate
            base_rate = 0.1
            lift = 0.02 if group == "Treatment" else 0
            converted = 1 if random.random() < (base_rate + lift) else 0
            data.append({
                "group": group,
                "converted": converted
            })
        df = pd.DataFrame(data)
        
    stream = io.StringIO()
    df.to_csv(stream, index=False)
    response = StreamingResponse(iter([stream.getvalue()]), media_type="text/csv")
    response.headers["Content-Disposition"] = "attachment; filename=random_data.csv"
    return response

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
        if file.filename and file.filename.endswith('.xlsx'):
             df = pd.read_excel(io.BytesIO(contents))
        else:
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
        # Ensure JSON compatibility for infinite/NaN values
        for res in result.results:
            if res.lift is not None and (pd.isna(res.lift) or pd.api.types.is_float(res.lift) and (res.lift == float('inf') or res.lift == float('-inf'))):
                res.lift = None
            if res.mean is not None and (pd.isna(res.mean) or pd.api.types.is_float(res.mean) and (res.mean == float('inf') or res.mean == float('-inf'))):
                 res.mean = 0.0 # fallback

        return result
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e)) from e

@router.post("/causal/analyze", response_model=CausalResult)
async def causal_analyze(
    file: UploadFile = File(...),
    method: str = Form(...), # "did" or "scm"
    unit_col: str = Form(...),
    time_col: str = Form(...),
    outcome_col: str = Form(...),
    treatment_col: str | None = Form(None), # For DiD
    post_period_start: int | None = Form(None), # For DiD
    treated_unit: str | None = Form(None), # For SCM
    intervention_time: int | None = Form(None), # For SCM
):
    try:
        contents = await file.read()
        if file.filename and file.filename.endswith('.xlsx'):
             df = pd.read_excel(io.BytesIO(contents))
        else:
             df = pd.read_csv(io.BytesIO(contents))
        
        if method == "did":
            if not treatment_col or post_period_start is None:
                raise HTTPException(status_code=400, detail="DiD requires treatment_col and post_period_start")
            
            return analyze_observational(
                df=df,
                method="did",
                unit_col=unit_col,
                time_col=time_col,
                treatment_col=treatment_col,
                outcome_col=outcome_col,
                post_period_start=post_period_start
            )
            
        elif method == "scm":
            if not treated_unit or intervention_time is None:
                raise HTTPException(status_code=400, detail="SCM requires treated_unit and intervention_time")
            
            return analyze_observational(
                df=df,
                method="scm",
                unit_col=unit_col,
                time_col=time_col,
                outcome_col=outcome_col,
                treated_unit=treated_unit,
                intervention_time=intervention_time
            )
        
        else:
             raise HTTPException(status_code=400, detail=f"Unknown method: {method}")
             
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e)) from e
