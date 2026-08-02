import os
import traceback
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

init_application = None
routers = []
import_error: str | None = None
agent_import_error: str | None = None
legacy_import_error: str | None = None
agent_state = "unavailable"
legacy_state = "disabled"

try:
    from .conversations import router as conversations_router
    from .database import create_db_and_tables
    from .studies import router as studies_router

    routers.append(conversations_router)
    routers.append(studies_router)
    init_application = create_db_and_tables

except Exception as e:
    import_error = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
    print(f"Failed to import lifecycle API: {import_error}")

try:
    from .agent import router as agent_router

    routers.append(agent_router)
    agent_state = "available"
except Exception as exc:
    agent_import_error = f"{type(exc).__name__}: {exc}\n{traceback.format_exc()}"
    print(f"Agent API unavailable: {agent_import_error}")

if os.environ.get("ENABLE_LEGACY_API", "false").lower() in {"1", "true", "yes"}:
    try:
        from .api import router as legacy_router

        routers.append(legacy_router)
        legacy_state = "available"
    except Exception as exc:
        # The new lifecycle must remain available even when an optional legacy
        # integration is misconfigured.
        legacy_import_error = f"{type(exc).__name__}: {exc}\n{traceback.format_exc()}"
        legacy_state = "unavailable"
        print(f"Legacy API unavailable: {legacy_import_error}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.ready = False
    app.state.startup_error = None
    if init_application:
        try:
            init_application()
            app.state.ready = True
        except Exception as exc:
            app.state.startup_error = f"{type(exc).__name__}: {exc}"
            print(f"Startup failed: {app.state.startup_error}")
    yield


app = FastAPI(title="Causal Agent API", lifespan=lifespan)

default_origins = "http://localhost:3000,http://127.0.0.1:3000,https://causal-agent-sage.vercel.app"
origins = [
    origin.strip()
    for origin in os.environ.get("CORS_ORIGINS", default_origins).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    if import_error:
        return JSONResponse(
            status_code=503,
            content={"status": "error", "message": "API initialization failed"},
        )
    return {
        "status": "ok",
        "message": "Causal Decision Agent API is running",
        "agent_api": agent_state,
        "legacy_api": legacy_state,
    }


@app.get("/health")
def health_check():
    return {"status": "ok", "check": "liveness"}


@app.get("/ready")
def readiness_check():
    if import_error or not getattr(app.state, "ready", False):
        return JSONResponse(
            status_code=503,
            content={"status": "warming", "check": "readiness"},
        )

    try:
        from .database import check_database

        check_database()
    except Exception as exc:
        print(f"Readiness database check failed: {type(exc).__name__}: {exc}")
        return JSONResponse(
            status_code=503,
            content={"status": "unavailable", "check": "readiness"},
        )
    return {"status": "ready", "check": "readiness"}


for registered_router in routers:
    app.include_router(registered_router, prefix="/api")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
