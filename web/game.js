/* Shockmate v0.1 */
(function () {
  const FILES = "abcdefgh";
  const GLYPH = {wr:"♖",wn:"♘",wb:"♗",wq:"♕",wk:"♔",wp:"♙",br:"♜",bn:"♞",bb:"♝",bq:"♛",bk:"♚",bp:"♟"};
  const STORAGE = "shockmate-v1";
  const state = {
    encounters: window.SHOCKMATE_ENCOUNTERS || [],
    index: 0, selected: null, pieces: {}, locked: false, lastResult: null,
    settings: { intensity: "messy", cap: 8, sound: true, coords: false },
    stats: { hits: 0, misses: 0, streak: 0, bestStreak: 0, session: 0, figurines: [] }
  };
  const $ = (id) => document.getElementById(id);
  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE) || "{}");
      Object.assign(state.settings, data.settings || {});
      Object.assign(state.stats, data.stats || {});
    } catch (e) {}
  }
  function save() {
    localStorage.setItem(STORAGE, JSON.stringify({ settings: state.settings, stats: state.stats }));
  }
  function show(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    $(id).classList.add("active");
  }
  function toast(msg) {
    const t = $("toast"); t.hidden = false; t.textContent = msg;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 1600);
  }
  function hud() {
    $("stat-hits").textContent = state.stats.hits;
    $("stat-streak").textContent = state.stats.streak;
    $("stat-palace").textContent = state.stats.figurines.length;
  }
  let ac;
  function beep(freq, dur, type, gain) {
    if (!state.settings.sound) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator(); const g = ac.createGain();
      o.type = type || "square"; o.frequency.value = freq; g.gain.value = gain || 0.05;
      o.connect(g); g.connect(ac.destination); o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
      o.stop(ac.currentTime + dur);
    } catch (e) {}
  }
  function sfx(kind) {
    if (kind === "select") beep(220, 0.06);
    if (kind === "move") beep(180, 0.08, "triangle");
    if (kind === "win") { beep(440, 0.12); setTimeout(() => beep(660, 0.16), 90); }
    if (kind === "boom") beep(90, 0.2, "sawtooth", 0.07);
    if (kind === "fork") { beep(330, 0.08); setTimeout(() => beep(330, 0.08), 80); }
  }
  function current() { return state.encounters[state.index % state.encounters.length]; }
  function piecesFrom(enc) {
    const map = {}; enc.pieces.forEach((p) => { map[p.sq] = p; }); return map;
  }
  function renderBoard() {
    const enc = current(); const board = $("board"); board.innerHTML = "";
    for (let r = 8; r >= 1; r--) {
      for (let f = 0; f < 8; f++) {
        const sq = FILES[f] + r;
        const cell = document.createElement("div");
        cell.className = "sq " + (((f + r) % 2 === 0) ? "dark" : "light");
        cell.dataset.sq = sq;
        if (state.settings.coords && (f === 0 || r === 1)) {
          const c = document.createElement("span"); c.className = "coord";
          c.textContent = f === 0 ? String(r) : FILES[f]; cell.appendChild(c);
        }
        const piece = state.pieces[sq];
        if (piece) {
          const el = document.createElement("div");
          el.className = "piece " + piece.color;
          el.textContent = GLYPH[piece.color + piece.role];
          cell.appendChild(el);
        }
        cell.addEventListener("click", () => onSquare(sq));
        board.appendChild(cell);
      }
    }
    paintSelection();
  }
  function paintSelection() {
    const enc = current();
    document.querySelectorAll(".sq").forEach((el) => el.classList.remove("sel", "legal", "cap"));
    if (!state.selected) return;
    const from = document.querySelector('.sq[data-sq="' + state.selected + '"]');
    if (from) from.classList.add("sel");
    (enc.legal[state.selected] || []).forEach((m) => {
      const el = document.querySelector('.sq[data-sq="' + m.to + '"]');
      if (!el) return;
      el.classList.add("legal");
      if (m.capture) el.classList.add("cap");
    });
  }
  function onSquare(sq) {
    if (state.locked) return;
    const enc = current();
    if (state.selected) {
      const option = (enc.legal[state.selected] || []).find((m) => m.to === sq);
      if (option) { commitMove(option); return; }
    }
    const piece = state.pieces[sq];
    if (piece && piece.color === enc.turn) { state.selected = sq; sfx("select"); }
    else state.selected = null;
    paintSelection();
  }
  function commitMove(move) {
    state.locked = true;
    const from = move.uci.slice(0, 2); const to = move.uci.slice(2, 4);
    const captured = state.pieces[to]; const mover = state.pieces[from];
    delete state.pieces[from]; state.pieces[to] = mover;
    renderBoard();
    const dest = document.querySelector('.sq[data-sq="' + to + '"] .piece');
    if (dest) dest.classList.add("pop");
    sfx("move");
    if (captured) explode(to);
    setTimeout(() => resolve(move.uci === current().best, move), captured ? 550 : 280);
  }
  function explode(sq) {
    const intensity = state.settings.intensity;
    const board = $("board"); const fx = $("fx");
    const cell = document.querySelector('.sq[data-sq="' + sq + '"]');
    if (!cell) return;
    board.classList.remove("shake"); void board.offsetWidth; board.classList.add("shake");
    sfx("boom");
    const rect = cell.getBoundingClientRect(); const parent = fx.getBoundingClientRect();
    const x = rect.left - parent.left + rect.width / 2;
    const y = rect.top - parent.top + rect.height / 2;
    const size = intensity === "silly" ? 36 : intensity === "intense" ? 70 : 52;
    const splat = document.createElement("div"); splat.className = "splat";
    splat.style.width = splat.style.height = size + "px";
    splat.style.left = (x - size / 2) + "px"; splat.style.top = (y - size / 2) + "px";
    if (intensity === "silly") splat.style.background = "radial-gradient(circle,#fff,#ff8ad4 70%)";
    fx.appendChild(splat);
    const ring = document.createElement("div"); ring.className = "boom-ring";
    ring.style.width = ring.style.height = "20px"; ring.style.left = (x - 10) + "px"; ring.style.top = (y - 10) + "px";
    fx.appendChild(ring);
    for (let i = 0; i < 10; i++) {
      const sp = document.createElement("div"); sp.className = "spark";
      const ang = (Math.PI * 2 * i) / 10;
      sp.style.left = x + "px"; sp.style.top = y + "px";
      sp.style.setProperty("--dx", Math.cos(ang) * 48 + "px");
      sp.style.setProperty("--dy", Math.sin(ang) * 48 + "px");
      fx.appendChild(sp);
    }
    setTimeout(() => { fx.innerHTML = ""; }, 650);
  }
  function resolve(correct, move) {
    const enc = current(); state.lastResult = { correct, move };
    if (correct) {
      state.stats.hits += 1; state.stats.streak += 1;
      state.stats.bestStreak = Math.max(state.stats.bestStreak, state.stats.streak);
      addFigurine(enc, true); sfx(enc.motif.indexOf("ork") >= 0 ? "fork" : "win");
      $("prompt").textContent = "BOOM. That was the better future.";
    } else {
      state.stats.misses += 1; state.stats.streak = 0; addFigurine(enc, false);
      $("prompt").textContent = "That future was weaker.";
      const el = document.querySelector('.sq[data-sq="' + enc.best.slice(2, 4) + '"]');
      if (el) el.classList.add("best-glow");
    }
    state.stats.session += 1; save(); hud();
    setTimeout(() => showFutures(enc, correct), 700);
  }
  function addFigurine(enc, mastered) {
    const existing = state.stats.figurines.find((f) => f.id === enc.id);
    if (existing) { if (mastered) existing.mastered = true; existing.seen += 1; }
    else state.stats.figurines.push({ id: enc.id, title: enc.title, room: enc.palaceRoom, mascot: enc.mascot, why: enc.why, mastered, seen: 1 });
  }
  function showFutures(enc, correct) {
    show("screen-futures");
    $("screen-futures").classList.toggle("win", correct);
    $("screen-futures").classList.toggle("miss", !correct);
    $("future-title").textContent = correct ? "Your future was the explosion" : "Two futures";
    $("why-mascot").textContent = enc.mascot;
    $("why-text").textContent = enc.why;
    $("why-long").textContent = enc.whyLong + (correct ? "" : " Tempting was " + enc.temptingSan + ". Better is " + enc.bestSan + ".");
  }
  function nextEncounter() {
    if (state.stats.session > 0 && state.stats.session % state.settings.cap === 0) { endSession(); return; }
    state.index = (state.index + 1) % state.encounters.length;
    startEncounter();
  }
  function startEncounter() {
    state.selected = null; state.locked = false; state.pieces = piecesFrom(current());
    $("fx").innerHTML = ""; $("hook").textContent = current().hook;
    $("prompt").textContent = "Your move. Find the reason, not the snack.";
    show("screen-play"); renderBoard();
  }
  function endSession() {
    $("session-summary").textContent = "Hits " + state.stats.hits + " · misses " + state.stats.misses + " · figurines " + state.stats.figurines.length + ". The basement is still chewing.";
    $("session-end").hidden = false; show("screen-title");
  }
  function renderPalace() {
    const rooms = {};
    state.encounters.forEach((e) => {
      rooms[e.palaceRoom] = rooms[e.palaceRoom] || [];
      rooms[e.palaceRoom].push({ enc: e, fig: state.stats.figurines.find((f) => f.id === e.id) });
    });
    const root = $("palace-rooms"); root.innerHTML = "";
    Object.keys(rooms).forEach((name) => {
      const div = document.createElement("div"); div.className = "room";
      div.innerHTML = "<h3>" + name + "</h3>";
      rooms[name].forEach((item) => {
        const f = document.createElement("div");
        f.className = "fig" + (item.fig ? "" : " locked");
        f.textContent = item.fig ? ((item.fig.mastered ? "★ " : "· ") + item.enc.title + " — " + item.enc.why) : ("? " + item.enc.title);
        div.appendChild(f);
      });
      root.appendChild(div);
    });
  }
  function bind() {
    $("btn-start").onclick = startEncounter;
    $("btn-next").onclick = nextEncounter;
    $("btn-replay").onclick = function () {
      state.pieces = piecesFrom(current()); renderBoard(); show("screen-play"); state.locked = true;
      $("prompt").textContent = "Better move is " + current().bestSan + ".";
      const el = document.querySelector('.sq[data-sq="' + current().best.slice(2, 4) + '"]');
      if (el) el.classList.add("best-glow");
      setTimeout(() => showFutures(current(), state.lastResult && state.lastResult.correct), 1200);
    };
    $("btn-palace").onclick = function () { renderPalace(); show("screen-palace"); };
    $("btn-back-play").onclick = function () {
      if (state.locked && state.lastResult) show("screen-futures"); else show("screen-play");
    };
    $("btn-settings").onclick = function () {
      $("opt-intensity").value = state.settings.intensity;
      $("opt-cap").value = state.settings.cap;
      $("opt-sound").checked = state.settings.sound;
      $("opt-coords").checked = state.settings.coords;
      show("screen-settings");
    };
    $("btn-close-settings").onclick = function () {
      state.settings.intensity = $("opt-intensity").value;
      state.settings.cap = Math.max(3, Math.min(20, Number($("opt-cap").value) || 8));
      state.settings.sound = $("opt-sound").checked;
      state.settings.coords = $("opt-coords").checked;
      save(); show("screen-title");
    };
    $("btn-reset").onclick = function () {
      if (!confirm("Wipe palace and scores?")) return;
      state.stats = { hits: 0, misses: 0, streak: 0, bestStreak: 0, session: 0, figurines: [] };
      save(); hud(); toast("Palace emptied");
    };
    $("btn-hint").onclick = function () {
      const el = document.querySelector('.sq[data-sq="' + current().tempting.slice(2, 4) + '"]');
      if (el) el.classList.add("tempt-glow");
      toast("The snack is glowing gold. Do not eat it.");
    };
    $("btn-skip").onclick = function () { state.stats.session += 1; nextEncounter(); };
    $("btn-end-ok").onclick = function () { $("session-end").hidden = true; };
  }
  function selfTest() {
    const errors = [];
    const list = state.encounters;
    if (list.length !== 12) errors.push("expected 12, got " + list.length);
    list.forEach((e) => {
      const hasBest = (e.legal[e.best.slice(0, 2)] || []).some((m) => m.uci === e.best);
      const hasTemp = (e.legal[e.tempting.slice(0, 2)] || []).some((m) => m.uci === e.tempting);
      if (!hasBest) errors.push(e.id + " best not legal");
      if (!hasTemp) errors.push(e.id + " tempting not legal");
    });
    if (errors.length) console.error("self-test failed", errors);
    else console.log("Shockmate self-test passed: 12 fights.");
  }
  load(); bind(); hud(); selfTest();
})();
