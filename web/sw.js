// Offline shell. Bump CACHE when any listed file changes, or phones keep the old copy.
const CACHE = "shockmate-v33";   // bump with BUILD in src/game/00-core.js (then npm run build:game), or phones keep the old shell
const SHELL = [
  "./", "./index.html", "./styles.css", "./game.js", "./encounters.js", "./futures.js",
  "./score.js", "./flash.js", "./days.js", "./sync.js", "./sync-config.js", "./glitch.js", "./motifs.js", "./pieces.js", "./short-lines.js",
  "./play.js", "./versus.js", "./live.js", "./engine.js",
  // Play is lazy in the page but eager in the shell: the install is the one moment there is
  // certainly a network, and a game started on the bus has to work without one.
  "./vendor/chess.js", "./vendor/stockfish.wasm.js", "./vendor/stockfish.wasm",
  "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"
];

// The origin sends max-age=600, so a plain fetch (and cache.addAll, which is one) can hand a NEW
// worker a ten-minute-old game.js and the bump changes nothing on that phone. Installing with
// "reload" goes past the browser cache to the origin; refreshing with "no-cache" revalidates there.
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => Promise.all(SHELL.map((u) => fetch(new Request(u, { cache: "reload" })).then((res) => {
      if (!res || !res.ok) throw new Error("shell " + u + " " + (res && res.status));
      return c.put(u, res);
    }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// The page asks which shell it is being served; the answer is what tells it a new build landed.
self.addEventListener("message", (e) => {
  if (e.data === "shell?" && e.source) e.source.postMessage({ shell: CACHE });
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;                      // never cache a sync POST
  const url = new URL(req.url);
  if (url.pathname.indexOf("/rest/v1/") === 0 || url.hostname.indexOf("supabase") >= 0) return;

  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  const own = url.origin === self.location.origin;
  e.respondWith(caches.match(req).then((hit) => {
    if (hit) {
      // Serve from cache, then refresh quietly so the next launch is current.
      if (!isFont) fetch(own ? new Request(req, { cache: "no-cache" }) : req)
        .then((res) => res && res.ok && caches.open(CACHE).then((c) => c.put(req, res.clone()))).catch(() => {});
      return hit;
    }
    return fetch(req).then((res) => {
      if (res && res.ok && (own || isFont)) {
        const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match("./index.html"));
  }));
});
