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
});
