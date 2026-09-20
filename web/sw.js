// Offline shell. Bump CACHE when any listed file changes, or phones keep the old copy.
const CACHE = "shockmate-v29";   // bump with BUILD in game.js, or phones keep the old shell
const SHELL = [
  "./", "./index.html", "./styles.css", "./game.js", "./encounters.js", "./futures.js",
  "./score.js", "./flash.js", "./days.js", "./sync.js", "./sync-config.js", "./glitch.js", "./motifs.js", "./pieces.js", "./short-lines.js",
  "./play.js", "./versus.js", "./live.js", "./engine.js",
  // Play is lazy in the page but eager in the shell: the install is the one moment there is
  // certainly a network, and a game started on the bus has to work without one.
  "./vendor/chess.js", "./vendor/stockfish.wasm.js", "./vendor/stockfish.wasm",
  "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;                      // never cache a sync POST
  const url = new URL(req.url);
  if (url.pathname.indexOf("/rest/v1/") === 0 || url.hostname.indexOf("supabase") >= 0) return;

  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  e.respondWith(caches.match(req).then((hit) => {
    if (hit) {
      // Serve from cache, then refresh quietly so the next launch is current.
      if (!isFont) fetch(req).then((res) => res && res.ok && caches.open(CACHE).then((c) => c.put(req, res.clone()))).catch(() => {});
      return hit;
    }
    return fetch(req).then((res) => {
      if (res && res.ok && (url.origin === self.location.origin || isFont)) {
        const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match("./index.html"));
  }));
});
