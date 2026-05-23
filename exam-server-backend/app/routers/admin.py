"""Admin router — /api/admin/*  (admin role required)."""
import json
import logging
import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile

from app import database as db
from app.auth import hash_password, require_admin
from app.config import ALLOWED_EXTENSIONS, MAX_UPLOAD_BYTES, UPLOAD_DIR
from app.models import CreateExamRequest, ExamSummary, UpdateExamRequest
from app.utils.audit import audit_log
from app.utils.document_parser import parse_exam_file

router = APIRouter(prefix="/api/admin", tags=["admin"])
logger = logging.getLogger(__name__)


def _ip(r: Request) -> str:
    return r.client.host if r.client else ""


# ── Exams ─────────────────────────────────────────────────────────────────────

@router.get("/exams", response_model=list[ExamSummary])
async def list_exams(status: str | None = None, admin: dict = Depends(require_admin)):
    rows = db.list_exams(status)
    return [
        ExamSummary(
            id=r["id"],
            title=r["title"],
            course_name=r["course_name"],
            level=r["level"],
            duration_minutes=r["duration_minutes"],
            total_marks=r["total_marks"],
            status=r["status"],
            created_at=r["created_at"],
            question_count=len(json.loads(r["questions_json"])),
        )
        for r in rows
    ]


@router.post("/exams", status_code=201)
async def create_exam(body: CreateExamRequest, request: Request, admin: dict = Depends(require_admin)):
    questions_json = json.dumps([q.model_dump() for q in body.questions])
    exam_id = db.create_exam(
        title=body.title,
        course_name=body.course_name,
        level=body.level,
        duration_minutes=body.duration_minutes,
        total_marks=body.total_marks,
        questions_json=questions_json,
        created_by=admin["id"],
    )
    audit_log("EXAM_CREATE", admin["username"], _ip(request), f"exam_id={exam_id}")
    return {"id": exam_id, "message": "Exam created as draft."}


@router.get("/exams/{exam_id}")
async def get_exam(exam_id: int, admin: dict = Depends(require_admin)):
    exam = db.get_exam(exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    exam["questions"] = json.loads(exam["questions_json"])
    return exam


@router.put("/exams/{exam_id}")
async def update_exam(exam_id: int, body: UpdateExamRequest, request: Request, admin: dict = Depends(require_admin)):
    exam = db.get_exam(exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    fields: dict = {}
    if body.title is not None:
        fields["title"] = body.title
    if body.course_name is not None:
        fields["course_name"] = body.course_name
    if body.level is not None:
        fields["level"] = body.level
    if body.duration_minutes is not None:
        fields["duration_minutes"] = body.duration_minutes
    if body.total_marks is not None:
        fields["total_marks"] = body.total_marks
    if body.questions is not None:
        fields["questions_json"] = json.dumps([q.model_dump() for q in body.questions])
    db.update_exam(exam_id, **fields)
    audit_log("EXAM_UPDATE", admin["username"], _ip(request), f"exam_id={exam_id}")
    return {"message": "Exam updated."}


@router.post("/exams/{exam_id}/publish")
async def publish_exam(exam_id: int, request: Request, admin: dict = Depends(require_admin)):
    exam = db.get_exam(exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    questions = json.loads(exam["questions_json"])
    if not questions:
        raise HTTPException(status_code=400, detail="Cannot publish an exam with no questions.")
    db.publish_exam(exam_id)
    audit_log("EXAM_PUBLISH", admin["username"], _ip(request), f"exam_id={exam_id}")
    return {"message": "Exam published."}


@router.post("/exams/{exam_id}/unpublish")
async def unpublish_exam(exam_id: int, request: Request, admin: dict = Depends(require_admin)):
    db.update_exam(exam_id, status="draft")
    audit_log("EXAM_UNPUBLISH", admin["username"], _ip(request), f"exam_id={exam_id}")
    return {"message": "Exam moved back to draft."}


@router.delete("/exams/{exam_id}", status_code=204)
async def delete_exam(exam_id: int, request: Request, admin: dict = Depends(require_admin)):
    db.delete_exam(exam_id)
    audit_log("EXAM_DELETE", admin["username"], _ip(request), f"exam_id={exam_id}")


# ── Upload & Parse ────────────────────────────────────────────────────────────

@router.post("/exams/upload-parse")
async def upload_and_parse(
    file: UploadFile = File(...),
    admin: dict = Depends(require_admin),
):
    """Upload a PDF/DOCX/JSON and return parsed questions for preview."""
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type. Allowed: {ALLOWED_EXTENSIONS}")

    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 50 MB)")

    tmp_path = UPLOAD_DIR / f"{uuid.uuid4()}{suffix}"
    tmp_path.write_bytes(content)
    try:
        questions = parse_exam_file(tmp_path)
    finally:
        tmp_path.unlink(missing_ok=True)

    audit_log("EXAM_UPLOAD_PARSE", admin["username"], details=f"filename={file.filename} questions={len(questions)}")
    return {"questions": questions, "count": len(questions)}


# ── Results (admin view) ──────────────────────────────────────────────────────

@router.get("/results")
async def list_results(exam_id: int | None = None, admin: dict = Depends(require_admin)):
    """List all submitted sessions, optionally filtered by exam."""
    with db._conn() as con:
        if exam_id:
            rows = con.execute(
                """SELECT es.*, u.username, e.title as exam_title
                   FROM exam_sessions es
                   JOIN users u ON u.id = es.student_id
                   JOIN exams e ON e.id = es.exam_id
                   WHERE es.exam_id=? AND es.status='submitted'
                   ORDER BY es.end_time DESC""",
                (exam_id,),
            ).fetchall()
        else:
            rows = con.execute(
                """SELECT es.*, u.username, e.title as exam_title
                   FROM exam_sessions es
                   JOIN users u ON u.id = es.student_id
                   JOIN exams e ON e.id = es.exam_id
                   WHERE es.status='submitted'
                   ORDER BY es.end_time DESC""",
            ).fetchall()
        return [dict(r) for r in rows]


# ── User management ───────────────────────────────────────────────────────────

@router.get("/users")
async def list_users(admin: dict = Depends(require_admin)):
    return db.list_users()


@router.post("/users", status_code=201)
async def create_user(body: dict, request: Request, admin: dict = Depends(require_admin)):
    username = str(body.get("username", "")).strip()
    password = str(body.get("password", ""))
    role = str(body.get("role", "student"))
    group_id = body.get("group_id")  # optional
    if not username or len(password) < 8:
        raise HTTPException(status_code=400, detail="Username required; password min 8 chars.")
    if role not in {"student", "admin"}:
        raise HTTPException(status_code=400, detail="Invalid role.")
    if db.get_user_by_username(username):
        raise HTTPException(status_code=409, detail="Username already taken.")
    if group_id is not None:
        if not db.get_group(int(group_id)):
            raise HTTPException(status_code=404, detail="Group not found.")
    uid = db.create_user(username, hash_password(password), role, group_id)
    audit_log("USER_CREATE", admin["username"], _ip(request),
              f"new_user={username} role={role} group_id={group_id}")
    logger.info("User created: id=%d username=%s by admin=%s", uid, username, admin["username"])
    return {"id": uid, "message": "User created."}


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(user_id: int, request: Request, admin: dict = Depends(require_admin)):
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account.")
    db.delete_user(user_id)
    audit_log("USER_DELETE", admin["username"], _ip(request), f"deleted_id={user_id}")
    logger.info("User deleted: id=%d by admin=%s", user_id, admin["username"])


@router.put("/users/{user_id}/group", status_code=200)
async def assign_user_group(user_id: int, body: dict, request: Request, admin: dict = Depends(require_admin)):
    """Assign or remove a user from a group. Pass group_id=null to unassign."""
    group_id = body.get("group_id")
    if group_id is not None and not db.get_group(int(group_id)):
        raise HTTPException(status_code=404, detail="Group not found.")
    db.assign_user_group(user_id, group_id)
    audit_log("USER_GROUP_ASSIGN", admin["username"], _ip(request),
              f"user_id={user_id} group_id={group_id}")
    return {"message": "User group updated."}


# ── Group management ──────────────────────────────────────────────────────────

@router.get("/groups")
async def list_groups(admin: dict = Depends(require_admin)):
    return db.list_groups()


@router.post("/groups", status_code=201)
async def create_group(body: dict, request: Request, admin: dict = Depends(require_admin)):
    name = str(body.get("name", "")).strip()
    if not name:
        raise HTTPException(status_code=400, detail="Group name is required.")
    try:
        gid = db.create_group(name)
    except Exception:
        raise HTTPException(status_code=409, detail="A group with that name already exists.")
    audit_log("GROUP_CREATE", admin["username"], _ip(request), f"group={name}")
    logger.info("Group created: id=%d name=%s by admin=%s", gid, name, admin["username"])
    return {"id": gid, "message": "Group created."}


@router.delete("/groups/{group_id}", status_code=200)
async def delete_group(group_id: int, request: Request, admin: dict = Depends(require_admin)):
    """Delete group and all its member users (cascade)."""
    group = db.get_group(group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found.")
    removed = db.delete_group(group_id)
    audit_log("GROUP_DELETE", admin["username"], _ip(request),
              f"group_id={group_id} name={group['name']} users_removed={removed}")
    logger.info("Group deleted: id=%d name=%s removed %d user(s) by admin=%s",
                group_id, group["name"], removed, admin["username"])
    return {"message": f"Group deleted. {removed} user(s) removed."}
