"""Tamper-evident audit logger for security events."""
import logging
import logging.handlers
from pathlib import Path

_LOG_DIR = Path(__file__).parent.parent.parent / "logs"
_LOG_DIR.mkdir(exist_ok=True)

_audit_logger = logging.getLogger("audit")
_audit_logger.propagate = False  # keep separate from app log
_audit_logger.setLevel(logging.INFO)

_handler = logging.handlers.TimedRotatingFileHandler(
    _LOG_DIR / "audit.log", when="midnight", backupCount=90, encoding="utf-8"
)
_handler.setFormatter(
    logging.Formatter("%(asctime)s | %(message)s", datefmt="%Y-%m-%dT%H:%M:%S")
)
_audit_logger.addHandler(_handler)


def audit_log(event: str, user: str = "anonymous", ip: str = "", details: str = "") -> None:
    _audit_logger.info("EVENT=%s | USER=%s | IP=%s | %s", event, user, ip, details)
