# Causal Agent - Experiment Design MVP (v2)

A small, resume-friendly agent that turns a product experiment idea into:
- an experiment plan (Markdown)
- a runnable analysis scaffold (Python)
- a quick power + sample size estimate (two-proportion normal approximation)

It works in **two modes**:
1) **Heuristic only** (no API key needed)
2) **AI-assisted** (set `OPENAI_API_KEY` to get a more tailored plan)

## Quickstart (local)

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
source .venv/bin/activate

pip install -r requirements.txt
pip install -e .
streamlit run streamlit_app.py
```

## AI mode (optional)

Create a `.env` file:

```bash
OPENAI_API_KEY="your_key_here"
OPENAI_MODEL="gpt-5.2"
```

## Outputs

When you click **Generate**, the app writes:
- `outputs/report.md`
- `outputs/analysis.py`

## Repo structure

```
src/causal_agent/   core logic
streamlit_app.py    UI
tests/              tiny smoke test
```

## Notes

This is intentionally lightweight. You can extend it with:
- CUPED / variance reduction
- sequential testing / alpha spending
- heterogeneous treatment effect exploration
- diff-in-diff templates (for quasi-experiments)
