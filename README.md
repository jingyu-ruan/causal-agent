# Causal Agent: Experimentation & Causal Inference Platform

![Python](https://img.shields.io/badge/python-3.10+-blue.svg)
![TypeScript](https://img.shields.io/badge/typescript-5.0+-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

**Causal Agent** is a full-stack AI agent designed to bridge the gap between product ideas and rigorous causal evidence. It streamlines the entire experimentation lifecycle, from automated sample size planning to advanced post-experiment analysis.

Unlike simple A/B testing calculators, Causal Agent integrates **advanced statistical methods** and **observational causal inference** techniques into a user-friendly, chat-based interface.

## 🌟 Key Features

### 🤖 Agentic Experiment Planning
- **Smart Design**: Converts loose product ideas into structured Experiment Plans (Markdown) using LLMs.
- **Power Analysis**: Automated sample size estimation and power calculations (two-proportion z-test).
- **Risk Assessment**: AI-driven identification of guardrails and potential experiment risks.

### 📊 Advanced A/B Testing Engine
- **Variance Reduction (CUPED)**: Implements Controlled-experiment Using Pre-Experiment Data to increase metric sensitivity and reduce test duration.
- **Quality Assurance**: Automated **SRM (Sample Ratio Mismatch)** detection to catch instrumentation bugs early.
- **Hybrid Statistics**: Supports both frequentist (t-test, z-test) and Bayesian inference (probability to beat control).
- **Auto-Segmentation**: Automatically scans user segments to identify heterogeneous effects or Simpson's paradox.

### 🔍 Causal Inference (Observational)
For scenarios where randomization is impossible, the agent provides robust quasi-experimental methods:
- **Difference-in-Differences (DiD)**: Analyzes policy changes assuming parallel trends.
- **Synthetic Control Method (SCM)**: Constructs synthetic counterfactuals using Lasso or Ridge regression for single-unit interventions.
- **Heterogeneous Treatment Effects (HTE)**: Uses T-Learner with Random Forest to pinpoint which users benefit from a feature.

## 🏗 Architecture
- **Backend**: FastAPI (Python), Scikit-learn, Scipy, Pydantic
- **Frontend**: Next.js 14, TypeScript, Tailwind CSS, Shadcn UI
- **AI Engine**: OpenAI API compatible (supports GPT-4, DeepSeek, etc.)

## 🚀 Quickstart

### 1. Prerequisites
- Python 3.10+
- Node.js 18+

### 2. Backend Setup
```bash
# Create and activate virtual environment
python -m venv .venv

# Windows
.venv\Scripts\activate

# Linux or Mac
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
pip install -e .
```

### 3. Frontend Setup
```bash
cd frontend
npm install
cd ..
```

### 4. Run the Application

#### Option A: One-click Start (Windows)
```powershell
.\start.bat
```

#### Option B: Manual Start

Start backend:
```bash
uvicorn backend.main:app --reload --port 8000
```

Start frontend:
```bash
cd frontend
npm run dev
```

Access the app at: http://localhost:3000

## 🧠 AI Configuration
To enable LLM-powered planning features, create a `.env` file in the project root:

```env
OPENAI_API_KEY="your-api-key"
OPENAI_MODEL="deepseek-chat"
OPENAI_BASE_URL="https://api.deepseek.com"
```

Compatible with OpenAI or any OpenAI-compatible provider.

## 📂 Repository Structure
```text
.
├── backend/              # FastAPI application entry points
├── frontend/             # Next.js 14 web application
├── src/
│   └── causal_agent/     # Core business logic
│       ├── analysis.py   # Statistical engine (CUPED, SRM, Bayesian)
│       ├── causal.py     # Causal models (DiD, SCM, HTE)
│       ├── planner.py    # Experiment design and power analysis
│       └── llm.py        # LLM integration layer
├── tests/                # Pytest suite
└── start.bat             # Windows startup script
```

## 🔮 Roadmap
- Sequential Testing: Implement alpha spending functions such as O'Brien-Fleming for early stopping.
- Knowledge Base: RAG integration to learn from past experiment reports.
- Report Generation: Auto-generate PDF or Notion summaries of analysis results.

## 📄 License
[MIT](LICENSE)
