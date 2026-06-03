# Examination System

A self-contained, offline-capable computer-based examination platform built for military / institutional use, supporting both standard question-based exams and practical VM-based assessments.

**Stack:**
- **FastAPI** (Python 3.11+) — backend REST API with SQLite
- **React + Vite + Tailwind CSS** — instructor/admin web frontend
- **Electron** — locked-down kiosk exam client for students
- **Docker / Docker Compose** — container orchestration for easy deployment

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Quick Start (Docker)](#quick-start-docker)
3. [Project Structure](#project-structure)
4. [Backend — exam-server-backend](#backend--exam-server-backend)
5. [Admin Frontend — frontend-admin](#admin-frontend--frontend-admin)
6. [Exam Client — exam-browser-client](#exam-client--exam-browser-client)
7. [User Management & Import](#user-management--import)
8. [Question Types](#question-types)
9. [Creating Exams](#creating-exams)
10. [Exam JSON File Format](#exam-json-file-format)
11. [Grading](#grading)
12. [Results & Manual Review](#results--manual-review)
13. [Practical VM Exams](#practical-vm-exams)
14. [FITB Hint System](#fitb-hint-system)
15. [Offline Deployment](#offline-deployment)
16. [Environment Variables](#environment-variables)
17. [API Overview](#api-overview)
18. [Security Notes](#security-notes)
19. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
+-------------------------------------------------------------+
|                        Docker Host                           |
|                                                              |
|  +------------------+    +-------------------------------+   |
|  |  FastAPI Backend  |    |  React Admin Frontend (Nginx) |   |
|  |  :8001            |<---|  :80                          |   |
|  |  SQLite DB        |    |  (proxies /api/* -> :8001)    |   |
|  +------------------+    +-------------------------------+   |
|                                                              |
|  +--------------------------------------------------------+  |
|  |  Electron Exam Client (installed on student machines)  |  |
|  |  Kiosk mode - connects to FastAPI on LAN               |  |
|  +--------------------------------------------------------+  |
+-------------------------------------------------------------+
```

**Data flow:**
- The admin frontend communicates with the backend via REST API at `/api/admin/*`
- The Electron client connects to the same backend at `/api/exam/*` and `/api/auth/*`
- SQLite database is persisted in `data/exam.db` via a Docker volume
- Screenshot uploads are stored in `data/uploads/screenshots/`
- Logs are written to `data/logs/` and rotated daily

---

## Quick Start (Docker)

### Prerequisites

- Docker Desktop (Windows/macOS) or Docker + Docker Compose (Linux)
- Ports `8001` and `80` available on the host machine

### Start

```bash
docker compose up -d
```

- Admin frontend -> http://localhost
- Backend API -> http://localhost:8001
- API docs (Swagger UI) -> http://localhost:8001/docs

**Default admin credentials:**
- Username: `admin`
- Password: `admin123`

> **Important:** Change the admin password immediately after first login.

### Stop

```bash
docker compose down
```

### View Logs

```bash
docker compose logs -f backend
docker compose logs -f frontend
```

---

## Project Structure

```
Examination-System/
├── docker-compose.yml              # Main compose file
├── Dockerfile                      # Root-level helper Dockerfile
├── deploy-offline.ps1              # Windows offline deployment script
├── deploy-offline.sh               # Linux/macOS offline deployment script
├── export-for-offline.ps1          # Export Docker image for offline bundle
├── data/
│   ├── exam.db                     # SQLite database (auto-created on first run)
│   ├── uploads/
│   │   └── screenshots/            # Student screenshot uploads
│   └── logs/                       # Rotated application logs
│
├── exam-server-backend/            # FastAPI Python backend
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── run.py                      # Uvicorn entry point
│   └── app/
│       ├── auth.py                 # JWT creation, password hashing, auth middleware
│       ├── config.py               # Environment variable configuration
│       ├── database.py             # All SQLite async operations (aiosqlite)
│       ├── grader.py               # Answer grading logic (exact / fuzzy / LLM)
│       ├── main.py                 # FastAPI app, middleware, startup hooks
│       ├── models.py               # Pydantic request/response models
│       └── routers/
│           ├── admin.py            # /api/admin/* — instructor endpoints
│           ├── auth.py             # /api/auth/* — login
│           └── exam.py             # /api/exam/* — student endpoints
│       └── utils/
│           ├── audit.py            # Audit trail logging
│           ├── document_parser.py  # JSON exam file parser (3 formats)
│           └── logger.py           # Rotating file logger setup
│
├── frontend-admin/                 # React instructor dashboard
│   ├── Dockerfile
│   ├── nginx.conf                  # Nginx config (proxies /api to backend)
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── src/
│       ├── App.jsx                 # Root component, route/panel manager
│       ├── views/
│       │   ├── LoginPage.jsx       # Admin login screen
│       │   ├── DashboardPanel.jsx  # Overview statistics
│       │   ├── ExamListPanel.jsx   # List, publish, assign, delete exams
│       │   ├── ExamEditorPanel.jsx # Create and edit exams inline
│       │   ├── UploadPanel.jsx     # Upload JSON -> parse -> create exam
│       │   ├── ResultsPanel.jsx    # View, review and export results
│       │   └── UsersPanel.jsx      # Manage users, groups, bulk import
│       ├── services/
│       │   ├── base.js             # Fetch wrapper with JWT header
│       │   ├── auth.js             # Login/logout helpers
│       │   ├── exam.js             # Exam CRUD + upload + results API calls
│       │   └── index.js            # Re-exports all services
│       └── components/
│           ├── Sidebar.jsx         # Navigation sidebar
│           ├── QuestionCard.jsx    # Read-only question display component
│           └── ErrorBoundary.jsx
│
├── exam-browser-client/            # Electron kiosk client
│   ├── package.json
│   └── src/
│       ├── main.js                 # Electron main process, kiosk window
│       ├── preload.js              # IPC bridge (main <-> renderer)
│       ├── browser.html            # Practical VM browser window shell
│       ├── browser.js              # Practical VM browser main process
│       ├── browser-preload.js      # IPC for VM browser window
│       ├── proxmox-preload.js      # Proxmox console helpers
│       └── renderer/
│           ├── index.html          # Exam UI shell
│           ├── app.js              # All student exam logic
│           └── style.css
│
└── offline-bundle/
    ├── docker-compose.yml          # Compose file for offline deployment
    ├── deploy-offline.ps1
    └── deploy-offline.sh
```

---

## Backend — exam-server-backend

### Technology

| Component | Library |
|-----------|---------|
| Web framework | FastAPI |
| ASGI server | Uvicorn |
| Database | SQLite via `aiosqlite` |
| Auth | JWT (`python-jose`) + bcrypt |
| Fuzzy matching | `thefuzz` (python-Levenshtein) |
| LLM grading | `httpx` -> LM Studio OpenAI-compatible API |

### Setup (without Docker)

```bash
cd exam-server-backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Linux/macOS
pip install -r requirements.txt
uvicorn run:app --host 0.0.0.0 --port 8001 --reload
```

### Database

SQLite is used. The database file is created automatically at the path set by `DATABASE_PATH` (default: `./exam.db`). All table migrations run automatically at startup — no manual migration step is needed.

**Tables created automatically:**
- `users` — students and admins with bcrypt-hashed passwords
- `groups` — student groups for exam assignment
- `exams` — exam definitions with questions stored as a JSON column
- `sessions` — student exam attempts (active or submitted)
- `answers` — individual question answers per session
- `audit` — per-user audit trail of every action

### Authentication

- JWT tokens are issued on `/api/auth/login`
- Default expiry: **12 hours** (configurable via `JWT_EXPIRE_HOURS`)
- All `/api/admin/*` endpoints require a token with `role: admin`
- All `/api/exam/*` endpoints require any valid token
- The JWT secret is auto-generated and persisted to `.jwt_secret` if `JWT_SECRET` env var is not set — set `JWT_SECRET` explicitly in production

### Logging

Logs are written to `logs/` with daily rotation:

| File | Contents |
|------|----------|
| `exam_server.log.*` | All INFO+ application events |
| `errors.log.*` | ERROR and above only |
| `audit.log.*` | Every exam start, submit, login, user management action |

---

## Admin Frontend — frontend-admin

### Setup (without Docker)

```bash
cd frontend-admin
npm install
npm run dev        # development server at http://localhost:5173
npm run build      # production build -> dist/
```

> In development (`npm run dev`), Vite proxies all `/api/*` requests to `http://localhost:8001`. In production (Docker), Nginx performs this proxy.

### Panel-by-Panel Guide

#### Login Page

Standard username/password login. On success, the JWT is stored in `localStorage` and the user is redirected to the Dashboard. Invalid credentials show an error message.

---

#### Dashboard

Displays real-time statistics:
- Total exams (draft vs published)
- Total registered students
- Total submissions / pending reviews

---

#### Exam List

Displays all exams in a table showing status, question count, duration, total marks, and course.

| Action | Description |
|--------|-------------|
| **Publish** | Makes the exam available to students; requires at least one question |
| **Unpublish** | Returns the exam to Draft; existing student sessions are not affected |
| **Edit** | Opens the Exam Editor for that exam |
| **Assign to Group** | Links the exam to a student group so all members see it in their client |
| **Delete** | Permanently removes the exam and all associated sessions |
| **New Exam** | Opens a blank Exam Editor |

---

#### Exam Editor

Used to create a new exam from scratch or edit an existing one.

**Metadata fields:**

| Field | Description |
|-------|-------------|
| Title | Exam name shown to students |
| Course Name | Optional — displayed in results export |
| Level | Optional — e.g., "Basic", "Advanced" |
| Duration (min) | Time limit for students in minutes |
| Total Marks | Displayed to students; auto-calculated from questions or set manually |
| Practical URL | URL opened in a locked browser window for VM-based exams (leave blank if not used) |
| Allow URL Bar | Whether the practical browser window shows the address bar |
| FITB Hints | Whether to show word-length hints for fill-in-the-blank questions |

The inline question editor supports all 5 question types. See [Question Types](#question-types) for details.

---

#### Upload Exam File

Allows bulk creation of exam questions from a JSON file.

**Workflow:**
1. Drag and drop (or click to browse) a `.json` file
2. Click **Parse File** — the backend parses and returns structured questions
3. Review the parsed questions; use the **Edit** button on any question to modify it
4. Use **+ Add Question** to add extra questions manually (any type including `practical_vm`)
5. Set the exam title, course, and duration
6. Click **Save as Draft** to create the exam in draft state
7. Go to Exam List and click **Publish** when ready for students

**Validation before saving:**
- MCQ questions must have exactly 4 options
- MCQ, True/False, and Fill-in-the-Blank questions must have a correct answer set
- Practical VM questions are accepted without an answer key (scored manually)

> See [Exam JSON File Format](#exam-json-file-format) for all supported JSON structures.

---

#### Results

| Action | Description |
|--------|-------------|
| **View all results** | Table of all submissions: student name, score, percentage, submitted time |
| **Filter by exam** | Dropdown to show results for one specific exam |
| **Review** | Opens full session view: every question, student answer, auto score |
| **Adjust score** | Click any score field in the review to override it |
| **Mark Reviewed** | Flags the session as reviewed (administrative record) |
| **Release Result** | Makes the result visible in the student's Electron client |
| **Release Group** | Releases all results for a specific group + exam combination at once |
| **Export** | Download the result set as an Excel or Word document |

---

#### Users & Groups

**Users table** shows all registered users with their role, group, rank, unit, and active status.

| Action | Description |
|--------|-------------|
| **Add User** | Create a single student or admin account |
| **Reset Password** | Set a new password for any user |
| **Toggle Active** | Enable or disable a student's login access |
| **Assign Group** | Move a student to a group |
| **Delete** | Remove the user permanently |
| **Bulk Import** | Import many students at once from an Excel file |
| **Demo Excel** | Download the Excel template for bulk import |

The **Groups** section lets you create named groups and delete them. Deleting a group un-assigns its members but does not delete the user accounts.

---

## Exam Client — exam-browser-client

The Electron client is installed on **student machines**. It runs in full-screen kiosk mode to prevent cheating.

### Kiosk Security Features

- Full-screen mode cannot be exited during an active exam
- Alt+Tab, Alt+F4, and system keyboard shortcuts are blocked
- Right-click context menus are disabled
- Developer tools are disabled
- A separate locked browser window handles practical VM access

### Build

```bash
cd exam-browser-client
npm install
npm run build      # creates distributable in out/
```

### Configuration

Before distributing to students, edit `src/main.js` and set the server URL:

```js
const SERVER_URL = 'http://192.168.1.100:8001';  // your server LAN IP
```

### Student Exam Flow

1. Student launches the Electron client
2. Enters their **Army No** and password to log in
3. Available assigned exams are listed
4. Student selects an exam and clicks **Start**
5. Questions are displayed with a countdown timer
6. For practical exams, a locked browser window opens alongside the questions
7. Student answers questions and uploads screenshots as required
8. Clicks **Submit** — receives a confirmation message
9. The result is visible only after the instructor **releases** it

### Resuming an Active Session

If a student exits and re-opens the client during an active exam, they are automatically placed back into the same session. The questions appear in the same order (deterministically shuffled by session ID).

---

## User Management & Import

### Bulk Import (Excel)

Download the template using the **Demo Excel** button in the Users panel.

The template has 4 columns:

| Army No | Rank | Name | Unit |
|---------|------|------|------|
| 12345 | Pte | Ahmad bin Ali | 3 SIR |
| 67890 | Cpl | Ravi Kumar | 7 SIB |

**Rules:**
- **Army No** is used as both the login **username** and the **default password**
- Rank, Name, and Unit are stored and appear in exported results
- Duplicate Army No entries are skipped without error
- Empty rows are ignored

### Single User Creation

Fields when creating a user manually:
- **Full Name** — student's display name
- **Rank** — e.g., Pte, Cpl, Sgt
- **Unit** — e.g., 3 SIR
- **Username (Army No)** — unique login identifier
- **Password** — minimum 8 characters
- **Role** — `student` or `admin`
- **Group** — optional; assign to an existing group immediately

### Group-Based Exam Assignment

Groups control which exams a student can access. An exam must be explicitly assigned to a group (via Exam List -> Actions -> Assign to Group) before students in that group will see it in their client.

### Exported Results

Excel/Word exports include:

| Column | Description |
|--------|-------------|
| # | Row number |
| Army No | Student username |
| Rank | From user profile |
| Name | From user profile |
| Unit | From user profile |
| Score | Marks awarded |
| Out of | Total marks |
| Percentage | Score / Total x 100 |
| Submitted At | Timestamp of submission |

---

## Question Types

The system supports **5 question types**:

### 1. MCQ (Multiple Choice)

```json
{
  "type": "mcq",
  "text": "What is the capital of Malaysia?",
  "options": ["Kuala Lumpur", "Penang", "Johor Bahru", "Ipoh"],
  "answer_key": "Kuala Lumpur",
  "marks": 2
}
```

- Exactly **4 options** required
- `answer_key` must exactly match one of the options (case-insensitive comparison at grading)
- Questions are **randomly shuffled** per student session (seed = session ID, so re-login gives the same order)
- Graded by exact string comparison

---

### 2. True / False

```json
{
  "type": "true_false",
  "text": "The Earth revolves around the Sun.",
  "answer_key": "True",
  "marks": 1
}
```

- `answer_key` must be exactly `"True"` or `"False"` (capital first letter)
- Graded by exact match

---

### 3. Fill in the Blank

```json
{
  "type": "fill_blank",
  "text": "The process by which plants make food using sunlight is called ___.",
  "answer_key": "photosynthesis",
  "marks": 2
}
```

- `answer_key` can contain **multiple accepted answers** separated by commas:
  `"photosynthesis, photo synthesis"`
- Graded using fuzzy string matching (`thefuzz`) — see [Grading](#grading)
- Optional word-length hints can be shown to students (see [FITB Hint System](#fitb-hint-system))

---

### 4. Short Answer

```json
{
  "type": "short_answer",
  "text": "Explain the role of the commanding officer during an assault.",
  "answer_key": "Leads the assault, coordinates supporting fire, maintains situational awareness.",
  "rubric": "1 mark for each: leadership, fire coordination, SA. Max 3.",
  "marks": 3
}
```

- Student types a free-text answer; can also upload a screenshot as supporting evidence
- **Auto-graded** by a local LLM (LM Studio) using `rubric` and `answer_key`
- If only a screenshot is uploaded (no text), the question is flagged for **manual review**
- Instructor can override the auto-assigned score

---

### 5. Practical VM

```json
{
  "type": "practical_vm",
  "text": "Connect to the server via SSH and change the hostname to 'exam-server'. Submit a screenshot showing the result.",
  "marks": 10
}
```

- No `answer_key` required
- Auto-scored **0** and placed in the review queue
- Student completes the task in the VM browser window and uploads a screenshot
- Instructor reviews the screenshot and manually sets the score
- Requires the exam to have a **Practical URL** configured

---

## Creating Exams

There are **two ways** to create an exam:

### Method 1: Exam Editor (manual, question by question)

1. Go to **Exam List** and click **New Exam**
2. Fill in the exam metadata (title, duration, practical URL if needed)
3. Click **+ Add Question** to add questions one by one
4. For each question: choose the type, fill in the text, set marks and answer
5. Click **Save** on each question
6. When done, click **Save Exam**
7. Click **Publish** in Exam List when ready for students

### Method 2: Upload Exam File (bulk, from JSON)

1. Go to **Upload** panel
2. Drag and drop a `.json` file (see [Exam JSON File Format](#exam-json-file-format))
3. Click **Parse File**
4. Review and edit parsed questions using the **Edit** button
5. Add extra questions manually (including `practical_vm` type) with **+ Add Question**
6. Set the title, course, and duration at the top
7. Click **Save as Draft**
8. Go to **Exam List** and click **Publish** when ready

---

## Exam JSON File Format

The upload parser accepts **three JSON structures**:

### Format 1 — Flat List

A plain JSON array of question objects:

```json
[
  {
    "id": "q1",
    "type": "mcq",
    "text": "Which OSI layer handles routing?",
    "options": ["Physical", "Data Link", "Network", "Transport"],
    "answer_key": "Network",
    "marks": 2
  },
  {
    "id": "q2",
    "type": "true_false",
    "text": "TCP is a connectionless protocol.",
    "answer_key": "False",
    "marks": 1
  },
  {
    "id": "q3",
    "type": "practical_vm",
    "text": "Configure the firewall to block port 23.",
    "marks": 10
  }
]
```

---

### Format 2 — Object with `questions` Key

Allows including exam metadata alongside the questions:

```json
{
  "title": "Network Fundamentals",
  "course_name": "IT Foundation",
  "duration_minutes": 60,
  "questions": [
    {
      "id": "q1",
      "type": "fill_blank",
      "text": "The default HTTP port is ___.",
      "answer_key": "80",
      "marks": 1
    },
    {
      "id": "q2",
      "type": "short_answer",
      "text": "Describe the three-way TCP handshake.",
      "answer_key": "SYN, SYN-ACK, ACK",
      "rubric": "1 mark per step. Max 3.",
      "marks": 3
    }
  ]
}
```

**Supported metadata keys:**

| Key | Description |
|-----|-------------|
| `title` or `exam_title` | Exam title pre-filled in the upload panel |
| `course_name` or `course` | Course name pre-filled |
| `duration_minutes` or `duration` | Duration in minutes |
| `time_allowed` or `timeAllowed` | Duration in seconds if value > 300, otherwise minutes |

---

### Format 3 — Sectioned Exam Paper

Structured by question type sections. Useful for directly uploading traditionally formatted exam papers:

```json
{
  "title": "Basic Military Knowledge",
  "course_name": "BMT",
  "duration_minutes": 45,
  "sections": {
    "mcq": [
      {
        "number": 1,
        "text": "What does SOP stand for?",
        "options": [
          "A) Standard Operating Procedure",
          "B) Special Order Protocol",
          "C) Strategic Operation Plan",
          "D) Standard Output Process"
        ],
        "answer": "A"
      }
    ],
    "true_false": [
      {
        "number": 1,
        "text": "A section commander is responsible for the welfare of his men.",
        "answer": "True"
      }
    ],
    "fill_blank": [
      {
        "number": 1,
        "text": "The NATO phonetic alphabet letter for A is ___.",
        "answer": "Alpha"
      }
    ],
    "short_answer": [
      {
        "number": 1,
        "text": "Describe the key principles of fire and movement.",
        "answer": "Suppress, move, assault using bounding overwatch.",
        "rubric": "1 mark each for suppression, movement, assault concept.",
        "marks": 3
      }
    ]
  }
}
```

**Notes:**
- MCQ `options` can include letter prefixes (`"A) text"` or `"A. text"`) — they are stripped automatically
- MCQ `answer` is a letter (`A`/`B`/`C`/`D`) mapped to the matching option text
- `id` is auto-generated from type and number if not provided
- `practical_vm` questions cannot be in sections — add them manually after parsing, or use Format 1/2

---

## Grading

### Automatic Grading

All answers are graded immediately when a student submits.

| Question Type | Grading Method | Notes |
|---------------|---------------|-------|
| MCQ | Exact match (case-insensitive) | — |
| True / False | Exact match (`True` / `False`) | — |
| Fill in the Blank | Fuzzy match via `thefuzz` | Threshold configurable |
| Short Answer (text provided) | LLM rubric grading via LM Studio | Falls back to 0 if LLM unavailable |
| Short Answer (screenshot only) | 0 — flagged for manual review | — |
| Practical VM | 0 — always flagged for manual review | — |

### Fuzzy Matching Details (Fill in the Blank)

1. `token_sort_ratio(student_answer, answer_key) >= threshold` → **full marks**
2. `partial_ratio(student_answer, answer_key) >= threshold` → **50% partial credit**
3. Otherwise → **0 marks**

If `answer_key` has multiple comma-separated accepted answers, each is tested and the best match wins.

Default threshold: `80` — change with the `FUZZY_THRESHOLD` environment variable.

### LLM Grading Details (Short Answer)

The backend sends a request to LM Studio:

```
POST {LM_STUDIO_BASE_URL}/chat/completions
```

The prompt includes the student's answer, the expected answer, and the rubric. The model must return:

```json
{ "score": 2, "feedback": "Correctly identified suppression but missed movement phase." }
```

- Score is clamped between 0 and the question's max marks
- If the LLM is unavailable or returns invalid JSON, score defaults to 0 and the question is flagged for manual review
- The student is never told the LLM was unavailable — the instructor reviews and adjusts

### Manual Score Override

1. Open **Results -> Review** for any session
2. Click the score value next to any question
3. Enter a new score (0 to max marks for that question)
4. The total score is recalculated and saved immediately

---

## Results & Manual Review

### Result Lifecycle

```
Student Submits
      |
      v
Auto-Graded (MCQ, T/F, FITB)
LLM Graded (Short Answer text)
Flagged for Review (Practical VM, Screenshot-only)
      |
      v
Instructor Reviews Session
- Sees all questions, student answers, auto scores
- Adjusts scores if needed
- Views uploaded screenshots
      |
      v
Instructor Marks Reviewed (optional administrative step)
      |
      v
Instructor Releases Result
      |
      v
Student Can View Score in Electron Client
```

### Group Release

To release all results for a group at once:
1. Go to **Results** panel
2. Select the exam from the filter dropdown
3. Click **Release Group Results**
4. Select the group — all reviewed sessions for that group are released simultaneously

---

## Practical VM Exams

Practical exams let students demonstrate hands-on skills in a virtual machine environment (Proxmox or any web-accessible VM console).

### Setup

1. In the Exam Editor, set **Practical URL** to your VM console:
   - Proxmox example: `http://192.168.1.10:8006`
   - noVNC example: `http://192.168.1.10/novnc/vnc.html`
2. Set **Allow URL Bar** based on whether students should be able to type a URL
3. Add one or more `practical_vm` type questions describing the tasks

### Student Experience

1. Exam starts — the Electron client opens a **second locked window** with the Practical URL
2. The main exam window shows the question list on the left
3. Student reads each task in the question panel and performs it in the VM window
4. Uses the **Upload Screenshot** button to attach evidence to each question
5. Submits the exam when all tasks are complete

### Instructor Scoring

1. Open **Results -> Review** for the student's session
2. Each `practical_vm` question shows the uploaded screenshot(s)
3. Click the score field and enter marks based on the evidence
4. Release the result after scoring all practical questions

---

## FITB Hint System

For fill-in-the-blank questions, an optional hint system can show students the **word length** of the expected answer.

**Enable per-exam:**
Toggle **FITB Hints** ON in the Exam Editor metadata section.

**What students see:**
Underscores representing the character count of the answer alongside the blank.

Example: For the answer `"photosynthesis"`, students see `_ _ _ _ _ _ _ _ _ _ _ _ _ _` (14 characters).

The actual answer text is never revealed.

---

## Offline Deployment

For environments without internet access, deploy from a pre-exported Docker image bundle.

### Windows

```powershell
.\deploy-offline.ps1
```

### Linux / macOS

```bash
chmod +x deploy-offline.sh
./deploy-offline.sh
```

### Exporting for Offline Use

Run this on a machine with internet access to export the Docker images:

```powershell
.\export-for-offline.ps1
```

This creates an `offline-bundle/` containing Docker image tar files, a `docker-compose.yml`, and deploy scripts. Copy the entire `offline-bundle/` folder to the target machine and run the deploy script there.

---

## Environment Variables

Configure in `docker-compose.yml` under the backend service, or in a `.env` file inside `exam-server-backend/`:

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Bind address for Uvicorn |
| `PORT` | `8001` | Bind port for Uvicorn |
| `DATABASE_PATH` | `./exam.db` | Path to SQLite database file |
| `JWT_SECRET` | *(auto-generated)* | JWT signing key — **must be set explicitly in production** |
| `JWT_EXPIRE_HOURS` | `12` | Token expiry in hours |
| `LM_STUDIO_BASE_URL` | `http://localhost:1234/v1` | LM Studio API base URL for LLM grading |
| `LLM_MODEL` | `qwen2.5-7b-instruct-1m` | Model name passed to LM Studio |
| `FUZZY_THRESHOLD` | `80` | Minimum fuzzy match % for fill-in-the-blank (0-100) |
| `UPLOAD_DIR` | `data/uploads` | Directory for student screenshot uploads |
| `LOG_LEVEL` | `INFO` | Logging level (`DEBUG`, `INFO`, `WARNING`, `ERROR`) |
| `CORS_ORIGINS` | `http://localhost:5174,...` | Comma-separated allowed CORS origins |
| `DEBUG` | `false` | Enable Uvicorn reload/debug mode |

---

## API Overview

Base URL: `http://<host>:8001`

Interactive Swagger UI: `http://<host>:8001/docs`

### Authentication

| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | `{username, password}` | Returns JWT `access_token` |

### Admin Endpoints

All require header: `Authorization: Bearer <admin_token>`

#### Exams

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/exams` | List all exams (optional `?status=draft\|published`) |
| POST | `/api/admin/exams` | Create a new exam (returns `{id}`) |
| GET | `/api/admin/exams/{id}` | Get full exam with all questions |
| PUT | `/api/admin/exams/{id}` | Update exam fields (resets all student sessions) |
| DELETE | `/api/admin/exams/{id}` | Delete exam and all sessions |
| POST | `/api/admin/exams/{id}/publish` | Publish exam (requires at least 1 question) |
| POST | `/api/admin/exams/{id}/unpublish` | Move exam back to draft |
| POST | `/api/admin/exams/upload-parse` | Upload `.json` file, returns parsed questions |

**Create/Update Exam body:**

```json
{
  "title": "string",
  "course_name": "string",
  "level": "string",
  "duration_minutes": 60,
  "total_marks": 100,
  "fitb_hint_enabled": false,
  "practical_url": "",
  "allow_url_bar": true,
  "questions": [
    {
      "id": "q1",
      "type": "mcq | true_false | fill_blank | short_answer | practical_vm",
      "text": "Question text",
      "options": ["A", "B", "C", "D"],
      "answer_key": "A",
      "marks": 2,
      "rubric": ""
    }
  ]
}
```

> `id` on each question is **optional** — the backend auto-generates a UUID if it is empty or omitted.

#### Results

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/results` | List all sessions (optional `?exam_id=N`) |
| GET | `/api/admin/results/{session_id}` | Full session review with all answers |
| PUT | `/api/admin/results/{session_id}/answers/{question_id}/score` | Override score `{score: N}` |
| POST | `/api/admin/results/{session_id}/release` | Release result to student |
| POST | `/api/admin/results/release-group` | Release all `?exam_id=N&group_id=N` |
| POST | `/api/admin/results/{session_id}/mark-reviewed` | Mark session as reviewed |

#### Users

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/users` | List all users |
| POST | `/api/admin/users` | Create single user |
| DELETE | `/api/admin/users/{id}` | Delete user |
| PUT | `/api/admin/users/{id}/password` | Reset password `{new_password}` |
| PUT | `/api/admin/users/{id}/active` | Enable/disable `{active: true\|false}` |
| PUT | `/api/admin/users/{id}/group` | Assign to group `{group_id}` |
| POST | `/api/admin/users/bulk-import` | Bulk import `{users: [{army_no, rank, name, unit}]}` |

#### Groups

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/groups` | List all groups |
| POST | `/api/admin/groups` | Create group `{name}` |
| DELETE | `/api/admin/groups/{id}` | Delete group (members unassigned, not deleted) |

### Student Endpoints

All require header: `Authorization: Bearer <student_token>`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/exam/available` | List exams assigned to this student's group |
| POST | `/api/exam/start` | Start or resume a session `{exam_id}` |
| POST | `/api/exam/submit` | Submit all answers |
| POST | `/api/exam/upload-screenshot` | Upload screenshot file (returns `{filename}`) |
| GET | `/api/exam/result/{session_id}` | View released result |
| GET | `/api/exam/screenshots/{filename}` | Retrieve uploaded screenshot (JWT required) |

---

## Security Notes

| Area | Recommendation |
|------|---------------|
| JWT Secret | Set `JWT_SECRET` to a strong random value in `docker-compose.yml`; never rely on the auto-generated `.jwt_secret` file in production |
| Admin password | Change `admin123` immediately after first login |
| Network isolation | Run on an isolated LAN; do not expose port `8001` directly to the internet |
| CORS | Set `CORS_ORIGINS` to the exact admin frontend URL in production |
| Screenshot access | All screenshot endpoints require a valid JWT — students can only access their own |
| Audit trail | All admin and exam events are written to `audit.log.*` — monitor these for anomalies |
| Kiosk client | Test the Electron client on the target OS before exam day to verify kiosk enforcement |
| Database backups | Regularly backup `data/exam.db`; it is the single source of truth for all exam data |

---

## Troubleshooting

### 422 Unprocessable Entity when creating an exam

**Cause:** A question sent to the backend is missing a required field, most commonly `type` or `text`.

**Note:** The `id` field is now auto-generated by the backend if omitted — this was previously a cause of 422 errors when adding questions manually via the Upload panel.

**Fix:** Ensure all questions have at minimum a `type` and non-empty `text`. Check the browser console and backend logs for the exact field causing the validation error.

---

### LLM grading returns 0 for all short answer questions

**Cause:** LM Studio is not running or the model is not loaded.

**Fix:**
1. Start LM Studio and load a model
2. Enable the local server in LM Studio (default port 1234)
3. Verify `LM_STUDIO_BASE_URL` in your environment matches the LM Studio address
4. Restart the backend: `docker compose restart backend`

Short-answer questions are flagged for manual review when the LLM is unavailable — students are not penalised.

---

### Students cannot see their assigned exam

**Possible causes:**
1. Exam is in **Draft** status → publish it from the Exam List
2. The student's group has not been assigned the exam → Exam List -> Actions -> Assign to Group
3. The student is not in any group → assign them from the Users panel

---

### Electron client shows "Cannot connect to server"

**Fix:** Check that `SERVER_URL` in `src/main.js` matches the server's LAN IP address. Ensure port `8001` is not blocked by a firewall on either machine.

---

### Screenshot uploads fail

- Max file size per screenshot: **10 MB**
- Allowed formats: JPEG, PNG, GIF, WebP, BMP
- Ensure `UPLOAD_DIR` exists and is writable by the Docker container

---

### "You have already completed this exam" error

A student sees this when trying to start an exam they already submitted.

**Fix:** If a retake is needed, the instructor must edit and re-save the exam — this automatically resets all sessions for that exam. The number of reset sessions is displayed in the editor after saving.

---

### Session reset unexpectedly after exam edit

**Expected behaviour.** Any edit to an exam (even metadata-only) resets all active student sessions for that exam. This ensures students always receive the latest version. Warn students before editing a published exam that is currently in progress.
