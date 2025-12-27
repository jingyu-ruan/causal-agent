from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# 尝试导入初始化函数，如果没有(比如没改api.py)就跳过，保证不报错
try:
    from .api import router, init_application
except ImportError:
    from .api import router
    init_application = None

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

# --- 关键修改在这里 ---
origins = [
    "http://localhost:3000",                # 本地开发
    "https://causal-agent-sage.vercel.app", # Vercel 域名 (从报错里抄来的)
    "https://causal-agent.onrender.com",    # 后端自己的域名
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins, # 使用上面的列表
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)