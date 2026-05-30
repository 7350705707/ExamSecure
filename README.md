# Examination System

A self-contained, offline-capable computer-based examination platform built with:

- **FastAPI** (Python) — backend API server
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
9. [Grading](#grading)
10. [Offline Deployment](#offline-deployment)
11. [Environment Variables](#environment-variables)
12. [API Overview](#api-overview)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     Docker Host                          │
│                                                          │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────┐  │
│  │  FastAPI      │   │  React Admin │   │  Nginx      │  │
│  │  :8001        │◄──│  Frontend    │   │  :80 → :443 │  │
│  │  (SQLite DB)  │   │  (Vite/Build)│   │             │  │
│  └──────────────┘   └──────────────┘   └─────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │  Electron Exam Client (runs on student machines) │    │
│  │  Kiosk mode · connects to FastAPI on LAN         │    │
│  └──────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

- **SQLite** database stored in `data/` (persisted via Docker volume)
- **Uploads** (screenshots) stored in `data/uploads/`
- **LM Studio** (optional, local LLM) used for auto-grading `short_answer` questions

---

## Quick Start (Docker)

### Prerequisites

- Docker Desktop (Windows/Mac) or Docker + Docker Compose (Linux)
- Port `8001` and `80` available on the host

### Start

```bash
docker compose up -d
```

Admin frontend → http://localhost  
Backend API → http://localhost:8001

Default admin credentials:
- Username: `admin`
- Password: `admin123` *(change immediately after first login)*

### Stop

```bash
docker compose down
```

---

## Project Structure

```
Examination-System/
├── docker-compose.yml              # Main compose file
├── Dockerfile                      # Root-level helper
├── data/
│   ├── exam.db                     # SQLite database (auto-created)
│   ├── uploads/                    # Student screenshot uploads
│   └── logs/                       # Application logs
├── exam-server-backend/            # FastAPI Python backend
│   ├── app/
│   │   ├── routers/
│   │   │   ├── admin.py            # Instructor/admin endpoints
│   │   │   ├── auth.py             # Login / JWT
│   │   │   └── exam.py             # Student exam endpoints
│   │   ├── database.py             # All SQLite operations
│   │   ├── grader.py               # Auto-grading logic
│   │   ├── models.py               # Pydantic request/response models
│   │   └── config.py               # App settings / environment
│   └── requirements.txt
├── frontend-admin/                 # React instructor dashboard
│   └── src/
│       ├── views/
│       │   ├── LoginPage.jsx
│       │   ├── DashboardPanel.jsx
│       │   ├── ExamListPanel.jsx
│       │   ├── ExamEditorPanel.jsx  # Create/edit exams
│       │   ├── ResultsPanel.jsx     # View, review and export results
│       │   ├── UsersPanel.jsx       # Manage users and groups
│       │   └── UploadPanel.jsx      # Document-to-exam parser
│       └── services/               # API client functions
└── exam-browser-client/            # Electron kiosk client
    └── src/renderer/
        ├── app.js                  # Main exam logic
        ├── index.html
        └── style.css
```

---

## Backend — exam-server-backend

### Setup (without Docker)

```bash
cd exam-server-backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
uvicorn run:app --host 0.0.0.0 --port 8001 --reload
```

### Database

SQLite is used automatically. The database file is created at `data/exam.db` (or the path set by `DATABASE_PATH` env var). Migrations run automatically on startup.

### Authentication

JWT-based. Tokens expire after 8 hours. All `/api/admin/*` endpoints require an `admin` role token.

---

## Admin Frontend — frontend-admin

### Setup (without Docker)

```bash
cd frontend-admin
npm install
npm run dev        # development server at http://localhost:5173
npm run build      # production build to dist/
```

### Features

| Panel | Description |
|---|---|
| Dashboard | Overview of exams, users, submissions |
| Exam List | Assign exams to groups, manage active exams |
| Exam Editor | Create/edit exams with questions, marks, time limits |
| Results | View submissions, review short answers, export |
| Users & Groups | Manage students, bulk import from Excel |
| Upload | Parse Word/PDF documents into exam questions |

---

## Exam Client — exam-browser-client

The Electron client runs in **kiosk mode** — it prevents Alt+Tab, context menus, and other escape paths.

### Build

```bash
cd exam-browser-client
npm install
npm run build      # creates distributable in out/
```

### Configuration

Before distribution, set the server URL in `src/main.js`:

```js
const SERVER_URL = 'http://192.168.1.100:8001';  // replace with your server IP
```

### Student Flow

1. Student launches the exam client
2. Enters their **Army No** and password to log in
3. Selects an assigned exam
4. Answers questions within the time limit
5. Submits — receives confirmation that result will be released by the **Instructor**

---

## User Management & Import

### Bulk Import (Excel)

Download the demo Excel template from the **Users** panel (→ *Demo Excel* button).

The template has 4 columns:

| Army No | Rank | Name | Unit |
|---------|------|------|------|
| 12345 | Pte | Ahmad bin Ali | 3 SIR |
| 67890 | Cpl | Ravi Kumar | 7 SIB |

- **Army No** is used as both **username** and **default password**
- Students should change their password on first login *(feature to be added)*
- Rank and Unit are stored and appear in exported results

### Single User Creation

Use the *Add User* button in the Users panel. Fields: Full Name, Rank, Unit, Username (Army No), Password, Role, Group.

### Exported Results

When exporting results to Excel or Word, the following columns are included:

`#` · `Army No` · `Rank` · `Name` · `Unit` · `Score` · `Out of` · `Percentage` · `Submitted At`

---

## Question Types

| Type | Description | Grading |
|------|-------------|---------|
| `mcq` | Multiple choice (radio) | Exact match |
| `true_false` | True or False buttons | Exact match |
| `fill_blank` | Text input | Fuzzy string match (thefuzz) |
| `short_answer` | Text area + optional screenshot upload | LLM graded (if text provided); manual review if only screenshot |

> **Note:** The legacy `short_answer_screenshot` type is no longer available for new questions. Existing exams using this type will still work — answers are graded manually.

### Short Answer with Screenshot

When a student encounters a `short_answer` question:

1. They can type a text answer in the textarea
2. Optionally attach a screenshot (JPEG/PNG/GIF/WebP, max 10 MB)
3. If only a screenshot is uploaded (no text), the question is flagged for **manual review**
4. If a text answer is provided, it is auto-graded by the LLM

---

## Grading

### Automatic Grading

After a student submits, all answers are graded immediately:

- **MCQ / True-False** — exact string comparison
- **Fill in the blank** — fuzzy match using `thefuzz` (token_set_ratio), threshold configurable
- **Short answer** — sent to a local **LM Studio** LLM with the rubric/answer key

### Manual Review

Instructors can review individual submissions in the **Results** panel:

1. Click *Review* next to a submission
2. See each question, the student's answer, and the auto-assigned score
3. Adjust scores for any question
4. Mark as reviewed to release the result

### Session Reset on Exam Edit

When an instructor edits an existing exam, all existing student sessions for that exam are **automatically reset**. Students will need to retake the exam. The number of reset sessions is shown in the editor after saving.

---

## Offline Deployment

### Windows

```powershell
.\deploy-offline.ps1
```

### Linux / macOS

```bash
chmod +x deploy-offline.sh
./deploy-offline.sh
```

The offline bundle (`offline-bundle/`) contains a pre-exported Docker image and compose file for environments without internet access.

To export the current image for offline use:

```powershell
.\export-for-offline.ps1
```

---

## Environment Variables

Set these in `docker-compose.yml` under the backend service, or in a `.env` file:

| Variable | Default | Description |
|---|---|---|
| `DATABASE_PATH` | `data/exam.db` | Path to SQLite database |
| `SECRET_KEY` | *(required)* | JWT signing key — **change in production** |
| `LLM_BASE_URL` | `http://localhost:1234/v1` | LM Studio API URL |
| `LLM_MODEL` | `local-model` | Model name for LLM grading |
| `UPLOAD_DIR` | `data/uploads` | Directory for screenshot uploads |
| `LOG_LEVEL` | `INFO` | Logging verbosity |

---

## API Overview

Base URL: `http://<host>:8001`

### Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Log in, returns JWT token |

### Admin (require `admin` role)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/exams` | List all exams |
| POST | `/api/admin/exams` | Create exam |
| PUT | `/api/admin/exams/{id}` | Update exam (resets student sessions) |
| DELETE | `/api/admin/exams/{id}` | Delete exam |
| GET | `/api/admin/results` | List submitted sessions (filter by `exam_id`) |
| GET | `/api/admin/results/{session_id}` | Detailed session review |
| POST | `/api/admin/results/{session_id}/answers/{question_id}/score` | Manually adjust score |
| POST | `/api/admin/results/{session_id}/reviewed` | Mark session as reviewed |
| GET | `/api/admin/users` | List all users |
| POST | `/api/admin/users` | Create single user |
| DELETE | `/api/admin/users/{id}` | Delete user |
| POST | `/api/admin/users/bulk-import` | Bulk import users from JSON array |
| GET | `/api/admin/groups` | List groups |
| POST | `/api/admin/groups` | Create group |
| DELETE | `/api/admin/groups/{id}` | Delete group (and members) |

### Exam (require student JWT)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/exam/available` | List exams available to student |
| POST | `/api/exam/start/{exam_id}` | Start exam session |
| POST | `/api/exam/submit` | Submit answers |
| POST | `/api/exam/upload-screenshot` | Upload screenshot file |

---

## Security Notes

- Change the `SECRET_KEY` before any production deployment
- Change the default `admin` password immediately after first login
- The Electron client enforces kiosk mode; test on the target OS before deployment
- All uploaded screenshots are served from `/api/exam/screenshots/{filename}` with JWT auth
- Audit logs are written to `logs/audit.log.*`
