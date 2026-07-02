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
    from .llm import get_usage, llm_available

    return {"ok": True, "llm_enabled": llm_available(), "router": get_usage()}


@app.get("/api/usage")
def usage():
    """Model-router metering: calls, tokens, latency and errors per tier."""
    from .llm import get_usage

    return get_usage()
