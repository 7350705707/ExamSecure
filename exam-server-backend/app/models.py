"""Pydantic request / response models."""
from typing import Any, Optional
from pydantic import BaseModel, Field


# ── Auth ──────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str

class SignupRequest(BaseModel):
    username: str
    password: str = Field(min_length=8)
    role: str = "student"

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


# ── Question ──────────────────────────────────────────────────────────────────

class Question(BaseModel):
    id: str
    type: str  # mcq | true_false | fill_blank | short_answer
    text: str
    options: Optional[list[str]] = None   # MCQ only
    marks: int = 1
    answer_key: Optional[str] = None      # stripped before sending to student
    rubric: Optional[str] = None          # short_answer grading hints


# ── Exams (admin) ─────────────────────────────────────────────────────────────

class CreateExamRequest(BaseModel):
    title: str
    course_name: str = ""
    level: str = ""
    duration_minutes: int = 60
    total_marks: int = 100
    questions: list[Question] = []
    fitb_hint_enabled: bool = False
    practical_url: str = ""
    allow_url_bar: bool = True

class UpdateExamRequest(BaseModel):
    title: Optional[str] = None
    course_name: Optional[str] = None
    level: Optional[str] = None
    duration_minutes: Optional[int] = None
    total_marks: Optional[int] = None
    questions: Optional[list[Question]] = None
    fitb_hint_enabled: Optional[bool] = None
    practical_url: Optional[str] = None
    allow_url_bar: Optional[bool] = None

class ExamSummary(BaseModel):
    id: int
    title: str
    course_name: str
    level: str
    duration_minutes: int
    total_marks: int
    status: str
    created_at: str
    question_count: int


# ── Exam session (student) ────────────────────────────────────────────────────

class StartExamRequest(BaseModel):
    exam_id: int

class StudentQuestion(BaseModel):
    """Question delivered to student — answer_key / rubric removed."""
    id: str
    type: str
    text: str
    options: Optional[list[str]] = None
    marks: int
    hints: Optional[list[str]] = None   # FITB suggestions when instructor enables hints

class StartExamResponse(BaseModel):
    session_id: int
    exam_id: int
    title: str
    duration_minutes: int
    total_marks: int
    questions: list[StudentQuestion]
    fitb_hint_enabled: bool = False
    practical_url: str = ""
    allow_url_bar: bool = True

class AnswerItem(BaseModel):
    question_id: str
    student_answer: str

class SubmitExamRequest(BaseModel):
    session_id: int
    answers: list[AnswerItem]

class AnswerResult(BaseModel):
    question_id: str
    question_text: str = ""
    question_type: str = ""
    correct_answer: str = ""
    student_answer: str
    score: float
    max_score: float
    feedback: str

class ExamResult(BaseModel):
    session_id: int
    exam_id: int
    exam_title: str
    score: float
    total_marks: float
    percentage: float
    status: str
    answers: list[AnswerResult]
