/* Shockmate arena v0.3 — Phase 0 "playable truth".
   States: home > think > tease > consequence > (secondTry | confession > guided) > gate > card > next | end.
   Engine is judge (pre-baked tiers). Animation is teacher. Nothing on screen goes down. Every fight is winnable. */
(function () {
  const F = window.ShockmateFutures, S = window.ShockmateScore, D = window.ShockmateDays;
  const FILES = "abcdefgh", KEY = "shockmate-v2";
  // Read this off the home screen to tell what a phone actually loaded — Pages and the
  // service worker both cache, so "I don't see the new screen" is usually a stale copy.
  const BUILD = "v0.7";
  const Y = window.ShockmateSync;
  const GLYPH = { wr: "♖", wn: "♘", wb: "♗", wq: "♕", wk: "♔", wp: "♙", br: "♜", bn: "♞", bb: "♝", bq: "♛", bk: "♚", bp: "♟" };
  const FAST = /[?&]fast=1/.test(location.search);
  const T = (ms) => (FAST ? Math.min(ms, 20) : ms);
  const sleep = (ms) => new Promise((r) => {
    const t = setTimeout(done, T(ms) * (state.speed || 1)); let done2 = false;
    function done() { if (done2) return; done2 = true; clearTimeout(t); state.waiters.delete(done); r(); }
    state.waiters.add(done);
  });
  function skipAhead() { const w = Array.from(state.waiters); state.waiters.clear(); w.forEach((f) => f()); }
  const $ = (id) => document.getElementById(id);

  const ALL = window.SHOCKMATE_ENCOUNTERS || [];
  const PACKS = ["tactics", "openings", "endgames"];
  const state = {
    encounters: ALL.filter((e) => e.pack === "tactics"), index: 0, pieces: {}, selected: null, phase: "home",
    tries: 0, guided: false, lastTier: null, lastUci: null, lastCritical: false, gate: null,
    session: { count: 0, reviews: 0, won: 0, crits: 0, rage: 0 }, waiters: new Set(),
    settings: { names: ["Player 1", "Player 2"], cap: 6, sound: true, coords: false, hurry: false, profile: 0, blitz: [false, false], pack: "tactics", day: 1, seats: 1, syncedAt: 0,
      sync: { url: "", anonKey: "", code: "", players: [{ username: "", pin: "" }, { username: "", pin: "" }] } },
    mode: "solo", pack: "tactics", active: 0, profiles: [null, null], duel: null, blitzTimer: null, speed: 1,
    stats: null,
  };
  const RAGE_TARGET = 4;

  /* ---------- storage ---------- */
  function freshStats() { return Object.assign(S.emptyStats(), { won: 0, criticals: 0, cardsEarned: {}, tiers: [], battle: S.emptyBattle() }); }
  function readProfile(i) {
    try { return Object.assign(freshStats(), JSON.parse(localStorage.getItem(KEY + ":p" + i) || "{}")); }
    catch (e) { return freshStats(); }
  }
  function useProfile(i) { state.active = i; state.stats = state.profiles[i]; }

  // API details come from this device's settings first, then any baked-in sync-config.js.
  function syncCfg() {
    const s = state.settings.sync || {};
    if (s.url && s.anonKey) return { url: s.url, anonKey: s.anonKey };
    return window.SHOCKMATE_SYNC && window.SHOCKMATE_SYNC.url ? window.SHOCKMATE_SYNC : null;
  }
  function syncSlots() { return (state.settings.sync && state.settings.sync.players) || [{}, {}]; }
  function syncOn() {
    const s = state.settings.sync || {};
    return !!(Y && Y.configured(syncCfg()) && Y.validCode(s.code) && syncSlots().some(Y.boundSlot));
  }

  function applyMerged(profiles, names) {
    state.profiles = [0, 1].map((i) => Object.assign(freshStats(), profiles[i]));
    if (names && names[0]) state.settings.names = [names[0], names[1] || state.settings.names[1]];
    useProfile(state.settings.profile); save(); renderPath(); hud();
  }

  // One round trip per profile: pull the other device's copy, merge both ways, push the result.
  // Merging (never overwriting) means an old device coming back online cannot delete a new card.
  function syncNow(quiet) {
    if (!syncOn()) return Promise.resolve(false);
    const code = state.settings.sync.code, slots = syncSlots();
    // Only a slot with a username and PIN syncs; an unbound slot stays device-local.
    const jobs = [0, 1].filter((i) => Y.boundSlot(slots[i])).map((i) => Y.pull(syncCfg(), code, slots[i])
      .then((remote) => {
        const merged = Y.mergeStats(state.profiles[i], remote || {});
        state.profiles[i] = Object.assign(freshStats(), merged);
        return Y.push(syncCfg(), code, slots[i], state.profiles[i]);
      }));
    return Promise.all(jobs).then(() => {
      state.settings.syncedAt = Date.now(); useProfile(state.settings.profile); save(); renderPath(); hud(); renderSyncState();
      if (!quiet) toast("Cards synced.", 1800);
      return true;
    }).catch((err) => {
      renderSyncState(String(err && err.message || err));
      if (!quiet) toast("Sync could not finish. Cards are safe on this device.", 2600);
      return false;
    });
  }

  let syncTimer = null;
  function syncSoon() {   // after a card is earned; coalesced so a fast session makes one call
    if (!syncOn() || syncTimer) return;
    syncTimer = setTimeout(() => { syncTimer = null; syncNow(true); }, 4000);
  }

  function renderSyncState(problem) {
    const off = $("sync-off"), on = $("sync-on");
    if (!off || !on) return;
    const ready = !!(Y && Y.configured(syncCfg()));
    off.hidden = ready; on.hidden = !ready;
    if (!ready) return;
    const el = $("sync-state"), s = state.settings.sync;
    if (problem) el.textContent = problem;
    else if (!Y.validCode(s.code)) el.textContent = "Type the family code from the spelling or maths app.";
    else if (!syncSlots().some(Y.boundSlot)) el.textContent = "Add a username and 4-digit PIN for at least one player.";
    else if (!state.settings.syncedAt) el.textContent = "Ready. Nothing synced yet.";
    else el.textContent = "Last synced " + new Date(state.settings.syncedAt).toLocaleString() + ".";
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify(Y.exportBlob(state.settings, state.profiles), null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "shockmate-cards-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast("Backup file saved.", 1800);
  }

  function importBackup(text) {
    try {
      const merged = Y.importBlob(text, state.profiles);
      applyMerged(merged.profiles, merged.names);
      renderSettings(); toast("Cards restored and merged.", 2200);
    } catch (err) { toast(String(err && err.message || err), 2600); }
  }
  function loadStats() { state.profiles = [readProfile(0), readProfile(1)]; useProfile(state.settings.profile); }
  function load() {
    try { Object.assign(state.settings, JSON.parse(localStorage.getItem(KEY + ":settings") || "{}")); } catch (e) {}
    if (!Array.isArray(state.settings.blitz)) state.settings.blitz = [false, false];
    if (!(state.settings.day >= 1 && state.settings.day <= D.DAYS.length)) state.settings.day = 1;
    const sy = state.settings.sync = Object.assign({ url: "", anonKey: "", code: "", players: [] }, state.settings.sync);
    sy.players = [0, 1].map((i) => Object.assign({ username: "", pin: "" }, sy.players[i]));
    setSeats(state.settings.seats === 2 ? 2 : 1);
    setDay(state.settings.day);
    loadStats();
    if (syncOn()) syncNow(true);
  }
  function save() {
    try {
      localStorage.setItem(KEY + ":settings", JSON.stringify(state.settings));
      state.profiles.forEach((p, i) => localStorage.setItem(KEY + ":p" + i, JSON.stringify(p)));
    } catch (e) {}
  }
  function activeName() { return state.settings.names[state.active]; }
  function setSeats(n) {
    // Seats answer "how many people are holding this phone", never "which colour am I".
    state.seats = n === 2 ? 2 : 1; state.settings.seats = state.seats;
    $("seat-1").classList.toggle("active", state.seats === 1);
    $("seat-2").classList.toggle("active", state.seats === 2);
    $("step-solo").hidden = state.seats === 2;
    $("step-two").hidden = state.seats === 1;
    $("btn-start").hidden = state.seats === 2;
    $("two-hint").textContent = state.settings.names[0] + " and " + state.settings.names[1]
      + " take turns on this phone. You both play White.";
  }
  function setDay(n) {
    const day = D.dayByNumber(Number(n) || 1);
    state.day = day.n; state.settings.day = day.n;
    state.encounters = D.fightsForDay(ALL, day.n); state.index = 0;
    renderDayStrip();
  }
  function renderDayStrip() {
    const host = $("day-strip"); if (!host) return;
    const cur = state.day || 1;
    host.innerHTML = D.DAYS.map(function (d) {
      const pr = D.dayProgress(state.stats, d.n), open = D.dayUnlocked(state.stats, d.n);
      const cls = ["day-chip"];
      if (pr.complete) cls.push("done"); else if (d.n === cur) cls.push("current");
      if (!open) cls.push("locked");
      return '<button class="' + cls.join(" ") + '" data-day="' + d.n + '"' + (open ? "" : " disabled") +
        '><span class="n">Day ' + d.n + '</span>' + d.title + '</button>';
    }).join("");
    Array.prototype.forEach.call(host.querySelectorAll(".day-chip"), function (b) {
      b.onclick = function () { setDay(Number(b.dataset.day)); renderPath(); hud(); };
    });
    if ($("day-blurb")) $("day-blurb").textContent = D.dayByNumber(cur).blurb;
  }
  /* adaptive: rolling tier history decides whether the next fight opens with candidates lit */
  function needsHelp(stats) {
    const t = (stats.tiers || []).slice(-2);
    return t.length === 2 && t.every((x) => x === "bait" || x === "blunder");
  }
  function onFire(stats) {
    const t = (stats.tiers || []).slice(-3);
    return t.length === 3 && t.every((x) => x === "best");
  }
  function now() { return Date.now(); }

  /* ---------- ui helpers ---------- */
  function show(id) { document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active")); $(id).classList.add("active"); }
  function toast(msg, ms) { const t = $("toast"); t.hidden = false; t.textContent = msg; clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, ms || 1600); }
  function banner(text, tone) {
    const b = $("banner"); b.className = "banner" + (tone ? " " + tone : ""); b.textContent = text || ""; b.hidden = !text;
  }
  function glitchSay(text, mood) {
    if (window.ShockmateGlitch) {
      const wilt = window.ShockmateGlitch.wiltTier(S.glitchRating(state.stats).fraction);
      return window.ShockmateGlitch.set(mood || "taunt", text || "", wilt);
    }
    const b = $("glitch-line"); b.textContent = text || ""; b.hidden = !text;
  }
  function renderTeam() {
    const team = $("team"); if (!team) return;
    team.hidden = state.mode === "solo" || state.phase === "home";
    if (team.hidden) return;
    $("turn-chip").textContent = (state.mode === "duel" ? "DUEL · " : "") + activeName().toUpperCase() + "'S TURN";
    const pct = Math.min(100, Math.round((state.session.rage / RAGE_TARGET) * 100));
    $("rage-fill").style.width = pct + "%";
    document.querySelector(".rage").classList.toggle("full", pct >= 100);
  }
  function stopBlitz() { clearTimeout(state.blitzTimer); state.blitzTimer = null; state.speed = 1; const b = $("blitz"); b.hidden = true; b.classList.remove("run"); }
  function startBlitz() {
    const b = $("blitz");
    if (!state.settings.blitz[state.active] || state.mode === "duel") return stopBlitz();
    b.hidden = false; b.classList.remove("run"); $("blitz-fill").style.width = "100%"; void b.offsetWidth; b.classList.add("run");
    state.speed = 0.6;
    state.blitzTimer = setTimeout(() => {
      if (state.phase !== "think") return;
      current().candidates.forEach((sqr) => sq(sqr) && sq(sqr).classList.add("cand"));
      glitchSay("Too slow! Here, I'll narrow it down. Ugh.", "nervous");
    }, T(10000));
  }
  function renderPath() {
    const root = $("path"); if (!root) return;
    const earned = state.stats.cardsEarned || {}, cur = current();
    root.innerHTML = state.encounters.map((e) => {
      const cls = ["pip"]; if (e.boss) cls.push("boss");
      if (earned[e.id]) cls.push("done"); else if (state.phase !== "home" && e.id === cur.id) cls.push("now");
      return '<div class="' + cls.join(" ") + '"></div>';
    }).join("");
  }
  // Glitch's own rating never recovers. A different crony fronts for him each day, so there is
  // always a fresh brag to knock down without taking yesterday's win away.
  function renderCrony() {
    const box = $("crony"); if (!box) return;
    const c = S.dailyChallenger(state.stats, now());
    box.hidden = false;
    $("crony-name").textContent = "TODAY: " + c.name;
    $("crony-real").textContent = c.real;
    $("crony-fill").style.width = Math.round(c.fraction * 100) + "%";
    $("crony-line").textContent = c.cardsToday
      ? c.name + " claimed " + c.claimed + " this morning. You have taken " + c.drop + " off him today."
      : c.name + " is standing in for Glitch today. He says he is " + c.claimed + ".";
  }
  function renderBoss() {
    const box = $("boss"); if (!box) return;
    const b = S.bossHp(state.stats, now());
    box.hidden = state.phase === "home";
    box.classList.toggle("ko", b.ko);
    $("boss-name").textContent = b.ko ? b.name + " \u00b7 KO" : b.name;
    $("boss-hp").textContent = b.ko ? "DOWN" : String(b.hp);
    $("boss-fill").style.width = Math.round(Math.max(0, Math.min(1, b.fraction)) * 100) + "%";
  }
  function renderPowers() {
    const host = $("powers"); if (!host) return;
    const b = S.battleOf(state.stats), pips = $("power-pips");
    if (pips) { let h = ""; for (let i = 0; i < S.POWER_CAP; i++) h += '<i class="' + (i < b.power ? "on" : "") + '"></i>'; pips.innerHTML = h; }
    Array.prototype.forEach.call(host.querySelectorAll(".pw"), function (btn) {
      const id = btn.dataset.ability, armed = id !== "tell" && !!b.next[id];
      btn.classList.toggle("armed", armed);
      btn.disabled = state.phase !== "think" || (!armed && !S.canAfford(b, id));
    });
  }
  function prompt(text) { $("prompt").textContent = text; }
  function hud() {
    $("stat-won").textContent = state.stats.won || 0;
    $("stat-crit").textContent = state.stats.criticals || 0;
    $("stat-cards").textContent = Object.keys(state.stats.cardsEarned || {}).length;
    if ($("stat-rank")) $("stat-rank").textContent = S.agentRank(state.stats).title;
    renderCrony(); renderBoss();
    if ($("two-hint")) $("two-hint").textContent = state.settings.names[0] + " and " + state.settings.names[1]
      + " take turns on this phone. You both play White.";
    // During play the board never flips, so the note doubles as "whose go is it" in co-op.
    if ($("turn-note")) $("turn-note").textContent = activeName() + " is White.";  // the co-op turn banner already says whose go it is
    [0, 1].forEach((i) => { const b = $("prof-" + i); b.textContent = state.settings.names[i]; b.classList.toggle("active", (state.mode === "solo" ? state.settings.profile : state.active) === i); });
    if ($("build-tag")) $("build-tag").textContent = BUILD + " \u00b7 " + ALL.length + " fights \u00b7 " + D.DAYS.length + " days";
    renderBrag(); renderPath(); renderTeam();
  }

  // Glitch's number, never the kid's. It only ever falls, and his claim never moves.
  function renderBrag() {
    if (!$("brag-real")) return;
    const r = S.glitchRating(state.stats);
    $("brag-real").textContent = r.real;
    $("brag-fill").style.width = Math.max(2, Math.round(100 * r.fraction)) + "%";
    $("brag-line").textContent = S.ratingTaunt(r);
  }
  let ac;
  function beep(freq, dur, type, gain) {
    if (!state.settings.sound || FAST) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type || "square"; o.frequency.value = freq; g.gain.value = gain || 0.05;
      o.connect(g); g.connect(ac.destination); o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur); o.stop(ac.currentTime + dur);
    } catch (e) {}
  }
  function sfx(kind) {
    if (kind === "select") beep(220, 0.06);
    if (kind === "move") beep(180, 0.08, "triangle");
    if (kind === "win") { beep(440, 0.12); setTimeout(() => beep(660, 0.16), 90); }
    if (kind === "boom") beep(90, 0.2, "sawtooth", 0.07);
    if (kind === "fork") { beep(330, 0.08); setTimeout(() => beep(330, 0.08), 80); }
    if (kind === "tease") { beep(110, 0.15, "sine", 0.06); setTimeout(() => beep(110, 0.15, "sine", 0.06), 300); }
    if (kind === "crit") { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.18, "square", 0.06), i * 90)); }
    if (kind === "nope") beep(140, 0.12, "sawtooth", 0.04);
  }

  /* ---------- board ---------- */
  function current() { return state.encounters[state.index % state.encounters.length]; }
  function sq(name) { return document.querySelector('.sq[data-sq="' + name + '"]'); }
  function renderBoard() {
    const board = $("board"); board.innerHTML = "";
    for (let r = 8; r >= 1; r--) for (let f = 0; f < 8; f++) {
      const name = FILES[f] + r, cell = document.createElement("div");
      cell.className = "sq " + (((f + r) % 2 === 0) ? "dark" : "light"); cell.dataset.sq = name;
      if (state.settings.coords && (f === 0 || r === 1)) { const c = document.createElement("span"); c.className = "coord"; c.textContent = f === 0 ? String(r) : FILES[f]; cell.appendChild(c); }
      const p = state.pieces[name];
      if (p) { const el = document.createElement("div"); el.className = "piece " + p.color; el.textContent = GLYPH[p.color + p.role]; cell.appendChild(el); }
      cell.addEventListener("click", () => onSquare(name));
      board.appendChild(cell);
    }
    paintSelection();
  }
  function clearMarks() { document.querySelectorAll(".sq").forEach((el) => { el.className = el.className.replace(/\b(sel|legal|cap|cand|guide|best-glow|tempt-glow|gate-target|gate-ok|gate-hint|fork-glow|pin-freeze|skewer-stab|door-slam|laser|poison)\b/g, "").trim(); }); }
  function paintSelection() {
    const enc = current();
    document.querySelectorAll(".sq").forEach((el) => el.classList.remove("sel", "legal", "cap"));
    const helping = state.tries === 1 || state.helpThisFight;
    if (state.phase === "think" && helping && !state.guided) enc.candidates.forEach((s) => sq(s) && sq(s).classList.add("cand"));
    if (state.guided) { sq(enc.best.slice(0, 2)).classList.add("guide"); sq(enc.best.slice(2, 4)).classList.add("guide"); }
    if (!state.selected) return;
    sq(state.selected).classList.add("sel");
    (enc.legal[state.selected] || []).forEach((m) => {
      if (state.guided && m.uci !== enc.best) return;
      const el = sq(m.to); if (!el) return; el.classList.add("legal"); if (m.capture) el.classList.add("cap");
    });
  }
  function setPieces(map) { state.pieces = F.clonePieces(map); renderBoard(); }
  function onSquare(name) {
    if (state.phase === "gate") return gateTap(name);
    if (state.phase !== "think") return;
    const enc = current();
    if (state.selected) {
      const option = (enc.legal[state.selected] || []).find((m) => m.to === name);
      if (option && (!state.guided || option.uci === enc.best)) return commitMove(option);
    }
    const p = state.pieces[name];
    if (p && p.color === enc.turn) { state.selected = name; sfx("select"); } else state.selected = null;
    paintSelection();
  }

  /* ---------- fx ---------- */
  function explode(square, big) {
    const board = $("board"), fx = $("fx"), cell = sq(square); if (!cell) return;
    board.classList.remove("shake"); void board.offsetWidth; board.classList.add("shake"); sfx("boom");
    const rect = cell.getBoundingClientRect(), parent = fx.getBoundingClientRect();
    const x = rect.left - parent.left + rect.width / 2, y = rect.top - parent.top + rect.height / 2, size = big ? 90 : 52;
    const splat = document.createElement("div"); splat.className = "splat";
    splat.style.width = splat.style.height = size + "px"; splat.style.left = (x - size / 2) + "px"; splat.style.top = (y - size / 2) + "px";
    splat.style.background = "radial-gradient(circle,#fff,#ffd36a 40%,#ff8ad4 70%)"; fx.appendChild(splat);
    const ring = document.createElement("div"); ring.className = "boom-ring"; ring.style.width = ring.style.height = "20px"; ring.style.left = (x - 10) + "px"; ring.style.top = (y - 10) + "px"; fx.appendChild(ring);
    for (let i = 0; i < (big ? 18 : 10); i++) {
      const sp = document.createElement("div"); sp.className = "spark"; const ang = (Math.PI * 2 * i) / (big ? 18 : 10);
      sp.style.left = x + "px"; sp.style.top = y + "px"; sp.style.setProperty("--dx", Math.cos(ang) * (big ? 90 : 48) + "px"); sp.style.setProperty("--dy", Math.sin(ang) * (big ? 90 : 48) + "px"); fx.appendChild(sp);
    }
    setTimeout(() => { fx.innerHTML = ""; }, 700);
  }
  async function playLine(ucis, startMap) {
    let map = F.clonePieces(startMap);
    for (const uci of ucis) {
      const step = F.applyUci(map, uci); map = step.pieces; setPieces(map);
      const dest = sq(step.to) && sq(step.to).querySelector(".piece"); if (dest) dest.classList.add("pop"); sfx("move");
      if (step.captured) explode(step.to, false);
      await sleep(450);
    }
    return map;
  }
  function finisher(enc) {
    const fin = F.finisherFor(enc); fin.targets.forEach((s) => sq(s) && sq(s).classList.add(fin.css)); sfx(fin.sfx); return fin;
  }

  /* ---------- fight flow ---------- */
  function startEncounter() {
    const enc = current(); state.selected = null; state.tries = 0; state.guided = false; state.lastTier = null; state.phase = "think";
    setPieces(F.piecesFromList(enc.pieces)); clearMarks(); $("fx").innerHTML = ""; $("board").classList.remove("dim");
    banner(""); glitchSay(enc.glitch.taunt, "taunt"); prompt(enc.hook); $("gate-dots").innerHTML = "";
    $("btn-hint").hidden = false; $("btn-skip").hidden = false; show("screen-play");
    state.helpThisFight = needsHelp(state.stats) || (state.mode === "duel" && state.duel && state.duel.helpSeat === state.active);
    paintSelection(); renderTeam(); startBlitz(); hud(); renderPowers();
  }
  async function commitMove(move) {
    const enc = current(); state.phase = "busy"; state.selected = null; paintSelection();
    const start = F.piecesFromList(enc.pieces); const step = F.applyUci(start, move.uci); setPieces(step.pieces);
    const dest = sq(step.to) && sq(step.to).querySelector(".piece"); if (dest) dest.classList.add("pop"); sfx("move");
    if (step.captured) explode(step.to, false);
    stopBlitz();
    const tier = state.guided ? "best" : (enc.moves[move.uci] || {}).tier || "blunder";
    state.lastTier = tier; state.lastUci = move.uci; $("btn-hint").hidden = true; $("btn-skip").hidden = true;
    // tease: both futures charge
    banner("SPLITTING TIME…", "tease"); $("board").classList.add("dim"); $("timelines").hidden = false;
    glitchSay("Wait. Wait. Which future is this…", "nervous"); sfx("tease");
    await sleep(700); $("board").classList.remove("dim"); $("timelines").hidden = true;
    if (tier === "best" || tier === "good") await hitFlow(enc, move, tier, step.pieces);
    else await missFlow(enc, move, tier, start, step.pieces);
  }
  async function hitFlow(enc, move, tier, afterMap) {
    banner("YOUR FUTURE", "win"); glitchSay(enc.glitch.rage, "rage");
    state.stats = S.recordAttempt(state.stats, enc, { correct: true, san: move.san, t: now(), hurry: state.settings.hurry }).stats;
    (state.stats.tiers = state.stats.tiers || []).push(tier); if (state.stats.tiers.length > 8) state.stats.tiers.shift();
    let map = afterMap;
    if (move.uci === enc.best && enc.bestLineUci.length > 1) map = await playLine(enc.bestLineUci.slice(1), afterMap);
    else await sleep(350);
    const fin = finisher(enc); await sleep(500);
    const critRes = S.resolveCritical(state.stats.battle, tier, state.guided, state.lastCritical, enc.boss, Math.random());
    state.stats.battle = critRes.battle; const crit = critRes.crit;
    if (critRes.forced) toast("OVERCHARGE!", 1400);
    state.lastCritical = crit;
    if (crit) {
      banner("CRITICAL!", "crit"); sfx("crit"); document.querySelector(".board-wrap").classList.add("zoom");
      await sleep(180);
      (fin.targets.length ? fin.targets : [enc.best.slice(2, 4)]).forEach((s) => explode(s, true));
      setTimeout(() => document.querySelector(".board-wrap").classList.remove("zoom"), T(900));
      state.stats.criticals = (state.stats.criticals || 0) + 1; state.session.crits += 1; await sleep(900);
    }
    if (tier === "good") { toast("Glitch: there was a BIGGER one…", 2200); }
    save(); hud();
    await whyGate(enc);
    state.stats = S.recordWhy(state.stats, enc, { ok: true, t: now(), hurry: state.settings.hurry }).stats;
    state.ratingBefore = S.glitchRating(state.stats).real; state.rankBefore = S.agentRank(state.stats).index; state.hpBefore = S.bossHp(state.stats, now()).hp;   // read before the card lands, shown on the card screen
    const earned = state.stats.cardsEarned[enc.id] || { critical: false, tries: 0 };
    earned.critical = earned.critical || crit; earned.tries = state.tries + 1; earned.t = now(); earned.tier = tier; state.stats.cardsEarned[enc.id] = earned;
    state.stats.battle = S.earnPower(state.stats.battle, crit);
    let hpNow = S.bossHp(state.stats, now());
    const hit = S.resolveHitDamage(state.stats.battle, (state.hpBefore || hpNow.hp) - hpNow.hp, hpNow.dateKey);
    state.stats.battle = hit.battle; hpNow = S.bossHp(state.stats, now());
    const dmg = hit.dmg;
    banner((hit.doubled ? "DOUBLE STRIKE!  -" : crit ? "CRITICAL HIT!  -" : "HIT!  -") + dmg, (crit || hit.doubled) ? "crit" : "win");
    renderPowers();
    renderBoss(); await sleep(650);
    if (hpNow.ko && state.koShown !== hpNow.dateKey) {
      state.koShown = hpNow.dateKey;
      state.stats.battle = S.recordKo(state.stats.battle);
      banner("KNOCKOUT!  " + hpNow.name + " is done", "crit"); sfx("crit");
      glitchSay(hpNow.name + "? Never heard of him.", "hide"); await sleep(1100);
    }
    syncSoon();
    state.stats.won = (state.stats.won || 0) + 1; state.session.won += 1;
    if (state.mode !== "solo") { state.session.rage = Math.min(RAGE_TARGET, state.session.rage + 1); renderTeam(); }
    save(); hud();
    if (state.mode === "duel") return duelSeatDone(enc, true);
    showCard(enc, tier, crit);
  }
  async function missFlow(enc, move, tier, start, afterMap) {
    const missRes = S.resolveMiss(state.stats.battle); state.stats.battle = missRes.battle;
    if (missRes.shielded) { banner("TIME SHIELD", "tease"); glitchSay("Hey! Where did my gloat go?", "nervous"); renderPowers(); }
    else { banner("GLITCH'S FUTURE", "miss"); glitchSay(enc.glitch.gloat, "smug"); }
    state.stats = S.recordAttempt(state.stats, enc, { correct: false, san: move.san, t: now() }).stats;
    (state.stats.tiers = state.stats.tiers || []).push(tier); if (state.stats.tiers.length > 8) state.stats.tiers.shift(); save();
    if (move.uci === enc.tempting && enc.temptingLineUci.length > 1) await playLine(enc.temptingLineUci.slice(1), afterMap);
    else await sleep(600);
    await sleep(500);
    if (state.mode === "duel") return duelSeatDone(enc, false);
    state.tries += 1;
    if (state.tries === 1) {
      banner("SECOND TRY", "tease"); setPieces(start); clearMarks(); glitchSay("Sweating? Me? Never.", "nervous"); prompt("Try again. Glitch is sweating.");
      state.phase = "think"; paintSelection(); renderPowers(); return;
    }
    // confession: show the better future, then the kid plays it
    banner("THE BETTER FUTURE", "win"); glitchSay("Fine. FINE. Here is what I was scared of.", "nervous"); setPieces(start); await sleep(500);
    await playLine(enc.bestLineUci, start); finisher(enc); await sleep(800);
    banner("YOUR TURN", "tease"); setPieces(start); clearMarks(); state.guided = true; state.phase = "think";
    prompt("Now you play it: " + enc.bestSan); paintSelection(); renderPowers();
  }
  function whyGate(enc) {
    return new Promise((resolve) => {
      const targets = enc.whyTargets.squares.slice();
      state.gate = { targets, found: [], wrong: 0, resolve }; state.phase = "gate";
      // Rewind to the moment the reason is visible, so the prompt matches the board.
      const start = F.piecesFromList(enc.pieces);
      const rewind = enc.whyTargets.at !== "after";
      setPieces(rewind ? start : F.applyUci(start, enc.best).pieces);
      banner(rewind ? "REWIND" : "LOCK IT IN", "tease");
      glitchSay("Don't say it. Don't you DARE say why…", "hide");
      prompt(enc.whyTargets.prompt);
      clearMarks(); renderDots(); $("prompt").classList.add("gate-prompt");
    });
  }
  function renderDots() {
    const g = state.gate; $("gate-dots").innerHTML = g.targets.map((t) => '<span class="' + (g.found.includes(t) ? "on" : "") + '"></span>').join("");
  }
  function gateTap(name) {
    const g = state.gate; if (!g) return;
    if (g.targets.includes(name) && !g.found.includes(name)) {
      g.found.push(name); sq(name).classList.add("gate-ok"); sq(name).classList.remove("gate-hint"); sfx("win"); renderDots();
      if (g.found.length === g.targets.length) { state.phase = "busy"; $("gate-dots").innerHTML = ""; $("prompt").classList.remove("gate-prompt"); banner("LOCKED IN", "win"); setTimeout(() => { const r = g.resolve; state.gate = null; r(); }, T(500)); }
      return;
    }
    if (!g.found.includes(name)) {
      g.wrong += 1; const el = sq(name); el.classList.remove("nope"); void el.offsetWidth; el.classList.add("nope"); sfx("nope");
      if (g.wrong === 1) toast("Glitch: nope.");
      if (g.wrong >= 2) { const hint = g.targets.find((t) => !g.found.includes(t)); if (hint) sq(hint).classList.add("gate-hint"); }
    }
  }
  function showCard(enc, tier, crit) {
    state.phase = "card"; renderPath(); $("prompt").classList.remove("gate-prompt");
    $("card-title").textContent = crit ? "CRITICAL KNOCKDOWN" : (state.tries > 0 ? "YOU BEAT GLITCH after " + (state.tries + 1) + " tries" : "YOU BEAT GLITCH");
    if ($("card-spoils")) { $("card-spoils").hidden = false; $("card-spoils").textContent = "Spoils: the " + enc.title + " card"; }
    $("why-mascot").textContent = enc.mascot; $("why-text").textContent = enc.why; $("why-long").textContent = enc.whyLong;
    $("glitch-line-2").textContent = "Glitch: " + enc.glitch.rage;
    $("btn-peek").hidden = !(tier === "good" && state.lastUci !== enc.best);
    const before = state.ratingBefore, after = S.glitchRating(state.stats), fell = (before || after.real) - after.real;
    const rankNow = S.agentRank(state.stats);
    const rankLine = $("card-rank");
    if (rankLine) {
      const up = state.rankBefore != null && rankNow.index > state.rankBefore;
      rankLine.hidden = !up;
      rankLine.textContent = up ? "Promoted: " + rankNow.title : "";
    }
    const tick = $("brag-tick");
    if (tick) {
      tick.hidden = fell <= 0;
      tick.textContent = fell > 0 ? "GLITCH'S RATING " + before + " \u2192 " + after.real + "  (\u25bc" + fell + ")" : "";
    }
    show("screen-card");
  }

  /* ---------- duel ---------- */
  function tierAvg(stats) {
    const w = { best: 3, good: 2, bait: 0, blunder: 0 }, t = (stats.tiers || []).slice(-8);
    if (!t.length) return 1.5;
    return t.reduce((a, x) => a + (w[x] || 0), 0) / t.length;
  }
  function startDuel() {
    state.mode = "duel";
    const help = tierAvg(state.profiles[0]) <= tierAvg(state.profiles[1]) ? 0 : 1;
    state.duel = Object.assign(S.emptyDuel(state.settings.names[0], state.settings.names[1], null), { helpSeat: help });
    state.session = { count: 0, reviews: 0, won: 0, crits: 0, rage: 0 };
    useProfile(0); state.index = pickNext(-1); state.duel.encId = current().id; startEncounter();
  }
  function duelSeatDone(enc, kept) {
    state.duel = S.recordDuelSeat(state.duel, { found: kept, kept: kept, san: enc.bestSan });
    if (state.duel.turn === 0) {
      state.duel.turn = 1; useProfile(1); hud();
      banner("HOT SEAT", "tease"); glitchSay("Your turn. Same board. No peeking at the answer.", "smug");
      toast(state.settings.names[1] + ": same board, your go.", 2200);
      state.tries = 0; state.guided = false; setTimeout(startEncounter, T(900));
      return;
    }
    const v = S.duelVerdict(state.duel);
    $("duel-title").textContent = v.winner === "basement" ? "Glitch wins this board" : "Board decided";
    $("duel-line").textContent = v.line;
    $("duel-detail").textContent = "The move Glitch feared was " + enc.bestSan + ". " + enc.why;
    save(); show("screen-duel"); state.phase = "duel";
  }
  function duelNextBoard() {
    state.duel = Object.assign(S.emptyDuel(state.settings.names[0], state.settings.names[1], null), { helpSeat: state.duel.helpSeat });
    useProfile(0); state.session.count += 1;
    if (state.session.count >= state.settings.cap) return endSession();
    state.index = pickNext(); state.duel.encId = current().id; startEncounter();
  }

  /* ---------- session ---------- */
  function pickNext(cur) {
    const list = state.encounters; if (cur === undefined) cur = state.index;
    if (state.session.rage >= RAGE_TARGET || onFire(state.stats)) {
      const earned = state.stats.cardsEarned || {};
      const boss = list.find((e, i) => e.boss && i !== cur && !earned[e.id]);
      if (boss && (state.session.bosses || 0) < 2) {
        state.session.rage = 0; state.session.bosses = (state.session.bosses || 0) + 1;
        toast("Glitch is furious. BOSS BOARD.", 2200); return list.indexOf(boss);
      }
    }
    if (state.session.reviews < 2) {
      const due = S.dueReviews(list, state.stats, now()).filter((e) => list.indexOf(e) !== cur);
      if (due.length) { state.session.reviews += 1; toast("Glitch demands a rematch!", 1800); return list.indexOf(due[0]); }
    }
    return S.pickNextIndex(list, state.stats, cur);
  }
  function nextEncounter() {
    state.session.count += 1;
    if (D.dayProgress(state.stats, state.day || 1).complete) return endSession();
    if (state.session.count >= state.settings.cap) return endSession();
    if (state.mode === "coop") { useProfile(state.active === 0 ? 1 : 0); toast(activeName() + "'s turn.", 1600); }
    state.index = pickNext(); startEncounter();
  }
  function endSession() {
    stopBlitz();
    const day = D.dayByNumber(state.day || 1);
    const pr = D.dayProgress(state.stats, day.n);
    const rank = S.agentRank(state.stats);
    const c = S.dailyChallenger(state.stats, now());
    const nxt = D.nextDay(day.n);
    const who = state.mode === "solo" ? activeName() : state.settings.names.join(" and ");

    const boss = S.bossHp(state.stats, now());
    $("end-title").textContent = pr.complete
      ? (boss.ko ? "KNOCKOUT! You beat " + boss.name + ", " + who + "!" : "Day " + day.n + " done, " + who + "!")
      : (state.session.won ? "Good run, " + who + "!" : "Paused");

    const bits = ["Fights won: " + state.session.won, "Criticals: " + state.session.crits];
    if (c.drop > 0) bits.push("Knocked " + c.drop + " off " + c.name + " today");
    bits.push("Off Glitch for good: " + S.knockedOff(state.stats));
    $("session-summary").textContent = bits.join("\u2009\u00b7\u2009");

    $("end-rank").textContent = rank.top
      ? "Rank: " + rank.title + ". The top one."
      : "Rank: " + rank.title + ". " + rank.cardsToNext + " more card" + (rank.cardsToNext === 1 ? "" : "s") + " to " + rank.next + ".";

    const btn = $("btn-next-day"), nudge = $("end-nudge");
    if (btn) {
      btn.hidden = !(pr.complete && nxt);
      if (pr.complete && nxt) btn.textContent = "Start Day " + nxt + ": " + D.dayByNumber(nxt).title;
    }
    if (nudge) {
      const second = (state.sitting || 0) >= 2;
      nudge.hidden = !(pr.complete && second);
      nudge.textContent = "Glitch will still be here tomorrow, and a new crony turns up with him.";
    }

    if (pr.complete && !nxt) {
      $("session-next").textContent = "That is every day finished. " + c.name + " is out of excuses.";
      const mini = $("next-mini"); if (mini) mini.innerHTML = "";
    } else {
      const peek = state.encounters[pickNext()] || D.fightsForDay(ALL, nxt || day.n)[0];
      $("session-next").textContent = "Next: " + (peek ? peek.hook : "a new trap.");
      if (peek) renderMini(peek);
    }
    $("session-end").hidden = false; state.phase = "end";
  }
  function startSession(mode) {
    state.mode = mode || "solo";
    state.settings.lastPlayed = now(); state.sitting = (state.sitting || 0) + 1;
    state.session = { count: 0, reviews: 0, won: 0, crits: 0, rage: 0 };
    useProfile(state.mode === "solo" ? state.settings.profile : 0);
    state.index = pickNext(-1); startEncounter();
  }
  function goHome() { state.mode = "solo"; state.duel = null; state.phase = "home"; stopBlitz(); useProfile(state.settings.profile); renderTeam(); renderPath(); hud(); show("screen-title"); }

  function renderMini(enc) {
    const host = $("next-mini"); if (!host) return;
    const map = F.piecesFromList(enc.pieces); let html = "";
    for (let r = 8; r >= 1; r--) for (let f = 0; f < 8; f++) {
      const name = FILES[f] + r, p = map[name], light = ((f + r) % 2 !== 0);
      html += '<div class="' + (light ? "light" : "dark") + '">' + (p && window.ShockmatePieces ? window.ShockmatePieces.svg(p.color, p.role) : "") + "</div>";
    }
    host.innerHTML = html;
  }

  /* ---------- collection ---------- */
  function renderCollection() {
    const rooms = {}; ALL.forEach((e) => { (rooms[e.palaceRoom] = rooms[e.palaceRoom] || []).push(e); });
    const root = $("palace-rooms"); root.innerHTML = "";
    const earned = state.stats.cardsEarned || {};
    $("collection-summary").textContent = activeName() + ": " + Object.keys(earned).length + " of " + ALL.length + " cards.";
    Object.keys(rooms).forEach((name) => {
      const div = document.createElement("div"); div.className = "room"; div.innerHTML = "<h3>" + name + "</h3>";
      rooms[name].forEach((e) => {
        const c = earned[e.id], f = document.createElement("div");
        f.className = "fig" + (c ? (c.critical ? " crit" : "") : " locked");
        const art = window.ShockmateMotifs ? window.ShockmateMotifs.icon(e.motif, 28) : "";
        f.innerHTML = '<div class="art">' + art + '</div><div class="txt"><b>' + (c ? (c.critical ? "★ " : "") + e.title : "Locked") + "</b><small>" + (c ? e.why : "Beat Glitch on this board to unlock.") + "</small></div>";
        div.appendChild(f);
      });
      root.appendChild(div);
    });
  }

  /* ---------- bindings ---------- */
  function readLogin() {
    if (!$("opt-code")) return;
    const s = state.settings.sync;
    s.code = Y.normaliseCode($("opt-code").value);
    s.players = [0, 1].map((i) => ({ username: Y.normaliseUser($("opt-user-" + i).value), pin: Y.normalisePin($("opt-pin-" + i).value) }));
    $("opt-code").value = s.code;
    [0, 1].forEach((i) => { $("opt-user-" + i).value = s.players[i].username; $("opt-pin-" + i).value = s.players[i].pin; });
    save();
  }
  function renderSettings() {
    $("opt-name-0").value = state.settings.names[0]; $("opt-name-1").value = state.settings.names[1]; $("opt-cap").value = state.settings.cap;
    $("opt-sound").checked = state.settings.sound; $("opt-coords").checked = state.settings.coords; $("opt-hurry").checked = state.settings.hurry;
    $("opt-blitz-0").checked = !!state.settings.blitz[0]; $("opt-blitz-1").checked = !!state.settings.blitz[1];
    const s = state.settings.sync || {};
    if ($("opt-code")) {
      $("opt-code").value = Y.normaliseCode(s.code);
      $("opt-url").value = s.url || ""; $("opt-key").value = s.anonKey || "";
      [0, 1].forEach((i) => {
        $("opt-user-" + i).value = (s.players && s.players[i] && s.players[i].username) || "";
        $("opt-pin-" + i).value = (s.players && s.players[i] && s.players[i].pin) || "";
      });
    }
    renderSyncState();
  }
  function switchProfile(i) { state.settings.profile = i; useProfile(i); save(); hud(); }
  function bind() {
    $("prof-0").onclick = () => switchProfile(0); $("prof-1").onclick = () => switchProfile(1);
    $("seat-1").onclick = () => { setSeats(1); save(); hud(); };
    $("seat-2").onclick = () => { setSeats(2); save(); hud(); };
    $("btn-names").onclick = () => { $("btn-settings").click(); };
    $("btn-start").onclick = () => startSession("solo");
    $("btn-coop").onclick = () => { startSession("coop"); toast(state.settings.names[0] + " starts. Take turns.", 2000); };
    $("btn-duel").onclick = startDuel;
    $("btn-duel-next").onclick = duelNextBoard;
    $("btn-duel-home").onclick = goHome;
    $("btn-next").onclick = nextEncounter;
    $("btn-peek").onclick = async function () {
      const enc = current(); $("btn-peek").hidden = true; show("screen-play"); state.phase = "busy";
      const start = F.piecesFromList(enc.pieces); banner("THE BIGGEST ONE", "win"); glitchSay("Ugh. THAT one.", "rage"); prompt("Best was " + enc.bestSan + ".");
      await playLine(enc.bestLineUci, start); finisher(enc); await sleep(900); showCard(enc, "best", false);
    };
    $("btn-replay").onclick = async function () {
      const enc = current(); show("screen-play"); state.phase = "busy"; const start = F.piecesFromList(enc.pieces);
      banner("GLITCH'S FUTURE", "miss"); glitchSay(enc.glitch.gloat, "smug"); prompt(enc.temptingSan + " — the bait."); clearMarks();
      await playLine(enc.temptingLineUci, start); await sleep(500);
      banner("YOUR FUTURE", "win"); glitchSay(enc.glitch.rage, "rage"); prompt(enc.bestSan + " — the move Glitch fears."); clearMarks();
      await playLine(enc.bestLineUci, start); finisher(enc); await sleep(900); showCard(enc, state.lastTier || "best", false);
    };
    $("btn-collection").onclick = function () { renderCollection(); show("screen-collection"); };
    $("btn-back-play").onclick = function () { show(state.phase === "card" ? "screen-card" : state.phase === "duel" ? "screen-duel" : state.phase === "think" || state.phase === "gate" ? "screen-play" : "screen-title"); };
    $("btn-settings").onclick = function () { renderSettings(); show("screen-settings"); };
    $("btn-export").onclick = exportBackup;
    $("btn-import").onclick = function () { $("file-import").click(); };
    $("file-import").onchange = function (ev) {
      const file = ev.target.files && ev.target.files[0]; if (!file) return;
      const r = new FileReader();
      r.onload = function () { importBackup(String(r.result)); };
      r.onerror = function () { toast("Could not read that file.", 2400); };
      r.readAsText(file); ev.target.value = "";
    };
    $("btn-save-api").onclick = function () {
      state.settings.sync.url = $("opt-url").value.trim().replace(/\/+$/, "");
      state.settings.sync.anonKey = $("opt-key").value.trim();
      save(); renderSettings();
      toast(Y.configured(syncCfg()) ? "API details saved on this device." : "Both fields are needed.", 2200);
    };
    $("btn-roster").onclick = function () {
      readLogin();
      if (!Y.validCode(state.settings.sync.code)) { $("roster-state").textContent = "That family code is too short."; return; }
      $("roster-state").textContent = "Looking up the family…";
      Y.roster(syncCfg(), state.settings.sync.code).then((rows) => {
        const list = $("roster-list"); list.innerHTML = "";
        (rows || []).forEach((r) => { const o = document.createElement("option"); o.value = r.username; o.label = r.display_name || r.username; list.appendChild(o); });
        if (!rows || !rows.length) { $("roster-state").textContent = "No players found for that code."; return; }
        $("roster-state").textContent = "Found: " + rows.map((r) => (r.display_name || r.username)).join(", ") + ". Pick two and add their PINs.";
        // Names follow the other apps, so the cards say what the kids are used to seeing.
        [0, 1].forEach((i) => {
          const match = (rows || []).filter((r) => r.username === Y.normaliseUser($("opt-user-" + i).value))[0];
          if (match && match.display_name) { state.settings.names[i] = match.display_name; $("opt-name-" + i).value = match.display_name; }
        });
        save(); hud();
      }).catch((err) => { $("roster-state").textContent = String(err && err.message || err); });
    };
    $("btn-sync").onclick = function () {
      readLogin();
      if (!Y.validCode(state.settings.sync.code)) { renderSyncState("That family code is too short."); return; }
      if (!syncSlots().some(Y.boundSlot)) { renderSyncState("Add a username and 4-digit PIN for at least one player."); return; }
      renderSyncState("Syncing…"); syncNow(false);
    };
    $("btn-close-settings").onclick = function () {
      state.settings.names = [$("opt-name-0").value.trim() || "Player 1", $("opt-name-1").value.trim() || "Player 2"];
      readLogin();
      state.settings.cap = Math.max(3, Math.min(12, Number($("opt-cap").value) || 6));
      state.settings.sound = $("opt-sound").checked; state.settings.coords = $("opt-coords").checked; state.settings.hurry = $("opt-hurry").checked;
      state.settings.blitz = [$("opt-blitz-0").checked, $("opt-blitz-1").checked];
      save(); hud(); setSeats(state.settings.seats); show("screen-title");
      if (syncOn()) syncNow(true);
    };
    $("btn-reset").onclick = function () {
      if (!confirm("Reset " + state.settings.names[state.settings.profile] + "'s cards and progress?")) return;
      state.profiles[state.active] = freshStats(); state.stats = state.profiles[state.active]; save(); hud(); toast("Reset done");
    };
    Array.prototype.forEach.call(document.querySelectorAll('#powers .pw[data-ability]'), function (btn) {
      const id = btn.dataset.ability; if (id === "tell") return;   // the Tell has its own handler below
      btn.onclick = function () {
        if (state.phase !== "think") return;
        const a = S.abilityById(id), b = S.battleOf(state.stats);
        if (b.next[id]) { toast(a.name + " is already armed.", 1400); return; }
        if (!S.canAfford(b, id)) { toast(a.name + " needs " + a.cost + " power. Win a fight.", 1800); return; }
        state.stats.battle = S.armAbility(b, id); save(); renderPowers();
        toast(a.name + " armed. " + a.blurb, 2200);
      };
    });
    $("btn-hint").onclick = function () {
      if (state.phase !== "think") return; const enc = current();
      if (!S.canAfford(state.stats.battle, "tell")) { toast("Glitch's Tell needs 1 power. Win a fight.", 1800); return; }
      state.stats.battle = S.armAbility(state.stats.battle, "tell"); save(); renderPowers();
      const el = sq(enc.tempting.slice(2, 4)); if (el) el.classList.add("tempt-glow"); toast("Glitch flinches at THAT one. So don't.", 2000);
    };
    $("btn-skip").onclick = function () { if (state.phase !== "think") return; nextEncounter(); };
    $("btn-end-ok").onclick = function () { $("session-end").hidden = true; goHome(); };
    if ($("btn-next-day")) $("btn-next-day").onclick = function () {
      const nxt = D.nextDay(state.day || 1);
      $("session-end").hidden = true;
      if (nxt) { setDay(nxt); save(); startSession(state.mode === "coop" ? "coop" : "solo"); }
      else goHome();
    };
    document.querySelector(".board-wrap").addEventListener("click", function () { if (state.phase === "busy") skipAhead(); }, true);
  }
  function selfTest() {
    const errors = []; const list = ALL;
    if (ALL.filter((e) => e.pack === "tactics").length !== 12) errors.push("tactics pack should hold 12 fights");
    PACKS.slice(1).forEach((p) => { if (!ALL.filter((e) => e.pack === p).length) errors.push(p + " pack is empty"); });
    list.forEach((e) => {
      if (!(e.legal[e.best.slice(0, 2)] || []).some((m) => m.uci === e.best)) errors.push(e.id + " best not legal");
      if (!e.moves || !e.moves[e.best] || e.moves[e.best].tier !== "best") errors.push(e.id + " best not tiered");
      if (!e.whyTargets || !e.whyTargets.squares.length) errors.push(e.id + " no why targets");
    });
    if (errors.length) console.error("self-test failed", errors);
    else console.log("Shockmate self-test passed: " + ALL.length + " fights across " + PACKS.length + " packs.");
  }
  load(); bind(); hud(); selfTest();
  window.__shockmate = { state, startEncounter, nextEncounter, current, startSession, startDuel, setDay, setSeats, syncNow, exportBackup, importBackup, all: ALL };
})();
