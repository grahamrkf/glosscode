/* The web app's service worker: keeps a copy of every file of this version of the app, so it starts
   and works without a network connection once it has been opened. scripts/build-site.mjs fills in
   the cache name (version plus a hash of the files, so any change makes a new one) and the file list.
   A new version is fetched in the background and used the next time the app starts. */
const CACHE = "__GC_CACHE__";
const FILES = __GC_FILES__;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("glosscode-app-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req, { ignoreSearch: true }) || (req.mode === "navigate" ? await c.match("./") : null);
    return hit || fetch(req);
  }));
});
