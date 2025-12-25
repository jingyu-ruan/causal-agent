@echo off
echo Starting Backend...
start "Causal Agent Backend" cmd /k "call .venv\Scripts\activate && uvicorn backend.main:app --reload --port 8000"

echo Starting Frontend...
cd frontend
start "Causal Agent Frontend" cmd /k "npm run dev"
cd ..

echo.
echo Services are starting...
echo Once ready, open: http://localhost:3000
echo.
pause