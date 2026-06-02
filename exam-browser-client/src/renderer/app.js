/* global examBridge from preload.js */

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// State
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let serverUrl   = "";
let token       = "";
let currentUser = null;
let examData    = null;   // { session_id, exam_id, title, duration_minutes, questions[] }
let answers     = {};     // { [question_id]: string }
let markedForReview = {}; // { [question_id]: bool }
let currentIdx  = 0;
let timerInterval = null;
let secondsLeft   = 0;
let autoSaveInterval = null;  // for periodic answer auto-save
let _warned5min = false;      // timer warning flags
let _warned1min = false;
const practicalVmScreenshots = {};    // keyed by q.id → [filename, …] across the exam session
let _vmScreenshotListenerDone = false; // register onProxmoxScreenshot listener only once
let _vmConsoleClosedListenerDone = false; // register onProxmoxConsoleClosed listener only once

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Screens
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const $ = (id) => document.getElementById(id);

function showScreen(name) {
  ["login-screen", "change-password-screen", "exam-instructions-screen", "exam-select-screen", "exam-screen", "result-screen", "review-screen"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("hidden", id !== name);
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
    const err = new Error(`Network error — could not reach server.\n${networkErr.message}`);
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
    // Handle session displacement (another login invalidated this token)
    if (res.status === 401 && typeof detail === "string" && detail.includes("SESSION_DISPLACED")) {
      token = "";
      currentUser = null;
      stopAutoSave();
      clearInterval(timerInterval);
      showError("Logged Out", "Your account was logged in on another device. Please log in again.");
      setTimeout(() => showScreen("login-screen"), 2500);
    }
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
  $("login-btn").textContent = "Connecting…";

  try {
    if (!username || !password) throw new Error("Username and password are required.");

    // Authenticate
    const auth = await api("POST", "/api/auth/login", { username, password });
    token = auth.access_token;
    currentUser = auth.user;

    // Force password change on first login (bulk-imported students)
    if (auth.user.must_change_password) {
      showChangePasswordScreen();
      return;
    }

    // Fetch published exams
    const exams = await api("GET", "/api/exam/available", null, true);
    if (!exams || exams.length === 0)
      throw new Error("No exams are currently available. Please contact your Instructor.");

    if (exams.length === 1) {
      // Auto-start only if the student has no released results to view
      let hasReleased = false;
      try {
        const myResults = await api("GET", "/api/exam/my-results", null, true);
        hasReleased = myResults && myResults.some((r) => r.result_released);
      } catch (_) {}
      if (hasReleased) {
        showExamSelect(exams);
      } else {
        await startExam(exams[0].id);
      }
    } else {
      showExamSelect(exams);
    }
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove("hidden");
    showError("Login Error", err.message);
    $("login-btn").disabled = false;
    $("login-btn").textContent = "Login";  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Force password change screen
// ─────────────────────────────────────────────────────────────────────────────
function showChangePasswordScreen() {
  const errEl = $("cp-error");
  if (errEl) errEl.classList.add("hidden");
  showScreen("change-password-screen");
}

async function handleChangePassword() {
  const np1 = $("cp-new1").value;
  const np2 = $("cp-new2").value;
  const errEl = $("cp-error");
  errEl.classList.add("hidden");

  if (!np1 || np1.length < 8) {
    errEl.textContent = "New password must be at least 8 characters.";
    errEl.classList.remove("hidden");
    return;
  }
  if (np1 !== np2) {
    errEl.textContent = "Passwords do not match.";
    errEl.classList.remove("hidden");
    return;
  }

  const btn = $("cp-submit-btn");
  btn.disabled = true;
  btn.textContent = "Changing…";
  try {
    // Use Army No (username) as the current password — matches bulk-import default
    await api("PUT", "/api/auth/change-password", {
      current_password: currentUser.username,
      new_password: np1,
    }, true);

    // Clear the flag locally
    currentUser.must_change_password = false;
    $("cp-new1").value = "";
    $("cp-new2").value = "";

    // Proceed to exam list
    const exams = await api("GET", "/api/exam/available", null, true);
    if (!exams || exams.length === 0) {
      showError("No Exams", "No exams are currently available. Please contact your Instructor.");
      showScreen("login-screen");
      return;
    }
    if (exams.length === 1) {
      // Auto-start only if the student has no released results to view
      let hasReleased = false;
      try {
        const myResults = await api("GET", "/api/exam/my-results", null, true);
        hasReleased = myResults && myResults.some((r) => r.result_released);
      } catch (_) {}
      if (hasReleased) {
        showExamSelect(exams);
      } else {
        await startExam(exams[0].id);
      }
    } else {
      showExamSelect(exams);
    }
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove("hidden");
    btn.disabled = false;
    btn.textContent = "Change Password";
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
      <div class="exam-item-meta">${exam.course_name || ""} &middot; ${exam.duration_minutes} min &middot; ${exam.total_marks} marks</div>
    `;
    btn.addEventListener("click", () => startExam(exam.id));
    list.appendChild(btn);
  });

  // Show released results if any
  try {
    const myResults = await api("GET", "/api/exam/my-results", null, true);
    const releasedEl = $("released-results");
    if (releasedEl && myResults && myResults.length > 0) {
      const released = myResults.filter((r) => r.result_released);
      if (released.length > 0) {
        releasedEl.innerHTML = `<p class="released-heading">Your Released Results:</p>`;
        released.forEach((r) => {
          const btn = document.createElement("button");
          btn.className = "exam-item released-item";
          btn.innerHTML = `
            <div class="exam-item-title">View Result — Exam #${r.exam_id}</div>
            <div class="exam-item-meta">Score: ${r.score !== null ? r.score : '?'} &middot; Click to review your paper</div>
          `;
          btn.addEventListener("click", () => loadAndShowReview(r.session_id));
          releasedEl.appendChild(btn);
        });
        releasedEl.classList.remove("hidden");
      } else {
        releasedEl.classList.add("hidden");
      }
    }
  } catch (_) { /* non-critical */ }

  showScreen("exam-select-screen");
}

async function startExam(examId) {
  // Show instructions screen; proceed to load exam only after student accepts
  showScreen("exam-instructions-screen");
  const acceptChk  = $("instr-accept-chk");
  const startBtn   = $("instr-start-btn");
  const cancelBtn  = $("instr-cancel-btn");
  // Reset state
  acceptChk.checked = false;
  startBtn.disabled = true;
  // Clone buttons to remove any old listeners
  const newStart  = startBtn.cloneNode(true);
  const newCancel = cancelBtn.cloneNode(true);
  startBtn.parentNode.replaceChild(newStart, startBtn);
  cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
  $("instr-accept-chk").onchange = (e) => { $("instr-start-btn").disabled = !e.target.checked; };
  $("instr-start-btn").addEventListener("click", async () => {
    $("instr-start-btn").disabled = true;
    $("instr-start-btn").textContent = "Loading…";
    try {
      examData = await api("POST", "/api/exam/start", { exam_id: examId }, true);
    } catch (err) {
      $("instr-start-btn").disabled = false;
      $("instr-start-btn").textContent = "Start Exam";
      if (err.status === 409) { await showAlreadyCompleted(examId); return; }
      showError("Exam Start Failed", err.message);
      return;
    }
    if (!examData.questions || examData.questions.length === 0) {
      showError("Exam Error", "This exam has no questions.");
      return;
    }
    startExamScreen();
  });
  $("instr-cancel-btn").addEventListener("click", async () => {
    const exams = await api("GET", "/api/exam/available", null, true).catch(() => []);
    showExamSelect(exams);
  });
}

async function showAlreadyCompleted(examId) {
  $('result-icon').innerHTML = '<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
  $('result-title').textContent = 'Exam Already Submitted';
  $('result-score').textContent = '';
  $('result-pct').textContent   = 'You have already completed this exam. Your result will be released by the Instructor.';
  $('result-back-btn').classList.remove('hidden');
  $('result-exit-btn').classList.remove('hidden');
  showScreen('result-screen');
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Exam screen
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function startExamScreen() {
  // Initialise answers map
  answers = {};
  markedForReview = {};
  examData.questions.forEach((q) => (answers[q.id] = ""));
  currentIdx = 0;
  _warned5min = false;
  _warned1min = false;

  // Reset per-question screenshot lists for a fresh exam session
  Object.keys(practicalVmScreenshots).forEach((k) => delete practicalVmScreenshots[k]);

  // Register the Proxmox screenshot listener exactly once for the app's lifetime
  if (!_vmScreenshotListenerDone && window.examBridge && window.examBridge.onProxmoxScreenshot) {
    _vmScreenshotListenerDone = true;
    window.examBridge.onProxmoxScreenshot(async (base64) => {
      const q = examData && examData.questions[currentIdx];
      if (!q || q.type !== "practical_vm") return;
      const qId = q.id;
      const statusEl = $(`vm-status-${qId}`);
      if (statusEl) { statusEl.textContent = "Uploading screenshot\u2026"; statusEl.className = "vm-status"; }
      try {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: "image/png" });
        const file = new File([blob], "screen.png", { type: "image/png" });
        const filename = await uploadScreenshot(file);
        if (!practicalVmScreenshots[qId]) practicalVmScreenshots[qId] = [];
        practicalVmScreenshots[qId].push(filename);
        answers[qId] = JSON.stringify(practicalVmScreenshots[qId]);
        updateNav();
        refreshVmScreenshotGallery(qId);
        const count = practicalVmScreenshots[qId].length;
        if (statusEl) {
          statusEl.textContent = `\u2713 ${count} screenshot${count > 1 ? "s" : ""} captured and saved.`;
          statusEl.className = "vm-status vm-status-ok";
        }
      } catch (err) {
        if (statusEl) { statusEl.textContent = `\u2717 Upload failed: ${err.message}`; statusEl.className = "vm-status vm-status-err"; }
      }
    });
  }

  // When the Proxmox console window is closed, just continue the exam
  // (do NOT log the student out — the exam should carry on)
  if (!_vmConsoleClosedListenerDone && window.examBridge && window.examBridge.onProxmoxConsoleClosed) {
    _vmConsoleClosedListenerDone = true;
    window.examBridge.onProxmoxConsoleClosed(() => {
      // Console popup closed — exam continues; nothing to do here
    });
  }

  // Header
  $("header-title").textContent  = examData.title;
  $("sidebar-title").textContent = examData.title;
  $("sidebar-student").textContent = currentUser.username;

  // Build question nav
  buildNav();
  renderQuestion(0);
  startTimer(examData.duration_minutes * 60);
  startAutoSave();

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
    btn.classList.remove("answered", "current", "review");
    if (i === currentIdx) btn.classList.add("current");
    else if (markedForReview[q.id]) btn.classList.add("review");
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
  $("q-type-badge").textContent = q.type.replace(/_/g, " ").toUpperCase();
  $("q-marks").textContent  = `${q.marks} mark${q.marks !== 1 ? "s" : ""}`;

  // Mark-for-review button
  const reviewBtn = $("mark-review-btn");
  if (reviewBtn) {
    reviewBtn.textContent = markedForReview[q.id] ? "\u2605 Marked for Review" : "\u2606 Mark for Review";
    reviewBtn.className   = markedForReview[q.id] ? "review-btn marked" : "review-btn";
    reviewBtn.onclick = () => {
      markedForReview[q.id] = !markedForReview[q.id];
      reviewBtn.textContent = markedForReview[q.id] ? "\u2605 Marked for Review" : "\u2606 Mark for Review";
      reviewBtn.className   = markedForReview[q.id] ? "review-btn marked" : "review-btn";
      updateNav();
    };
  }

  // Hide all answer inputs
  ["q-options", "q-tf", "q-textarea", "q-screenshot", "q-fill-wrap", "q-vm-task"].forEach((id) => {
    const el = $(id); if (el) el.classList.add("hidden");
  });

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
        if (answers[q.id] === opt) {
          // Deselect
          btn.classList.remove("selected");
          answers[q.id] = "";
          updateNav();
          return;
        }
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
        if (answers[q.id] === btn.dataset.val) {
          // Deselect
          btn.classList.remove("selected");
          answers[q.id] = "";
          updateNav();
          return;
        }
        tfEl.querySelectorAll(".tf-btn").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        answers[q.id] = btn.dataset.val;
        updateNav();
      };
    });
  } else if (q.type === "short_answer_screenshot") {
    // Legacy type — treat same as short_answer (text + optional screenshot)
    const ta = $("q-textarea");
    ta.classList.remove("hidden");
    // If the stored answer is a screenshot filename, clear it (show empty textarea)
    ta.value = /^[0-9a-f\-]{36}\.[a-z]+$/i.test(saved) ? '' : (saved || '');
    ta.oninput = () => { answers[q.id] = ta.value; updateNav(); };
    // Fall through to also show screenshot section
    const ssEl = $("q-screenshot");
    if (ssEl) {
      ssEl.classList.remove("hidden");
      const fileInput  = ssEl.querySelector(".ss-file-input");
      const previewImg = ssEl.querySelector(".ss-preview");
      const statusEl   = ssEl.querySelector(".ss-status");
      if (saved && /^[0-9a-f\-]{36}\.[a-z]+$/i.test(saved) && previewImg) {
        previewImg.classList.remove("hidden");
        previewImg.alt = saved;
        previewImg.src = "";
        if (statusEl) statusEl.textContent = `\u2713 Uploaded: ${saved}`;
      }
      if (fileInput) {
        fileInput.onchange = async () => {
          const file = fileInput.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => { if (previewImg) { previewImg.src = ev.target.result; previewImg.classList.remove("hidden"); } };
          reader.readAsDataURL(file);
          if (statusEl) statusEl.textContent = "Uploading\u2026";
          try {
            const filename = await uploadScreenshot(file);
            answers[q.id] = filename;
            if (statusEl) statusEl.textContent = `\u2713 Uploaded: ${filename}`;
            updateNav();
          } catch (err) {
            if (statusEl) statusEl.textContent = `Upload failed: ${err.message}`;
          }
        };
      }
    }
  } else if (q.type === "short_answer") {
    const ta = $("q-textarea");
    ta.classList.remove("hidden");
    ta.value = saved || '';
    ta.oninput = () => { answers[q.id] = ta.value; updateNav(); };
  } else if (q.type === "practical_vm") {
    // ── Practical VM: open Proxmox popup window, capture multiple screenshots ──
    const vmEl = $("q-vm-task");
    if (vmEl) {
      vmEl.classList.remove("hidden");

      // Restore screenshot list from the saved answer when revisiting this question
      if (!practicalVmScreenshots[q.id]) {
        if (saved) {
          try { practicalVmScreenshots[q.id] = JSON.parse(saved); }
          catch { practicalVmScreenshots[q.id] = saved.split(",").filter((f) => /^[0-9a-f\-]{36}\.\w+$/i.test(f)); }
        } else {
          practicalVmScreenshots[q.id] = [];
        }
        if (practicalVmScreenshots[q.id].length > 0) {
          answers[q.id] = JSON.stringify(practicalVmScreenshots[q.id]);
        }
      }

      const shots = practicalVmScreenshots[q.id];
      vmEl.innerHTML = `
        <p class="vm-instructions">
          Click <strong>Open Exam Browser</strong> to complete the Proxmox task in a separate window.<br>
          Use the <strong>\u{1F4F8} Screenshot &amp; Save</strong> button inside that window to capture evidence.<br>
          You may take <strong>multiple screenshots</strong> \u2014 all will be submitted for review.
        </p>
        <div class="vm-action-row">
          <button id="vm-open-btn-${q.id}" class="vm-btn-open-browser">\u{1F5A5} Open Exam Browser</button>
        </div>
        <div class="vm-gallery-wrap">
          <p class="vm-gallery-heading">\u{1F4F8} Captured Screenshots (<span id="vm-count-${q.id}">${shots.length}</span>)</p>
          <div id="vm-gallery-${q.id}" class="vm-gallery"></div>
        </div>
        <div id="vm-status-${q.id}" class="vm-status ${shots.length > 0 ? "vm-status-ok" : ""}">
          ${shots.length > 0
            ? `\u2713 ${shots.length} screenshot${shots.length > 1 ? "s" : ""} captured and saved.`
            : "No screenshots captured yet \u2014 open the browser and use the Screenshot button."}
        </div>
      `;

      refreshVmScreenshotGallery(q.id);

      $(`vm-open-btn-${q.id}`).addEventListener("click", () => {
        window.examBridge.openProxmoxWindow(
          examData.practical_url || '',
          examData.allow_url_bar !== false
        );
      });
    }
  } else {
    // fill_blank: use hint datalist if enabled, otherwise plain textarea
    const ta       = $("q-textarea");
    const fillWrap  = $("q-fill-wrap");
    const fillInput = $("q-fill-input");
    if (q.type === "fill_blank" && examData.fitb_hint_enabled && fillWrap && fillInput) {
      // Build word bank from ALL fill_blank questions' hints (deduplicated)
      const pool = [];
      examData.questions.forEach((otherQ) => {
        if (otherQ.type === "fill_blank" && otherQ.hints) {
          otherQ.hints.forEach((h) => {
            const t = h && h.trim();
            if (t && !pool.includes(t)) pool.push(t);
          });
        }
      });
      fillWrap.classList.remove("hidden");
      fillInput.value = saved || '';
      const hintPanel = $("q-hint-panel");
      renderFitbHints(pool, (saved || '').trim(), hintPanel);
      fillInput.oninput = () => {
        answers[q.id] = fillInput.value;
        updateNav();
        renderFitbHints(pool, fillInput.value.trim(), hintPanel);
      };
    } else {
      ta.classList.remove("hidden");
      ta.value = saved || '';
      ta.oninput = () => { answers[q.id] = ta.value; updateNav(); };
    }
  }

  // Navigation buttons
  $("prev-btn").disabled = idx === 0;
  updateNav();
}

// ── Refresh the screenshot gallery list for a practical_vm question ───────────
function refreshVmScreenshotGallery(qId) {
  const gallery = $(`vm-gallery-${qId}`);
  const countEl = $(`vm-count-${qId}`);
  if (!gallery) return;
  const shots = practicalVmScreenshots[qId] || [];
  if (countEl) countEl.textContent = shots.length;
  if (shots.length === 0) {
    gallery.innerHTML = '<p class="vm-gallery-empty">No screenshots yet.</p>';
    return;
  }
  gallery.innerHTML = shots.map((fname, i) => `
    <div class="vm-gallery-item">
      <span class="vm-gallery-num">#${i + 1}</span>
      <span class="vm-gallery-fname">${escapeHtml(fname)}</span>
      <button class="vm-gallery-del" data-qid="${escapeHtml(String(qId))}" data-idx="${i}" title="Remove this screenshot">\u2715</button>
    </div>
  `).join("");
  gallery.querySelectorAll(".vm-gallery-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.idx, 10);
      practicalVmScreenshots[qId].splice(idx, 1);
      const remaining = practicalVmScreenshots[qId].length;
      answers[qId] = remaining > 0 ? JSON.stringify(practicalVmScreenshots[qId]) : "";
      updateNav();
      refreshVmScreenshotGallery(qId);
      const statusEl = $(`vm-status-${qId}`);
      if (statusEl) {
        statusEl.textContent = remaining > 0
          ? `\u2713 ${remaining} screenshot${remaining > 1 ? "s" : ""} captured and saved.`
          : "No screenshots captured yet \u2014 open the browser and use the Screenshot button.";
        statusEl.className = remaining > 0 ? "vm-status vm-status-ok" : "vm-status";
      }
    });
  });
}

function renderFitbHints(pool, query, panel) {
  if (!panel || pool.length === 0) return;
  const q = query.toLowerCase();
  if (q.length === 0) {
    panel.classList.add("hidden");
    panel.innerHTML = "";
    return;
  }
  const matches = pool.filter((h) => h.toLowerCase().includes(q));
  if (matches.length === 0) {
    panel.classList.add("hidden");
    panel.innerHTML = "";
    return;
  }
  panel.classList.remove("hidden");
  panel.innerHTML =
    '<span class="hint-label">\ud83d\udca1 Word bank:</span>' +
    matches.map((h) => `<span class="hint-chip">${escapeHtml(h)}</span>`).join("");
}

function saveCurrentAnswer() {
  const q = examData.questions[currentIdx];
  if (q.type === "fill_blank" || q.type === "short_answer" || q.type === "short_answer_screenshot") {
    if (q.type === "fill_blank" && examData.fitb_hint_enabled && q.hints && q.hints.length > 0) {
      answers[q.id] = $("q-fill-input").value || answers[q.id] || "";
    } else {
      answers[q.id] = $("q-textarea").value || answers[q.id] || "";
    }
  }
  // practical_vm answers are stored directly when screenshot is captured — no save needed
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload screenshot to server and return filename
async function uploadScreenshot(file) {
  const ALLOWED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!ALLOWED.includes(file.type)) throw new Error('Only JPEG, PNG, GIF or WebP images are allowed.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Image must be under 10 MB.');

  const formData = new FormData();
  formData.append('file', file);

  let res;
  try {
    res = await fetch(`${serverUrl}/api/exam/upload-screenshot`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
  } catch (networkErr) {
    throw new Error(`Network error: ${networkErr.message}`);
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || `Upload failed (HTTP ${res.status})`);
  return data.filename;
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
    // Timer warnings
    if (secondsLeft === 5 * 60 && !_warned5min) {
      _warned5min = true;
      showTimerWarning("5 minutes remaining!");
      playBeep(2);
    } else if (secondsLeft === 60 && !_warned1min) {
      _warned1min = true;
      showTimerWarning("1 minute remaining — submit now!");
      playBeep(4);
    }
    if (secondsLeft <= 0) {
      clearInterval(timerInterval);
      autoSubmit();
    }
  }, 1000);
}

function showTimerWarning(msg) {
  const banner = $("timer-warning-banner");
  if (!banner) return;
  banner.textContent = "⚠ " + msg;
  banner.classList.remove("hidden");
  setTimeout(() => banner.classList.add("hidden"), 8000);
}

function playBeep(times) {
  try {
    const ctx = new AudioContext();
    for (let i = 0; i < times; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.4);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.4 + 0.35);
      osc.start(ctx.currentTime + i * 0.4);
      osc.stop(ctx.currentTime + i * 0.4 + 0.35);
    }
  } catch (_) { /* AudioContext not available — silent degradation */ }
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

// =============================================================================
// Auto-save answers to backend every 30 seconds
// =============================================================================
function startAutoSave() {
  if (autoSaveInterval) clearInterval(autoSaveInterval);
  autoSaveInterval = setInterval(autoSaveAnswers, 30 * 1000);
}

function stopAutoSave() {
  if (autoSaveInterval) { clearInterval(autoSaveInterval); autoSaveInterval = null; }
}

async function autoSaveAnswers() {
  if (!examData || !token) return;
  saveCurrentAnswer();
  const payload = Object.entries(answers).map(([question_id, student_answer]) => ({
    question_id,
    student_answer: student_answer || "",
  }));
  try {
    await api("PATCH", `/api/exam/sessions/${examData.session_id}/answers`, { answers: payload }, true);
  } catch (_) { /* non-critical - answers safe in memory */ }
}

// =============================================================================
// Paper review screen (student sees their paper after result is released)
// =============================================================================
async function loadAndShowReview(sessionId) {
  try {
    const result = await api("GET", `/api/exam/result/${sessionId}`, null, true);
    showReviewScreen(result);
  } catch (err) {
    showError("Could not load result", err.message);
  }
}

function showReviewScreen(result) {
  const container = $("review-content");
  if (!container) return;
  const pct = result.percentage || 0;
  const answersHtml = (result.answers || []).map(function(a, i) {
    const cls = a.score >= a.max_score ? 'correct' : (a.score > 0 ? 'partial' : 'wrong');
    const correctLine = a.correct_answer
      ? '<div class="review-q-correct">Correct answer: <span>' + escapeHtml(a.correct_answer) + '</span></div>'
      : '';
    const feedbackLine = a.feedback
      ? '<div class="review-q-feedback">Feedback: ' + escapeHtml(a.feedback) + '</div>'
      : '';
    return '<li class="review-q">'
      + '<div class="review-q-text"><strong>Q' + (i + 1) + '.</strong> ' + escapeHtml(a.question_text || a.question_id) + '</div>'
      + '<div class="review-q-your">Your answer: <span class="' + cls + '">' + escapeHtml(a.student_answer || '(no answer)') + '</span></div>'
      + correctLine
      + '<div class="review-q-score">Score: ' + a.score + ' / ' + a.max_score + '</div>'
      + feedbackLine
      + '</li>';
  }).join('');
  container.innerHTML = '<div class="review-summary">'
    + '<h2 class="review-exam-title">' + escapeHtml(result.exam_title) + '</h2>'
    + '<div class="review-score-line">Score: <strong>' + result.score + ' / ' + result.total_marks + '</strong> &nbsp;|&nbsp; ' + pct + '%</div>'
    + '</div>'
    + '<ol class="review-questions">' + answersHtml + '</ol>';
  showScreen("review-screen");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
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
  stopAutoSave();
  const submitBtn = $("submit-btn");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="submit-spinner"></span> Submitting…';
  }
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
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Exam";
    }
    showError("Submission Failed", `${err.message}\n\nPlease contact the invigilator.`);
  }
}

function showResultScreen(result, isAuto) {
  $("result-icon").innerHTML = '<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
  $("result-title").textContent = isAuto ? "Time's up \u2014 Exam Auto-Submitted" : "Exam Submitted!";
  $("result-score").textContent = "";
  $("result-pct").textContent   = "Your result will be released by the Instructor after review.";
  $("result-back-btn").classList.add("hidden");
  $("result-exit-btn").classList.remove("hidden");

  showScreen("result-screen");
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Event listeners
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
$("login-btn").addEventListener("click", handleLogin);
$("exit-btn").addEventListener("click", async () => {
  const ok = await showConfirm(
    "Are you sure you want to exit the exam?\n\nYour current session will remain saved but any unsaved progress since the last auto-save may be lost. You will not be able to return to this exam once you exit."
  );
  if (ok) window.examBridge.requestExit();
});
$("result-exit-btn").addEventListener("click", () => window.examBridge.requestExit());
$("result-back-btn").addEventListener("click", () => {
  // Return to exam list (re-fetch available exams)
  $("result-back-btn").classList.add("hidden");
  api("GET", "/api/exam/available", null, true)
    .then((exams) => {
      if (!exams || exams.length === 0) {
        showScreen("login-screen");
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

// Change password screen
const _cpBtn = $("cp-submit-btn");
if (_cpBtn) _cpBtn.addEventListener("click", handleChangePassword);

// Review screen back button
const _reviewBack = $("review-back-btn");
if (_reviewBack) _reviewBack.addEventListener("click", () => showScreen("exam-select-screen"));

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
