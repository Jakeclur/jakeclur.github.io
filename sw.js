/* Year Ten Study Hub: offline support.
   Change VERSION whenever you upload new pages so phones refresh their saved copy. */
const VERSION = "yt-v3";
const FILES = ["./", "index.html", "psychology.html", "specialist-maths.html", "physics.html", "methods.html", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => Promise.all(FILES.map(f => c.add(new Request(f, { cache: "reload" })).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  if (u.origin !== location.origin) return;            // Google Forms, the tutor API etc. always use the network
  const isPage = r.mode === "navigate" || u.pathname.endsWith(".html") || u.pathname.endsWith("/");
  if (isPage) {
    // Pages: try the network first so updates arrive, fall back to the saved copy when offline.
    e.respondWith(
      fetch(r).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(r, copy)); return res; })
        .catch(() => caches.match(r).then(m => m || caches.match("index.html")))
    );
  } else {
    // Icons, manifest: saved copy first.
    e.respondWith(
      caches.match(r).then(m => m || fetch(r).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(r, copy)); return res; }))
    );
  }
});
