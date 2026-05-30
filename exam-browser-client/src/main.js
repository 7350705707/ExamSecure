"use strict";
require("dotenv").config();

const { app, BrowserWindow, globalShortcut, session, ipcMain, dialog } = require("electron");
const path = require("path");

const EXAM_SERVER_URL = process.env.EXAM_SERVER_URL || "http://localhost:8001";

// Parse origin so we can restrict navigation to just this host.
// activeOrigin is mutable — the renderer can update it via IPC when the user
// changes the server URL on the login screen.
let activeOrigin = new URL(EXAM_SERVER_URL).origin;

let mainWindow = null;
let isExiting = false;

// ─────────────────────────────────────────────────────────────────────────────
// Window creation
// ─────────────────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    fullscreen: true,
    kiosk: true,             // OS-level kiosk (blocks taskbar on Windows)
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    minimizable: false,
    closable: false,         // Prevents Alt+F4 from closing (handled via IPC)
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,       // Allow fetch from file:// to http:// backend
      sandbox: false,
      devTools: false,
      spellcheck: false,
      enableWebSQL: false,
    },
  });

  // ── Load the renderer ──────────────────────────────────────────────────────
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  // ── Intercept ALL close attempts (Alt+F4, taskbar, etc.) ─────────────────
  // closable:false blocks the title-bar button; this catches every other path.
  mainWindow.on("close", (event) => {
    if (!isExiting) {
      event.preventDefault();   // swallow the close silently
    }
  });

  // ── Prevent DevTools ──────────────────────────────────────────────────────
  mainWindow.webContents.on("devtools-opened", () => {
    mainWindow.webContents.closeDevTools();
  });

  // ── Prevent right-click context menu ─────────────────────────────────────
  mainWindow.webContents.on("context-menu", (e) => e.preventDefault());

  // ── Block navigation to anything outside the exam server ─────────────────
  mainWindow.webContents.on("will-navigate", (event, url) => {
    try {
      const target = new URL(url);
      if (target.origin !== activeOrigin && !url.startsWith("file://")) {
        event.preventDefault();
      }
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  // ── Re-focus if the window loses focus (anti-Alt+Tab) ─────────────────────
  mainWindow.on("blur", () => {
    if (isExiting) return;          // don't fight the exit dialog
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.focus();
    }
  });

  // ── Block new-window / popup attempts ────────────────────────────────────
  mainWindow.webContents.on("new-window", (event) => event.preventDefault());
}

// ─────────────────────────────────────────────────────────────────────────────
// Global shortcut blocking
// ─────────────────────────────────────────────────────────────────────────────
function registerBlockedShortcuts() {
  const blocked = [
    // Windows system shortcuts
    "Alt+F4", "Alt+Tab", "Alt+Escape",
    "Super+D", "Super+E", "Super+R", "Super+L",
    "Super+Tab", "Super+Up", "Super+Down",
    "Ctrl+Escape", "Ctrl+Alt+Delete",
    // Browser / DevTools
    "F12", "Ctrl+Shift+I", "Ctrl+Shift+J", "Ctrl+Shift+C",
    "Ctrl+U", "Ctrl+S", "Ctrl+P",
    // Screenshot
    "PrintScreen", "Alt+PrintScreen",
    // Navigation
    "F5", "Ctrl+R", "Ctrl+W", "Ctrl+T", "Ctrl+N",
    "Ctrl+Tab", "Ctrl+Shift+Tab",
    // Clipboard
    "Ctrl+C", "Ctrl+V", "Ctrl+X", "Ctrl+A",
  ];

  for (const shortcut of blocked) {
    try {
      globalShortcut.register(shortcut, () => {
        // silently consume
      });
    } catch {
      // Some shortcuts can't be registered on all platforms; ignore
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Session / CSP hardening
// ─────────────────────────────────────────────────────────────────────────────
function hardenSession() {
  // Inject CSP into every HTTP response.
  // connect-src is intentionally broad (http: https:) so that the renderer can
  // reach whichever server URL the user has configured — including IPs on local
  // network interfaces (e.g. 192.168.x.x).  The navigation guards below still
  // prevent the window from navigating away from the exam server.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          `default-src 'self' http: https:; ` +
          `script-src 'self'; ` +
          `style-src 'self' 'unsafe-inline'; ` +
          `img-src 'self' data:; ` +
          `connect-src 'self' http: https:;`,
        ],
      },
    });
  });

  // Block all third-party navigations at the session level.
  // Uses activeOrigin (updated via IPC when user changes server URL).
  session.defaultSession.on("will-navigate", (event, url) => {
    try {
      const origin = new URL(url).origin;
      if (origin !== activeOrigin && !url.startsWith("file://")) {
        event.preventDefault();
      }
    } catch {
      event.preventDefault();
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// IPC handlers (renderer → main)
// ─────────────────────────────────────────────────────────────────────────────
function registerIPC() {
  // Expose server URL to renderer safely
  ipcMain.handle("get-server-url", () => EXAM_SERVER_URL);

  // Allow renderer to update the active server origin when the user
  // configures a different server IP on the login screen.
  // This keeps the will-navigate navigation guard in sync.
  ipcMain.handle("update-server-origin", (_, newUrl) => {
    try {
      activeOrigin = new URL(newUrl).origin;
    } catch {
      // ignore invalid URLs — activeOrigin remains unchanged
    }
  });

  // Controlled exit after exam submission (require confirmation)
  ipcMain.handle("request-exit", async () => {
    if (isExiting) return false;    // prevent stacked dialogs
    isExiting = true;
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: "question",
      buttons: ["Cancel", "Exit Exam Browser"],
      defaultId: 0,
      cancelId: 0,
      title: "Exit",
      message: "Are you sure you want to close the exam browser?",
    });
    if (response === 1) {
      globalShortcut.unregisterAll();
      mainWindow.setClosable(true);
      mainWindow.destroy();
      app.exit(0);                  // bypass window-all-closed entirely
    } else {
      isExiting = false;            // cancelled — allow future attempts
    }
    return response === 1;
  });

  // Exam submitted — unlock close
  ipcMain.on("exam-submitted", () => {
    globalShortcut.unregisterAll();
    mainWindow.setClosable(true);
    mainWindow.alwaysOnTop = false;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// App lifecycle
// ─────────────────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  hardenSession();
  createWindow();
  registerBlockedShortcuts();
  registerIPC();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

// Block OS-level quit (e.g. task manager close, system shutdown shortcut)
// unless an intentional exit via IPC has been acknowledged.
app.on("before-quit", (event) => {
  if (!isExiting) {
    event.preventDefault();
  }
});

// Prevent multiple instances
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      mainWindow.focus();
    }
  });
}

// Prevent accidental close; intentional exit uses app.exit() directly
app.on("window-all-closed", () => {
  if (!isExiting) app.quit();
});
