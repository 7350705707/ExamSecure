"""Application configuration — driven by environment variables."""
import os
import secrets
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# ── Server ────────────────────────────────────────────────────────────────────
HOST: str = os.getenv("HOST", "0.0.0.0")
PORT: int = int(os.getenv("PORT", "8001"))
DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"

# ── CORS ──────────────────────────────────────────────────────────────────────
CORS_ORIGINS: list[str] = [
    o.strip()
    for o in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5174,http://localhost:8001",
    ).split(",")
    if o.strip()
]

# ── JWT ───────────────────────────────────────────────────────────────────────
_SECRET_FILE = Path(__file__).parent.parent / ".jwt_secret"

def _load_or_create_jwt_secret() -> str:
    env_val = os.getenv("JWT_SECRET", "").strip()
    if env_val:
        return env_val
    if _SECRET_FILE.exists():
        return _SECRET_FILE.read_text().strip()
    secret = secrets.token_hex(32)
    _SECRET_FILE.write_text(secret)
    return secret

JWT_SECRET: str = _load_or_create_jwt_secret()
JWT_ALGORITHM: str = "HS256"
JWT_EXPIRE_HOURS: int = int(os.getenv("JWT_EXPIRE_HOURS", "12"))

# ── Database ──────────────────────────────────────────────────────────────────
DATABASE_PATH: str = os.getenv("DATABASE_PATH", "./exam.db")

# ── LLM (LM Studio) ──────────────────────────────────────────────────────────
LM_STUDIO_BASE_URL: str = os.getenv("LM_STUDIO_BASE_URL", "http://localhost:1234/v1")
LLM_MODEL: str = os.getenv("LLM_MODEL", "qwen2.5-7b-instruct-1m")

# ── Grading ───────────────────────────────────────────────────────────────────
FUZZY_THRESHOLD: int = int(os.getenv("FUZZY_THRESHOLD", "80"))

# ── Upload ────────────────────────────────────────────────────────────────────
UPLOAD_DIR = Path(__file__).parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
MAX_UPLOAD_BYTES: int = 50 * 1024 * 1024  # 50 MB
ALLOWED_EXTENSIONS: set[str] = {".json"}
