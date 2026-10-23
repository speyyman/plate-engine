// Plate Studio service worker: cache what the page loads, serve it when offline.
// Navigations go to the network first (so new releases arrive), falling back to the cache;
// other same-origin requests (hashed assets, fonts) are served from the cache first.
// Cache Storage is shared by every app on the origin (speyyman.github.io hosts several), so the name
// carries this worker's scope, and only this deployment's own older caches are ever deleted.
const PREFIX = `plate-studio:${self.registration.scope}:`
const CACHE = `${PREFIX}v1`

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(['./', './favicon.svg', './manifest.webmanifest']))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('./', copy))
          return res
        })
        .catch(() => caches.open(CACHE).then((c) => c.match('./'))),
    )
    return
  }
  event.respondWith(
    caches
      .open(CACHE)
      .then((c) => c.match(req))
      .then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(CACHE).then((c) => c.put(req, copy))
            }
            return res
          }),
      ),
  )
})
