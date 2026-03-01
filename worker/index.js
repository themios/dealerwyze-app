// Push notification handler — merged into sw.js by next-pwa at build time

self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'New Lead', {
      body: data.body || 'Tap to view',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'new-lead',
      renotify: true,
      data: { url: data.url || '/' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.focus()
          client.navigate(url)
          return
        }
      }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
