// ROP Chat desktop shell (Electron).
//
// It does two jobs:
//   1. Wraps the hosted web app (chat.ropsalons.com) in a normal desktop window, so it always runs
//      the latest version with no separate build to ship.
//   2. Listens for URGENT alerts from the web app (window.ropDesktop.urgent(...), wired in the app's
//      UrgentTakeover component) and pops a frameless, always-on-top window that appears OVER other
//      programs (Boulevard, Excel, email) — even when ROP Chat isn't the focused app — with sound,
//      a Dock/taskbar flash, and Open / Acknowledge buttons. This is the piece a browser PWA can't do.
//
// Run in dev:   npm install && npm start
// Build apps:   npm run dist:mac   /   npm run dist:win

const { app, BrowserWindow, ipcMain, screen, shell } = require('electron')
const path = require('path')

const APP_URL = process.env.ROP_APP_URL || 'https://chat.ropsalons.com'

let mainWindow = null
let urgentWindow = null

// Single instance — a second launch focuses the existing window instead of opening another.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus() }
  })
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 380,
    minHeight: 560,
    title: 'ROP Chat',
    backgroundColor: '#0b1220',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  mainWindow.loadURL(APP_URL)
  // Open external links (mailto:, other sites) in the system browser, not inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(APP_URL)) { shell.openExternal(url); return { action: 'deny' } }
    return { action: 'allow' }
  })
  mainWindow.on('closed', () => { mainWindow = null })
}

// Pop (or refresh) the always-on-top urgent window, sized to ~a third of the screen, top-center.
function showUrgent(payload) {
  const primary = screen.getPrimaryDisplay()
  const { width: sw, height: sh } = primary.workAreaSize
  const w = Math.min(720, Math.round(sw * 0.42))
  const h = Math.min(420, Math.round(sh * 0.4))

  if (!urgentWindow) {
    urgentWindow = new BrowserWindow({
      width: w,
      height: h,
      x: Math.round((sw - w) / 2) + primary.workArea.x,
      y: primary.workArea.y + Math.round(sh * 0.06),
      frame: false,
      resizable: false,
      movable: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      fullscreenable: false,
      show: false,
      backgroundColor: '#7f1d1d',
      webPreferences: {
        preload: path.join(__dirname, 'urgent-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    })
    urgentWindow.loadFile(path.join(__dirname, 'urgent.html'))
    urgentWindow.on('closed', () => { urgentWindow = null })
  }

  // Force it above everything, including full-screen apps and other Spaces (macOS).
  urgentWindow.setAlwaysOnTop(true, 'screen-saver')
  if (typeof urgentWindow.setVisibleOnAllWorkspaces === 'function') {
    urgentWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreenScreen: true })
  }
  const send = () => urgentWindow && urgentWindow.webContents.send('urgent-payload', payload)
  if (urgentWindow.webContents.isLoading()) urgentWindow.webContents.once('did-finish-load', send)
  else send()
  urgentWindow.showInactive()
  urgentWindow.show()
  urgentWindow.focus()

  // Grab attention on the OS level too.
  if (process.platform === 'darwin' && app.dock) app.dock.bounce('critical')
  if (mainWindow) mainWindow.flashFrame(true)
}

function closeUrgent() {
  if (mainWindow) mainWindow.flashFrame(false)
  if (urgentWindow) { urgentWindow.close(); urgentWindow = null }
}

ipcMain.on('rop-urgent', (_e, payload) => { try { showUrgent(payload || {}) } catch (_) { /* ignore */ } })
ipcMain.on('rop-urgent-ack', () => closeUrgent())
ipcMain.on('rop-urgent-open', (_e, link) => {
  // Bring the main app forward and route it to the message, then close the alert.
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    if (link) mainWindow.webContents.executeJavaScript(`window.location.hash = ${JSON.stringify(String(link))}`).catch(() => {})
  }
  closeUrgent()
})

app.whenReady().then(() => {
  // Launch automatically when the user logs in, so the front-desk machine is always armed.
  try { app.setLoginItemSettings({ openAtLogin: true }) } catch (_) { /* ignore */ }
  createMainWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
