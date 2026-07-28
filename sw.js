/* Bump this string whenever you change index.html — it's what forces
   phones to pick up the new version instead of serving the old cache. */
const CACHE = "4day-v4";
/* addAll() is atomic — one 404 here and the worker never installs, silently
   killing offline mode. Every path listed must actually ship. */
const ASSETS = [
  "./", "./index.html", "./manifest.webmanifest",
  "./icon.svg", "./icon-maskable.svg",
  "./icon-192.png", "./icon-512.png",
  "./icon-maskable-192.png", "./icon-maskable-512.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if(req.method !== "GET") return;

  // Never cache YouTube or anything cross-origin — let those fail normally
  // when there's no signal rather than serving something stale.
  if(new URL(req.url).origin !== self.location.origin) return;

  // Cache first: the app must open instantly in a gym with no signal.
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if(res && res.status === 200){
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match("./index.html")))
  );
});
