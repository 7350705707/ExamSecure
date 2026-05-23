"""Parse JSON exam files into structured question lists."""
import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def parse_exam_file(file_path: str | Path) -> list[dict]:
    """Return a list of question dicts from an uploaded JSON exam file."""
    path = Path(file_path)
    if path.suffix.lower() != ".json":
        raise ValueError("Only .json files are supported for upload.")
    return _parse_json(path)


# ─────────────────────────────────────────────────────────────────────────────
# JSON parser — handles three formats:
#   1. Flat list:              [{type, text, answer_key, ...}, ...]
#   2. questions key:          {questions: [...]}
#   3. Sectioned exam paper:   {sections: {mcq: [...], true_false: [...], fill_blank: [...]}}
# ─────────────────────────────────────────────────────────────────────────────

def _parse_json(path: Path) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))

    # Format 1 — already a flat list
    if isinstance(data, list):
        return [_normalise(q) for q in data]

    if not isinstance(data, dict):
        raise ValueError("JSON must be an object or a list of questions.")

    # Format 2 — {questions: [...]}
    if "questions" in data and isinstance(data["questions"], list):
        return [_normalise(q) for q in data["questions"]]

    # Format 3 — sectioned exam paper {sections: {mcq, true_false, fill_blank, short_answer}}
    if "sections" in data and isinstance(data["sections"], dict):
        return _parse_sections(data["sections"])

    raise ValueError(
        "Unrecognised JSON structure. Expected a list, {questions:[...]}, "
        "or {sections:{mcq:[...], true_false:[...], fill_blank:[...]}}."
    )


def _parse_sections(sections: dict) -> list[dict]:
    """Convert the sectioned exam-paper format into normalised question dicts."""
    questions: list[dict] = []

    for q in sections.get("mcq", []):
        # options: ["A) text", "B) text", ...] → strip the letter prefix
        raw_opts = q.get("options", [])
        opts = [_strip_option_prefix(o) for o in raw_opts]
        answer_letter = str(q.get("answer", "")).strip().upper()
        # Convert letter (A/B/C/D) to the matching option text
        letter_to_idx = {"A": 0, "B": 1, "C": 2, "D": 3, "E": 4}
        idx = letter_to_idx.get(answer_letter)
        answer_key = opts[idx] if idx is not None and idx < len(opts) else answer_letter

        questions.append({
            "id": f"mcq_{q.get('number', len(questions)+1)}",
            "type": "mcq",
            "text": q.get("text", "").strip(),
            "options": opts,
            "marks": 1,
            "answer_key": answer_key,
            "rubric": "",
        })

    for q in sections.get("true_false", []):
        answer_raw = str(q.get("answer", "")).strip()
        # Normalise to "True" / "False"
        answer_key = "True" if answer_raw.lower() in ("true", "t", "yes", "1") else "False"
        questions.append({
            "id": f"tf_{q.get('number', len(questions)+1)}",
            "type": "true_false",
            "text": q.get("text", "").strip(),
            "options": [],
            "marks": 1,
            "answer_key": answer_key,
            "rubric": "",
        })

    for q in sections.get("fill_blank", []):
        questions.append({
            "id": f"fb_{q.get('number', len(questions)+1)}",
            "type": "fill_blank",
            "text": q.get("text", "").strip(),
            "options": [],
            "marks": 1,
            "answer_key": str(q.get("answer", "")).strip(),
            "rubric": "",
        })

    for q in sections.get("short_answer", []):
        questions.append({
            "id": f"sa_{q.get('number', len(questions)+1)}",
            "type": "short_answer",
            "text": q.get("text", "").strip(),
            "options": [],
            "marks": q.get("marks", 2),
            "answer_key": str(q.get("answer", "")).strip(),
            "rubric": str(q.get("rubric", "")).strip(),
        })

    return questions


def _strip_option_prefix(text: str) -> str:
    """Remove leading 'A) ', 'B. ', '1) ' etc. from an option string."""
    import re
    return re.sub(r"^[A-Ea-e\d][.)]\s*", "", text.strip())


def _normalise(q: dict) -> dict:
    """Ensure every question dict has all expected keys."""
    return {
        "id":         q.get("id", ""),
        "type":       q.get("type", "mcq"),
        "text":       q.get("text", q.get("question", "")),
        "options":    q.get("options", []),
        "marks":      q.get("marks", 1),
        "answer_key": q.get("answer_key", q.get("answer", "")),
        "rubric":     q.get("rubric", ""),
    }


# ─────────────────────────────────────────────────────────────────────────────
# PDF (best-effort plain text extraction)
# ─────────────────────────────────────────────────────────────────────────────

def _parse_pdf(path: Path) -> list[dict]:
    try:
        import fitz  # PyMuPDF
    except ImportError:
        logger.error("PyMuPDF not installed — cannot parse PDF")
        return []

    doc = fitz.open(str(path))
    lines: list[str] = []
    for page in doc:
        lines.extend(page.get_text().splitlines())
    doc.close()
    return _lines_to_questions(lines)


# ─────────────────────────────────────────────────────────────────────────────
# DOCX
# ─────────────────────────────────────────────────────────────────────────────

def _parse_docx(path: Path) -> list[dict]:
    try:
        from docx import Document
    except ImportError:
        logger.error("python-docx not installed — cannot parse DOCX")
        return []

    doc = Document(str(path))
    lines = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    return _lines_to_questions(lines)


# ─────────────────────────────────────────────────────────────────────────────
# Heuristic text → question extractor
# ─────────────────────────────────────────────────────────────────────────────

import re, uuid

_Q_PATTERN = re.compile(r"^\s*(\d+)[.)]\s+(.+)$")
_OPT_PATTERN = re.compile(r"^\s*([A-Da-d])[.)]\s+(.+)$")
_ANS_PATTERN = re.compile(r"^\s*(?:Answer|Ans)[:\s]+([A-Da-dTtFf].*)$", re.IGNORECASE)


def _lines_to_questions(lines: list[str]) -> list[dict]:
    """Very simple heuristic parser — works for numbered question lists."""
    questions: list[dict] = []
    current: dict | None = None
    q_counter = 0

    for line in lines:
        line = line.strip()
        if not line:
            continue

        q_match = _Q_PATTERN.match(line)
        opt_match = _OPT_PATTERN.match(line)
        ans_match = _ANS_PATTERN.match(line)

        if q_match:
            if current:
                questions.append(current)
            q_counter += 1
            text = q_match.group(2)
            q_type = "short_answer"
            if re.search(r"\btrue\s+or\s+false\b", text, re.I):
                q_type = "true_false"
            current = {
                "id": str(uuid.uuid4()),
                "type": q_type,
                "text": text,
                "options": None,
                "marks": 1,
                "answer_key": "",
                "rubric": "",
            }
        elif opt_match and current:
            if current["options"] is None:
                current["options"] = []
                current["type"] = "mcq"
            current["options"].append(opt_match.group(2))
        elif ans_match and current:
            current["answer_key"] = ans_match.group(1).strip()

    if current:
        questions.append(current)

    return questions
