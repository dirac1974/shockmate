/* Shockmate arena v0.3 — Phase 0 "playable truth".
   States: home > think > tease > consequence > (secondTry | confession > guided) > gate > card > next | end.
   Engine is judge (pre-baked tiers). Animation is teacher. Nothing on screen goes down. Every fight is winnable. */
(function () {
  const F = window.ShockmateFutures, S = window.ShockmateScore;
  const FILES = "abcdefgh", KEY = "shockmate-v2";
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
    settings: { names: ["Player 1", "Player 2"], cap: 6, sound: true, coords: false, hurry: false, profile: 0, blitz: [false, false], pack: "tactics" },
    mode: "solo", pack: "tactics", active: 0, profiles: [null, null], duel: null, blitzTimer: null, speed: 1,
    stats: null,
  };
  const RAGE_TARGET = 4;

  /* ---------- storage ---------- */
  function freshStats() { return Object.assign(S.emptyStats(), { won: 0, criticals: 0, cardsEarned: {}, tiers: [] }); }
  function readProfile(i) {
    try { return Object.assign(freshStats(), JSON.parse(localStorage.getItem(KEY + ":p" + i) || "{}")); }
    catch (e) { return freshStats(); }
  }
  function useProfile(i) { state.active = i; state.stats = state.profiles[i]; }
  function loadStats() { state.profiles = [readProfile(0), readProfile(1)]; useProfile(state.settings.profile); }
  function load() {
    try { Object.assign(state.settings, JSON.parse(localStorage.getItem(KEY + ":settings") || "{}")); } catch (e) {}
    if (!Array.isArray(state.settings.blitz)) state.settings.blitz = [false, false];
    if (PACKS.indexOf(state.settings.pack) < 0) state.settings.pack = "tactics";
    setPack(state.settings.pack);
    loadStats();
  }
  function save() {
    try {
      localStorage.setItem(KEY + ":settings", JSON.stringify(state.settings));
      state.profiles.forEach((p, i) => localStorage.setItem(KEY + ":p" + i, JSON.stringify(p)));
    } catch (e) {}
  }
  function activeName() { return state.settings.names[state.active]; }
  function setPack(name) {
    state.pack = PACKS.indexOf(name) >= 0 ? name : "tactics";
    state.encounters = ALL.filter((e) => e.pack === state.pack);
    state.settings.pack = state.pack; state.index = 0;
    PACKS.forEach((p) => { const b = $("pack-" + p); if (b) b.classList.toggle("active", p === state.pack); });
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
    if (window.ShockmateGlitch) return window.ShockmateGlitch.set(mood || "taunt", text || "");
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
  function prompt(text) { $("prompt").textContent = text; }
  function hud() {
    $("stat-won").textContent = state.stats.won || 0;
    $("stat-crit").textContent = state.stats.criticals || 0;
    $("stat-cards").textContent = Object.keys(state.stats.cardsEarned || {}).length;
    [0, 1].forEach((i) => { const b = $("prof-" + i); b.textContent = state.settings.names[i]; b.classList.toggle("active", (state.mode === "solo" ? state.settings.profile : state.active) === i); });
    renderPath(); renderTeam();
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
    paintSelection(); renderTeam(); startBlitz(); hud();
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
    const crit = tier === "best" && !state.guided && !state.lastCritical && (enc.boss || Math.random() < 1 / 6);
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
    const earned = state.stats.cardsEarned[enc.id] || { critical: false, tries: 0 };
    earned.critical = earned.critical || crit; earned.tries = state.tries + 1; earned.t = now(); state.stats.cardsEarned[enc.id] = earned;
    state.stats.won = (state.stats.won || 0) + 1; state.session.won += 1;
    if (state.mode !== "solo") { state.session.rage = Math.min(RAGE_TARGET, state.session.rage + 1); renderTeam(); }
    save(); hud();
    if (state.mode === "duel") return duelSeatDone(enc, true);
    showCard(enc, tier, crit);
  }
  async function missFlow(enc, move, tier, start, afterMap) {
    banner("GLITCH'S FUTURE", "miss"); glitchSay(enc.glitch.gloat, "smug");
    state.stats = S.recordAttempt(state.stats, enc, { correct: false, san: move.san, t: now() }).stats;
    (state.stats.tiers = state.stats.tiers || []).push(tier); if (state.stats.tiers.length > 8) state.stats.tiers.shift(); save();
    if (move.uci === enc.tempting && enc.temptingLineUci.length > 1) await playLine(enc.temptingLineUci.slice(1), afterMap);
    else await sleep(600);
    await sleep(500);
    if (state.mode === "duel") return duelSeatDone(enc, false);
    state.tries += 1;
    if (state.tries === 1) {
      banner("SECOND TRY", "tease"); setPieces(start); clearMarks(); glitchSay("Sweating? Me? Never.", "nervous"); prompt("Try again. Glitch is sweating.");
      state.phase = "think"; paintSelection(); return;
    }
    // confession: show the better future, then the kid plays it
    banner("THE BETTER FUTURE", "win"); glitchSay("Fine. FINE. Here is what I was scared of.", "nervous"); setPieces(start); await sleep(500);
    await playLine(enc.bestLineUci, start); finisher(enc); await sleep(800);
    banner("YOUR TURN", "tease"); setPieces(start); clearMarks(); state.guided = true; state.phase = "think";
    prompt("Now you play it: " + enc.bestSan); paintSelection();
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
    $("card-title").textContent = crit ? "CRITICAL card earned" : (state.tries > 0 ? "Card earned (Glitch needed " + (state.tries + 1) + " tries to get you)" : "Card earned");
    $("why-mascot").textContent = enc.mascot; $("why-text").textContent = enc.why; $("why-long").textContent = enc.whyLong;
    $("glitch-line-2").textContent = "Glitch: " + enc.glitch.rage;
    $("btn-peek").hidden = !(tier === "good" && state.lastUci !== enc.best);
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
    if (state.session.count >= state.settings.cap) return endSession();
    if (state.mode === "coop") { useProfile(state.active === 0 ? 1 : 0); toast(activeName() + "'s turn.", 1600); }
    state.index = pickNext(); startEncounter();
  }
  function endSession() {
    const nxt = state.encounters[pickNext()];
    stopBlitz();
    $("end-title").textContent = state.session.won ? (state.mode === "solo" ? "Mission complete" : "Team mission complete") : "Mission paused";
    const cards = state.mode === "solo"
      ? Object.keys(state.stats.cardsEarned).length + "/" + ALL.length
      : state.settings.names.map((n, i) => n + " " + Object.keys(state.profiles[i].cardsEarned).length).join(" · ");
    $("session-summary").textContent = "Fights won: " + state.session.won + " · Criticals: " + state.session.crits + " · Cards: " + cards;
    $("session-next").textContent = "Next time: " + nxt.hook + " Glitch says: \"You got lucky. I have a new trap ready.\"";
    renderMini(nxt);
    $("session-end").hidden = false; state.phase = "end";
  }
  function startSession(mode) {
    state.mode = mode || "solo";
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
  function switchProfile(i) { state.settings.profile = i; useProfile(i); save(); hud(); }
  function bind() {
    $("prof-0").onclick = () => switchProfile(0); $("prof-1").onclick = () => switchProfile(1);
    PACKS.forEach((p) => { const b = $("pack-" + p); if (b) b.onclick = () => { setPack(p); save(); hud(); }; });
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
    $("btn-settings").onclick = function () {
      $("opt-name-0").value = state.settings.names[0]; $("opt-name-1").value = state.settings.names[1]; $("opt-cap").value = state.settings.cap;
      $("opt-sound").checked = state.settings.sound; $("opt-coords").checked = state.settings.coords; $("opt-hurry").checked = state.settings.hurry;
      $("opt-blitz-0").checked = !!state.settings.blitz[0]; $("opt-blitz-1").checked = !!state.settings.blitz[1]; show("screen-settings");
    };
    $("btn-close-settings").onclick = function () {
      state.settings.names = [$("opt-name-0").value.trim() || "Player 1", $("opt-name-1").value.trim() || "Player 2"];
      state.settings.cap = Math.max(3, Math.min(12, Number($("opt-cap").value) || 6));
      state.settings.sound = $("opt-sound").checked; state.settings.coords = $("opt-coords").checked; state.settings.hurry = $("opt-hurry").checked;
      state.settings.blitz = [$("opt-blitz-0").checked, $("opt-blitz-1").checked];
      save(); hud(); show("screen-title");
    };
    $("btn-reset").onclick = function () {
      if (!confirm("Reset " + state.settings.names[state.settings.profile] + "'s cards and progress?")) return;
      state.profiles[state.active] = freshStats(); state.stats = state.profiles[state.active]; save(); hud(); toast("Reset done");
    };
    $("btn-hint").onclick = function () {
      if (state.phase !== "think") return; const enc = current();
      const el = sq(enc.tempting.slice(2, 4)); if (el) el.classList.add("tempt-glow"); toast("Glitch wants THAT one. So don't.", 2000);
    };
    $("btn-skip").onclick = function () { if (state.phase !== "think") return; nextEncounter(); };
    $("btn-end-ok").onclick = function () { $("session-end").hidden = true; goHome(); };
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
  window.__shockmate = { state, startEncounter, nextEncounter, current, startSession, startDuel, setPack, all: ALL };
})();
