/* Stockfish, wrapped. The engine is the judge in Play exactly as the pre-baked tiers are the judge
   in a fight: it picks Glitch's moves and it scores the kid's, silently. Nothing it returns is ever
   printed on screen as a number.

   The build under vendor/ is single-threaded and never touches SharedArrayBuffer, because GitHub
   Pages sends no COOP/COEP headers and a threaded build would simply refuse to start there. It runs
   in a Web Worker, so a depth-8 search cannot freeze the board under the kid's thumb.

   Everything here is a promise with a timeout. If the worker never loads — old browser, blocked
   WASM, a phone that ran out of memory — `asleep()` goes true, every call rejects once, and the game
   layer says Glitch is asleep instead of hanging on a spinner. */
(function (root) {
  const WORKER = "vendor/stockfish.wasm.js";
  const CACHE_MAX = 240;
  const noop = function () {};
  let onLine = noop;                 // the one place worker output is routed; only one command at a time

  const state = { worker: null, boot: null, up: false, asleep: false, error: null,
    level: null, cache: {}, keys: [], nodes: 0 };

  function wasmOk() {
    try {
      return typeof WebAssembly === "object" &&
        WebAssembly.validate(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00));
    } catch (e) { return false; }
  }
  function post(text) { state.worker.postMessage(text); }

  // One command at a time. UCI has no request ids, so two searches in flight would read each
  // other's info lines and hand the kid Glitch's move from the wrong position.
  let gate = Promise.resolve();
  function serial(fn) { const p = gate.then(fn, fn); gate = p.then(noop, noop); return p; }

  function await_(text, done, ms, label) {
    return new Promise(function (resolve, reject) {
      const lines = [];
      const t = setTimeout(function () {
        onLine = noop; reject(new Error((label || text) + " timed out"));
      }, ms || 15000);
      onLine = function (line) {
        lines.push(line);
        if (done(line)) { clearTimeout(t); onLine = noop; resolve(lines); }
      };
      try { post(text); } catch (e) { clearTimeout(t); onLine = noop; reject(e); }
    });
  }

  function boot() {
    if (state.boot) return state.boot;
    state.boot = new Promise(function (resolve, reject) {
      if (typeof Worker !== "function") return reject(new Error("This browser has no Web Workers."));
      if (!wasmOk()) return reject(new Error("This browser has no WebAssembly."));
      let w;
      try { w = new Worker(WORKER); } catch (e) { return reject(e); }
      state.worker = w;
      w.onmessage = function (e) { onLine(String(e.data == null ? "" : e.data)); };
      w.onerror = function () { reject(new Error("Stockfish did not load.")); };
      resolve(w);
    }).then(function () {
      return await_("uci", function (l) { return l === "uciok"; }, 20000, "uci");
    }).then(function () {
      post("setoption name Hash value 16");
      post("setoption name Ponder value false");
      return await_("isready", function (l) { return l === "readyok"; }, 20000, "isready");
    }).then(function () { state.up = true; return true; })
      .catch(function (err) { state.asleep = true; state.error = err; throw err; });
    return state.boot;
  }

  /* An `info` line, as far as we care: which PV it is, what it is worth, and the line itself.
     `score` is always from the point of view of the side to move; callers normalise. */
  const UCI_RE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
  function parseInfo(line) {
    const p = line.split(/\s+/);
    const out = { multipv: 1, cp: null, mate: null, depth: 0, pv: [], uci: null };
    for (let i = 0; i < p.length; i++) {
      if (p[i] === "depth") out.depth = Number(p[i + 1]) || 0;
      else if (p[i] === "multipv") out.multipv = Number(p[i + 1]) || 1;
      else if (p[i] === "score") {
        if (p[i + 1] === "cp") out.cp = Number(p[i + 2]);
        else if (p[i + 1] === "mate") out.mate = Number(p[i + 2]);
      } else if (p[i] === "pv") { out.pv = p.slice(i + 1).filter(function (x) { return UCI_RE.test(x); }); break; }
    }
    out.uci = out.pv[0] || null;
    return out.uci ? out : null;
  }

  function remember(key, value) {
    if (!state.cache[key]) { state.keys.push(key); }
    state.cache[key] = value;
    while (state.keys.length > CACHE_MAX) { delete state.cache[state.keys.shift()]; }
    return value;
  }

  /* One search. Returns every PV the engine reported, deepest report per PV index, plus its own
     bestmove. `skill` is Stockfish's own Skill Level: it is how a crony plays badly on purpose in a
     way that still looks like chess. Scoring calls pass skill 20, because the judge never plays down. */
  function search(fen, opts) {
    const o = opts || {}, lv = state.level || {};
    const depth = Math.max(1, Math.round(o.depth || lv.depth || 8));
    const multipv = Math.max(1, Math.round(o.multipv || lv.multipv || 1));
    const skill = o.skill == null ? (lv.skill == null ? 20 : lv.skill) : o.skill;
    const key = fen + "|" + depth + "|" + multipv + "|" + skill;
    if (state.cache[key]) return Promise.resolve(state.cache[key]);
    return boot().then(function () {
      return serial(function () {
        return new Promise(function (resolve, reject) {
          const infos = {};
          const ms = o.timeout || (3000 + depth * 2000);
          const t = setTimeout(function () {
            onLine = noop;
            try { post("stop"); } catch (e) {}
            reject(new Error("search timed out"));
          }, ms);
          onLine = function (line) {
            if (line.indexOf("info ") === 0) {
              const inf = parseInfo(line);
              if (inf) infos[inf.multipv] = inf;
              return;
            }
            if (line.indexOf("bestmove") !== 0) return;
            clearTimeout(t); onLine = noop;
            const best = (line.split(/\s+/)[1] || "").replace("(none)", "");
            const lines = Object.keys(infos).map(function (k) { return infos[k]; })
              .sort(function (a, b) { return a.multipv - b.multipv; });
            resolve(remember(key, { fen: fen, best: best || null, lines: lines, depth: depth, skill: skill }));
          };
          try {
            post("setoption name MultiPV value " + multipv);
            post("setoption name Skill Level value " + skill);
            post("position fen " + fen);
            post("go depth " + depth);
            state.nodes += 1;
          } catch (e) { clearTimeout(t); onLine = noop; reject(e); }
        });
      });
    });
  }

  // The engine's own best move in a position, at full strength unless a level says otherwise.
  function bestMove(fen, opts) {
    return search(fen, opts).then(function (r) { return r.best; });
  }
  /* What the position is worth, from the point of view of the side to move. `{cp}` or `{mate}`;
     never both, never shown. Used to score the kid's move silently and to decide when Glitch folds. */
  function evaluate(fen, opts) {
    const o = Object.assign({ depth: 10, multipv: 1, skill: 20 }, opts || {});
    return search(fen, o).then(function (r) {
      const top = r.lines[0] || { cp: 0, mate: null, pv: [] };
      return { cp: top.cp, mate: top.mate, best: r.best || top.uci || null, pv: top.pv.slice(0, 6), depth: r.depth };
    });
  }

  function setLevel(level) { state.level = level || null; return state.level; }
  function asleep() { return !!state.asleep; }
  function up() { return !!state.up; }
  function reason() { return state.error ? String(state.error.message || state.error) : ""; }
  function init() { return boot(); }
  function quit() {
    onLine = noop;
    if (state.worker) { try { state.worker.postMessage("quit"); } catch (e) {} try { state.worker.terminate(); } catch (e) {} }
    state.worker = null; state.boot = null; state.up = false;
  }

  const api = { init, search, bestMove, evaluate, setLevel, asleep, up, reason, quit, parseInfo, WORKER };
  root.ShockmateEngine = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
