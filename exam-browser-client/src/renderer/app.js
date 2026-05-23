/* global examBridge from preload.js */

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// State
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let serverUrl   = "";
let token       = "";
let currentUser = null;
let examData    = null;   // { session_id, exam_id, title, duration_minutes, questions[] }
let answers     = {};     // { [question_id]: string }
let currentIdx  = 0;
let timerInterval = null;
let secondsLeft   = 0;

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Screens
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const $ = (id) => document.getElementById(id);

function showScreen(name) {
  ["login-screen", "exam-select-screen", "exam-screen", "result-screen"].forEach((id) => {
    document.getElementById(id).classList.toggle("hidden", id !== name);
  });
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Error Toast â€” shows technical errors in UI instead of silent console fails
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let _toastTimeout = null;

function showError(title, detail) {
  const toast      = $("error-toast");
  const toastTitle = $("error-toast-title");
  const toastBody  = $("error-toast-body");
  if (!toast || !toastTitle || !toastBody) return;   // DOM not ready (safety guard)
  toastTitle.textContent = title  || "Error";
  toastBody.textContent  = detail || "";
  toast.style.display = "block";            // force-show regardless of CSS class state
  toast.classList.remove("hidden");
  if (_toastTimeout) clearTimeout(_toastTimeout);
  _toastTimeout = setTimeout(() => hideError(), 15000);
}

function hideError() {
  const toast = $("error-toast");
  if (!toast) return;
  toast.classList.add("hidden");
  toast.style.display = "";
  if (_toastTimeout) clearTimeout(_toastTimeout);
}

// Override console.error so runtime errors surface in the UI
const _origConsoleError = console.error.bind(console);
console.error = (...args) => {
  _origConsoleError(...args);
  const msg = args.map((a) => (a instanceof Error ? `${a.message}\n${a.stack}` : String(a))).join(" ");
  showError("Console Error", msg);
};

// Catch synchronous JS errors (ReferenceError, TypeError, etc.)
window.onerror = (message, source, lineno, colno, error) => {
  const detail = error
    ? `${error.message}\n${error.stack || ""}`
    : String(message);
  showError("JavaScript Error", `${detail}\n\n(${source}:${lineno}:${colno})`);
  return true; // prevent default Electron error dialog
};

// Catch unhandled promise rejections and surface them
window.addEventListener("unhandledrejection", (e) => {
  const reason = e.reason;
  const msg = reason instanceof Error
    ? `${reason.message}\n\n${reason.stack || ""}`
    : String(reason);
  showError("Unhandled Error", msg);
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// API helpers
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function api(method, path, body = null, auth = false) {
  const headers = { "Content-Type": "application/json" };
  if (auth && token) headers["Authorization"] = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`${serverUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    const err = new Error(`Network error â€” could not reach server.\n${networkErr.message}`);
    err.status = 0;
    throw err;
  }

  // 204 No Content â€” nothing to parse
  if (res.status === 204) return null;

  let data;
  const ct = res.headers.get("content-type") || "";
  try {
    data = ct.includes("json") ? await res.json() : await res.text();
  } catch (parseErr) {
    const err = new Error(`Server returned an unreadable response (${res.status}).\n${parseErr.message}`);
    err.status = res.status;
    throw err;
  }

  if (!res.ok) {
    const detail = typeof data === "object" ? (data.detail || JSON.stringify(data)) : data;
    const err = new Error(detail || `Request failed (HTTP ${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Login
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function handleLogin() {
  const username = $("username").value.trim();
  const password = $("password").value;
  const errEl    = $("login-error");

  errEl.classList.add("hidden");
  $("login-btn").disabled = true;
  $("login-btn").textContent = "Connectingâ€¦";

  try {
    if (!username || !password) throw new Error("Username and password are required.");

    // Authenticate
    const auth = await api("POST", "/api/auth/login", { username, password });
    token = auth.access_token;
    currentUser = auth.user;

    // Fetch published exams
    const exams = await api("GET", "/api/exam/available", null, true);
    if (!exams || exams.length === 0)
      throw new Error("No exams are currently available. Please contact your invigilator.");

    if (exams.length === 1) {
      // Auto-start the only available exam
      await startExam(exams[0].id);
    } else {
      showExamSelect(exams);
    }
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove("hidden");
    showError("Login Error", err.message);
    $("login-btn").disabled = false;
    $("login-btn").textContent = "Login";
  }
}

async function showExamSelect(exams) {
  $("select-welcome").textContent = `Welcome, ${currentUser.username}. Choose your exam:`;
  const list = $("exam-list");
  list.innerHTML = "";
  exams.forEach((exam) => {
    const btn = document.createElement("button");
    btn.className = "exam-item";
    btn.innerHTML = `
      <div class="exam-item-title">${exam.title}</div>
      <div class="exam-item-meta">${exam.course_name || ""} â€¢ ${exam.duration_minutes} min â€¢ ${exam.total_marks} marks</div>
    `;
    btn.addEventListener("click", () => startExam(exam.id));
    list.appendChild(btn);
  });
  showScreen("exam-select-screen");
}

async function startExam(examId) {
  try {
    examData = await api("POST", "/api/exam/start", { exam_id: examId }, true);
  } catch (err) {
    if (err.status === 409) {
      await showAlreadyCompleted(examId);
      return;
    }
    showError("Exam Start Failed", err.message);
    throw err;
  }
  if (!examData.questions || examData.questions.length === 0)
    throw new Error("This exam has no questions.");
  startExamScreen();
}

async function showAlreadyCompleted(examId) {
  // Try to fetch the student's result for this exam to show the score
  $('result-icon').textContent  = 'âœ…';
  $('result-title').textContent = 'Exam Already Submitted';
  $('result-score').textContent = '';
  $('result-pct').textContent   = 'Loading your scoreâ€¦';
  $('result-back-btn').classList.remove('hidden');
  $('result-exit-btn').classList.remove('hidden');
  showScreen('result-screen');

  try {
    const sessions = await api("GET", "/api/exam/my-results", null, true);
    const session  = sessions.find((s) => s.exam_id === examId && s.status === 'submitted');
    if (session) {
      const result = await api("GET", `/api/exam/result/${session.id}`, null, true);
      const pct = result.total_marks > 0
        ? Math.round((result.score / result.total_marks) * 100)
        : 0;
      $('result-score').textContent = `${result.score} / ${result.total_marks}`;
      $('result-pct').textContent   = `Your Score: ${pct}%`;
    } else {
      $('result-pct').textContent = 'You have already completed this exam.';
    }
  } catch (_) {
    $('result-pct').textContent = 'You have already completed this exam.';
  }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Exam screen
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function startExamScreen() {
  // Initialise answers map
  answers = {};
  examData.questions.forEach((q) => (answers[q.id] = ""));
  currentIdx = 0;

  // Header
  $("header-title").textContent  = examData.title;
  $("sidebar-title").textContent = examData.title;
  $("sidebar-student").textContent = currentUser.username;

  // Build question nav
  buildNav();
  renderQuestion(0);
  startTimer(examData.duration_minutes * 60);

  showScreen("exam-screen");
}

function buildNav() {
  const nav = $("question-nav");
  nav.innerHTML = "";
  examData.questions.forEach((_, i) => {
    const btn = document.createElement("button");
    btn.className = "q-nav-btn";
    btn.textContent = i + 1;
    btn.addEventListener("click", () => saveCurrentAnswer() || renderQuestion(i));
    nav.appendChild(btn);
  });
  updateNav();
}

function updateNav() {
  const btns = $("question-nav").querySelectorAll(".q-nav-btn");
  btns.forEach((btn, i) => {
    const q = examData.questions[i];
    btn.classList.remove("answered", "current");
    if (i === currentIdx) btn.classList.add("current");
    else if (answers[q.id] && answers[q.id].trim()) btn.classList.add("answered");
  });

  // answered count
  const answered = examData.questions.filter((q) => answers[q.id]?.trim()).length;
  const total    = examData.questions.length;
  $("answered-count").textContent = `${answered} / ${total} answered`;

  // Show submit on last question or all answered
  const onLast    = currentIdx === total - 1;
  $("submit-btn").classList.toggle("hidden", !onLast);
  $("next-btn").classList.toggle("hidden", onLast);
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Render question
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function renderQuestion(idx) {
  currentIdx = idx;
  const q = examData.questions[idx];

  $("question-counter").textContent = `Q ${idx + 1} of ${examData.questions.length}`;
  $("q-text").textContent   = q.text;
  $("q-type-badge").textContent = q.type.replace("_", " ").toUpperCase();
  $("q-marks").textContent  = `${q.marks} mark${q.marks !== 1 ? "s" : ""}`;

  // Hide all answer inputs
  ["q-options", "q-tf", "q-textarea"].forEach((id) => $( id).classList.add("hidden"));

  const saved = answers[q.id] || "";

  if (q.type === "mcq") {
    const optEl = $("q-options");
    optEl.innerHTML = "";
    optEl.classList.remove("hidden");
    const labels = ["A", "B", "C", "D", "E"];
    (q.options || []).forEach((opt, i) => {
      const btn = document.createElement("button");
      btn.className = "option-btn" + (saved === opt ? " selected" : "");
      btn.innerHTML = `<span class="option-label">${labels[i] || i + 1}</span>${opt}`;
      btn.addEventListener("click", () => {
        optEl.querySelectorAll(".option-btn").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        answers[q.id] = opt;
        updateNav();
      });
      optEl.appendChild(btn);
    });
  } else if (q.type === "true_false") {
    const tfEl = $("q-tf");
    tfEl.classList.remove("hidden");
    tfEl.querySelectorAll(".tf-btn").forEach((btn) => {
      btn.classList.toggle("selected", btn.dataset.val === saved);
      btn.onclick = () => {
        tfEl.querySelectorAll(".tf-btn").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        answers[q.id] = btn.dataset.val;
        updateNav();
      };
    });
  } else {
    const ta = $("q-textarea");
    ta.classList.remove("hidden");
    ta.value = saved;
    ta.oninput = () => {
      answers[q.id] = ta.value;
      updateNav();
    };
  }

  // Navigation buttons
  $("prev-btn").disabled = idx === 0;
  updateNav();
}

function saveCurrentAnswer() {
  const q = examData.questions[currentIdx];
  if (q.type === "fill_blank" || q.type === "short_answer") {
    answers[q.id] = $("q-textarea").value;
  }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Timer
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function startTimer(seconds) {
  secondsLeft = seconds;
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    secondsLeft--;
    updateTimerDisplay();
    if (secondsLeft <= 0) {
      clearInterval(timerInterval);
      autoSubmit();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const m   = Math.floor(Math.abs(secondsLeft) / 60).toString().padStart(2, "0");
  const s   = (Math.abs(secondsLeft) % 60).toString().padStart(2, "0");
  $("timer").textContent = `${m}:${s}`;
  const wrap = $("timer-wrap");
  wrap.classList.remove("warning", "danger");
  if (secondsLeft <= 60)  wrap.classList.add("danger");
  else if (secondsLeft <= 300) wrap.classList.add("warning");
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Custom confirm modal (replaces native confirm() which fights blur handler)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function showConfirm(message) {
  return new Promise((resolve) => {
    $("confirm-msg").textContent = message;
    $("confirm-overlay").classList.remove("hidden");

    function onOk() {
      $("confirm-overlay").classList.add("hidden");
      cleanup();
      resolve(true);
    }
    function onCancel() {
      $("confirm-overlay").classList.add("hidden");
      cleanup();
      resolve(false);
    }
    function cleanup() {
      $("confirm-ok").removeEventListener("click", onOk);
      $("confirm-cancel").removeEventListener("click", onCancel);
    }

    $("confirm-ok").addEventListener("click", onOk);
    $("confirm-cancel").addEventListener("click", onCancel);
  });
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Submit
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function confirmSubmit() {
  saveCurrentAnswer();
  const answered = examData.questions.filter((q) => answers[q.id]?.trim()).length;
  const total    = examData.questions.length;
  if (answered < total) {
    const ok = await showConfirm(`You have ${total - answered} unanswered question(s). Submit anyway?`);
    if (!ok) return;
  }
  await doSubmit();
}

async function autoSubmit() {
  saveCurrentAnswer();
  await doSubmit(true);
}

async function doSubmit(isAuto = false) {
  clearInterval(timerInterval);
  try {
    const submissionAnswers = examData.questions.map((q) => ({
      question_id: q.id,
      student_answer: answers[q.id] || "",
    }));

    const result = await api("POST", "/api/exam/submit", {
      session_id: examData.session_id,
      answers: submissionAnswers,
    }, true);

    window.examBridge.notifySubmitted();
    showResultScreen(result, isAuto);
  } catch (err) {
    showError("Submission Failed", `${err.message}\n\nPlease contact the invigilator.`);
  }
}

function showResultScreen(result, isAuto) {
  const pct = result.total_marks > 0
    ? Math.round((result.score / result.total_marks) * 100)
    : 0;

  $("result-icon").textContent  = pct >= 50 ? "ðŸŽ‰" : "ðŸ“‹";
  $("result-title").textContent = isAuto ? "Time's up â€” Exam Auto-Submitted" : "Exam Submitted!";
  $("result-score").textContent = `${result.score} / ${result.total_marks}`;
  $("result-pct").textContent   = `Score: ${pct}%`;
  $("result-back-btn").classList.add("hidden");
  $("result-exit-btn").classList.remove("hidden");

  showScreen("result-screen");
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Event listeners
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
$("login-btn").addEventListener("click", handleLogin);
$("exit-btn").addEventListener("click", () => window.examBridge.requestExit());
$("result-exit-btn").addEventListener("click", () => window.examBridge.requestExit());
$("result-back-btn").addEventListener("click", () => {
  // Return to exam list (re-fetch available exams)
  $("result-back-btn").classList.add("hidden");
  api("GET", "/api/exam/available", null, true)
    .then((exams) => {
      if (!exams || exams.length === 0) {
        showScreen("login-screen");
      } else if (exams.length === 1) {
        startExam(exams[0].id);
      } else {
        showExamSelect(exams);
      }
    })
    .catch(() => showScreen("login-screen"));
});
$("back-btn").addEventListener("click", () => {
  token = "";
  currentUser = null;
  showScreen("login-screen");
});
["username", "password"].forEach((id) => {
  $(id).addEventListener("keydown", (e) => { if (e.key === "Enter") handleLogin(); });
});

$("prev-btn").addEventListener("click", () => {
  saveCurrentAnswer();
  if (currentIdx > 0) renderQuestion(currentIdx - 1);
});

$("next-btn").addEventListener("click", () => {
  saveCurrentAnswer();
  if (currentIdx < examData.questions.length - 1) renderQuestion(currentIdx + 1);
});

$("submit-btn").addEventListener("click", confirmSubmit);

$("error-toast-close").addEventListener("click", hideError);

// Disable right-click, text selection drag, clipboard in question area
document.addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("selectstart", (e) => {
  // Allow selection only in textarea and inputs
  if (!["TEXTAREA", "INPUT"].includes(e.target.tagName)) e.preventDefault();
});
document.addEventListener("copy",  (e) => { if (!["TEXTAREA","INPUT"].includes(document.activeElement.tagName)) e.preventDefault(); });
document.addEventListener("paste", (e) => { if (!["TEXTAREA","INPUT"].includes(document.activeElement.tagName)) e.preventDefault(); });

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Init
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// ─────────────────────────────────────────────────────────────────────────────
// Server URL configurator
// ─────────────────────────────────────────────────────────────────────────────
function applyServerUrl(url, isReset) {
  const trimmed = url.trim().replace(/\/+$/, "");
  const statusEl = $("server-url-status");

  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    statusEl.textContent = "⚠ URL must start with http:// or https://";
    statusEl.className = "server-url-status err";
    statusEl.classList.remove("hidden");
    return false;
  }

  serverUrl = trimmed;
  $("server-url-input").value = trimmed;
  $("server-url-display").textContent = trimmed;

  // Keep the main-process navigation guard in sync with the new origin.
  if (window.examBridge?.updateServerOrigin) {
    window.examBridge.updateServerOrigin(trimmed);
  }

  if (isReset) {
    localStorage.removeItem("examServerUrl");
    statusEl.textContent = "✓ Reset to default URL";
  } else {
    localStorage.setItem("examServerUrl", trimmed);
    statusEl.textContent = "✓ URL applied — ready to login";
  }
  statusEl.className = "server-url-status ok";
  statusEl.classList.remove("hidden");
  setTimeout(() => {
    statusEl.classList.add("hidden");
    $("server-settings").removeAttribute("open");
  }, 1800);
  return true;
}

$("server-url-apply").addEventListener("click", () => {
  applyServerUrl($("server-url-input").value);
});

$("server-url-reset").addEventListener("click", async () => {
  const defaultUrl = await window.examBridge.getServerUrl();
  applyServerUrl(defaultUrl, true);
});

$("server-url-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") applyServerUrl($("server-url-input").value);
});

// ─────────────────────────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────────────────────────
(async function init() {
  const defaultUrl = await window.examBridge.getServerUrl();
  const savedUrl   = localStorage.getItem("examServerUrl");
  serverUrl = (savedUrl && savedUrl.startsWith("http")) ? savedUrl : defaultUrl;

  $("server-url-input").value         = serverUrl;
  $("server-url-display").textContent = serverUrl;

  showScreen("login-screen");
})();
