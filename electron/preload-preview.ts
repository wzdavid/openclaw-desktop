import { contextBridge, ipcRenderer } from 'electron';

// ═══════════════════════════════════════════════════════════
// OpenClaw Desktop preview window — Preload Bridge
// Exposes artifact receiver + clipboard (sandboxed)
// ═══════════════════════════════════════════════════════════

contextBridge.exposeInMainWorld('electronAPI', {
  // Receive artifact content from main process
  onArtifact: (callback: (data: { type: string; title: string; content: string }) => void) => {
    ipcRenderer.on('artifact:content', (_e, data) => callback(data));
  },

  // Copy text to clipboard (fallback for sandboxed context)
  copyToClipboard: (text: string) => {
    ipcRenderer.invoke('clipboard:write', text);
  },
});
