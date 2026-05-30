"""Answer grading logic.

MCQ / True-False  → exact match (case-insensitive, stripped)
Fill-in-the-blank → fuzzy string ratio (thefuzz)
Short answer      → rubric-based LLM grading via LM Studio
"""
import json
import logging

import httpx
from thefuzz import fuzz

from app.config import LM_STUDIO_BASE_URL, LLM_MODEL, FUZZY_THRESHOLD

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def grade_answer(
    q_type: str,
    student_answer: str,
    answer_key: str,
    marks: int,
    rubric: str = "",
) -> tuple[float, str]:
    """Return (score, feedback) for one question."""
    sa = (student_answer or "").strip()
    ak = (answer_key or "").strip()

    # No answer given — always 0 regardless of type
    if not sa:
        logger.debug("Empty answer for question type=%s — score=0", q_type)
        return 0.0, "No answer provided."

    if q_type in ("mcq", "true_false"):
        return _grade_exact(sa, ak, marks)
    elif q_type == "fill_blank":
        return _grade_fuzzy(sa, ak, marks)
    elif q_type == "short_answer":
        # If the answer looks like an uploaded screenshot filename (uuid.ext), grade manually
        import re
        if re.match(r'^[0-9a-f\-]{36}\.(png|jpg|jpeg|gif|webp|bmp)$', sa, re.IGNORECASE):
            return 0.0, "Pending manual review (screenshot)."
        return _grade_llm(sa, ak, marks, rubric)
    elif q_type == "short_answer_screenshot":
        # Legacy type — treat same as screenshot short answer
        return 0.0, "Pending manual review."
    else:
        logger.warning("Unknown question type %s — skipping grade", q_type)
        return 0.0, "Unknown question type"


# ─────────────────────────────────────────────────────────────────────────────
# Graders
# ─────────────────────────────────────────────────────────────────────────────

def _grade_exact(student: str, key: str, marks: int) -> tuple[float, str]:
    if student.lower() == key.lower():
        return float(marks), "Correct."
    return 0.0, f"Incorrect. Expected: {key}."


def _grade_fuzzy(student: str, key: str, marks: int) -> tuple[float, str]:
    ratio = fuzz.token_sort_ratio(student.lower(), key.lower())
    if ratio >= FUZZY_THRESHOLD:
        return float(marks), f"Accepted (match score {ratio}%)."
    partial_ratio = fuzz.partial_ratio(student.lower(), key.lower())
    if partial_ratio >= FUZZY_THRESHOLD:
        return float(marks) * 0.5, f"Partial credit (partial match {partial_ratio}%)."
    return 0.0, f"Incorrect. Expected something like: {key}."


def _grade_llm(student: str, key: str, marks: int, rubric: str) -> tuple[float, str]:
    """Call LM Studio for rubric-based scoring. Falls back to 0 on error."""
    system_prompt = (
        "You are an exam grader. Given the student's answer, the expected answer, "
        "and a rubric (if any), return a JSON object with two keys:\n"
        '  "score": a float between 0 and {marks} (use 0.5 increments),\n'
        '  "feedback": a short explanation (1-2 sentences).\n'
        "Return ONLY valid JSON, no extra text."
    ).format(marks=marks)

    user_prompt = (
        f"Max marks: {marks}\n"
        f"Expected answer: {key}\n"
        f"Rubric: {rubric or 'General correctness and completeness.'}\n"
        f"Student answer: {student}"
    )

    try:
        resp = httpx.post(
            f"{LM_STUDIO_BASE_URL}/chat/completions",
            json={
                "model": LLM_MODEL,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0,
                "max_tokens": 200,
            },
            timeout=60,
        )
        resp.raise_for_status()
        raw = resp.json()["choices"][0]["message"]["content"].strip()
        # Extract JSON from possible markdown fences
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        data = json.loads(raw)
        score = max(0.0, min(float(data.get("score", 0)), float(marks)))
        feedback = str(data.get("feedback", ""))
        return score, feedback
    except Exception as exc:
        logger.error("LLM grading failed: %s", exc)
        # Fallback: partial credit if answer is non-empty
        if student.strip():
            return float(marks) * 0.5, "Auto-grading unavailable. Partial credit awarded for non-empty answer."
        return 0.0, "Auto-grading unavailable. No answer provided."
