const CACHE_NAME = 'family-todo-v1'
const STATIC_ASSETS = [
  '/',
]

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS)
    })
  )
  self.skipWaiting()
})

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function(name) { return name !== CACHE_NAME })
          .map(function(name) { return caches.delete(name) })
      )
    })
  )
  self.clients.claim()
})

self.addEventListener('fetch', function(event) {
  const url = new URL(event.request.url)

  if (event.request.method !== 'GET') return

  if (url.pathname.startsWith('/api/') || url.pathname.includes('pocketbase')) {
    event.respondWith(
      fetch(event.request)
        .then(function(response) {
          var clone = response.clone()
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone)
          })
          return response
        })
        .catch(function() {
          return caches.match(event.request)
        })
    )
    return
  }

  if (url.pathname.match(/\.(css|js|png|jpg|jpeg|svg|gif|woff2?|ttf|eot)$/)) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        if (cached) return cached
        return fetch(event.request).then(function(response) {
          var clone = response.clone()
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone)
          })
          return response
        })
      })
    )
    return
  }

  event.respondWith(
    fetch(event.request)
      .then(function(response) {
        var clone = response.clone()
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, clone)
        })
        return response
      })
      .catch(function() {
        return caches.match(event.request)
      })
  )
})
