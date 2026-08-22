# ROP Chat — Desktop app (Phase 2)

A thin Electron shell around the hosted web app (`chat.ropsalons.com`). It exists for one thing a
browser/PWA can't do: pop an **urgent alert over other programs** — even when ROP Chat isn't the
focused window — with sound, a Dock/taskbar flash, and Open / Acknowledge buttons.

Because it loads the hosted site, it always runs the latest ROP Chat with no separate release to ship.

## How the urgent flow works

1. A message lands in a channel flagged **Urgent takeover** (set per-channel in the app's Edit panel).
2. The web app's `UrgentTakeover` component fires. Inside the desktop shell it calls
   `window.ropDesktop.urgent({ title, body, link })` (exposed by `preload.js`).
3. `main.js` opens a frameless, always-on-top window (`urgent.html`) sized to ~a third of the screen,
   top-center, above full-screen apps and other Spaces. It plays a repeating tone and bounces the Dock.
4. **Open & take action** brings the main window forward and routes it to the exact message;
   **Acknowledge** dismisses the alert.

No new backend — it reuses the same urgent notification the mobile/web app already gets.

## Run it (dev)

```
cd desktop
npm install
npm start
```

Point it at a different environment with `ROP_APP_URL=https://staging… npm start`.

## Build installers

```
npm run dist:mac    # → dist/ROP Chat-*.dmg
npm run dist:win    # → dist/ROP Chat Setup *.exe
```

## Still to do before wide rollout

- **Icons**: add `assets/icon.icns` (mac) and `assets/icon.ico` (win) and reference them in
  `package.json` → `build.mac.icon` / `build.win.icon`.
- **Code signing / notarization** so Mac Gatekeeper and Windows SmartScreen don't warn on install
  (Apple Developer cert + notarize; Windows Authenticode cert).
- **Auto-update** (e.g. `electron-updater`) if we want the shell itself to update; the *web app* inside
  already updates on its own.
- Optionally scope auto-launch to the **front-desk machines** only.
