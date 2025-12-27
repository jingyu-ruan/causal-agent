from contextlib import asynccontextmanager
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import traceback
import sys
import os

# Ensure current directory is in path for absolute imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

init_application = None
router = None
import_error = None

try:
    # Try to import router and init_application
    # We prioritize relative import as it is cleaner for package structure
    try:
        from .api import router, init_application
    except (ImportError, ValueError):
        # Fallback for when running directly
        from api import router, init_application
except Exception as e:
    import_error = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
    print(f"Failed to import api module: {import_error}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动后执行初始化，防止 Render 超时
    if init_application:
        print("Executing startup logic...")
        try:
            init_application()
        except Exception as e:
            print(f"Startup warning: {e}")
    yield

app = FastAPI(title="Causal Agent API", lifespan=lifespan)

origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://causal-agent-sage.vercel.app",
    "https://causal-agent.onrender.com",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    if import_error:
        return {"status": "error", "message": "Backend started but failed to import API module", "detail": import_error}
    return {"status": "ok", "message": "Causal Agent API is running"}

@app.get("/health")
def health_check():
    return {"status": "ok"}

if router:
    app.include_router(router, prefix="/api")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
