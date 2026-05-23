# Examination System

A complete, offline-capable exam-taking ecosystem built for controlled, secure examination environments. The system supports multiple question types, automated grading (including AI-assisted short-answer grading), a locked-down student kiosk browser, and a full-featured admin panel.

---

## Table of Contents

- [Components Overview](#components-overview)
- [Architecture](#architecture)
- [Complete Workflow Guides](#complete-workflow-guides)
  - [Admin: First-Time Setup](#workflow-1-admin-first-time-setup)
  - [Admin: Creating an Exam](#workflow-2-admin-creating-an-exam-from-scratch)
  - [Admin: Importing an Exam from JSON](#workflow-3-admin-importing-an-exam-from-json)
  - [Admin: Managing Users](#workflow-4-admin-managing-users)
  - [Admin: Publishing and Managing Exams](#workflow-5-admin-publishing-and-managing-exams)
  - [Admin: Viewing Results](#workflow-6-admin-viewing-results)
  - [Student: Taking an Exam](#workflow-7-student-taking-an-exam)
  - [Student: Already-Submitted Exam](#workflow-8-student-viewing-already-submitted-score)
  - [Offline Deployment](#workflow-9-offline-deployment)
  - [Building the Electron Installer](#workflow-10-building-the-electron-installer)
- [Features](#features)
- [Question Types & Grading](#question-types--grading)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Configuration](#configuration)
- [Quick Start (Docker)](#quick-start-docker)
- [Development Setup](#development-setup)
- [Security Notes](#security-notes)
- [Project Structure](#project-structure)
- [Default Credentials](#default-credentials)

---

## Components Overview

| Component | Stack | Port | Purpose |
|-----------|-------|------|---------|
| **exam-server-backend** | FastAPI · SQLite · PyJWT · Uvicorn | `8001` | REST API server — auth, exam management, grading, audit logging |
| **exam-browser-client** | Electron · Node.js | — | Locked-down kiosk browser for students taking exams |
| **frontend-admin** | React 18 · Vite · Tailwind CSS | `80` prod / `5174` dev | Web admin panel — manage exams, users, results |

---

## Architecture

```
┌─────────────────────────┐        ┌───────────────────────────────┐
│  exam-browser-client    │──HTTP─►│                               │
│  (Electron kiosk)       │        │   exam-server-backend         │
└─────────────────────────┘        │   (FastAPI on :8001)          │
                                   │                               │
┌─────────────────────────┐        │  ┌─────────────────────────┐  │
│  frontend-admin         │──HTTP─►│  │  SQLite  (exam.db)      │  │
│  (React on :80 / :5174) │        │  └─────────────────────────┘  │
└─────────────────────────┘        │  ┌─────────────────────────┐  │
                                   │  │  LM Studio (optional)   │  │
                                   │  │  Short-answer grading   │  │
                                   │  └─────────────────────────┘  │
                                   └───────────────────────────────┘
```

### Request Flow

1. **Admin** logs in via the React admin panel → creates/publishes exams → manages users.
2. **Student** opens the Electron kiosk → logs in → selects an exam → answers questions → submits.
3. **Backend** grades answers automatically, stores results, and provides results to both roles.
4. All authentication uses **JWT tokens** (HS256, configurable expiry, default 12 h).
5. Every sensitive action is written to an **audit log** (file + database).

---

## Complete Workflow Guides

### Workflow 1: Admin — First-Time Setup

This is the initial setup you perform once before anything else.

1. **Start the server** (Docker or dev mode — see [Quick Start](#quick-start-docker)).
2. **Open the admin panel** at `http://localhost:80` (Docker) or `http://localhost:5174` (dev).
3. **Log in** with default credentials: username `admin`, password `admin123`.
4. **Change the admin password immediately:**
   - Go to **Users** in the left sidebar.
   - Click the pencil icon on the `admin` account.
   - Enter a new strong password and save.
5. **Configure the Electron client `.env`** (if students will use the kiosk):
   - Edit `exam-browser-client/.env`.
   - Set `EXAM_SERVER_URL` to the machine IP or hostname where the backend runs, e.g. `http://192.168.1.10:8001`.

---

### Workflow 2: Admin — Creating an Exam from Scratch

Use this when you want to build an exam question-by-question using the editor.

1. Open the admin panel and click **Exams** in the sidebar.
2. Click **+ New Exam** (top-right button).
3. Fill in the **exam metadata** fields:
   - **Title** *(required)* — e.g. "Mathematics Mid-Term".
   - **Course / Subject** — e.g. "Mathematics".
   - **Level** — e.g. "Grade 10" or "A-Level".
   - **Duration (minutes)** — total time allowed, e.g. `60`.
   - **Pass Marks** — minimum score to pass.
   - **Description** — shown on the results screen.
   - **Instructions** — displayed before the exam starts.
4. Click **+ Add Question** to open the question editor modal.
5. In the question editor:
   - Choose the **Type**: `mcq`, `true-false`, `fill-blank`, or `short-answer`.
   - Set the **Marks** value.
   - Type the **Question Text**.
   - For `mcq`: fill in all four option fields (A, B, C, D). At least 4 non-empty options are required.
   - Set the **Answer Key**:
     - `mcq` — type the exact option text that matches one of A/B/C/D.
     - `true-false` — choose True or False from the dropdown.
     - `fill-blank` — type the expected answer.
     - `short-answer` — type a model answer; also add a **Rubric** to guide AI grading.
   - Click **Save Question**.

   > **Validation before saving the exam:**
   > - If any MCQ has fewer than 4 non-empty options, a **yellow warning banner** lists the affected questions and the **Save Exam** button is disabled.
   > - If any question has an empty answer key, a **red error banner** lists the affected questions and the **Save Exam** button is disabled.
   > - Fix all flagged questions before the Save button re-enables.

6. Repeat step 4–5 for each question.
7. Click **Save Exam**. The exam is saved as a **draft** (not visible to students yet).
8. To make it available, see [Workflow 5](#workflow-5-admin-publishing-and-managing-exams).

---

### Workflow 3: Admin — Importing an Exam from JSON

Use this to bulk-import questions from a structured JSON file.

1. Open the admin panel and click **Upload** in the left sidebar.
2. Click **Choose File** and select a `.json` file from your computer.
3. Click **Parse & Preview**. The backend reads the file and returns the parsed questions.
4. Review the question list in the preview panel — verify types, options, and answers.
5. Click **Import to Exam** to create a new draft exam. You can then edit it further via the Exam Editor.

**Supported JSON formats:**

**Format 1 — Flat list:**
```json
[
  { "type": "mcq", "text": "What is 2+2?", "options": ["3","4","5","6"], "answer_key": "4", "marks": 1 }
]
```

**Format 2 — Questions wrapper:**
```json
{ "questions": [ { "type": "true_false", "text": "The sky is blue.", "answer_key": "true", "marks": 1 } ] }
```

**Format 3 — Sectioned exam paper:**
```json
{
  "sections": {
    "mcq":         [ { "text": "...", "options": ["A) opt1","B) opt2","C) opt3","D) opt4"], "answer": "A" } ],
    "true_false":  [ { "text": "...", "answer": "True" } ],
    "fill_blank":  [ { "text": "The capital of France is ___.", "answer": "Paris" } ],
    "short_answer":[ { "text": "Explain photosynthesis.", "rubric": "Mention light, CO2, glucose." } ]
  }
}
```

---

### Workflow 4: Admin — Managing Users

Create, activate, and deactivate student accounts.

1. Click **Users** in the left sidebar.
2. **Create a student account:**
   - Click **+ New User**.
   - Enter a **Username** (must be unique).
   - Enter a **Password** (minimum 8 characters).
   - Set **Role** to `student` (or `admin` to create another admin).
   - Click **Create**.
3. **Deactivate a student** (prevents login without deleting data):
   - Click the active toggle next to the student's name.
4. **Reset a password:**
   - Click the edit icon on the user row.
   - Enter a new password and save.
5. Repeat for each student who will sit the exam.

> **Tip:** Use student IDs or roll numbers as usernames for easy tracking in the audit log and results view.

---

### Workflow 5: Admin — Publishing and Managing Exams

An exam must be **published** before students can see it in the kiosk.

1. Click **Exams** in the left sidebar.
2. Locate the exam — its status shows **draft**.
3. Click **Publish**. The backend validates that the exam has at least one question.
4. Status changes to **published** — students can now see and start it.
5. To hide it again without deleting, click **Unpublish** — status reverts to **draft**. Sessions already in progress are unaffected.
6. To permanently remove an exam, click **Delete** and confirm.

**Editing a published exam:**
- Click **Edit** on any exam to modify its content. Changes affect new sessions immediately.
- To avoid mid-exam disruption, unpublish the exam before editing it during an active session.

---

### Workflow 6: Admin — Viewing Results

1. Click **Results** in the left sidebar.
2. The table lists every submitted exam session with: student username, exam title, score, percentage, submission time.
3. Click any row to expand the **per-question breakdown** showing: student answer, correct answer, marks awarded, and grader feedback.
4. Use the **filter by exam** dropdown to narrow results.
5. Results persist indefinitely in the database.

---

### Workflow 7: Student — Taking an Exam

End-to-end flow for a student using the locked-down Electron kiosk.

1. **Open ExamBrowser** on the student's machine.
2. The kiosk goes fullscreen. All system shortcuts (Alt+Tab, Alt+F4, F11, etc.) and DevTools are blocked.
3. Enter the **Username** and **Password** assigned by the admin. Press **Login**.
4. If one exam is published it starts automatically. If multiple are published, a selection screen appears.
5. The **exam screen** opens with:
   - Sidebar: numbered grid of all questions (green = answered, blue = current, dark = unanswered).
   - Top-right countdown timer (turns amber below 5 min, red below 1 min).
   - Question card: MCQ option buttons, True/False buttons, or text area.
6. **Answering:**
   - `MCQ` — click an option button to select; click another to change.
   - `True/False` — click **True** or **False**.
   - `Fill-in-the-blank` / `Short Answer` — type in the text area.
   - Navigate freely with **← Previous** / **Next →** or click any question number in the sidebar.
7. **Question order is randomised per student** — each student receives questions in a different order seeded by their session ID. Resuming a dropped connection restores the same order.
8. On the last question the **Submit Exam** button appears. A confirmation modal warns if any questions are unanswered.
9. After submission the **result screen** shows: score (e.g. "18 / 25") and percentage. The student clicks **Exit Browser** to close the kiosk.
10. If **time runs out**, the exam is auto-submitted with whatever answers were entered.

---

### Workflow 8: Student — Viewing an Already-Submitted Score

If a student logs in and tries to start an exam they have already completed:

1. The kiosk detects the existing submission (HTTP 409 from the server).
2. The **result screen** appears showing:
   - ✅ "Exam Already Submitted"
   - Their **score** (e.g. "18 / 25")
   - Their **percentage** (e.g. "72%")
3. **← Back to Exam List** returns them to the exam selection screen (useful if they have another exam available).
4. **Exit Browser** closes the kiosk normally.

---

### Workflow 9: Offline Deployment

#### Step 1 — Export (internet-connected machine with Docker)

```powershell
.\export-for-offline.ps1
```

This script builds Docker images and bundles them with config files into `exam-system-offline.zip`. Transfer this file to the offline machine via USB or local network.

#### Step 2 — Deploy (offline machine)

Extract the zip and run:

**Windows:** `.\deploy-offline.ps1`
**Linux:** `chmod +x deploy-offline.sh && ./deploy-offline.sh`
**macOS:** `chmod +x deploy-offline-macos.sh && ./deploy-offline-macos.sh`

Each script loads the Docker images, creates data directories, and starts the stack.

After deployment: **Admin panel:** `http://localhost:80` | **API:** `http://localhost:8001`

#### Step 3 — Configure the Electron client

1. Edit `exam-browser-client/.env`: set `EXAM_SERVER_URL=http://<server-ip>:8001`.
2. Build the installer (see [Workflow 10](#workflow-10-building-the-electron-installer)).
3. Install it on each student machine.

---

### Workflow 10: Building the Electron Installer

```bash
cd exam-browser-client
npm install
# Edit .env to point at your production backend BEFORE building
npm run dist:win    # Windows — NSIS installer in dist/
npm run dist:linux  # Linux   — AppImage in dist/
npm run dist:mac    # macOS   — DMG in dist/
```

The built installer **embeds the `.env` file**, so the server URL is baked in.

#### Why you get a folder instead of one file

The `dist/` output always contains a folder (`win-unpacked/`) **plus** an installer file:

- The **folder** is the portable unpackaged app — useful for quick testing.
- The **installer** (`.exe`, `.AppImage`, `.dmg`) is what you distribute. Students double-click it, it installs to `Program Files`, and creates a desktop shortcut. They never see the internal folder.

#### How to get a true single-file portable `.exe`

Add `"portable"` to the electron-builder targets in `package.json`:

```json
"win": {
  "target": [
    { "target": "nsis" },
    { "target": "portable" }
  ]
}
```

Then run `npm run dist:win`. You get an extra `ExamBrowser-Portable.exe` — a single file that requires no installation; students copy it and run it directly.

| Method | How | Output |
|--------|-----|--------|
| `portable` target | Add `"portable"` to electron-builder targets | Single `.exe`, no installation needed |
| `nsis` target (default) | Already configured | Small installer `.exe` |
| `zip` target | Add `"target": "zip"` | Zipped portable folder |

---

## Features

### Admin Panel (`frontend-admin`)
- **Dashboard** — live overview of active exams and recent submissions.
- **Exam Editor** — rich question builder with real-time validation; Save is blocked if any MCQ has fewer than 4 options or any question is missing an answer key.
- **Exam List** — browse all exams; publish, unpublish, or delete.
- **Upload & Parse** — import exams from structured JSON files (three formats).
- **Users** — create, activate, and deactivate student/admin accounts.
- **Results** — per-student scores with full per-question breakdown and grader feedback.

### Exam Browser Client (`exam-browser-client`)
- Fullscreen, frameless Electron window — no taskbar, no title bar.
- Blocks Alt+Tab, Alt+F4, F11, Ctrl+W, Ctrl+R, F5, and all developer-tool shortcuts.
- Blocks right-click context menu and navigation outside the configured server origin.
- Re-focuses automatically if the window loses focus.
- **Question shuffling** — each student receives questions in a unique randomised order seeded by their session ID; reconnection restores the same order.
- **Error display** — all runtime and network errors surface in an on-screen toast overlay instead of silent console failures.
- **Already-submitted detection** — shows the student's actual score instead of a blank message.
- Configured via `.env` — no hardcoded server URL.

### Backend (`exam-server-backend`)
- FastAPI with automatic OpenAPI docs (enabled only when `DEBUG=true`).
- Role-based access control (`admin` / `student`) enforced on every endpoint.
- Exam lifecycle: `draft` → `published`; cannot publish an empty exam.
- Resumable sessions — if connection drops, student picks up where they left off with the same question order.
- Automated grading (exact, fuzzy, LLM) on submission.
- Full audit logging to file and SQLite.

---

## Question Types & Grading

| Type | JSON `type` value | Grading Method | Notes |
|------|-------------------|----------------|-------|
| Multiple Choice | `mcq` | Exact match (case-insensitive) | Min 4 options required in editor |
| True / False | `true_false` | Exact match (case-insensitive) | Values: `true` / `false` |
| Fill in the Blank | `fill_blank` | Fuzzy string match (`thefuzz`) | Full credit ≥ 80%; partial credit at ≥ 80% partial ratio |
| Short Answer | `short_answer` | LM Studio rubric-based LLM grading | Falls back to 0 on LM Studio error |

---

## API Reference

All endpoints are prefixed with `/api`. **[Admin]** = requires JWT with `role=admin`. **[Auth]** = any valid JWT.

### Authentication — `/api/auth`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/login` | — | Obtain JWT. Body: `{ username, password }` |
| `POST` | `/api/auth/signup` | — | Register a new account. Body: `{ username, password, role }` |
| `GET` | `/api/auth/me` | [Auth] | Return current user info |

### Exam Sessions — `/api/exam`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/exam/start` | [Auth] | Begin or resume a session. Returns 409 if already submitted. |
| `POST` | `/api/exam/submit` | [Auth] | Submit answers for grading. |
| `GET` | `/api/exam/result/{session_id}` | [Auth] | Detailed per-question result. |
| `GET` | `/api/exam/available` | [Auth] | List published exams. |
| `GET` | `/api/exam/my-results` | [Auth] | List student's completed sessions. |

### Admin — `/api/admin`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/exams` | List all exams (`?status=draft\|published`) |
| `POST` | `/api/admin/exams` | Create exam (draft) |
| `GET` | `/api/admin/exams/{id}` | Get exam detail |
| `PUT` | `/api/admin/exams/{id}` | Update exam |
| `DELETE` | `/api/admin/exams/{id}` | Delete exam (204 No Content) |
| `POST` | `/api/admin/exams/{id}/publish` | Publish exam |
| `POST` | `/api/admin/exams/{id}/unpublish` | Revert to draft |
| `POST` | `/api/admin/exams/upload-parse` | Upload JSON; return parsed questions |
| `GET` | `/api/admin/users` | List users |
| `POST` | `/api/admin/users` | Create user |
| `PUT` | `/api/admin/users/{id}` | Update user |
| `GET` | `/api/admin/results` | List all submitted sessions |

### Utility

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Returns `{"status":"ok"}` |

---

## Database Schema

SQLite database (`exam.db`) with WAL mode and foreign-key enforcement.

| Table | Key Columns | Description |
|-------|-------------|-------------|
| `users` | `id, username, password_hash, role, active, created_at` | All accounts |
| `exams` | `id, title, course_name, level, duration_minutes, total_marks, status, questions_json, created_by, created_at` | Exam definitions |
| `exam_sessions` | `id, exam_id, student_id, start_time, end_time, status` | One row per student attempt |
| `answers` | `session_id, question_id, student_answer, score, max_score, feedback` | Graded answers |
| `audit_log` | `id, user_id, event, ip, detail, created_at` | Immutable event log |

---

## Configuration

### Backend `.env`

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Uvicorn bind host |
| `PORT` | `8001` | Uvicorn bind port |
| `DEBUG` | `false` | Enables `/docs` OpenAPI UI |
| `JWT_SECRET` | *(auto-generated)* | HS256 signing secret |
| `JWT_EXPIRE_HOURS` | `12` | Token lifetime in hours |
| `CORS_ORIGINS` | `http://localhost:5174,...` | Comma-separated allowed origins |
| `DATABASE_PATH` | `./exam.db` | SQLite file path |
| `LM_STUDIO_BASE_URL` | `http://localhost:1234/v1` | LM Studio API (short-answer grading) |
| `LLM_MODEL` | `qwen2.5-7b-instruct-1m` | Model name for LM Studio |
| `FUZZY_THRESHOLD` | `80` | Min fuzzy score (0–100) for fill-in-the-blank |

### Electron Client `.env`

| Variable | Default | Description |
|----------|---------|-------------|
| `EXAM_SERVER_URL` | `http://localhost:8001` | Backend URL (also the navigation whitelist) |

---

## Quick Start (Docker)

```bash
# 1. Configure
cp exam-server-backend/.env.example exam-server-backend/.env
# Edit JWT_SECRET

# 2. Start
docker-compose up --build -d

# 3. Admin panel: http://localhost:80  (admin / admin123)

# 4. Logs
docker-compose logs -f

# 5. Stop
docker-compose down
```

---

## Development Setup

### Backend
```bash
cd exam-server-backend
python -m venv .venv
.venv\Scripts\activate       # Windows
pip install -r requirements.txt
cp .env.example .env
python run.py                # http://localhost:8001
```

### Admin Frontend
```bash
cd frontend-admin
npm install
npm run dev                  # http://localhost:5174
```

### Electron Client
```bash
cd exam-browser-client
npm install
echo EXAM_SERVER_URL=http://localhost:8001 > .env
npm start
```

---

## Security Notes

- Change the default admin password immediately after first login.
- Set a strong, random `JWT_SECRET` — do not use the auto-generated value in production.
- The Electron client blocks all DevTools access, right-click menus, external navigation, and OS shortcuts.
- Answer keys and rubrics are **never sent to the student** — stripped server-side before delivery.
- All logins, exam starts, and submissions are recorded in the audit log.
- File uploads restricted to `.json`, capped at 50 MB.
- OpenAPI docs (`/docs`) disabled in production (`DEBUG=false`).

---

## Project Structure

```
Examination-System/
├── docker-compose.yml
├── export-for-offline.ps1
├── deploy-offline.ps1 / .sh / -macos.sh
│
├── exam-server-backend/
│   ├── run.py
│   └── app/
│       ├── main.py, config.py, database.py, models.py, auth.py, grader.py
│       ├── routers/
│       │   ├── auth.py      — /api/auth/*
│       │   ├── exam.py      — /api/exam/*  (shuffles questions per session)
│       │   └── admin.py     — /api/admin/*
│       └── utils/
│           ├── audit.py, document_parser.py, logger.py
│
├── exam-browser-client/
│   └── src/
│       ├── main.js          — Electron main process, kiosk security
│       ├── preload.js       — Context bridge
│       └── renderer/
│           ├── index.html   — Shell + error toast overlay
│           ├── app.js       — Exam UI + error handling system
│           └── style.css
│
└── frontend-admin/
    └── src/
        ├── views/
        │   ├── ExamEditorPanel.jsx  — Validates MCQ options & answers before save
        │   └── ...
        └── services/
            ├── base.js              — Fetch wrapper (handles 204 No Content)
            └── ...
```

---

## Default Credentials

| Username | Password | Role |
|----------|----------|------|
| `admin`  | `admin123` | admin |

**Change the admin password immediately after first login.**
