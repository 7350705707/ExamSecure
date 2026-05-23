"""SQLite database layer — thin helpers, no ORM."""
import json
import logging
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Optional

from app.config import DATABASE_PATH

logger = logging.getLogger(__name__)


@contextmanager
def _conn():
    con = sqlite3.connect(DATABASE_PATH, check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA foreign_keys=ON")
    try:
        yield con
        con.commit()
    finally:
        con.close()


# ─────────────────────────────────────────────────────────────────────────────
# Schema
# ─────────────────────────────────────────────────────────────────────────────

def init_db() -> None:
    with _conn() as con:
        con.executescript("""
        CREATE TABLE IF NOT EXISTS user_groups (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT    UNIQUE NOT NULL,
            created_at TEXT    NOT NULL
        );

        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            username      TEXT    UNIQUE NOT NULL,
            password_hash TEXT    NOT NULL,
            role          TEXT    NOT NULL DEFAULT 'student',
            active        INTEGER NOT NULL DEFAULT 1,
            created_at    TEXT    NOT NULL
        );

        CREATE TABLE IF NOT EXISTS exams (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            title           TEXT    NOT NULL,
            course_name     TEXT    NOT NULL DEFAULT '',
            level           TEXT    NOT NULL DEFAULT '',
            duration_minutes INTEGER NOT NULL DEFAULT 60,
            total_marks     INTEGER NOT NULL DEFAULT 100,
            status          TEXT    NOT NULL DEFAULT 'draft',
            questions_json  TEXT    NOT NULL DEFAULT '[]',
            created_by      INTEGER REFERENCES users(id),
            created_at      TEXT    NOT NULL,
            updated_at      TEXT    NOT NULL
        );

        CREATE TABLE IF NOT EXISTS exam_sessions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            exam_id     INTEGER NOT NULL REFERENCES exams(id),
            student_id  INTEGER NOT NULL REFERENCES users(id),
            start_time  TEXT    NOT NULL,
            end_time    TEXT,
            status      TEXT    NOT NULL DEFAULT 'active',
            score       REAL,
            UNIQUE(exam_id, student_id)
        );

        CREATE TABLE IF NOT EXISTS answers (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id      INTEGER NOT NULL REFERENCES exam_sessions(id),
            question_id     TEXT    NOT NULL,
            student_answer  TEXT    NOT NULL DEFAULT '',
            score           REAL    NOT NULL DEFAULT 0,
            max_score       REAL    NOT NULL DEFAULT 0,
            feedback        TEXT    NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS audit_log (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER,
            action     TEXT    NOT NULL,
            ip_address TEXT    NOT NULL DEFAULT '',
            timestamp  TEXT    NOT NULL,
            details    TEXT    NOT NULL DEFAULT ''
        );
        """)

        # ── Migration: add group_id column to users if not present ────────────
        existing_cols = [r[1] for r in con.execute("PRAGMA table_info(users)").fetchall()]
        if "group_id" not in existing_cols:
            logger.info("DB migration: adding group_id column to users table")
            con.execute("ALTER TABLE users ADD COLUMN group_id INTEGER REFERENCES user_groups(id)")

        # Seed default admin if no users exist
        row = con.execute("SELECT COUNT(*) AS n FROM users").fetchone()
        if row["n"] == 0:
            from app.auth import hash_password
            now = _now()
            con.execute(
                "INSERT INTO users (username, password_hash, role, active, created_at) VALUES (?,?,?,?,?)",
                ("admin", hash_password("admin123"), "admin", 1, now),
            )
            logger.info("Seeded default admin user")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ─────────────────────────────────────────────────────────────────────────────
# Users
# ─────────────────────────────────────────────────────────────────────────────

def get_user_by_username(username: str) -> Optional[sqlite3.Row]:
    with _conn() as con:
        return con.execute(
            "SELECT * FROM users WHERE username=?", (username,)
        ).fetchone()


def get_user_by_id(user_id: int) -> Optional[sqlite3.Row]:
    with _conn() as con:
        return con.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()


def create_user(username: str, password_hash: str, role: str = "student", group_id: Optional[int] = None) -> int:
    with _conn() as con:
        cur = con.execute(
            "INSERT INTO users (username, password_hash, role, active, created_at, group_id) VALUES (?,?,?,1,?,?)",
            (username, password_hash, role, _now(), group_id),
        )
        uid = cur.lastrowid
        logger.info("User created: id=%d username=%s role=%s group_id=%s", uid, username, role, group_id)
        return uid


def list_users() -> list:
    with _conn() as con:
        return [dict(r) for r in con.execute(
            """SELECT u.id, u.username, u.role, u.active, u.created_at, u.group_id,
                      g.name as group_name
               FROM users u
               LEFT JOIN user_groups g ON g.id = u.group_id
               ORDER BY u.created_at DESC"""
        ).fetchall()]


def delete_user(user_id: int) -> None:
    with _conn() as con:
        con.execute("DELETE FROM users WHERE id=?", (user_id,))
        logger.info("User deleted: id=%d", user_id)


# ─────────────────────────────────────────────────────────────────────────────
# User Groups
# ─────────────────────────────────────────────────────────────────────────────

def list_groups() -> list:
    with _conn() as con:
        rows = con.execute(
            """SELECT g.*, COUNT(u.id) as member_count
               FROM user_groups g
               LEFT JOIN users u ON u.group_id = g.id
               GROUP BY g.id ORDER BY g.name"""
        ).fetchall()
        return [dict(r) for r in rows]


def create_group(name: str) -> int:
    with _conn() as con:
        cur = con.execute(
            "INSERT INTO user_groups (name, created_at) VALUES (?,?)",
            (name, _now()),
        )
        gid = cur.lastrowid
        logger.info("Group created: id=%d name=%s", gid, name)
        return gid


def get_group(group_id: int) -> Optional[dict]:
    with _conn() as con:
        row = con.execute("SELECT * FROM user_groups WHERE id=?", (group_id,)).fetchone()
        return dict(row) if row else None


def delete_group(group_id: int) -> int:
    """Delete group and all users belonging to it. Returns number of users deleted."""
    with _conn() as con:
        members = con.execute(
            "SELECT id FROM users WHERE group_id=?", (group_id,)
        ).fetchall()
        member_ids = [r["id"] for r in members]
        # Cascade: delete sessions/answers for those users
        for uid in member_ids:
            sessions = con.execute(
                "SELECT id FROM exam_sessions WHERE student_id=?", (uid,)
            ).fetchall()
            for s in sessions:
                con.execute("DELETE FROM answers WHERE session_id=?", (s["id"],))
            con.execute("DELETE FROM exam_sessions WHERE student_id=?", (uid,))
        con.execute("DELETE FROM users WHERE group_id=?", (group_id,))
        con.execute("DELETE FROM user_groups WHERE id=?", (group_id,))
        logger.info("Group deleted: id=%d, removed %d user(s)", group_id, len(member_ids))
        return len(member_ids)


def assign_user_group(user_id: int, group_id: Optional[int]) -> None:
    with _conn() as con:
        con.execute("UPDATE users SET group_id=? WHERE id=?", (group_id, user_id))
        logger.info("User %d assigned to group %s", user_id, group_id)


# ─────────────────────────────────────────────────────────────────────────────
# Exams
# ─────────────────────────────────────────────────────────────────────────────

def create_exam(title: str, course_name: str, level: str,
                duration_minutes: int, total_marks: int,
                questions_json: str, created_by: int) -> int:
    now = _now()
    with _conn() as con:
        cur = con.execute(
            """INSERT INTO exams (title, course_name, level, duration_minutes,
               total_marks, status, questions_json, created_by, created_at, updated_at)
               VALUES (?,?,?,?,?,'draft',?,?,?,?)""",
            (title, course_name, level, duration_minutes, total_marks,
             questions_json, created_by, now, now),
        )
        eid = cur.lastrowid
        logger.info("Exam created: id=%d title=%r by user=%d", eid, title, created_by)
        return eid


def get_exam(exam_id: int) -> Optional[dict]:
    with _conn() as con:
        row = con.execute("SELECT * FROM exams WHERE id=?", (exam_id,)).fetchone()
        return dict(row) if row else None


def list_exams(status: Optional[str] = None) -> list:
    with _conn() as con:
        if status:
            rows = con.execute("SELECT * FROM exams WHERE status=? ORDER BY created_at DESC", (status,)).fetchall()
        else:
            rows = con.execute("SELECT * FROM exams ORDER BY created_at DESC").fetchall()
        return [dict(r) for r in rows]


def update_exam(exam_id: int, **fields) -> None:
    fields["updated_at"] = _now()
    set_clause = ", ".join(f"{k}=?" for k in fields)
    with _conn() as con:
        con.execute(
            f"UPDATE exams SET {set_clause} WHERE id=?",
            (*fields.values(), exam_id),
        )


def publish_exam(exam_id: int) -> None:
    update_exam(exam_id, status="published")


def delete_exam(exam_id: int) -> None:
    with _conn() as con:
        # Cascade: answers → sessions → exam
        con.execute(
            "DELETE FROM answers WHERE session_id IN (SELECT id FROM exam_sessions WHERE exam_id=?)",
            (exam_id,),
        )
        con.execute("DELETE FROM exam_sessions WHERE exam_id=?", (exam_id,))
        con.execute("DELETE FROM exams WHERE id=?", (exam_id,))
        logger.info("Deleted exam id=%d with all sessions and answers", exam_id)


# ─────────────────────────────────────────────────────────────────────────────
# Exam sessions
# ─────────────────────────────────────────────────────────────────────────────

def create_session(exam_id: int, student_id: int) -> int:
    with _conn() as con:
        cur = con.execute(
            "INSERT INTO exam_sessions (exam_id, student_id, start_time, status) VALUES (?,?,?,'active')",
            (exam_id, student_id, _now()),
        )
        sid = cur.lastrowid
        logger.info("Exam session created: session_id=%d exam_id=%d student_id=%d", sid, exam_id, student_id)
        return sid


def get_session(session_id: int) -> Optional[dict]:
    with _conn() as con:
        row = con.execute("SELECT * FROM exam_sessions WHERE id=?", (session_id,)).fetchone()
        return dict(row) if row else None


def get_active_session(exam_id: int, student_id: int) -> Optional[dict]:
    with _conn() as con:
        row = con.execute(
            "SELECT * FROM exam_sessions WHERE exam_id=? AND student_id=? AND status='active'",
            (exam_id, student_id),
        ).fetchone()
        return dict(row) if row else None


def get_any_session(exam_id: int, student_id: int) -> Optional[dict]:
    """Return any session (active or submitted) for this student+exam combo."""
    with _conn() as con:
        row = con.execute(
            "SELECT * FROM exam_sessions WHERE exam_id=? AND student_id=?",
            (exam_id, student_id),
        ).fetchone()
        return dict(row) if row else None


def close_session(session_id: int, score: float) -> None:
    with _conn() as con:
        con.execute(
            "UPDATE exam_sessions SET status='submitted', end_time=?, score=? WHERE id=?",
            (_now(), score, session_id),
        )
        logger.info("Session closed: session_id=%d score=%.2f", session_id, score)


def list_sessions_for_student(student_id: int) -> list:
    with _conn() as con:
        rows = con.execute(
            """SELECT es.*, e.title as exam_title FROM exam_sessions es
               JOIN exams e ON e.id = es.exam_id
               WHERE es.student_id=? ORDER BY es.start_time DESC""",
            (student_id,),
        ).fetchall()
        return [dict(r) for r in rows]


# ─────────────────────────────────────────────────────────────────────────────
# Answers
# ─────────────────────────────────────────────────────────────────────────────

def save_answers(session_id: int, scored: list[dict]) -> None:
    with _conn() as con:
        con.execute("DELETE FROM answers WHERE session_id=?", (session_id,))
        con.executemany(
            "INSERT INTO answers (session_id, question_id, student_answer, score, max_score, feedback) VALUES (?,?,?,?,?,?)",
            [
                (session_id, a["question_id"], a["student_answer"],
                 a["score"], a["max_score"], a["feedback"])
                for a in scored
            ],
        )


def get_answers(session_id: int) -> list:
    with _conn() as con:
        rows = con.execute(
            "SELECT * FROM answers WHERE session_id=? ORDER BY rowid", (session_id,)
        ).fetchall()
        return [dict(r) for r in rows]


# ─────────────────────────────────────────────────────────────────────────────
# Audit
# ─────────────────────────────────────────────────────────────────────────────

def audit(user_id: Optional[int], action: str, ip: str = "", details: str = "") -> None:
    with _conn() as con:
        con.execute(
            "INSERT INTO audit_log (user_id, action, ip_address, timestamp, details) VALUES (?,?,?,?,?)",
            (user_id, action, ip, _now(), details),
        )
