"use strict";
const { contextBridge, ipcRenderer } = require("electron");

/**
 * Minimal bridge exposed to the Proxmox BrowserWindow.
 * Called by the injected exam toolbar buttons.
 */
contextBridge.exposeInMainWorld("examProxmox", {
  /** Capture the full screen and forward it to the exam renderer window. */
  captureAndSave: () => ipcRenderer.invoke("proxmox-capture-screen"),

  /** Navigate the Proxmox window to a new URL. */
  navigateTo: (url) => ipcRenderer.invoke("proxmox-navigate", url),
});
