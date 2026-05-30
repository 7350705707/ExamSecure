"""Exam session router — /api/exam/*  (student-facing endpoints)."""
import json
import logging
import random
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile

from app import database as db
from app.auth import get_current_user
from app.grader import grade_answer
from app.models import (
    AnswerResult,
    ExamResult,
    StartExamRequest,
    StartExamResponse,
    StudentQuestion,
    SubmitExamRequest,
)
from app.utils.audit import audit_log

_SCREENSHOTS_DIR = Path("uploads") / "screenshots"
_SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)
_ALLOWED_IMAGE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"}

router = APIRouter(prefix="/api/exam", tags=["exam"])
logger = logging.getLogger(__name__)


def _ip(r: Request) -> str:
    return r.client.host if r.client else ""


@router.post("/start", response_model=StartExamResponse)
async def start_exam(body: StartExamRequest, request: Request, user: dict = Depends(get_current_user)):
    """Begin an exam session and receive questions (no answer keys)."""
    logger.info("start_exam: user=%s exam_id=%d", user["username"], body.exam_id)
    exam = await db.get_exam(body.exam_id)
    if not exam or exam["status"] != "published":
        raise HTTPException(status_code=404, detail="Exam not found or not published")

    # Check for any existing session (active OR submitted)
    any_session = await db.get_any_session(body.exam_id, user["id"])
    if any_session:
        if any_session["status"] == "submitted":
            logger.warning("start_exam: user=%s already submitted exam_id=%d", user["username"], body.exam_id)
            raise HTTPException(status_code=409, detail="You have already completed this exam.")
        # status == 'active' — resume existing session
        logger.info("start_exam: resuming session_id=%d for user=%s", any_session["id"], user["username"])
        questions_raw = json.loads(exam["questions_json"])
        random.Random(any_session["id"]).shuffle(questions_raw)
        fitb_enabled = bool(exam.get("fitb_hint_enabled", False))
        questions = _strip_keys(questions_raw, fitb_enabled)
        return StartExamResponse(
            session_id=any_session["id"],
            exam_id=exam["id"],
            title=exam["title"],
            duration_minutes=exam["duration_minutes"],
            total_marks=exam["total_marks"],
            questions=questions,
            fitb_hint_enabled=fitb_enabled,
        )

    session_id = await db.create_session(body.exam_id, user["id"])
    audit_log("EXAM_START", user["username"], _ip(request), f"exam_id={body.exam_id}")
    await db.audit(user["id"], "EXAM_START", _ip(request), f"exam_id={body.exam_id}")
    logger.info("start_exam: new session_id=%d for user=%s", session_id, user["username"])

    questions_raw = json.loads(exam["questions_json"])
    random.Random(session_id).shuffle(questions_raw)
    fitb_enabled = bool(exam.get("fitb_hint_enabled", False))
    questions = _strip_keys(questions_raw, fitb_enabled)
    return StartExamResponse(
        session_id=session_id,
        exam_id=exam["id"],
        title=exam["title"],
        duration_minutes=exam["duration_minutes"],
        total_marks=exam["total_marks"],
        questions=questions,
        fitb_hint_enabled=fitb_enabled,
    )


@router.post("/submit")
async def submit_exam(body: SubmitExamRequest, request: Request, user: dict = Depends(get_current_user)):
    """Grade and persist student answers; close session."""
    logger.info("submit_exam: user=%s session_id=%d answers=%d", user["username"], body.session_id, len(body.answers))
    session = await db.get_session(body.session_id)
    if not session or session["student_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Session not found")
    if session["status"] != "active":
        raise HTTPException(status_code=409, detail="Session already submitted")

    exam = await db.get_exam(session["exam_id"])
    questions = {q["id"]: q for q in json.loads(exam["questions_json"])}

    answers_map = {a.question_id: a.student_answer for a in body.answers}
    scored: list[dict] = []
    total_score = 0.0
    total_marks = 0.0

    for q_id, q in questions.items():
        student_ans = answers_map.get(q_id, "")
        score, feedback = grade_answer(
            q_type=q["type"],
            student_answer=student_ans,
            answer_key=q.get("answer_key", ""),
            marks=int(q.get("marks", 1)),
            rubric=q.get("rubric", ""),
        )
        scored.append({
            "question_id": q_id,
            "student_answer": student_ans,
            "score": score,
            "max_score": float(q.get("marks", 1)),
            "feedback": feedback,
        })
        total_score += score
        total_marks += float(q.get("marks", 1))

    await db.save_answers(body.session_id, scored)
    await db.close_session(body.session_id, total_score)
    audit_log("EXAM_SUBMIT", user["username"], _ip(request),
              f"session_id={body.session_id} score={total_score}/{total_marks}")
    await db.audit(user["id"], "EXAM_SUBMIT", _ip(request),
             f"session_id={body.session_id} score={total_score}")
    logger.info("submit_exam: session_id=%d score=%.2f/%.2f user=%s",
                body.session_id, total_score, total_marks, user["username"])

    # Do NOT return score to student — admin reviews first
    return {"status": "submitted", "session_id": body.session_id}


@router.get("/result/{session_id}", response_model=ExamResult)
async def get_result(session_id: int, user: dict = Depends(get_current_user)):
    """Fetch detailed result for a completed session."""
    session = await db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    # Students can only see their own results; admins can see all
    if user["role"] != "admin" and session["student_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    if session["status"] == "active":
        raise HTTPException(status_code=409, detail="Exam not yet submitted")
    # Students cannot view result until it is released
    if user["role"] != "admin" and not session.get("result_released", 0):
        raise HTTPException(status_code=403, detail="Result not yet released by your Instructor.")

    exam = await db.get_exam(session["exam_id"])
    raw_answers = await db.get_answers(session_id)
    total_marks = sum(a["max_score"] for a in raw_answers)
    score = session["score"] or 0.0
    pct = round(score / total_marks * 100, 1) if total_marks else 0.0

    # Build answer results enriched with question text for paper review
    questions_map: dict = {}
    if exam:
        for q in json.loads(exam["questions_json"]):
            questions_map[q["id"]] = q

    enriched_answers = []
    for a in raw_answers:
        q = questions_map.get(a["question_id"], {})
        enriched_answers.append(AnswerResult(
            question_id=a["question_id"],
            question_text=q.get("text", ""),
            question_type=q.get("type", ""),
            student_answer=a["student_answer"],
            score=a["score"],
            max_score=a["max_score"],
            feedback=a["feedback"],
            correct_answer=q.get("answer_key", "") if user["role"] == "admin" else q.get("answer_key", ""),
        ))

    return ExamResult(
        session_id=session_id,
        exam_id=session["exam_id"],
        exam_title=exam["title"] if exam else "Unknown",
        score=score,
        total_marks=total_marks,
        percentage=pct,
        status=session["status"],
        answers=enriched_answers,
    )


@router.get("/available")
async def available_exams(user: dict = Depends(get_current_user)):
    """List all published exams the student can take."""
    exams = await db.list_exams(status="published")
    return [
        {"id": e["id"], "title": e["title"], "course_name": e["course_name"],
         "level": e["level"], "duration_minutes": e["duration_minutes"],
         "total_marks": e["total_marks"]}
        for e in exams
    ]


@router.get("/my-results")
async def my_results(user: dict = Depends(get_current_user)):
    """List all completed sessions for the current student."""
    sessions = await db.list_sessions_for_student(user["id"])
    result = []
    for s in sessions:
        if s["status"] == "active":
            continue
        result.append({
            "session_id": s["id"],
            "exam_id": s["exam_id"],
            "status": s["status"],
            "result_released": bool(s.get("result_released", 0)),
            "score": s.get("score"),
        })
    return result


@router.patch("/sessions/{session_id}/answers")
async def autosave_answers(
    session_id: int,
    body: dict,
    request: Request,
    user: dict = Depends(get_current_user),
):
    """Periodically save draft answers so they survive an Electron crash."""
    session = await db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session["student_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    if session["status"] != "active":
        raise HTTPException(status_code=409, detail="Session is not active")
    answers_list = body.get("answers", [])
    if not isinstance(answers_list, list):
        raise HTTPException(status_code=422, detail="'answers' must be a list")
    saved = await db.upsert_draft_answers(session_id, answers_list)
    return {"saved": saved}


@router.post("/upload-screenshot")
async def upload_screenshot(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """Upload a screenshot for a short_answer_screenshot question."""
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in _ALLOWED_IMAGE_EXT:
        raise HTTPException(status_code=400, detail="Only image files allowed (png, jpg, jpeg, gif, webp, bmp).")
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:  # 10 MB
        raise HTTPException(status_code=413, detail="Image too large (max 10 MB).")
    filename = f"{uuid.uuid4()}{suffix}"
    (_SCREENSHOTS_DIR / filename).write_bytes(content)
    logger.info("Screenshot uploaded: filename=%s by user=%s", filename, user["username"])
    return {"filename": filename}


# ─────────────────────────────────────────────────────────────────────────────
# Helper
# ─────────────────────────────────────────────────────────────────────────────

def _strip_keys(questions: list[dict], fitb_hint_enabled: bool = False) -> list[StudentQuestion]:
    """Remove answer_key and rubric before sending to student."""
    result = []
    for q in questions:
        hints = None
        if fitb_hint_enabled and q.get("type") == "fill_blank" and q.get("answer_key"):
            raw = (q["answer_key"] or "").strip()
            parts = [p.strip() for p in re.split(r"[,|;]", raw) if p.strip()]
            hints = parts or None
        result.append(StudentQuestion(
            id=q["id"],
            type=q["type"],
            text=q["text"],
            options=q.get("options"),
            marks=q.get("marks", 1),
            hints=hints,
        ))
    return result
