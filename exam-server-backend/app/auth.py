"""JWT creation, password hashing, and FastAPI dependency helpers."""
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import bcrypt as _bcrypt
from jose import JWTError, jwt

from app.config import JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRE_HOURS
from app import database as db

_bearer = HTTPBearer()


def hash_password(plain: str) -> str:
    return _bcrypt.hashpw(plain.encode(), _bcrypt.gensalt(rounds=12)).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return _bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(hours=JWT_EXPIRE_HOURS)
    )
    to_encode["exp"] = expire
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _token_fingerprint(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()[:32]


def _decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict:
    token = creds.credentials
    payload = _decode_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token has no subject")
    user = await db.get_user_by_id(int(user_id))
    if not user or not user["active"]:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    # Single-session enforcement: reject tokens whose fingerprint doesn't match
    # the most recently issued token stored in the DB.
    stored_fp = await db.get_active_session_token(int(user_id))
    if stored_fp and _token_fingerprint(token) != stored_fp:
        raise HTTPException(
            status_code=401,
            detail="SESSION_DISPLACED — your account was logged in elsewhere.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return dict(user)


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
