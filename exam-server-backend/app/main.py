"""FastAPI app factory."""
import logging
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from app.config import CORS_ORIGINS, DEBUG
from app.database import async_init_db
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
async def on_startup():
    logger.info("ExamServer starting up — initialising database")
    await async_init_db()
    logger.info("Database ready")

# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    return {"status": "ok"}

# ── Serve built React admin panel ─────────────────────────────────────────────
# Docker / production: Dockerfile copies dist → static/admin/ (VITE_BASE=/admin/)
_docker_static = Path(__file__).parent.parent / "static" / "admin"
# Local dev: build frontend-admin normally (VITE_BASE defaults to /) then serve here
_dev_static    = Path(__file__).parent.parent.parent / "frontend-admin" / "dist"

if _docker_static.exists():
    # Assets built with base=/admin/ — mount at /admin and redirect root there
    app.mount("/admin", StaticFiles(directory=str(_docker_static), html=True), name="admin")

    @app.get("/", include_in_schema=False)
    def _root_to_admin():
        return RedirectResponse(url="/admin")

    logger.info("Serving production frontend from %s", _docker_static)

elif _dev_static.exists():
    # Assets built with base=/ — mount directly at root; API routes registered
    # above take priority so /api/* endpoints are never shadowed.
    app.mount("/", StaticFiles(directory=str(_dev_static), html=True), name="admin")
    logger.info("Serving local-dev frontend from %s", _dev_static)

else:
    logger.warning(
        "No built frontend found. "
        "Run 'npm run build' in frontend-admin/ to serve the admin panel."
    )
