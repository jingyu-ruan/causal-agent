# Causal Agent - Experiment Design MVP (v2)

A small, resume-friendly agent that turns a product experiment idea into:
- an experiment plan (Markdown)
- a runnable analysis scaffold (Python)
- a quick power + sample size estimate (two-proportion normal approximation)

## Architecture

- **Backend**: FastAPI (Python)
- **Frontend**: Next.js 14 + Shadcn UI (TypeScript)
- **Core Logic**: Pydantic + Scipy (Shared with legacy app)

## Quickstart

### 1. Prerequisites
- Python 3.10+
- Node.js 18+

### 2. Setup Backend
```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# Linux/Mac: source .venv/bin/activate

pip install -r requirements.txt
pip install -e .
```

### 3. Setup Frontend
```bash
cd frontend
npm install
cd ..
```

### 4. Run the App
**Windows**: Double-click `start.bat` or run:
```powershell
.\start.bat
```

**Manual Start**:
- Backend: `uvicorn backend.main:app --reload --port 8000`
- Frontend: `npm run dev` (inside `frontend/`)

Open [http://localhost:3000](http://localhost:3000) to use the app.

## AI mode (optional)

Create a `.env` file in the root:

```bash
OPENAI_API_KEY="your_key_here"
OPENAI_MODEL="deepseek-chat"
OPENAI_BASE_URL="https://api.deepseek.com"
```

## Repo structure

```
backend/            FastAPI app
frontend/           Next.js app
src/causal_agent/   Core business logic
```

## Notes

This is intentionally lightweight. You can extend it with:
- CUPED / variance reduction
- sequential testing / alpha spending
- heterogeneous treatment effect exploration
- diff-in-diff templates (for quasi-experiments)
