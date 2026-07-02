import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .db import Base, auto_migrate, engine
from .routers import meetings, profile, records, search, ws

logging.basicConfig(level=logging.INFO)

Base.metadata.create_all(bind=engine)
auto_migrate()

settings = get_settings()

app = FastAPI(title="Meeting Copilot", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(meetings.router)
app.include_router(search.router)
app.include_router(profile.router)
app.include_router(records.router)
app.include_router(ws.router)


@app.get("/api/health")
def health():
    return {"ok": True, "llm_enabled": settings.llm_enabled, "model": settings.anthropic_model if settings.llm_enabled else None}
