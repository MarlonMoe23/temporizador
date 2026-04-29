const CACHE = 'zen-timer-v2'

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(['/', '/index.html']))
  )
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone()
        caches.open(CACHE).then(cache => cache.put(e.request, clone))
        return res
      })
      .catch(() => caches.match(e.request))
  )
})

// Timer en background
let timerInterval = null

self.addEventListener('message', e => {
  if (e.data.type === 'TIMER_START') {
    const endTime = e.data.endTime // ms timestamp
    clearInterval(timerInterval)

    timerInterval = setInterval(() => {
      const remaining = endTime - Date.now()
      if (remaining <= 0) {
        clearInterval(timerInterval)
        timerInterval = null
        self.registration.showNotification('¡Tiempo completado! ✓', {
          body: e.data.label || 'Tu sesión ha terminado',
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          vibrate: [400, 200, 400, 200, 600],
          tag: 'zen-timer-done',
          renotify: true,
          requireInteraction: true,
        })
        // Notifica a la app si está abierta
        self.clients.matchAll({ type: 'window' }).then(clients => {
          clients.forEach(c => c.postMessage({ type: 'TIMER_DONE' }))
        })
      }
    }, 2000) // chequea cada 2 segundos
  }

  if (e.data.type === 'TIMER_CANCEL') {
    clearInterval(timerInterval)
    timerInterval = null
  }
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      if (clients.length > 0) {
        clients[0].focus()
      } else {
        self.clients.openWindow('/')
      }
    })
  )
})
