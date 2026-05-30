"""Auth router — /api/auth/*"""
import hashlib

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app import database as db
from app.auth import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from app.models import LoginRequest, SignupRequest, TokenResponse
from app.utils.audit import audit_log

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _ip(request: Request) -> str:
    return request.client.host if request.client else ""


def _token_fingerprint(token: str) -> str:
    """Short SHA-256 fingerprint used for single-session enforcement."""
    return hashlib.sha256(token.encode()).hexdigest()[:32]


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, request: Request):
    user = await db.get_user_by_username(body.username)
    ip = _ip(request)
    if not user or not verify_password(body.password, user["password_hash"]):
        audit_log("LOGIN_FAIL", body.username, ip)
        await db.audit(None, "LOGIN_FAIL", ip, f"username={body.username}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user["active"]:
        raise HTTPException(status_code=403, detail="Account inactive")
    token = create_access_token({"sub": str(user["id"]), "role": user["role"]})
    fp = _token_fingerprint(token)
    await db.set_active_session_token(user["id"], fp)
    audit_log("LOGIN_OK", user["username"], ip)
    await db.audit(user["id"], "LOGIN_OK", ip)
    return TokenResponse(
        access_token=token,
        user={
            "id": user["id"],
            "username": user["username"],
            "role": user["role"],
            "must_change_password": bool(user.get("must_change_password", 0)),
        },
    )


@router.post("/signup", status_code=201)
async def signup(body: SignupRequest, request: Request):
    ip = _ip(request)
    if await db.get_user_by_username(body.username):
        raise HTTPException(status_code=409, detail="Username already taken")
    allowed_roles = {"student", "admin"}
    if body.role not in allowed_roles:
        raise HTTPException(status_code=400, detail="Invalid role")
    await db.create_user(body.username, hash_password(body.password), body.role)
    audit_log("SIGNUP", body.username, ip)
    return {"message": "Account created. You may now log in."}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return {"id": user["id"], "username": user["username"], "role": user["role"]}


@router.put("/change-password")
async def change_password(body: dict, request: Request, user: dict = Depends(get_current_user)):
    current_pw = str(body.get("current_password", ""))
    new_pw = str(body.get("new_password", ""))
    if len(new_pw) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters.")
    db_user = await db.get_user_by_id(user["id"])
    if not db_user or not verify_password(current_pw, db_user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    await db.update_user_password(user["id"], hash_password(new_pw))
    audit_log("CHANGE_PASSWORD", user["username"], _ip(request))
    return {"message": "Password updated successfully."}


@router.put("/change-username")
async def change_username(body: dict, request: Request, user: dict = Depends(get_current_user)):
    new_username = str(body.get("new_username", "")).strip()
    current_pw = str(body.get("current_password", ""))
    if not new_username:
        raise HTTPException(status_code=400, detail="New username is required.")
    db_user = await db.get_user_by_id(user["id"])
    if not db_user or not verify_password(current_pw, db_user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    existing = await db.get_user_by_username(new_username)
    if existing and existing["id"] != user["id"]:
        raise HTTPException(status_code=409, detail="Username already taken.")
    await db.update_username(user["id"], new_username)
    audit_log("CHANGE_USERNAME", user["username"], _ip(request), f"new_username={new_username}")
    return {"message": "Username updated successfully.", "username": new_username}
