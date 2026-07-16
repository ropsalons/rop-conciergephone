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
// home screen. We remember the target here; the freshly-launched app asks for it (message
// 'client-ready') and we hand it over, so it still routes to the exact message. Android delivers
// the openWindow URL directly, so this is a no-op there.
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
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      // Remember the target for a cold launch (iOS), where no window exists yet.
      pendingNavigate = hashPath
      for (var i = 0; i < list.length; i++) {
        var client = list[i]
        if ('focus' in client) {
          // App already open — route it now and focus. (Clears the pending target: it's handled.)
          pendingNavigate = null
          try { client.postMessage({ type: 'navigate', path: hashPath }) } catch (e) { /* ignore */ }
          if ('navigate' in client) { try { client.navigate(url) } catch (e) { /* ignore */ } }
          return client.focus()
        }
      }
      // App not open — open it at the deep link (Android honors this), and also postMessage the
      // window once it appears (belt-and-suspenders; iOS gets it via 'client-ready' below).
      if (self.clients.openWindow) {
        return self.clients.openWindow(url).then(function (client) {
          if (client) { try { client.postMessage({ type: 'navigate', path: hashPath }) } catch (e) { /* ignore */ } }
        })
      }
    }),
  )
})

// The freshly-launched app announces itself; hand it any pending deep link so a notification tap
// lands on the exact conversation even on iOS (where a cold launch drops the openWindow target).
self.addEventListener('message', function (event) {
  var data = event.data || {}
  if (data.type === 'client-ready' && pendingNavigate) {
    var path = pendingNavigate
    pendingNavigate = null
    try {
      if (event.source && event.source.postMessage) event.source.postMessage({ type: 'navigate', path: path })
    } catch (e) { /* ignore */ }
  }
})
