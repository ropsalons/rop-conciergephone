// Preload for the MAIN window (the wrapped web app). Exposes a tiny, safe bridge the web app uses to
// hand an urgent alert to the desktop shell. The web app calls window.ropDesktop.urgent({...}) — see
// src/components/UrgentTakeover.tsx. Nothing else is exposed.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('ropDesktop', {
  isDesktop: true,
  urgent: (payload) => ipcRenderer.send('rop-urgent', payload),
})
