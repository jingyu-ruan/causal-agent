# causal-agent

Experiment design copilot: schema-validated plan + power sizing + report.md + analysis.py scaffold.

## Features
- Streamlit UI
- Pydantic schema validation (no free-form hallucinated plans)
- Optional LLM planner + LLM critic
- Optional local RAG over `docs/`
- Two-proportion z-test sample size sizing (plus optional simulation check in code scaffold)
- Outputs:
  - `spec.json`
  - `report.md`
  - `analysis.py`

## Quickstart

```bash
pip install -e .
cp .env.example .env
# set OPENAI_API_KEY if you want LLM features
streamlit run app.py
