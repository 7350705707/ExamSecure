"""Admin router — /api/admin/*  (admin role required)."""
import json
import logging
import shutil
import uuid
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse

from app import database as db
from app.auth import hash_password, require_admin
from app.config import ALLOWED_EXTENSIONS, MAX_UPLOAD_BYTES, UPLOAD_DIR
from app.models import CreateExamRequest, ExamSummary, UpdateExamRequest
from app.utils.audit import audit_log
from app.utils.document_parser import parse_exam_file

_SCREENSHOTS_DIR = Path("uploads") / "screenshots"
_SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)

router = APIRouter(prefix="/api/admin", tags=["admin"])
logger = logging.getLogger(__name__)


def _ip(r: Request) -> str:
    return r.client.host if r.client else ""


# ── Exams ─────────────────────────────────────────────────────────────────────

@router.get("/exams", response_model=list[ExamSummary])
async def list_exams(status: str | None = None, admin: dict = Depends(require_admin)):
    rows = await db.list_exams(status)
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
    exam_id = await db.create_exam(
        title=body.title,
        course_name=body.course_name,
        level=body.level,
        duration_minutes=body.duration_minutes,
        total_marks=body.total_marks,
        questions_json=questions_json,
        created_by=admin["id"],
        fitb_hint_enabled=1 if body.fitb_hint_enabled else 0,
        practical_url=body.practical_url,
        allow_url_bar=1 if body.allow_url_bar else 0,
    )
    audit_log("EXAM_CREATE", admin["username"], _ip(request), f"exam_id={exam_id}")
    return {"id": exam_id, "message": "Exam created as draft."}


@router.get("/exams/{exam_id}")
async def get_exam(exam_id: int, admin: dict = Depends(require_admin)):
    exam = await db.get_exam(exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    exam["questions"] = json.loads(exam["questions_json"])
    return exam


@router.put("/exams/{exam_id}")
async def update_exam(exam_id: int, body: UpdateExamRequest, request: Request, admin: dict = Depends(require_admin)):
    exam = await db.get_exam(exam_id)
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
    if body.fitb_hint_enabled is not None:
        fields["fitb_hint_enabled"] = 1 if body.fitb_hint_enabled else 0
    if body.practical_url is not None:
        fields["practical_url"] = body.practical_url
    if body.allow_url_bar is not None:
        fields["allow_url_bar"] = 1 if body.allow_url_bar else 0
    await db.update_exam(exam_id, **fields)
    # Reset all existing sessions so students can retake with the new version
    reset_count = await db.reset_exam_sessions(exam_id)
    audit_log("EXAM_UPDATE", admin["username"], _ip(request),
              f"exam_id={exam_id} sessions_reset={reset_count}")
    return {"message": "Exam updated.", "sessions_reset": reset_count}


@router.post("/exams/{exam_id}/publish")
async def publish_exam(exam_id: int, request: Request, admin: dict = Depends(require_admin)):
    exam = await db.get_exam(exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    questions = json.loads(exam["questions_json"])
    if not questions:
        raise HTTPException(status_code=400, detail="Cannot publish an exam with no questions.")
    await db.publish_exam(exam_id)
    audit_log("EXAM_PUBLISH", admin["username"], _ip(request), f"exam_id={exam_id}")
    return {"message": "Exam published."}


@router.post("/exams/{exam_id}/unpublish")
async def unpublish_exam(exam_id: int, request: Request, admin: dict = Depends(require_admin)):
    await db.update_exam(exam_id, status="draft")
    audit_log("EXAM_UNPUBLISH", admin["username"], _ip(request), f"exam_id={exam_id}")
    return {"message": "Exam moved back to draft."}


@router.delete("/exams/{exam_id}", status_code=204)
async def delete_exam(exam_id: int, request: Request, admin: dict = Depends(require_admin)):
    await db.delete_exam(exam_id)
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

    # Extract metadata from JSON before parsing
    metadata: dict = {}
    if suffix == ".json":
        try:
            raw = json.loads(content.decode("utf-8"))
            if isinstance(raw, dict):
                # Title
                if raw.get("title"):
                    metadata["title"] = str(raw["title"])
                elif raw.get("exam_title"):
                    metadata["title"] = str(raw["exam_title"])
                # Course
                if raw.get("course_name"):
                    metadata["course_name"] = str(raw["course_name"])
                elif raw.get("course"):
                    metadata["course_name"] = str(raw["course"])
                # Duration — support timeAllowed (seconds or minutes), duration_minutes, duration
                for key in ("timeAllowed", "time_allowed", "duration_minutes", "duration"):
                    val = raw.get(key)
                    if val is not None:
                        try:
                            ta = int(val)
                            # heuristic: if value > 300, treat as seconds → convert to minutes
                            metadata["time_allowed"] = ta // 60 if ta > 300 else ta
                        except (ValueError, TypeError):
                            pass
                        break
        except Exception:
            pass

    try:
        questions = parse_exam_file(tmp_path)
    finally:
        tmp_path.unlink(missing_ok=True)

    audit_log("EXAM_UPLOAD_PARSE", admin["username"], details=f"filename={file.filename} questions={len(questions)}")
    return {"questions": questions, "count": len(questions), **metadata}


# ── Results (admin view) ──────────────────────────────────────────────────────

@router.get("/results")
async def list_results(exam_id: int | None = None, admin: dict = Depends(require_admin)):
    """List all submitted sessions, optionally filtered by exam."""
    return await db.list_sessions_admin(exam_id)


# ── User management ───────────────────────────────────────────────────────────

@router.get("/users")
async def list_users(admin: dict = Depends(require_admin)):
    return await db.list_users()


@router.post("/users", status_code=201)
async def create_user(body: dict, request: Request, admin: dict = Depends(require_admin)):
    username = str(body.get("username", "")).strip()
    password = str(body.get("password", ""))
    role = str(body.get("role", "student"))
    group_id = body.get("group_id")  # optional
    full_name = str(body.get("full_name", "")).strip()
    rank = str(body.get("rank", "")).strip()
    unit = str(body.get("unit", "")).strip()
    if not username or len(password) < 8:
        raise HTTPException(status_code=400, detail="Username required; password min 8 chars.")
    if role not in {"student", "admin"}:
        raise HTTPException(status_code=400, detail="Invalid role.")
    if await db.get_user_by_username(username):
        raise HTTPException(status_code=409, detail="Username already taken.")
    if group_id is not None:
        if not await db.get_group(int(group_id)):
            raise HTTPException(status_code=404, detail="Group not found.")
    uid = await db.create_user(username, hash_password(password), role, group_id, full_name, rank, unit)
    audit_log("USER_CREATE", admin["username"], _ip(request),
              f"new_user={username} role={role} group_id={group_id}")
    logger.info("User created: id=%d username=%s by admin=%s", uid, username, admin["username"])
    return {"id": uid, "message": "User created."}


@router.post("/users/bulk-import", status_code=201)
async def bulk_import_users(body: dict, request: Request, admin: dict = Depends(require_admin)):
    """Bulk-create students from Excel import. army_no becomes username and password."""
    users: list = body.get("users", [])
    if not isinstance(users, list) or len(users) == 0:
        raise HTTPException(status_code=400, detail="No users provided.")
    if len(users) > 500:
        raise HTTPException(status_code=400, detail="Maximum 500 users per import.")

    created, skipped, errors = 0, 0, []
    for u in users:
        army_no = str(u.get("army_no") or u.get("armyNo") or "").strip()
        name = str(u.get("name") or u.get("full_name") or "").strip()
        rank = str(u.get("rank") or "").strip()
        unit = str(u.get("unit") or "").strip()
        group_id = u.get("group_id")
        if not army_no:
            skipped += 1
            continue
        if len(army_no) < 3:
            errors.append(f"{army_no}: Army No too short (min 3 chars)")
            skipped += 1
            continue
        if await db.get_user_by_username(army_no):
            errors.append(f"{army_no}: Username already exists")
            skipped += 1
            continue
        try:
            await db.create_user(army_no, hash_password(army_no), "student", group_id, name, rank, unit, must_change_password=1)
            created += 1
        except Exception as e:
            errors.append(f"{army_no}: {e}")
            skipped += 1

    audit_log("USERS_BULK_IMPORT", admin["username"], _ip(request),
              f"created={created} skipped={skipped}")
    return {"created": created, "skipped": skipped, "errors": errors}


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(user_id: int, request: Request, admin: dict = Depends(require_admin)):
    import sqlite3
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account.")
    try:
        await db.delete_user(user_id)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="Cannot delete user: related records exist.") from exc
    audit_log("USER_DELETE", admin["username"], _ip(request), f"deleted_id={user_id}")
    logger.info("User deleted: id=%d by admin=%s", user_id, admin["username"])


@router.put("/users/{user_id}/password", status_code=200)
async def reset_user_password(user_id: int, body: dict, request: Request, admin: dict = Depends(require_admin)):
    """Allow an admin to set a new password for any user."""
    new_password = str(body.get("new_password", "")).strip()
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")
    target = await db.get_user_by_id(user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    await db.update_user_password(user_id, hash_password(new_password), clear_must_change=True)
    audit_log("USER_PASSWORD_RESET", admin["username"], _ip(request),
              f"target_user_id={user_id} target_username={target['username']}")
    return {"message": "Password updated."}


@router.put("/users/{user_id}/active", status_code=200)
async def set_user_active(user_id: int, body: dict, request: Request, admin: dict = Depends(require_admin)):
    """Activate or deactivate a user account."""
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account.")
    target = await db.get_user_by_id(user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    active = bool(body.get("active", True))
    await db.set_user_active(user_id, active)
    action = "ACTIVATE" if active else "DEACTIVATE"
    audit_log(f"USER_{action}", admin["username"], _ip(request),
              f"target_user_id={user_id} target_username={target['username']}")
    return {"message": f"User {'activated' if active else 'deactivated'}."}


@router.put("/users/{user_id}/group", status_code=200)
async def assign_user_group(user_id: int, body: dict, request: Request, admin: dict = Depends(require_admin)):
    """Assign or remove a user from a group. Pass group_id=null to unassign."""
    group_id = body.get("group_id")
    if group_id is not None and not await db.get_group(int(group_id)):
        raise HTTPException(status_code=404, detail="Group not found.")
    await db.assign_user_group(user_id, group_id)
    audit_log("USER_GROUP_ASSIGN", admin["username"], _ip(request),
              f"user_id={user_id} group_id={group_id}")
    return {"message": "User group updated."}


# ── Group management ──────────────────────────────────────────────────────────

@router.get("/groups")
async def list_groups(admin: dict = Depends(require_admin)):
    return await db.list_groups()


@router.post("/groups", status_code=201)
async def create_group(body: dict, request: Request, admin: dict = Depends(require_admin)):
    name = str(body.get("name", "")).strip()
    if not name:
        raise HTTPException(status_code=400, detail="Group name is required.")
    try:
        gid = await db.create_group(name)
    except Exception:
        raise HTTPException(status_code=409, detail="A group with that name already exists.")
    audit_log("GROUP_CREATE", admin["username"], _ip(request), f"group={name}")
    logger.info("Group created: id=%d name=%s by admin=%s", gid, name, admin["username"])
    return {"id": gid, "message": "Group created."}


@router.delete("/groups/{group_id}", status_code=200)
async def delete_group(group_id: int, request: Request, admin: dict = Depends(require_admin)):
    """Delete group and all its member users (cascade)."""
    group = await db.get_group(group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found.")
    removed = await db.delete_group(group_id)
    audit_log("GROUP_DELETE", admin["username"], _ip(request),
              f"group_id={group_id} name={group['name']} users_removed={removed}")
    logger.info("Group deleted: id=%d name=%s removed %d user(s) by admin=%s",
                group_id, group["name"], removed, admin["username"])
    return {"message": f"Group deleted. {removed} user(s) removed."}


# ── Exam review (admin grading) ───────────────────────────────────────────────

@router.get("/results/{session_id}/review")
async def review_session(session_id: int, admin: dict = Depends(require_admin)):
    """Return full question+answer detail for admin review."""
    session = await db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    exam = await db.get_exam(session["exam_id"])
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    questions = json.loads(exam["questions_json"])
    answers = await db.get_answers(session_id)
    answers_map = {a["question_id"]: a for a in answers}

    student = await db.get_user_by_id(session["student_id"])
    student_name = student["full_name"] or student["username"] if student else "Unknown"

    q_detail = []
    for q in questions:
        ans = answers_map.get(q["id"], {})
        q_detail.append({
            "question_id": q["id"],
            "question_text": q["text"],
            "question_type": q["type"],
            "options": q.get("options") if q["type"] == "mcq" else None,
            "answer_key": q.get("answer_key", ""),
            "marks": q.get("marks", 1),
            "student_answer": ans.get("student_answer", ""),
            "score": ans.get("score", 0.0),
            "max_score": ans.get("max_score", float(q.get("marks", 1))),
            "feedback": ans.get("feedback", ""),
        })

    total_marks = sum(float(q.get("marks", 1)) for q in questions)
    return {
        "session_id": session_id,
        "student_id": session["student_id"],
        "student_name": student_name,
        "student_username": student["username"] if student else "",
        "student_rank": student["rank"] if student else "",
        "student_unit": student["unit"] if student else "",
        "exam_id": session["exam_id"],
        "exam_title": exam["title"],
        "start_time": session["start_time"],
        "end_time": session["end_time"],
        "current_score": session.get("score") or 0.0,
        "total_marks": total_marks,
        "reviewed": bool(session.get("reviewed", 0)),
        "questions": q_detail,
    }


@router.put("/results/{session_id}/answers/{question_id}/score")
async def update_answer_score(
    session_id: int,
    question_id: str,
    body: dict,
    request: Request,
    admin: dict = Depends(require_admin),
):
    """Override the score for a single answer and recalculate the session total."""
    session = await db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    new_score = float(body.get("score", 0))
    if new_score < 0:
        raise HTTPException(status_code=400, detail="Score cannot be negative.")
    await db.update_answer_score(session_id, question_id, new_score)
    new_total = await db.recalculate_session_score(session_id)
    audit_log("REVIEW_SCORE_UPDATE", admin["username"], _ip(request),
              f"session_id={session_id} q={question_id} score={new_score}")
    return {"total_score": new_total, "message": "Score updated."}


def _exam_needs_review(exam: dict) -> bool:
    """True if exam contains short_answer questions requiring manual instructor review."""
    questions = json.loads(exam.get("questions_json", "[]"))
    return any(q.get("type") in ("short_answer", "short_answer_screenshot") for q in questions)


@router.post("/results/{session_id}/mark-reviewed")
async def mark_session_reviewed(session_id: int, request: Request, admin: dict = Depends(require_admin)):
    """Mark a session as reviewed by the instructor (after scoring manual questions)."""
    session = await db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await db.mark_session_reviewed(session_id)
    audit_log("SESSION_REVIEWED", admin["username"], _ip(request), f"session_id={session_id}")
    return {"message": "Session marked as reviewed."}


@router.post("/results/{session_id}/release")
async def release_result(session_id: int, request: Request, admin: dict = Depends(require_admin)):
    """Release a single student's result so they can view it."""
    session = await db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session["status"] != "submitted":
        raise HTTPException(status_code=409, detail="Session not yet submitted")
    exam = await db.get_exam(session["exam_id"])
    if exam and _exam_needs_review(exam) and not session.get("reviewed"):
        raise HTTPException(
            status_code=409,
            detail="This exam has short answer questions. Review and score the student's answers before releasing the result."
        )
    await db.release_result(session_id)
    audit_log("RESULT_RELEASED", admin["username"], _ip(request), f"session_id={session_id}")
    return {"message": "Result released."}


@router.post("/results/release-group")
async def release_group_results(
    exam_id: int,
    group_id: Optional[str] = None,
    request: Request = None,
    admin: dict = Depends(require_admin),
):
    """Release all submitted results for a group on a given exam."""
    gid = None if group_id in (None, "null", "") else int(group_id)
    exam = await db.get_exam(exam_id)
    require_reviewed = exam is not None and _exam_needs_review(exam)
    count = await db.release_results_for_group(exam_id, gid, require_reviewed=require_reviewed)
    audit_log("RESULT_RELEASED_GROUP", admin["username"], _ip(request),
              f"exam_id={exam_id} group_id={gid} count={count}")
    return {"message": f"Released {count} result(s).", "count": count}


@router.get("/screenshots/{filename}")
async def serve_screenshot(filename: str, admin: dict = Depends(require_admin)):
    """Serve a student-uploaded screenshot (admin only)."""
    # Prevent path traversal
    safe_name = Path(filename).name
    file_path = _SCREENSHOTS_DIR / safe_name
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Screenshot not found")
    return FileResponse(str(file_path))
