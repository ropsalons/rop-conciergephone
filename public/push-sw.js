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
      for (var i = 0; i < list.length; i++) {
        var client = list[i]
        if ('focus' in client) {
          // Tell the already-open app to route to the target (reliable for hash routing), then focus.
          try { client.postMessage({ type: 'navigate', path: hashPath }) } catch (e) { /* ignore */ }
          if ('navigate' in client) { try { client.navigate(url) } catch (e) { /* ignore */ } }
          return client.focus()
        }
      }
      // App not open — open it directly at the deep link.
      if (self.clients.openWindow) return self.clients.openWindow(url)
    }),
  )
})
