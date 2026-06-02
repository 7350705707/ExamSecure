"use strict";
const { contextBridge, ipcRenderer } = require("electron");

/**
 * Expose a minimal, typed API to the renderer.
 * No direct Node/Electron access — only these whitelisted methods.
 */
contextBridge.exposeInMainWorld("examBridge", {
  /** Returns the configured exam server base URL */
  getServerUrl: () => ipcRenderer.invoke("get-server-url"),

  /** Request controlled application exit (shows confirmation dialog) */
  requestExit: () => ipcRenderer.invoke("request-exit"),

  /** Notify main process that exam has been submitted — unlocks close */
  notifySubmitted: () => ipcRenderer.send("exam-submitted"),

  /**
   * Inform main process of a new server URL so the navigation guard
   * (will-navigate) stays in sync when the user changes the server IP.
   */
  updateServerOrigin: (url) => ipcRenderer.invoke("update-server-origin", url),

  /**
   * Whitelist the Proxmox origin so the navigation guard allows the console.
   * Call once when the exam with Proxmox credentials starts.
   */
  setProxmoxOrigin: (url) => ipcRenderer.invoke("set-proxmox-origin", url),

  /**
   * Capture the primary screen as a PNG and return base64-encoded bytes.
   * Used by practical_vm questions to record proof of task completion.
   */
  captureScreen: () => ipcRenderer.invoke("capture-screen"),

  /** Open the Proxmox console in a dedicated child window. */
  openProxmoxWindow: (url, allowUrlBar) => ipcRenderer.invoke("open-proxmox-window", { url, allowUrlBar }),

  /**
   * Register a callback that fires whenever a screenshot is captured from
   * the Proxmox child window.  The callback receives a base64-encoded PNG.
   */
  onProxmoxScreenshot: (callback) => {
    ipcRenderer.on("proxmox-screenshot-captured", (_, base64) => callback(base64));
  },

  /**
   * Register a callback that fires when the Proxmox console window is closed.
   * Used to automatically log the student out.
   */
  onProxmoxConsoleClosed: (callback) => {
    ipcRenderer.on("proxmox-console-closed", callback);
  },
});
