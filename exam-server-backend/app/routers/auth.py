"""Auth router — /api/auth/*"""
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


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, request: Request):
    user = db.get_user_by_username(body.username)
    ip = _ip(request)
    if not user or not verify_password(body.password, user["password_hash"]):
        audit_log("LOGIN_FAIL", body.username, ip)
        db.audit(None, "LOGIN_FAIL", ip, f"username={body.username}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user["active"]:
        raise HTTPException(status_code=403, detail="Account inactive")
    token = create_access_token({"sub": str(user["id"]), "role": user["role"]})
    audit_log("LOGIN_OK", user["username"], ip)
    db.audit(user["id"], "LOGIN_OK", ip)
    return TokenResponse(
        access_token=token,
        user={"id": user["id"], "username": user["username"], "role": user["role"]},
    )


@router.post("/signup", status_code=201)
async def signup(body: SignupRequest, request: Request):
    ip = _ip(request)
    if db.get_user_by_username(body.username):
        raise HTTPException(status_code=409, detail="Username already taken")
    allowed_roles = {"student", "admin"}
    if body.role not in allowed_roles:
        raise HTTPException(status_code=400, detail="Invalid role")
    db.create_user(body.username, hash_password(body.password), body.role)
    audit_log("SIGNUP", body.username, ip)
    return {"message": "Account created. You may now log in."}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return {"id": user["id"], "username": user["username"], "role": user["role"]}
