// Preload for the URGENT alert window. Receives the alert payload from main and exposes the two
// actions the buttons need (open / acknowledge). No Node access reaches the page.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('urgentApi', {
  onPayload: (cb) => ipcRenderer.on('urgent-payload', (_e, payload) => cb(payload || {})),
  open: (link) => ipcRenderer.send('rop-urgent-open', link),
  ack: () => ipcRenderer.send('rop-urgent-ack'),
})
