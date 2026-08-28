/* ROP Chat — push handlers, imported into the generated Workbox service worker.
   Receives a Web Push, shows the OS notification, and opens the RIGHT screen on tap. */

// The app is a HashRouter SPA, so a deep link must be a hash route ("/#/dm/123"). Notifications
// store plain paths ("/dm/123"); normalize them to hash form so a tapped notification lands on the
// exact conversation/channel instead of the app home.
function toHashUrl(raw) {
  if (!raw) return '/#/'
  if (raw.indexOf('http') === 0) return raw
  if (raw.indexOf('/#') === 0) return raw
  if (raw.charAt(0) !== '/') raw = '/' + raw
  return '/#' + raw
}

// When a notification is tapped and the app isn't already open, iOS launches the PWA at its start
// URL and IGNORES the openWindow target below — so the deep link is lost and the user lands on the
// home screen. We remember the freshly-tapped target here (with a timestamp); the launched app asks
// for it (message 'client-ready') and we hand it over, so it still routes to the exact message.
//
// It is stamped { path, ts } and ALWAYS overwritten by the latest tap, and the 'client-ready'
// handler only delivers it once and only if it's fresh. That's the fix for the Android bug where an
// OLD target got replayed every time the app came to the foreground (so tapping one notification
// could land you on a different notification's message). Never replay a stale target.
var pendingNavigate = null

self.addEventListener('push', function (event) {
  var data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = { title: 'ROP Chat', body: event.data ? event.data.text() : '' }
  }
  var title = data.title || 'ROP Chat'
  var options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: toHashUrl(data.url) },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  var url = toHashUrl((event.notification.data && event.notification.data.url) || '/')
  var hashPath = url.indexOf('/#') === 0 ? url.slice(2) : '/' // e.g. "/dm/123"
  // Record THIS tap as the one true pending target, overwriting any earlier one and stamping the
  // time. Doing it up front (before the async matchAll) means the freshest tap always wins.
  pendingNavigate = { path: hashPath, ts: Date.now() }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var client = list[i]
        if ('focus' in client) {
          // App already open — route it now and focus. We DON'T clear pendingNavigate here: on
          // Android a backgrounded PWA is often frozen, so this postMessage can be dropped and never
          // processed. Leaving the target set lets the 'client-ready' handshake (which fires when the
          // app is brought to the foreground) deliver it reliably as a backstop. The freshness window
          // (<60s) and single-delivery guard in that handler prevent any stale/duplicate replay, and
          // re-navigating to the same path is idempotent — so a rare double-deliver is harmless.
          try { client.postMessage({ type: 'navigate', path: hashPath, src: 'click' }) } catch (e) { /* ignore */ }
          if ('navigate' in client) { try { client.navigate(url) } catch (e) { /* ignore */ } }
          return client.focus()
        }
      }
      // App not open — open it at the deep link (Android honors this), and also postMessage the
      // window once it appears (belt-and-suspenders; a cold launch also gets it via 'client-ready').
      if (self.clients.openWindow) {
        return self.clients.openWindow(url).then(function (client) {
          if (client) { try { client.postMessage({ type: 'navigate', path: hashPath, src: 'open' }) } catch (e) { /* ignore */ } }
        })
      }
    }),
  )
})

// ── Web Share Target (Android) ────────────────────────────────────────────────────────────────
// When a user shares photos/videos to ROP Chat from their phone's share sheet, the OS POSTs the
// files to /share-target. We stash them in a cache and redirect into the app, which opens a
// "Share to ROP Chat" screen (pick a channel + caption → post). Scoped strictly to POST
// /share-target so it never touches any other request. (iOS/Safari has no share-target support.)
self.addEventListener('fetch', function (event) {
  var url
  try { url = new URL(event.request.url) } catch (e) { return }
  if (event.request.method !== 'POST' || url.pathname !== '/share-target') return
  event.respondWith((async function () {
    try {
      var form = await event.request.formData()
      var files = form.getAll('files')
      var cache = await caches.open('rop-share')
      var meta = []
      for (var i = 0; i < files.length; i++) {
        var f = files[i]
        if (!f || typeof f === 'string') continue
        var key = '/__share/' + i
        await cache.put(new Request(key), new Response(f, { headers: { 'Content-Type': f.type || 'application/octet-stream' } }))
        meta.push({ key: key, name: (f.name || 'shared-' + i), type: (f.type || '') })
      }
      var text = form.get('text') || form.get('title') || form.get('url') || ''
      await cache.put(new Request('/__share/meta'), new Response(JSON.stringify({ files: meta, text: String(text || '') }), { headers: { 'Content-Type': 'application/json' } }))
    } catch (e) { /* fall through to the app either way */ }
    return Response.redirect('/?share=1', 303)
  })())
})

// The freshly-launched app announces itself; hand it any pending deep link so a notification tap
// lands on the exact conversation even on iOS (where a cold launch drops the openWindow target).
self.addEventListener('message', function (event) {
  var data = event.data || {}
  if (data.type === 'client-ready') {
    // Deliver a pending deep link ONLY if it's from a recent tap, and only once. 'client-ready'
    // fires on every foreground on Android, so without the freshness guard an old target would be
    // replayed and send the user to the wrong message. Either way we clear it so it never resurfaces.
    var p = pendingNavigate
    pendingNavigate = null
    if (p && p.path && (Date.now() - p.ts) < 60000) {
      try {
        if (event.source && event.source.postMessage) event.source.postMessage({ type: 'navigate', path: p.path, src: 'ready' })
      } catch (e) { /* ignore */ }
    }
  }
})
