// ═══════════════════════════════════════
//  Flivo — Service Worker (PWA)
// ═══════════════════════════════════════

const CACHE_NAME = 'flivo-v1'

const FICHIERS_A_CACHER = [
  '/',
  '/index.html',
  '/login.html',
  '/dashboard.html',
  '/nouvelle-livraison.html',
  '/track.html',
  '/livreur.html',
  '/upgrade.html',
  '/reset-password.html',
  '/404.html',
  '/config.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

// Installation — mise en cache des fichiers statiques
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(FICHIERS_A_CACHER)
    })
  )
  self.skipWaiting()
})

// Activation — nettoyage des anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    })
  )
  self.clients.claim()
})

// Fetch — stratégie Network First pour les APIs, Cache First pour les assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // APIs → toujours réseau (pas de cache)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request))
    return
  }

  // Assets statiques → cache first, fallback réseau
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached
      return fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone))
        }
        return response
      }).catch(() => {
        // Offline → retourner la page 404
        return caches.match('/404.html')
      })
    })
  )
})
