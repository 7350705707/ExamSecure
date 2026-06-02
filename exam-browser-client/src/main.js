"use strict";
require("dotenv").config();

const { app, BrowserWindow, globalShortcut, session, ipcMain, dialog, desktopCapturer } = require("electron");
const path = require("path");

const EXAM_SERVER_URL = process.env.EXAM_SERVER_URL || "http://localhost:8001";

// Parse origin so we can restrict navigation to just this host.
// activeOrigin is mutable — the renderer can update it via IPC when the user
// changes the server URL on the login screen.
let activeOrigin = new URL(EXAM_SERVER_URL).origin;
// Proxmox server is fixed at this address; whitelisted in the navigation guard.
const PROXMOX_ORIGIN = "http://localhost:8001";
let proxmoxOrigin = PROXMOX_ORIGIN;   // allow from startup — student opens via button

let mainWindow = null;
let isExiting = false;
let proxmoxWindowOpen = false;
let proxmoxWin = null; // module-level so proxmox-navigate IPC can reach it

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
      webviewTag: true,         // Required for Proxmox console <webview>
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

  // ── Block navigation to anything outside the exam server or Proxmox ─────────────
  mainWindow.webContents.on("will-navigate", (event, url) => {
    try {
      const target = new URL(url);
      const allowed =
        target.origin === activeOrigin ||
        url.startsWith("file://") ||
        (proxmoxOrigin && target.origin === proxmoxOrigin);
      if (!allowed) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  // ── Re-focus if the window loses focus (anti-Alt+Tab) ─────────────────────
  mainWindow.on("blur", () => {
    if (isExiting || proxmoxWindowOpen) return;   // don't fight exit or Proxmox window
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

  // Accept Proxmox self-signed TLS certificate in the dedicated partition.
  // Proxmox VE uses a self-signed cert by default; without this the webview
  // refuses the connection with ERR_CERT_AUTHORITY_INVALID.
  const proxmoxSession = session.fromPartition("persist:proxmox");
  proxmoxSession.setCertificateVerifyProc((request, callback) => {
    // Only bypass for the Proxmox host; everything else uses the normal verifier.
    if (request.hostname === "172.16.20.2") {
      callback(0);   // 0 = certificate accepted
    } else {
      callback(-3);  // -3 = fall through to default verifier
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
  ipcMain.handle("update-server-origin", (_, newUrl) => {
    try {
      activeOrigin = new URL(newUrl).origin;
    } catch {
      // ignore invalid URLs — activeOrigin remains unchanged
    }
  });

  // Set Proxmox origin whitelist so the navigation guard allows the console
  ipcMain.handle("set-proxmox-origin", (_, url) => {
    try {
      proxmoxOrigin = new URL(url).origin;
    } catch {
      proxmoxOrigin = null;
    }
  });

  // Capture the primary screen as PNG and return as base64
  ipcMain.handle("capture-screen", async () => {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 1920, height: 1080 },
    });
    if (!sources || sources.length === 0) throw new Error("No screen source available");
    return sources[0].thumbnail.toPNG().toString("base64");
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

  // Open Proxmox in a dedicated BrowserWindow with an injected capture toolbar
  ipcMain.handle("open-proxmox-window", (_event, opts = {}) => {
    if (proxmoxWindowOpen) return;   // already open — do nothing
    proxmoxWindowOpen = true;
    mainWindow.setAlwaysOnTop(false);

    const targetUrl   = (opts.url && /^https?:\/\//i.test(opts.url)) ? opts.url : PROXMOX_ORIGIN;
    const showUrlBar  = opts.allowUrlBar !== false;  // default: show

    proxmoxWin = new BrowserWindow({
      width: 1280,
      height: 900,
      webPreferences: {
        preload: path.join(__dirname, "proxmox-preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: false,           // allow self-signed certs & HTTP
      },
      alwaysOnTop: true,
      autoHideMenuBar: true,
      title: "Proxmox Console — Close this window to return to exam",
    });

    proxmoxWin.maximize();
    proxmoxWin.loadURL(targetUrl);

    // Handle URL navigation from toolbar address bar
    // (registered as module-level handler below; proxmoxWin is now in outer scope)

    // Re-register the IPC handler each time the proxmox window is used
    proxmoxWin.webContents.on("did-navigate", (event, navUrl) => {
      if (!navUrl || navUrl.startsWith("chrome-error://") || navUrl.startsWith("chrome://")) return;
      proxmoxWin.webContents.executeJavaScript(`
        (function() {
          const bar = document.getElementById('_exam_url_input_');
          if (bar) bar.value = ${JSON.stringify(navUrl)};
        })();
      `).catch(() => {});
    });
    proxmoxWin.webContents.on("did-navigate-in-page", (event, navUrl) => {
      if (!navUrl || navUrl.startsWith("chrome-error://") || navUrl.startsWith("chrome://")) return;
      proxmoxWin.webContents.executeJavaScript(`
        (function() {
          const bar = document.getElementById('_exam_url_input_');
          if (bar) bar.value = ${JSON.stringify(navUrl)};
        })();
      `).catch(() => {});
    });

    // Accept self-signed / invalid TLS certificates on the Proxmox server
    proxmoxWin.webContents.on("certificate-error", (event, url, error, cert, callback) => {
      event.preventDefault();
      callback(true);
    });

    // Show a friendly error page when navigation fails (e.g. ERR_CONNECTION_REFUSED)
    proxmoxWin.webContents.on("did-fail-load", (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return;                          // ignore subframe failures
      if (errorCode === -3) return;                      // -3 = ERR_ABORTED (user navigated away, ignore)
      const safeUrl  = JSON.stringify(validatedURL  || '');
      const safeDesc = JSON.stringify(errorDescription || 'Unknown error');
      const safeCode = JSON.stringify(String(errorCode));
      proxmoxWin.webContents.executeJavaScript(`
        (function () {
          // Update URL bar to keep the attempted URL
          const bar = document.getElementById('_exam_url_input_');
          if (bar && ${safeUrl}) bar.value = ${safeUrl};

          // Inject error overlay (or update existing one)
          let el = document.getElementById('_exam_nav_error_');
          if (!el) {
            el = document.createElement('div');
            el.id = '_exam_nav_error_';
            document.body.appendChild(el);
          }
          Object.assign(el.style, {
            position: 'fixed', top: '60px', left: '50%',
            transform: 'translateX(-50%)', zIndex: '2147483646',
            background: '#1e293b', border: '2px solid #dc2626',
            borderRadius: '10px', padding: '24px 32px',
            color: '#f1f5f9', fontFamily: 'sans-serif',
            maxWidth: '560px', width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
            textAlign: 'center',
          });
          el.innerHTML =
            '<div style="font-size:2rem;margin-bottom:8px;">⚠️</div>' +
            '<div style="font-size:1.05rem;font-weight:700;color:#fca5a5;margin-bottom:6px;">Page failed to load</div>' +
            '<div style="font-size:0.85rem;color:#94a3b8;margin-bottom:10px;word-break:break-all;">' +
              ${safeUrl} +
            '</div>' +
            '<div style="font-size:0.78rem;color:#64748b;">' +
              ${safeDesc} + ' (' + ${safeCode} + ')' +
            '</div>' +
            '<button id="_exam_err_dismiss_" style="margin-top:14px;padding:7px 20px;border-radius:6px;border:none;background:#334155;color:#cbd5e1;cursor:pointer;font-size:0.82rem;">Dismiss</button>';
          document.getElementById('_exam_err_dismiss_').onclick = () => el.remove();
        })();
      `).catch(() => {});
    });

    // Hide the error overlay when a page loads successfully
    proxmoxWin.webContents.on("did-finish-load", () => {
      proxmoxWin.webContents.executeJavaScript(`
        (function(){ const el = document.getElementById('_exam_nav_error_'); if (el) el.remove(); })();
      `).catch(() => {});
    });
    const injectToolbar = () => {
      const _showUrlBarStr = showUrlBar ? 'true' : 'false';
      proxmoxWin.webContents.executeJavaScript(`
        (function (_showUrlBar) {
          function _buildExamToolbar() {
            if (document.getElementById('_exam_toolbar_')) return;
            if (!document.body) return;
            const bar = document.createElement('div');
            bar.id = '_exam_toolbar_';
            Object.assign(bar.style, {
              position: 'fixed', top: '0', left: '50%',
              transform: 'translateX(-50%)', zIndex: '2147483647',
              background: '#1e293b', border: '2px solid #4f46e5',
              borderRadius: '0 0 10px 10px', padding: '8px 20px',
              display: 'flex', gap: '12px', alignItems: 'center',
              boxShadow: '0 4px 20px rgba(0,0,0,0.6)', fontFamily: 'sans-serif',
            });

            const lbl = document.createElement('span');
            Object.assign(lbl.style, { color: '#94a3b8', fontSize: '0.78rem', fontWeight: '700', whiteSpace: 'nowrap' });
            lbl.textContent = '\u{1F393} Exam Browser';

            // URL address bar
            const urlWrap = document.createElement('div');
            Object.assign(urlWrap.style, { display: 'flex', alignItems: 'center', gap: '4px', flex: '1', maxWidth: '500px', minWidth: '200px' });

            const urlInput = document.createElement('input');
            urlInput.id = '_exam_url_input_';
            urlInput.type = 'text';
            // Only pre-fill with a real URL (not chrome-error pages)
            const _loc = location.href;
            urlInput.value = (_loc.startsWith('http://') || _loc.startsWith('https://')) ? _loc : '';
            urlInput.placeholder = 'Enter URL and press Enter';
            Object.assign(urlInput.style, {
              flex: '1', padding: '5px 10px', borderRadius: '6px',
              border: '1px solid #475569', background: '#0f172a', color: '#e2e8f0',
              fontSize: '0.78rem', outline: 'none', minWidth: '0',
            });

            const goBtn = document.createElement('button');
            Object.assign(goBtn.style, {
              background: '#334155', color: '#94a3b8', border: '1px solid #475569',
              padding: '5px 10px', borderRadius: '6px', cursor: 'pointer',
              fontSize: '0.78rem', fontWeight: '700', whiteSpace: 'nowrap',
            });
            goBtn.textContent = 'Go';

            async function doNavigate() {
              const raw = urlInput.value.trim();
              if (!raw || raw.startsWith('chrome-error://') || raw.startsWith('chrome://')) return;
              let url = raw;
              if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
              goBtn.disabled = true; goBtn.textContent = '...';
              try {
                await window.examProxmox.navigateTo(url);
              } catch (e) {
                urlInput.value = url; // keep the attempted URL visible
              } finally {
                goBtn.disabled = false; goBtn.textContent = 'Go';
              }
            }
            goBtn.onclick = doNavigate;
            urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doNavigate(); });

            urlWrap.appendChild(urlInput);
            urlWrap.appendChild(goBtn);

            const capBtn = document.createElement('button');
            Object.assign(capBtn.style, {
              background: '#4f46e5', color: '#fff', border: 'none',
              padding: '6px 14px', borderRadius: '6px', cursor: 'pointer',
              fontSize: '0.82rem', fontWeight: '700',
            });
            capBtn.textContent = '\u{1F4F8} Screenshot & Save';
            capBtn.onclick = async () => {
              const orig = capBtn.textContent;
              capBtn.disabled = true; capBtn.textContent = 'Saving\u2026';
              try {
                await window.examProxmox.captureAndSave();
                capBtn.textContent = '\u2713 Saved!';
              } catch (e) {
                capBtn.textContent = 'Error';
              }
              setTimeout(() => { capBtn.textContent = orig; capBtn.disabled = false; }, 2200);
            };

            bar.appendChild(lbl);
            if (_showUrlBar) bar.appendChild(urlWrap);
            bar.appendChild(capBtn);
            document.body.appendChild(bar);
          }

          _buildExamToolbar();

          // Re-inject if the page (SPA / redirect) removes the toolbar from the DOM
          if (!window._examToolbarObserver) {
            window._examToolbarObserver = new MutationObserver(() => {
              if (!document.getElementById('_exam_toolbar_')) _buildExamToolbar();
            });
            window._examToolbarObserver.observe(document.documentElement, {
              childList: true, subtree: true,
            });
          }
        })(${_showUrlBarStr});
      `).catch(() => {});
    };

    proxmoxWin.webContents.on("dom-ready", injectToolbar);
    proxmoxWin.webContents.on("did-finish-load", injectToolbar);
    proxmoxWin.webContents.on("did-navigate", injectToolbar);
    proxmoxWin.webContents.on("did-navigate-in-page", injectToolbar);

    proxmoxWin.on("closed", () => {
      proxmoxWindowOpen = false;
      proxmoxWin = null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("proxmox-console-closed");
        mainWindow.setAlwaysOnTop(true);
        mainWindow.focus();
      }
    });
  });

  // Navigate the Proxmox window to a URL from the toolbar address bar
  ipcMain.handle("proxmox-navigate", async (_, rawUrl) => {
    if (!proxmoxWin || proxmoxWin.isDestroyed()) return false;
    const url = String(rawUrl).trim();
    // Reject internal/error URLs
    if (!url.startsWith("http://") && !url.startsWith("https://")) return false;
    proxmoxWin.webContents.loadURL(url);
    return true;
  });

  // Capture screen from Proxmox window and forward base64 PNG to exam renderer
  ipcMain.handle("proxmox-capture-screen", async () => {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 1920, height: 1080 },
    });
    if (!sources || sources.length === 0) throw new Error("No screen source available");
    const base64 = sources[0].thumbnail.toPNG().toString("base64");
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("proxmox-screenshot-captured", base64);
    }
    return true;
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
