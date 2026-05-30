"""SQLite database layer — async helpers using aiosqlite."""
import logging
import aiosqlite
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

from app.config import DATABASE_PATH

logger = logging.getLogger(__name__)


@asynccontextmanager
async def _conn():
    async with aiosqlite.connect(DATABASE_PATH) as con:
        con.row_factory = aiosqlite.Row
        await con.execute("PRAGMA journal_mode=WAL")
        await con.execute("PRAGMA foreign_keys=ON")
        try:
            yield con
            await con.commit()
        except Exception:
            await con.rollback()
            raise


# ─────────────────────────────────────────────────────────────────────────────
# Schema
# ─────────────────────────────────────────────────────────────────────────────

async def async_init_db() -> None:
    """Initialise DB schema and run migrations. Call from async startup."""
    async with _conn() as con:
        for stmt in [
            """CREATE TABLE IF NOT EXISTS user_groups (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       TEXT    UNIQUE NOT NULL,
                created_at TEXT    NOT NULL
            )""",
            """CREATE TABLE IF NOT EXISTS users (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                username      TEXT    UNIQUE NOT NULL,
                password_hash TEXT    NOT NULL,
                role          TEXT    NOT NULL DEFAULT 'student',
                active        INTEGER NOT NULL DEFAULT 1,
                created_at    TEXT    NOT NULL
            )""",
            """CREATE TABLE IF NOT EXISTS exams (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                title            TEXT    NOT NULL,
                course_name      TEXT    NOT NULL DEFAULT '',
                level            TEXT    NOT NULL DEFAULT '',
                duration_minutes INTEGER NOT NULL DEFAULT 60,
                total_marks      INTEGER NOT NULL DEFAULT 100,
                status           TEXT    NOT NULL DEFAULT 'draft',
                questions_json   TEXT    NOT NULL DEFAULT '[]',
                created_by       INTEGER REFERENCES users(id),
                created_at       TEXT    NOT NULL,
                updated_at       TEXT    NOT NULL
            )""",
            """CREATE TABLE IF NOT EXISTS exam_sessions (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                exam_id     INTEGER NOT NULL REFERENCES exams(id),
                student_id  INTEGER NOT NULL REFERENCES users(id),
                start_time  TEXT    NOT NULL,
                end_time    TEXT,
                status      TEXT    NOT NULL DEFAULT 'active',
                score       REAL,
                UNIQUE(exam_id, student_id)
            )""",
            """CREATE TABLE IF NOT EXISTS answers (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id      INTEGER NOT NULL REFERENCES exam_sessions(id),
                question_id     TEXT    NOT NULL,
                student_answer  TEXT    NOT NULL DEFAULT '',
                score           REAL    NOT NULL DEFAULT 0,
                max_score       REAL    NOT NULL DEFAULT 0,
                feedback        TEXT    NOT NULL DEFAULT ''
            )""",
            """CREATE TABLE IF NOT EXISTS audit_log (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    INTEGER,
                action     TEXT    NOT NULL,
                ip_address TEXT    NOT NULL DEFAULT '',
                timestamp  TEXT    NOT NULL,
                details    TEXT    NOT NULL DEFAULT ''
            )""",
        ]:
            await con.execute(stmt)

        # ── Migrations: users table ───────────────────────────────────────────
        cur = await con.execute("PRAGMA table_info(users)")
        existing_cols = [r[1] for r in await cur.fetchall()]
        for col, ddl in [
            ("group_id",             "ALTER TABLE users ADD COLUMN group_id INTEGER REFERENCES user_groups(id)"),
            ("full_name",            "ALTER TABLE users ADD COLUMN full_name TEXT NOT NULL DEFAULT ''"),
            ("rank",                 "ALTER TABLE users ADD COLUMN rank TEXT NOT NULL DEFAULT ''"),
            ("unit",                 "ALTER TABLE users ADD COLUMN unit TEXT NOT NULL DEFAULT ''"),
            ("must_change_password", "ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0"),
            ("active_session_token", "ALTER TABLE users ADD COLUMN active_session_token TEXT"),
        ]:
            if col not in existing_cols:
                logger.info("DB migration: adding %s column to users table", col)
                await con.execute(ddl)

        # ── Migrations: exam_sessions table ───────────────────────────────────
        cur = await con.execute("PRAGMA table_info(exam_sessions)")
        sess_cols = [r[1] for r in await cur.fetchall()]
        for col, ddl in [
            ("reviewed",        "ALTER TABLE exam_sessions ADD COLUMN reviewed INTEGER NOT NULL DEFAULT 0"),
            ("result_released", "ALTER TABLE exam_sessions ADD COLUMN result_released INTEGER NOT NULL DEFAULT 0"),
        ]:
            if col not in sess_cols:
                logger.info("DB migration: adding %s column to exam_sessions table", col)
                await con.execute(ddl)
        # ── Migrations: exams table ──────────────────────────────────────────────────
        cur = await con.execute("PRAGMA table_info(exams)")
        exam_cols = [r[1] for r in await cur.fetchall()]
        for col, ddl in [
            ("fitb_hint_enabled", "ALTER TABLE exams ADD COLUMN fitb_hint_enabled INTEGER NOT NULL DEFAULT 0"),
        ]:
            if col not in exam_cols:
                logger.info("DB migration: adding %s column to exams table", col)
                await con.execute(ddl)
        # ── Seed default admin ────────────────────────────────────────────────
        cur = await con.execute("SELECT COUNT(*) AS n FROM users")
        row = await cur.fetchone()
        if row["n"] == 0:
            from app.auth import hash_password
            now = _now()
            await con.execute(
                "INSERT INTO users (username, password_hash, role, active, created_at) VALUES (?,?,?,?,?)",
                ("admin", hash_password("admin123"), "admin", 1, now),
            )
            logger.info("Seeded default admin user")


def init_db() -> None:
    """Synchronous shim — only for legacy/non-async contexts."""
    import asyncio
    asyncio.get_event_loop().run_until_complete(async_init_db())


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ─────────────────────────────────────────────────────────────────────────────
# Users
# ─────────────────────────────────────────────────────────────────────────────

async def get_user_by_username(username: str) -> Optional[dict]:
    async with _conn() as con:
        cur = await con.execute(
            "SELECT * FROM users WHERE username=?", (username,)
        )
        row = await cur.fetchone()
        return dict(row) if row else None


async def get_user_by_id(user_id: int) -> Optional[dict]:
    async with _conn() as con:
        cur = await con.execute("SELECT * FROM users WHERE id=?", (user_id,))
        row = await cur.fetchone()
        return dict(row) if row else None


async def create_user(
    username: str,
    password_hash: str,
    role: str = "student",
    group_id: Optional[int] = None,
    full_name: str = "",
    rank: str = "",
    unit: str = "",
    must_change_password: int = 0,
) -> int:
    async with _conn() as con:
        cur = await con.execute(
            "INSERT INTO users (username, password_hash, role, active, created_at, group_id, full_name, rank, unit, must_change_password) "
            "VALUES (?,?,?,1,?,?,?,?,?,?)",
            (username, password_hash, role, _now(), group_id, full_name or "", rank or "", unit or "", must_change_password),
        )
        uid = cur.lastrowid
        logger.info("User created: id=%d username=%s role=%s group_id=%s", uid, username, role, group_id)
        return uid


async def list_users() -> list:
    async with _conn() as con:
        cur = await con.execute(
            """SELECT u.id, u.username, u.full_name, u.rank, u.unit, u.role, u.active, u.created_at, u.group_id,
                      g.name as group_name
               FROM users u
               LEFT JOIN user_groups g ON g.id = u.group_id
               ORDER BY u.created_at DESC"""
        )
        return [dict(r) for r in await cur.fetchall()]


async def delete_user(user_id: int) -> None:
    async with _conn() as con:
        # Delete answers for all sessions belonging to this user
        await con.execute(
            "DELETE FROM answers WHERE session_id IN "
            "(SELECT id FROM exam_sessions WHERE student_id=?)",
            (user_id,),
        )
        # Delete exam sessions for this user
        await con.execute("DELETE FROM exam_sessions WHERE student_id=?", (user_id,))
        # Nullify created_by on exams authored by this user
        await con.execute("UPDATE exams SET created_by=NULL WHERE created_by=?", (user_id,))
        await con.execute("DELETE FROM users WHERE id=?", (user_id,))
        logger.info("User deleted: id=%d", user_id)


# ─────────────────────────────────────────────────────────────────────────────
# User Groups
# ─────────────────────────────────────────────────────────────────────────────

async def list_groups() -> list:
    async with _conn() as con:
        cur = await con.execute(
            """SELECT g.*, COUNT(u.id) as member_count
               FROM user_groups g
               LEFT JOIN users u ON u.group_id = g.id
               GROUP BY g.id ORDER BY g.name"""
        )
        return [dict(r) for r in await cur.fetchall()]


async def create_group(name: str) -> int:
    async with _conn() as con:
        cur = await con.execute(
            "INSERT INTO user_groups (name, created_at) VALUES (?,?)",
            (name, _now()),
        )
        gid = cur.lastrowid
        logger.info("Group created: id=%d name=%s", gid, name)
        return gid


async def get_group(group_id: int) -> Optional[dict]:
    async with _conn() as con:
        cur = await con.execute("SELECT * FROM user_groups WHERE id=?", (group_id,))
        row = await cur.fetchone()
        return dict(row) if row else None


async def delete_group(group_id: int) -> int:
    """Delete group and all users belonging to it. Returns number of users deleted."""
    async with _conn() as con:
        cur = await con.execute(
            "SELECT id FROM users WHERE group_id=?", (group_id,)
        )
        members = await cur.fetchall()
        member_ids = [r["id"] for r in members]
        for uid in member_ids:
            cur2 = await con.execute(
                "SELECT id FROM exam_sessions WHERE student_id=?", (uid,)
            )
            sessions = await cur2.fetchall()
            for s in sessions:
                await con.execute("DELETE FROM answers WHERE session_id=?", (s["id"],))
            await con.execute("DELETE FROM exam_sessions WHERE student_id=?", (uid,))
        await con.execute("DELETE FROM users WHERE group_id=?", (group_id,))
        await con.execute("DELETE FROM user_groups WHERE id=?", (group_id,))
        logger.info("Group deleted: id=%d, removed %d user(s)", group_id, len(member_ids))
        return len(member_ids)


async def assign_user_group(user_id: int, group_id: Optional[int]) -> None:
    async with _conn() as con:
        await con.execute("UPDATE users SET group_id=? WHERE id=?", (group_id, user_id))
        logger.info("User %d assigned to group %s", user_id, group_id)


async def update_user_password(user_id: int, new_hash: str, clear_must_change: bool = True) -> None:
    async with _conn() as con:
        if clear_must_change:
            await con.execute(
                "UPDATE users SET password_hash=?, must_change_password=0 WHERE id=?",
                (new_hash, user_id),
            )
        else:
            await con.execute("UPDATE users SET password_hash=? WHERE id=?", (new_hash, user_id))
        logger.info("Password updated for user id=%d", user_id)


async def update_username(user_id: int, new_username: str) -> None:
    async with _conn() as con:
        await con.execute("UPDATE users SET username=? WHERE id=?", (new_username, user_id))
        logger.info("Username updated for user id=%d", user_id)


async def set_active_session_token(user_id: int, token: Optional[str]) -> None:
    """Store the current JWT token fingerprint to enforce single-session."""
    async with _conn() as con:
        await con.execute("UPDATE users SET active_session_token=? WHERE id=?", (token, user_id))


async def get_active_session_token(user_id: int) -> Optional[str]:
    async with _conn() as con:
        cur = await con.execute("SELECT active_session_token FROM users WHERE id=?", (user_id,))
        row = await cur.fetchone()
        return row["active_session_token"] if row else None


async def release_result(session_id: int) -> None:
    """Mark a session result as released so the student can see their score."""
    async with _conn() as con:
        await con.execute("UPDATE exam_sessions SET result_released=1 WHERE id=?", (session_id,))
        logger.info("Result released for session_id=%d", session_id)


async def release_results_for_group(exam_id: int, group_id: Optional[int], require_reviewed: bool = False) -> int:
    """Release all results for a group (or all students) in a specific exam.
    When require_reviewed=True, only sessions already marked reviewed are released.
    """
    reviewed_clause = " AND reviewed=1" if require_reviewed else ""
    async with _conn() as con:
        if group_id:
            cur = await con.execute(
                f"""UPDATE exam_sessions SET result_released=1
                   WHERE exam_id=? AND student_id IN (
                     SELECT id FROM users WHERE group_id=?
                   ){reviewed_clause}""",
                (exam_id, group_id),
            )
        else:
            cur = await con.execute(
                f"UPDATE exam_sessions SET result_released=1 WHERE exam_id=?{reviewed_clause}",
                (exam_id,),
            )
        logger.info("Released %d result(s) for exam_id=%d group_id=%s", cur.rowcount, exam_id, group_id)
        return cur.rowcount


# ─────────────────────────────────────────────────────────────────────────────
# Exams
# ─────────────────────────────────────────────────────────────────────────────

async def create_exam(
    title: str,
    course_name: str,
    level: str,
    duration_minutes: int,
    total_marks: int,
    questions_json: str,
    created_by: int,
    fitb_hint_enabled: int = 0,
) -> int:
    now = _now()
    async with _conn() as con:
        cur = await con.execute(
            """INSERT INTO exams (title, course_name, level, duration_minutes,
               total_marks, status, questions_json, created_by, created_at, updated_at, fitb_hint_enabled)
               VALUES (?,?,?,?,?,'draft',?,?,?,?,?)""",
            (title, course_name, level, duration_minutes, total_marks,
             questions_json, created_by, now, now, fitb_hint_enabled),
        )
        eid = cur.lastrowid
        logger.info("Exam created: id=%d title=%r by user=%d", eid, title, created_by)
        return eid


async def get_exam(exam_id: int) -> Optional[dict]:
    async with _conn() as con:
        cur = await con.execute("SELECT * FROM exams WHERE id=?", (exam_id,))
        row = await cur.fetchone()
        return dict(row) if row else None


async def list_exams(status: Optional[str] = None) -> list:
    async with _conn() as con:
        if status:
            cur = await con.execute(
                "SELECT * FROM exams WHERE status=? ORDER BY created_at DESC", (status,)
            )
        else:
            cur = await con.execute("SELECT * FROM exams ORDER BY created_at DESC")
        return [dict(r) for r in await cur.fetchall()]


async def update_exam(exam_id: int, **fields) -> None:
    fields["updated_at"] = _now()
    set_clause = ", ".join(f"{k}=?" for k in fields)
    async with _conn() as con:
        await con.execute(
            f"UPDATE exams SET {set_clause} WHERE id=?",
            (*fields.values(), exam_id),
        )


async def publish_exam(exam_id: int) -> None:
    await update_exam(exam_id, status="published")


async def delete_exam(exam_id: int) -> None:
    async with _conn() as con:
        await con.execute(
            "DELETE FROM answers WHERE session_id IN (SELECT id FROM exam_sessions WHERE exam_id=?)",
            (exam_id,),
        )
        await con.execute("DELETE FROM exam_sessions WHERE exam_id=?", (exam_id,))
        await con.execute("DELETE FROM exams WHERE id=?", (exam_id,))
        logger.info("Deleted exam id=%d with all sessions and answers", exam_id)


async def reset_exam_sessions(exam_id: int) -> int:
    """Delete all sessions (and answers) for an exam so students can retake it."""
    async with _conn() as con:
        cur = await con.execute(
            "SELECT id FROM exam_sessions WHERE exam_id=?", (exam_id,)
        )
        sessions = await cur.fetchall()
        sids = [s["id"] for s in sessions]
        for sid in sids:
            await con.execute("DELETE FROM answers WHERE session_id=?", (sid,))
        await con.execute("DELETE FROM exam_sessions WHERE exam_id=?", (exam_id,))
        logger.info("Reset %d session(s) for exam_id=%d", len(sids), exam_id)
        return len(sids)


# ─────────────────────────────────────────────────────────────────────────────
# Exam sessions
# ─────────────────────────────────────────────────────────────────────────────

async def create_session(exam_id: int, student_id: int) -> int:
    async with _conn() as con:
        cur = await con.execute(
            "INSERT INTO exam_sessions (exam_id, student_id, start_time, status) VALUES (?,?,?,'active')",
            (exam_id, student_id, _now()),
        )
        sid = cur.lastrowid
        logger.info("Exam session created: session_id=%d exam_id=%d student_id=%d", sid, exam_id, student_id)
        return sid


async def get_session(session_id: int) -> Optional[dict]:
    async with _conn() as con:
        cur = await con.execute("SELECT * FROM exam_sessions WHERE id=?", (session_id,))
        row = await cur.fetchone()
        return dict(row) if row else None


async def get_active_session(exam_id: int, student_id: int) -> Optional[dict]:
    async with _conn() as con:
        cur = await con.execute(
            "SELECT * FROM exam_sessions WHERE exam_id=? AND student_id=? AND status='active'",
            (exam_id, student_id),
        )
        row = await cur.fetchone()
        return dict(row) if row else None


async def get_any_session(exam_id: int, student_id: int) -> Optional[dict]:
    """Return any session (active or submitted) for this student+exam combo."""
    async with _conn() as con:
        cur = await con.execute(
            "SELECT * FROM exam_sessions WHERE exam_id=? AND student_id=?",
            (exam_id, student_id),
        )
        row = await cur.fetchone()
        return dict(row) if row else None


async def close_session(session_id: int, score: float) -> None:
    async with _conn() as con:
        await con.execute(
            "UPDATE exam_sessions SET status='submitted', end_time=?, score=? WHERE id=?",
            (_now(), score, session_id),
        )
        logger.info("Session closed: session_id=%d score=%.2f", session_id, score)


async def list_sessions_for_student(student_id: int) -> list:
    async with _conn() as con:
        cur = await con.execute(
            """SELECT es.*, e.title as exam_title FROM exam_sessions es
               JOIN exams e ON e.id = es.exam_id
               WHERE es.student_id=? ORDER BY es.start_time DESC""",
            (student_id,),
        )
        return [dict(r) for r in await cur.fetchall()]


# ─────────────────────────────────────────────────────────────────────────────
# Answers
# ─────────────────────────────────────────────────────────────────────────────

async def save_answers(session_id: int, scored: list) -> None:
    async with _conn() as con:
        await con.execute("DELETE FROM answers WHERE session_id=?", (session_id,))
        await con.executemany(
            "INSERT INTO answers (session_id, question_id, student_answer, score, max_score, feedback) VALUES (?,?,?,?,?,?)",
            [
                (session_id, a["question_id"], a["student_answer"],
                 a["score"], a["max_score"], a["feedback"])
                for a in scored
            ],
        )


async def upsert_draft_answers(session_id: int, answers_list: list) -> int:
    """Save or update draft answers (no scoring) for auto-save. Returns count saved."""
    async with _conn() as con:
        for a in answers_list:
            qid = a.get("question_id", "")
            ans = a.get("student_answer", "")
            if not qid:
                continue
            cur = await con.execute(
                "SELECT id FROM answers WHERE session_id=? AND question_id=?",
                (session_id, qid),
            )
            existing = await cur.fetchone()
            if existing:
                await con.execute(
                    "UPDATE answers SET student_answer=? WHERE session_id=? AND question_id=?",
                    (ans, session_id, qid),
                )
            else:
                await con.execute(
                    "INSERT INTO answers (session_id, question_id, student_answer, score, max_score, feedback) VALUES (?,?,?,0,0,'')",
                    (session_id, qid, ans),
                )
        return len(answers_list)


async def get_answers(session_id: int) -> list:
    async with _conn() as con:
        cur = await con.execute(
            "SELECT * FROM answers WHERE session_id=? ORDER BY rowid", (session_id,)
        )
        return [dict(r) for r in await cur.fetchall()]


# ─────────────────────────────────────────────────────────────────────────────
# Scoring / review
# ─────────────────────────────────────────────────────────────────────────────

async def update_answer_score(session_id: int, question_id: str, new_score: float) -> None:
    async with _conn() as con:
        await con.execute(
            "UPDATE answers SET score=? WHERE session_id=? AND question_id=?",
            (new_score, session_id, question_id),
        )
        logger.info("Answer score updated: session_id=%d q=%s score=%.2f", session_id, question_id, new_score)


async def recalculate_session_score(session_id: int) -> float:
    """Recompute session total from all answer rows and persist it."""
    async with _conn() as con:
        cur = await con.execute(
            "SELECT SUM(score) as total FROM answers WHERE session_id=?",
            (session_id,),
        )
        row = await cur.fetchone()
        total = float(row["total"] or 0.0)
        await con.execute(
            "UPDATE exam_sessions SET score=?, reviewed=1 WHERE id=?",
            (total, session_id),
        )
        logger.info("Session score recalculated: session_id=%d total=%.2f", session_id, total)
        return total


# ─────────────────────────────────────────────────────────────────────────────
# Audit
# ─────────────────────────────────────────────────────────────────────────────

async def list_sessions_admin(exam_id: Optional[int] = None) -> list:
    """Return all submitted sessions joined with user and exam info (admin view)."""
    async with _conn() as con:
        if exam_id:
            cur = await con.execute(
                """SELECT es.*, u.username, u.full_name, u.rank, u.unit,
                          e.title as exam_title, e.total_marks as exam_total_marks
                   FROM exam_sessions es
                   JOIN users u ON u.id = es.student_id
                   JOIN exams e ON e.id = es.exam_id
                   WHERE es.exam_id=? AND es.status='submitted'
                   ORDER BY es.end_time DESC""",
                (exam_id,),
            )
        else:
            cur = await con.execute(
                """SELECT es.*, u.username, u.full_name, u.rank, u.unit,
                          e.title as exam_title, e.total_marks as exam_total_marks
                   FROM exam_sessions es
                   JOIN users u ON u.id = es.student_id
                   JOIN exams e ON e.id = es.exam_id
                   WHERE es.status='submitted'
                   ORDER BY es.end_time DESC""",
            )
        return [dict(r) for r in await cur.fetchall()]


async def audit(user_id: Optional[int], action: str, ip: str = "", details: str = "") -> None:
    async with _conn() as con:
        await con.execute(
            "INSERT INTO audit_log (user_id, action, ip_address, timestamp, details) VALUES (?,?,?,?,?)",
            (user_id, action, ip, _now(), details),
        )
