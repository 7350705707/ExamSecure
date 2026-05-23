"""FastAPI app factory."""
import logging
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from app.config import CORS_ORIGINS, DEBUG
from app.database import init_db
from app.routers import auth, exam, admin
from app.utils.logger import setup_logging

setup_logging()
logger = logging.getLogger(__name__)

app = FastAPI(
    title="ExamServer API",
    version="1.0.0",
    docs_url="/docs" if DEBUG else None,
    redoc_url=None,
)

# ── Request / Response logging middleware ──────────────────────────────────────
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.perf_counter()
    client = request.client.host if request.client else "unknown"
    logger.info("→ %s %s  client=%s", request.method, request.url.path, client)
    try:
        response = await call_next(request)
        elapsed = (time.perf_counter() - start) * 1000
        level = logging.WARNING if response.status_code >= 400 else logging.INFO
        logger.log(level, "← %s %s  status=%d  %.1fms",
                   request.method, request.url.path, response.status_code, elapsed)
        return response
    except Exception as exc:
        elapsed = (time.perf_counter() - start) * 1000
        logger.error("✗ %s %s  UNHANDLED %s  %.1fms",
                     request.method, request.url.path, type(exc).__name__, elapsed)
        raise

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(exam.router)
app.include_router(admin.router)

# ── Startup ───────────────────────────────────────────────────────────────────
@app.on_event("startup")
def on_startup():
    logger.info("ExamServer starting up — initialising database")
    init_db()
    logger.info("Database ready")

# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    return {"status": "ok"}

# ── Serve built React admin panel (if present) ────────────────────────────────
_static = Path(__file__).parent.parent / "static" / "admin"
if _static.exists():
    app.mount("/admin", StaticFiles(directory=str(_static), html=True), name="admin")
