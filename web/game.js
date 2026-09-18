/* Shockmate arena v0.3 — Phase 0 "playable truth".
   States: home > think > tease > consequence > (secondTry | confession > guided) > gate > card > next | end.
   Engine is judge (pre-baked tiers). Animation is teacher. Nothing on screen goes down. Every fight is winnable. */
(function () {
  const F = window.ShockmateFutures, S = window.ShockmateScore, D = window.ShockmateDays;
  const FILES = "abcdefgh", KEY = "shockmate-v2";
  // Read this off the home screen to tell what a phone actually loaded — Pages and the
  // service worker both cache, so "I don't see the new screen" is usually a stale copy.
  const BUILD = "v0.25";
  const Y = window.ShockmateSync, H = window.ShockmateShort, P = window.ShockmatePlay, V = window.ShockmateVersus, L = window.ShockmateLive;
  const X = window.ShockmateFlash;
  const E = () => window.ShockmateEngine;          // lazily loaded: it is 650 KB of Stockfish
  let CHESS = null;                                 // vendor/chess.js, loaded with it
  const EVAL_DEPTH = 10;                            // the depth the judge scores at. Never shown, never spoken.
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
    camp: null, flash: null, seen: {}, lineHistory: {}, lastPlay: {}, thinkAt: 0, lastThinkMs: null, cardNews: null, sittingDays: [0, 0], look: null,
    game: null, playIdx: {}, review: null, fromGame: false, pre: null, engineScripts: null,
    // versus: the board turns round to whoever is to move, so the arena needs to know which way up it is
    flip: false, vs: null, versusResult: null,
    settings: { names: ["Player 1", "Player 2"], cap: 6, sound: true, coords: true, hurry: false, profile: 0, blitz: [false, false], short: [false, false], coach: [null, null], pack: "tactics", day: 1, tournament: false, readAloud: true, seats: 1, syncedAt: 0,
      parent: { name: "", pin: "" }, play: [null, null], versus: { lastWhite: null, saved: null },
      // The family this phone belongs to: the code, which kid this phone plays as (`me`), the kids'
      // PINs this phone knows, and the roster names. `skipped` means "this phone only", asked once.
      family: { code: "", me: null, pins: ["", ""], roster: [], skipped: false }, live: null },
    mode: "solo", pack: "tactics", active: 0, nav: 0, prep: false, profiles: [null, null], duel: null, blitzTimer: null, speed: 1,
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

  /* ---------- family sync ----------
     The URL and publishable key are baked into sync-config.js; nothing about the backend is ever
     typed on a phone. A slot syncs when this phone knows that kid's PIN: the phone that made the
     family knows both, a phone that joined knows its own kid's. */
  function syncCfg() { return window.SHOCKMATE_SYNC && window.SHOCKMATE_SYNC.url ? window.SHOCKMATE_SYNC : null; }
  function fam() { return state.settings.family; }
  function blankFamily(skipped) { return { code: "", me: null, pins: ["", ""], roster: [], skipped: !!skipped }; }
  function syncOn() { return !!(Y && Y.configured(syncCfg()) && Y.syncSlots(fam()).length); }
  function familyJoined() { return !!(Y && Y.configured(syncCfg()) && Y.joined(fam())); }

  function applyMerged(profiles, names) {
    state.profiles = [0, 1].map((i) => Object.assign(freshStats(), profiles[i]));
    if (names && names[0]) state.settings.names = [names[0], names[1] || state.settings.names[1]];
    useProfile(state.settings.profile); save(); renderPath(); hud();
  }
  // Roster names are the family's names: the server is where a rename lands, so it wins here.
  function applyRoster(rows) {
    const f = fam(); if (!rows || !rows.length) return;
    f.roster = rows.map((r) => ({ slot: r.slot, name: r.name }));
    rows.forEach((r) => { if (r.name) state.settings.names[r.slot] = r.name; });
  }

  // One round trip per slot this phone can sync: pull the other phone's copy, merge both ways, push
  // the result. Merging (never overwriting) means an old phone coming back online cannot delete a card.
  let syncing = null;
  function syncNow(quiet) {
    if (!syncOn()) return Promise.resolve(false);
    if (syncing) return syncing;
    const f = fam(), cfg = syncCfg(), code = f.code;
    const jobs = Y.syncSlots(f).map((i) => Y.pull(cfg, code, i, f.pins[i]).then((remote) => {
      state.profiles[i] = Object.assign(freshStats(), Y.mergeStats(state.profiles[i], remote || {}));
      return Y.push(cfg, code, i, f.pins[i], state.profiles[i]);
    }));
    jobs.push(Y.familyRoster(cfg, code).then(applyRoster).catch(() => {}));
    syncing = Promise.all(jobs).then(() => {
      state.settings.syncedAt = Date.now(); useProfile(state.settings.profile); save(); renderPath(); hud(); renderFamilyCard();
      if (!quiet) toast("Cards synced.", 1800);
      return true;
    }).catch((err) => {
      // Silent and non-destructive: nothing local is touched by a failed sync.
      renderFamilyCard(String((err && err.message) || err));
      if (!quiet) toast("Sync could not finish. Cards are safe on this phone.", 2600);
      return false;
    }).then((ok) => { syncing = null; return ok; });
    return syncing;
  }

  let syncTimer = null;
  function syncSoon() {   // after a card is earned; coalesced so a fast session makes one call
    if (!syncOn() || syncTimer) return;
    syncTimer = setTimeout(() => { syncTimer = null; syncNow(true); }, 4000);
  }

  function renderFamilyCard(problem) {
    const on = $("family-on"), off = $("family-off");
    if (!on || !off) return;
    const f = fam(), has = Y.validCode(f.code);
    on.hidden = !has; off.hidden = has;
    if (!has) return;
    $("family-code").textContent = f.code;
    const me = Y.validSlot(f.me) ? state.settings.names[f.me] : "";
    $("family-who").textContent = me ? "This phone plays as " + me + "." : "This phone has not picked a player.";
    const el = $("sync-state");
    if (problem) el.textContent = problem;
    else if (!Y.syncSlots(f).length) el.textContent = "Pick this phone's player to sync.";
    else if (!state.settings.syncedAt) el.textContent = "Ready. Nothing synced yet.";
    else el.textContent = "Last synced " + new Date(state.settings.syncedAt).toLocaleString() + ".";
  }
  // Kept for the old name: the e2e suite and window.__shockmate callers use it.
  function renderSyncState(problem) { renderFamilyCard(problem); }

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
      // The coach comes back with the cards. A PIN already set on this device wins, so restoring an
      // old file can never lock the parent out of the phone he is holding (see sync.importBlob).
      const merged = Y.importBlob(text, state.profiles, state.settings);
      if (merged.parent) state.settings.parent = { name: merged.parent.name || "", pin: merged.parent.pin || "" };
      applyMerged(merged.profiles, merged.names);
      renderSettings(); toast("Cards restored and merged.", 2200);
    } catch (err) { toast(String(err && err.message || err), 2600); }
  }
  function loadStats() { state.profiles = [readProfile(0), readProfile(1)]; useProfile(state.settings.profile); }
  function load() {
    try { Object.assign(state.settings, JSON.parse(localStorage.getItem(KEY + ":settings") || "{}")); } catch (e) {}
    if (!Array.isArray(state.settings.blitz)) state.settings.blitz = [false, false];
    if (!Array.isArray(state.settings.short)) state.settings.short = [false, false];
    if (!Array.isArray(state.settings.coach)) state.settings.coach = [null, null];
    // An unfinished game per kid. It lives in settings, not in the profile, because a half-played
    // game is a thing about this device; cards and counters are the things that travel.
    if (!Array.isArray(state.settings.play)) state.settings.play = [null, null];
    // Who was White last time the two of them played each other, and an unfinished one to pick up.
    state.settings.versus = Object.assign({ lastWhite: null, saved: null }, state.settings.versus);
    // Coordinates became the default, as on every chess site; older saved settings had them off.
    if (!state.settings.coordsV2) { state.settings.coords = true; state.settings.coordsV2 = true; }
    if (!(state.settings.day >= 1 && state.settings.day <= D.DAYS.length)) state.settings.day = 1;
    state.settings.parent = Object.assign({ name: "", pin: "" }, state.settings.parent);
    // v0.21 and earlier kept a hand-typed URL, key and username login here; the backend is baked in now.
    delete state.settings.sync;
    const fm = state.settings.family = Object.assign(blankFamily(false), state.settings.family);
    fm.code = Y.validCode(fm.code) ? Y.normaliseCode(fm.code) : "";
    fm.pins = [0, 1].map((i) => Y.normalisePin((fm.pins || [])[i]));
    fm.me = Y.validSlot(fm.me) ? fm.me : null;
    if (!Array.isArray(fm.roster)) fm.roster = [];
    setSeats(state.settings.seats === 2 ? 2 : 1);
    setDay(state.settings.day);
    loadVoiceManifest(); loadStats();
    if (syncOn()) syncNow(true);
  }
  function save() {
    try {
      // The recorders in score.js are pure and hand back a NEW stats object, so the live profile has
      // to be pointed at it before anything is written, or a session's card stats never reach storage.
      if (state.stats && state.profiles[state.active]) state.profiles[state.active] = state.stats;
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
      + " take turns on this phone. Team up and Duel: you both play White. Play each other: you take a colour.";
  }
  function setPrepDay() {
    const avoid = D.dayByNumber(state.settings.day || D.currentDay(state.stats)).ids;
    state.prep = true; state.day = 0;
    // Boards from his own games lead Prep: prepFights takes anything in pack "game" first.
    state.encounters = S.prepFights(state.stats, playPool(), 4, avoid); state.index = 0;
    renderDayStrip();
  }
  function dayDone() {
    if (state.prep) { const earned = (state.stats && state.stats.cardsEarned) || {}; return state.encounters.length > 0 && state.encounters.every(function (e) { return !!earned[e.id]; }); }
    return D.dayProgress(state.stats, state.day || 1).complete;
  }
  function setDay(n) {
    state.prep = false;
    const day = D.dayByNumber(Number(n) || 1);
    state.day = day.n; state.settings.day = day.n;
    state.encounters = D.fightsForDay(ALL, day.n); state.index = 0;
    renderDayStrip();
  }
  // "Rated 600 to 800", "600-800", "600–800": whatever the blurb says, as a short band for the stop.
  function ratingBand(text) {
    const m = String(text || "").match(/(\d{3,4})\s*(?:-|–|—|to)\s*(\d{3,4})/);
    if (m) return m[1] + "–" + m[2];
    const one = String(text || "").match(/\b(\d{3,4})\+?\b/);
    return one ? one[0] : "";
  }
  function renderDayStrip() {
    const host = $("day-strip"); if (!host) return;
    const cur = state.day || 1;
    const weak = S.weakestMotifs(state.stats).filter(function (m) { return m.rate < 1; }).slice(0, 2);
    // A map, not a menu: numbered stops on a path. Prep is the side quest at the start.
    const prepChip = '<button class="day-chip prep' + (state.prep ? " current" : "") + '" data-day="0"><span class="n">★</span>' +
      '<span class="t">Prep</span><small>' + (weak.length ? weak.map(function (m) { return S.motifLabel(m.motif); }).join(" + ") : "opening traps") + '</small></button>';
    // Camp is a session, not a stop: tapping it starts one. It counts once a day and can be replayed.
    const campDone = S.campDoneToday(state.stats, now());
    const campChip = '<button class="day-chip camp' + (campDone ? " done" : "") + '" data-day="-1"><span class="n">⚑</span>' +
      '<span class="t">Camp</span><small>' + (campDone ? "done today ✓" : "8 minutes") + '</small></button>';
    // Flash is its own two minutes beside Camp, and it is also Camp's first four boards. Counted once
    // a day like Camp, replayable as often as he likes, and nothing about it locks.
    const flashDone = S.flashDoneToday(state.stats, now());
    const flashChip = '<button class="day-chip flash' + (flashDone ? " done" : "") + '" data-day="-2"><span class="n">⚡</span>' +
      '<span class="t">Flash</span><small>' + (flashDone ? "done today ✓" : "2 minutes") + '</small></button>';
    host.innerHTML = campChip + flashChip + prepChip + D.DAYS.map(function (d) {
      const pr = D.dayProgress(state.stats, d.n), open = D.dayUnlocked(state.stats, d.n);
      const cls = ["day-chip"];
      // Ladder days are rungs, not numbered stops: a rung glyph, and the rating band off the blurb.
      if (d.ladder) cls.push("ladder");
      if (pr.complete) cls.push("done");
      if (!state.prep && d.n === cur) cls.push("current");
      if (!open) cls.push("locked");
      return '<button class="' + cls.join(" ") + '" data-day="' + d.n + '"' + (open ? "" : " disabled") +
        '><span class="n">' + (pr.complete ? "✓" : d.ladder ? "≡" : d.n) + '</span><span class="t">' + d.title + '</span><small>' +
        (d.ladder && ratingBand(d.blurb) ? ratingBand(d.blurb) + " · " : "") + pr.done + "/" + pr.total + '</small></button>';
    }).join("");
    // Keep the day he is on in the middle of the map, so day 20 is not hiding off the right edge.
    const on = host.querySelector(".day-chip.current");
    if (on && on.scrollIntoView && document.body.dataset.screen === "screen-title") {
      try { on.scrollIntoView({ block: "nearest", inline: "center" }); } catch (e) {}
    }
    Array.prototype.forEach.call(host.querySelectorAll(".day-chip"), function (b) {
      b.onclick = function () {
        const n = Number(b.dataset.day);
        if (n === -1) return startCamp();
        if (n === -2) return startFlash();
        if (n === 0) setPrepDay(); else setDay(n);
        renderPath(); hud();
      };
    });
    if ($("day-blurb")) $("day-blurb").textContent = state.prep
      ? (S.prepSource(state.stats) === "misses"
        ? "Four fights picked from what you have missed. Slow down. Ask the two questions."
        : "No misses yet, so Prep drills opening traps. Slow down. Ask the two questions.")
      : D.dayByNumber(cur).blurb;
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
  function show(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    $(id).classList.add("active");
    if ($("btn-home")) $("btn-home").hidden = id === "screen-title";
    document.body.dataset.screen = id;
  }
  function stale(nav) { return nav !== state.nav; }
  function toast(msg, ms) { const t = $("toast"); t.hidden = false; t.textContent = msg; clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, ms || 1600); }
  function banner(text, tone) {
    const b = $("banner"); b.className = "banner" + (tone ? " " + tone : ""); b.textContent = text || ""; b.hidden = !text;
  }
  /* Every line Glitch says comes off a table (score.js, play.js, versus.js) through S.pickLine, which
     never repeats any of the last five said at that moment. The history lives on `state.lineHistory`
     for the whole sitting, across fights, games and screens. The bubble shows the line with the name
     filled in; the voice plays its key, whose audio is the same line without it.
     `how`: "now" (default) cuts off whatever is playing; "next" waits for it; "quiet" shows only. */
  function pickFrom(table, hist, vars) {
    const l = S.pickLine(table, state.lineHistory[hist]); state.lineHistory[hist] = l.history;
    return { text: S.fillLine(l.text, vars), mood: l.mood, key: l.key, index: l.index };
  }
  function sayFrom(table, hist, vars, how) {
    const l = pickFrom(table, hist, vars); glitchSay(l.text, l.mood, l.key, how); return l;
  }
  function glitchMoment(kind, vars, how) { return sayFrom(S.GLITCH_LINES[kind], "moment." + kind, vars, how); }
  // The ones he says in a toast rather than the bubble.
  function glitchToast(kind, ms, how) {
    const l = pickFrom(S.GLITCH_LINES[kind], "moment." + kind);
    toast("Glitch: " + l.text, ms); speak(l.key, how); return l;
  }
  function speak(key, how) {
    if (!key || how === "quiet") return false;
    return how === "next" ? voiceNext([key]) : voice(key);
  }
  function glitchSay(text, mood, key, how) {
    speak(key, how);
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
    // A whole game has no candidate squares to light and no single right move, so the blitz clock
    // has nothing to help with. It stays out of Play entirely.
    if (playing() || !state.settings.blitz[state.active] || state.mode === "duel") return stopBlitz();
    b.hidden = false; b.classList.remove("run"); $("blitz-fill").style.width = "100%"; void b.offsetWidth; b.classList.add("run");
    state.speed = 0.6;
    state.blitzTimer = setTimeout(() => {
      if (state.phase !== "think") return;
      current().candidates.forEach((sqr) => sq(sqr) && sq(sqr).classList.add("cand"));
      glitchMoment("blitz");                 // silent table: the think window stays quiet
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
    $("crony-name").textContent = c.name;
    $("crony-real").textContent = c.real;
    $("crony-fill").style.width = Math.round(c.fraction * 100) + "%";
    $("crony-line").textContent = c.cardsToday
      ? c.name + " claimed " + c.claimed + " this morning. You have taken " + c.drop + " off him today."
      : c.name + " is standing in for Glitch today. He says he is " + c.claimed + ".";
    if ($("btn-start")) $("btn-start").innerHTML = (c.ko ? "Rematch " : "Fight ") + "<span>" + c.name + "</span>";
    renderPacing();
    const art = $("home-glitch");
    if (art && window.ShockmateGlitch) {
      art.innerHTML = window.ShockmateGlitch.svg(c.ko ? "nervous" : "taunt");
      art.dataset.wilt = String(window.ShockmateGlitch.wiltTier(c.fraction));
    }
    const nm = state.settings.names[state.settings.profile] || "Player";
    if ($("you-name")) $("you-name").textContent = state.seats === 2 ? state.settings.names[0] + " + " + state.settings.names[1] : nm;
    if ($("you-avatar")) $("you-avatar").textContent = state.seats === 2 ? "2" : nm.trim().charAt(0).toUpperCase();
    if ($("you-wins")) $("you-wins").textContent = state.stats.won || 0;
  }
  /* Pacing: two days finished in one sitting and the arcade button offers Camp instead, in Glitch's
     voice, for the rest of the sitting. Soft: the day he picked is one tap away underneath. */
  function pacingOn() { return S.pacingNudge(state.sittingDays[state.settings.profile], S.campDoneToday(state.stats, now())); }
  function renderPacing() {
    const on = pacingOn(), btn = $("btn-start"), any = $("btn-anyway");
    if (btn && on) btn.innerHTML = "Camp instead?";
    if (btn) btn.classList.toggle("nudge", on);
    if (any) { any.hidden = !on || state.seats === 2; any.textContent = (state.prep ? "Prep" : "Day " + (state.day || 1)) + " anyway"; }
    if (on) {
      if (!state.pacingLine) state.pacingLine = glitchMoment("pacing");   // one line per sitting, not one per redraw
      if ($("crony-line")) $("crony-line").textContent = "Glitch: " + state.pacingLine.text;
    }
  }
  function renderBoss() {
    const box = $("boss"); if (!box) return;
    const b = S.bossHp(state.stats, now());
    box.hidden = state.phase === "home";
    box.classList.toggle("ko", b.ko);
    $("boss-name").textContent = b.ko ? b.name + " \u00b7 KO" : b.name + (b.weak ? "  \u00b7  weak to " + S.motifLabel(b.weak) : "");
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
  function renderAgent() {
    const box = $("agent"); if (!box) return;
    const rank = S.agentRank(state.stats), b = S.battleOf(state.stats), open = S.slotsUnlocked(rank);
    $("agent-rank").textContent = rank.title;
    $("agent-next").textContent = rank.top ? "Top rank. Every slot is yours."
      : rank.cardsToNext + " more card" + (rank.cardsToNext === 1 ? "" : "s") + " to " + rank.next + ".";
    const host = $("gear-slots"); let html = "";
    for (let s = 1; s <= S.SLOTS; s++) {
      const eq = b.gear["slot" + s], piece = eq ? S.gearById(eq) : null;
      if (s > open) {
        const need = S.RANKS[s] ? S.RANKS[s].title : "";
        html += '<div class="gear-slot locked"><span class="slot-n">SLOT ' + s + '</span>Locked<small><br>reach ' + need + '</small></div>';
        continue;
      }
      const choices = S.gearUnlocked(rank).filter(function (g) { return g.slot === s; });
      html += '<div class="gear-slot' + (piece ? " filled" : "") + '"><span class="slot-n">SLOT ' + s + '</span>' +
        (piece ? '<span class="equipped">' + piece.name + '</span><small>' + piece.blurb + '</small>' : '<span class="equipped">Empty</span>') +
        '<div class="pick">' + choices.map(function (g) {
          return '<button data-slot="' + s + '" data-gear="' + g.id + '" class="' + (eq === g.id ? "on" : "") + '">' + g.name + '</button>';
        }).join("") + '</div></div>';
    }
    host.innerHTML = html;
    Array.prototype.forEach.call(host.querySelectorAll("button[data-gear]"), function (btn) {
      btn.onclick = function () {
        const s = Number(btn.dataset.slot), id = btn.dataset.gear, cur = S.battleOf(state.stats).gear["slot" + s];
        state.stats.battle = cur === id ? S.unequipGear(state.stats.battle, s) : S.equipGear(state.stats.battle, s, id, S.agentRank(state.stats));
        save(); renderAgent();
        toast(cur === id ? "Unequipped." : S.gearById(id).name + " equipped. " + S.gearById(id).blurb, 2000);
      };
    });
  }
  // The parent view. Reads both profiles, never the live one only, so a kid who is not the active
  // profile still shows up. Everything here is derived; nothing is written.
  function esc(t) { return String(t == null ? "" : t).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }
  function tile(value, label) { return '<div class="tile"><b>' + esc(value) + "</b><small>" + esc(label) + "</small></div>"; }
  function renderProgress() {
    const root = $("progress-root"); if (!root) return;
    const firsts = [];
    let html = "";
    [0, 1].forEach(function (i) {
      const st = state.profiles[i] || freshStats(), name = state.settings.names[i] || ("Player " + (i + 1));
      const p = S.progressSummary(st, ALL, now());
      firsts.push({ name: name, note: p.coachNotes[0] || "" });
      const max = Math.max.apply(null, p.byDay.map(function (d) { return d.n; }).concat([1]));
      const initial = (name.trim().charAt(0) || "?").toUpperCase();
      html += '<section class="prog-kid">' +
        '<div class="prog-head"><div class="avatar sm">' + esc(initial) + "</div>" +
          '<div class="prog-who"><h3>' + esc(name) + '</h3><span class="ribbon">' + esc(p.rank.title) + "</span></div>" +
          '<b class="prog-cards">' + p.cards + "/" + p.total + "<small>cards</small></b></div>" +
        '<div class="tiles">' +
          tile(p.camp.days + " \u00b7 " + p.camp.best, "Camp days \u00b7 best run") +
          tile(p.threats.found + "/" + p.threats.asked, "Threats spotted") +
          tile(p.firstTry.cards ? Math.round(p.firstTryRate * 100) + "%" : "\u2014", "First try") +
          /* Flash sits between first-try rate and the games row on purpose: those are the two numbers
             the drill is supposed to move, and the only way to judge it is to read the three together. */
          tile(p.flash.items ? Math.round(p.flash.rate * 100) + "% \u00b7 " + p.flash.days : "\u2014", "Flash \u00b7 days") +
          tile(p.thisWeek.campDays + " \u00b7 " + p.thisWeek.cards, "This week: camp \u00b7 cards") +
          // Wrong moves made in under four seconds, of all timed moves. The parent's number, never the kid's.
          tile(p.rush.moves ? p.rush.rushed + "/" + p.rush.moves : "\u2014", "Rushed") +
          // Whole games against Glitch: played, won, and the highest crony he has actually beaten.
          tile(p.games.played ? p.games.played + " \u00b7 " + p.games.wins : "\u2014", "Games \u00b7 won") +
          tile(p.games.bestLevelWon ? S.levelName(p.games.bestLevelWon) : "\u2014", "Best level beaten") +
          /* Versus: how many games he has played against his sibling and how often he had each
             colour. His own row, on his own card. There is deliberately no result breakdown and no
             row anywhere on this screen that puts the two kids' numbers next to each other. */
          tile(p.versus.played ? p.versus.played + " \u00b7 " + p.versus.asWhite + "/" + p.versus.asBlack : "\u2014", "Versus \u00b7 W/B") +
          tile(p.bestMoves.length || "\u2014", "Best moves") +
        "</div>" +
        (p.bestMove
          ? '<p class="prog-line good"><b>Best moves:</b> ' + p.bestMoves.length + " kept. Latest: " +
            esc(p.bestMove.san) + (p.bestMove.n ? " on move " + p.bestMove.n : "") + ".</p>"
          : "") +
        // Blunders per game, oldest left. The parent's trend line; the kid never sees it.
        (p.blunderTrend.length
          ? '<div class="prog-bars blunders" title="blunders per game, last 10 games">' +
            p.blunderTrend.map(function (d) {
              const top = Math.max.apply(null, p.blunderTrend.map(function (x) { return x.blunders; }).concat([1]));
              return '<i style="height:' + Math.round(4 + 30 * d.blunders / top) + 'px" title="' +
                esc(S.levelName(d.level)) + ": " + d.blunders + " in " + d.moves + ' moves"></i>';
            }).join("") + "</div>"
          : "") +
        '<p class="prog-suggest"><b>Next game:</b> ' + esc(S.levelName(p.suggest.level)) + " \u2014 " + esc(p.suggest.reason) +
          " He picks the level himself; this is only what the app would offer.</p>" +
        '<p class="prog-line good"><b>Good at:</b> ' + (p.goodAt.length ? esc(p.goodAt.join(", ")) : "nothing yet, keep playing") + "</p>" +
        '<p class="prog-line focus"><b>Focus on:</b> ' + (p.focusOn.length ? esc(p.focusOn.join(", ")) : "nothing flagged") + "</p>" +
        // The coach's own voice, in the villain's colour: this screen is behind the gate, not in the
        // kid's world, so purple here reads as "not for you" rather than as a friendly control.
        '<div class="coach-says"><b>Coach says</b>' +
          p.coachNotes.map(function (n) { return "<p>" + esc(n) + "</p>"; }).join("") + "</div>" +
        '<div class="prog-bars" title="cards earned per day, last 14 days">' +
          p.byDay.map(function (d) { return '<i style="height:' + Math.round(4 + 36 * d.n / max) + 'px" title="' + esc(d.key) + ": " + d.n + '"></i>'; }).join("") +
        "</div>" +
        '<table class="prog-table"><thead><tr><th>Motif</th><th>Met</th><th>Hit rate</th><th>Misses</th><th></th></tr></thead><tbody>' +
        p.motifs.map(function (m) {
          return '<tr class="' + m.verdict + '"><td>' + esc(m.label) + "</td><td>" + m.fights + "/" + m.total + "</td><td>" +
            (m.attempts ? Math.round(m.rate * 100) + "%" : "\u2014") + "</td><td>" + m.misses + "</td><td>" + m.verdict + "</td></tr>";
        }).join("") +
        "</tbody></table></section>";
    });
    // What the parent actually carries to the venue. The two questions verbatim, the scoresheet
    // pause that is legal under US Chess rules, and one line per kid off his own data.
    html += '<section class="prog-kid checklist"><h3>Tournament checklist</h3><ol class="check-list">' +
      S.PREP_QUESTIONS.map(function (q) { return "<li>" + esc(q) + "</li>"; }).join("") +
      "<li>Write the move on the scoresheet before playing it. It is legal, and it buys the pause.</li></ol>" +
      firsts.map(function (f) { return '<p class="prog-line"><b>' + esc(f.name) + ":</b> " + esc(f.note) + "</p>"; }).join("") +
      "</section>";
    root.innerHTML = html;
  }
  function prompt(text) { $("prompt").textContent = text; }
  function hud() {
    $("stat-won").textContent = state.stats.won || 0;
    $("stat-crit").textContent = state.stats.criticals || 0;
    $("stat-cards").textContent = Object.keys(state.stats.cardsEarned || {}).length;
    if ($("stat-rank")) $("stat-rank").textContent = S.agentRank(state.stats).title;
    renderCrony(); renderBoss(); renderAgent();
    if ($("two-hint")) $("two-hint").textContent = state.settings.names[0] + " and " + state.settings.names[1]
      + " take turns on this phone. Team up and Duel: you both play White. Play each other: you take a colour.";
    // During play the board never flips, so the note doubles as "whose go is it" in co-op.
    if ($("turn-note")) $("turn-note").textContent = activeName() + " is White.";  // the co-op turn banner already says whose go it is
    [0, 1].forEach((i) => { const b = $("prof-" + i); b.textContent = state.settings.names[i]; b.classList.toggle("active", state.seats !== 2 && (state.mode === "solo" ? state.settings.profile : state.active) === i); });
    if ($("build-tag")) $("build-tag").textContent = BUILD + " \u00b7 " + ALL.length + " fights \u00b7 " + D.DAYS.length + " days";
    renderBrag(); renderPath(); renderTeam(); renderResume(); renderVersusResume(); renderLive();
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
  /* ---------- voice: spoken lines, if the parent has generated them ----------
     web/voice/manifest.json lists what exists. If it is missing, every call here is a silent no-op,
     so the feature ships before any audio does. One channel: a new line stops the one before it.
     For a kid whose listening is far ahead of his reading, the hook and the why are the lines that matter. */
  const VOICE = { manifest: null, current: null, queue: [] };
  function loadVoiceManifest() {
    if (typeof fetch !== "function") return;
    fetch("voice/manifest.json", { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (m) { VOICE.manifest = m && m.files ? m : null; })
      .catch(function () { VOICE.manifest = null; });
  }
  // The parent picks the register per kid. Never inferred from age or rank.
  function wantsShort() { return !!(state.settings.short && state.settings.short[state.active]); }
  // The register the coach speaks in for this kid. Parent-set; falls back to the short-lines flag.
  function coachStyle(i) { return S.coachStyleOf(state.settings, i == null ? state.active : i); }
  function coach(ctx) { return S.coachLine(coachStyle(), ctx); }
  function voiceOn() { return !!(state.settings.readAloud !== false && VOICE.manifest); }
  function voicePlay(key) {
    if (!voiceOn()) return false;
    const file = VOICE.manifest.files[key]; if (!file) return false;
    if (VOICE.current) { try { VOICE.current.pause(); } catch (e) {} }
    const a = new Audio("voice/" + file); VOICE.current = a;
    const done = function () { if (VOICE.current !== a) return; VOICE.current = null; const next = VOICE.queue.shift(); if (next) voicePlay(next); };
    a.onended = done; a.onerror = done;
    const p = a.play(); if (p && p.catch) p.catch(done);
    return true;
  }
  // Every per-fight line goes through here. Generated ladder fights carry `voice`, a template key
  // ("fork-v2"), so a hundred fights share one set of audio; hand-made fights fall back to their id.
  // A fight made from a kid's own game before v0.23 has no `voice`; it speaks as its motif's lines.
  function voiceKeyFor(enc, kind) {
    if (enc && !enc.voice && enc.pack === "game") return "game-" + (P.TEXT[enc.motif] ? enc.motif : "counting") + "-" + kind;
    return ((enc && (enc.voice || enc.id)) || "") + "-" + kind;
  }
  function voice(key) { VOICE.queue = []; return voicePlay(key); }
  function voiceSeq(keys) { if (!keys || !keys.length) return; VOICE.queue = keys.slice(1); voicePlay(keys[0]); }
  // After whatever is playing, so a Glitch reaction is never cut off by the line that follows it.
  function voiceNext(keys) {
    if (!keys || !keys.length || !voiceOn()) return false;
    if (VOICE.current) { VOICE.queue = VOICE.queue.concat(keys); return true; }
    voiceSeq(keys); return true;
  }
  function voiceStop() {
    VOICE.queue = [];
    if (VOICE.current) { const a = VOICE.current; VOICE.current = null; try { a.pause(); } catch (e) {} }
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
  /* A fight never flips: every fight in the app is white-to-move with the kid's pieces at the bottom,
     and the art, the prompts and the why-gate all assume it. Versus is the one place two people are
     sharing one screen, so the board turns round to whoever is to move — the way it would if they
     were sitting opposite each other at a table. `state.flip` is only ever true inside a versus game;
     the square names never change, so every other piece of code is untouched by it. */
  function renderBoard() {
    const board = $("board"); board.innerHTML = "";
    const ranks = state.flip ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
    const files = state.flip ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
    ranks.forEach((r, ri) => files.forEach((f, fi) => {
      const name = FILES[f] + r, cell = document.createElement("div");
      cell.className = "sq " + (((f + r) % 2 === 0) ? "dark" : "light"); cell.dataset.sq = name;
      // The labels ride the drawn edges, not the absolute ones, so a flipped board is still readable.
      if (state.settings.coords && fi === 0) { const c = document.createElement("span"); c.className = "coord rank"; c.textContent = String(r); cell.appendChild(c); }
      if (state.settings.coords && ri === 7) { const c = document.createElement("span"); c.className = "coord file"; c.textContent = FILES[f]; cell.appendChild(c); }
      const p = state.pieces[name];
      if (p) { const el = document.createElement("div"); el.className = "piece " + p.color; el.textContent = GLYPH[p.color + p.role]; cell.appendChild(el); }
      if (state.last && (state.last.from === name || state.last.to === name)) cell.classList.add("last");
      cell.addEventListener("click", () => onSquare(name));
      board.appendChild(cell);
    }));
    paintSelection();
  }
  function clearMarks() { document.querySelectorAll(".sq").forEach((el) => { el.className = el.className.replace(/\b(sel|legal|cap|cand|guide|best-glow|tempt-glow|gate-target|gate-ok|gate-hint|flash-from|fork-glow|pin-freeze|skewer-stab|door-slam|laser|poison)\b/g, "").trim(); }); }
  function paintSelection() {
    if (playing()) return paintPlay();
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
  // `last` is the move that just happened, shaded on the board the way every chess site does it.
  function setPieces(map, last) { state.pieces = F.clonePieces(map); state.last = last || null; renderBoard(); }
  function onSquare(name) {
    if (state.phase === "gate") return gateTap(name);
    if (state.phase === "threat") return threatTap(name);
    if (state.phase === "flash") return flashTap(name);
    if (state.phase !== "think") return;
    if (playing()) return playSquare(name);
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
      const step = F.applyUci(map, uci); map = step.pieces; setPieces(map, step);
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
  // Every fight opens on Glitch's move, so "what did that move just attack?" has a move to point at.
  async function startEncounter() {
    const enc = current(), nav = state.nav, arrive = F.arriveOf(enc);
    state.selected = null; state.tries = 0; state.guided = false; state.lastTier = null; state.phase = "arrive";
    const start = F.piecesFromList(enc.pieces);
    clearMarks(); $("fx").innerHTML = ""; $("board").classList.remove("dim"); $("gate-dots").innerHTML = "";
    banner(""); glitchSay(enc.glitch.taunt, "taunt"); prompt(enc.hook);
    $("btn-hint").hidden = true; $("btn-skip").hidden = true; if ($("ritual")) $("ritual").hidden = true; show("screen-play");
    renderTeam(); hud(); renderPowers();
    if (arrive && enc.arrivePosition) {
      setPieces(F.piecesFromPack(enc.arrivePosition)); await sleep(T(650)); if (stale(nav)) return;
      setPieces(start, arrive); const dest = sq(arrive.to) && sq(arrive.to).querySelector(".piece"); if (dest) dest.classList.add("pop"); sfx("move");
      await sleep(T(350)); if (stale(nav)) return;
    } else setPieces(start);
    // Look first: in Tournament week and in Camp, one tap on what that move attacked, before the
    // think window and before the think clock. Brief by rule (S.LOOK); it can never hold him longer.
    const targets = F.threatTargets(enc);
    if (S.lookFirst(state.settings, campOn(), enc, targets)) {
      const seen = await lookFirstGate(enc, targets);
      if (seen !== "open" || stale(nav)) return;          // he left, or skipped the board from the gate
    }
    openThink(enc);
  }
  function enterThink() { state.phase = "think"; state.thinkAt = now(); }
  function openThink(enc) {
    enterThink();
    const qs = S.prepQuestionsFor(enc);
    // Camp runs the tournament ritual whatever the settings toggle says: the ritual IS the session.
    const ritualOn = state.settings.tournament || campOn();
    if ($("ritual")) { $("ritual").hidden = !ritualOn; $("ritual").textContent = qs.join("   "); }
    // After Glitch's look-first reaction, never over it.
    voiceNext([voiceKeyFor(enc, "hook")].concat(ritualOn ? qs.map((q, i) => "prep-q" + (i + 1)) : []));
    $("btn-hint").hidden = false; $("btn-skip").hidden = false;
    state.helpThisFight = needsHelp(state.stats) || (state.mode === "duel" && state.duel && state.duel.helpSeat === state.active);
    paintSelection(); startBlitz();
  }
  async function commitMove(move) {
    const enc = current(); state.phase = "busy"; state.selected = null; paintSelection();
    // Think time: from the think window opening to this tap. Stored per attempt; S.recordMove decides "rushed".
    state.lastThinkMs = state.thinkAt ? Math.max(0, now() - state.thinkAt) : null; state.thinkAt = 0;
    const start = F.piecesFromList(enc.pieces); const step = F.applyUci(start, move.uci); setPieces(step.pieces, step);
    const dest = sq(step.to) && sq(step.to).querySelector(".piece"); if (dest) dest.classList.add("pop"); sfx("move");
    if (step.captured) explode(step.to, false);
    stopBlitz();
    const tier = state.guided ? "best" : (enc.moves[move.uci] || {}).tier || "blunder";
    state.lastTier = tier; state.lastUci = move.uci; $("btn-hint").hidden = true; $("btn-skip").hidden = true; if ($("ritual")) $("ritual").hidden = true;
    // tease: both futures charge
    banner("SPLITTING TIME…", "tease"); $("board").classList.add("dim"); $("timelines").hidden = false;
    glitchMoment("tease"); sfx("tease");
    await sleep(700); $("board").classList.remove("dim"); $("timelines").hidden = true;
    if (tier === "best" || tier === "good") await hitFlow(enc, move, tier, step.pieces);
    else await missFlow(enc, move, tier, start, step.pieces);
  }
  async function hitFlow(enc, move, tier, afterMap) {
    const nav = state.nav;
    banner("YOUR FUTURE", "win"); glitchSay(enc.glitch.rage, "rage", voiceKeyFor(enc, "rage"), "next");
    state.stats = S.recordAttempt(state.stats, enc, { correct: true, san: move.san, t: now(), hurry: state.settings.hurry, thinkMs: state.lastThinkMs }).stats;
    // `tries` counts the misses so far on this board, so zero means he found it first go.
    if (campOn() && state.camp.stage !== "warm") { state.camp.fights += 1; if (!state.tries) state.camp.firstTry += 1; }
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
    if (tier === "good") glitchToast("bigger", 2200, "next");
    save(); hud();
    if (stale(nav)) return;                                  // he left mid-animation; do not open a gate behind him
    await whyGate(enc);
    state.stats = S.recordWhy(state.stats, enc, { ok: true, t: now(), hurry: state.settings.hurry }).stats;
    state.ratingBefore = S.glitchRating(state.stats).real; state.rankBefore = S.agentRank(state.stats).index; state.hpBefore = S.bossHp(state.stats, now()).hp;   // read before the card lands, shown on the card screen
    // A confession win (Glitch showed it, the kid played it) earns a cracked card; a clean win repairs one.
    const ec = S.earnCard(state.stats.cardsEarned[enc.id], { critical: crit, tries: state.tries + 1, t: now(), tier: tier, guided: state.guided });
    state.stats.cardsEarned = Object.assign({}, state.stats.cardsEarned); state.stats.cardsEarned[enc.id] = ec.earned;
    state.cardNews = ec.cracked ? "cracked" : ec.repaired ? "repaired" : null;
    state.stats.battle = S.earnPower(state.stats.battle, crit);
    let hpNow = S.bossHp(state.stats, now());
    const hit = S.resolveHitDamage(state.stats.battle, (state.hpBefore || hpNow.hp) - hpNow.hp, hpNow.dateKey);
    state.stats.battle = hit.battle;
    const wk = S.resolveWeakness(state.stats.battle, hit.dmg, enc.motif, S.bossHp(state.stats, now()).weak, hpNow.dateKey);
    state.stats.battle = wk.battle; hpNow = S.bossHp(state.stats, now());
    const dmg = wk.dmg;
    banner((wk.weak ? "WEAKNESS HIT!  -" : hit.doubled ? "DOUBLE STRIKE!  -" : crit ? "CRITICAL HIT!  -" : "HIT!  -") + dmg, (crit || hit.doubled || wk.weak) ? "crit" : "win");
    renderPowers();
    renderBoss(); await sleep(650);
    if (hpNow.ko && state.koShown !== hpNow.dateKey) {
      state.koShown = hpNow.dateKey;
      state.stats.battle = S.recordKo(state.stats.battle);
      banner("KNOCKOUT!  " + hpNow.name + " is done", "crit"); sfx("crit"); voice("sys-ko");
      glitchMoment("ko", { name: hpNow.name }, "next"); await sleep(1100);
    }
    syncSoon();
    state.stats.won = (state.stats.won || 0) + 1; state.session.won += 1;
    if (state.mode !== "solo") { state.session.rage = Math.min(RAGE_TARGET, state.session.rage + 1); renderTeam(); }
    save(); hud();
    if (stale(nav)) return;                                  // he left; his card is saved, the screen stays home
    if (state.mode === "duel") return duelSeatDone(enc, true);
    showCard(enc, tier, crit);
  }
  async function missFlow(enc, move, tier, start, afterMap) {
    const nav = state.nav;
    const missRes = S.resolveMiss(state.stats.battle); state.stats.battle = missRes.battle;
    if (missRes.shielded) { banner("TIME SHIELD", "tease"); glitchMoment("shield", null, "next"); renderPowers(); }
    else { banner("GLITCH'S FUTURE", "miss"); glitchSay(enc.glitch.gloat, "smug", voiceKeyFor(enc, "gloat"), "next"); }
    state.stats = S.recordAttempt(state.stats, enc, { correct: false, san: move.san, t: now(), thinkMs: state.lastThinkMs }).stats;
    (state.stats.tiers = state.stats.tiers || []).push(tier); if (state.stats.tiers.length > 8) state.stats.tiers.shift(); save();
    if (move.uci === enc.tempting && enc.temptingLineUci.length > 1) await playLine(enc.temptingLineUci.slice(1), afterMap);
    else await sleep(600);
    await sleep(500);
    if (stale(nav)) return;
    if (state.mode === "duel") return duelSeatDone(enc, false);
    state.tries += 1;
    if (state.tries === 1) {
      banner("SECOND TRY", "tease"); setPieces(start, F.arriveOf(enc)); clearMarks(); glitchMoment("second"); prompt("Try again. Glitch is sweating."); voiceNext(["sys-second"]);
      enterThink(); paintSelection(); renderPowers(); return;
    }
    // confession: show the better future, then the kid plays it
    banner("THE BETTER FUTURE", "win"); glitchMoment("confess"); setPieces(start, F.arriveOf(enc)); await sleep(500);
    await playLine(enc.bestLineUci, start); finisher(enc); await sleep(800);
    banner("YOUR TURN", "tease"); setPieces(start, F.arriveOf(enc)); clearMarks(); state.guided = true; enterThink();
    prompt("Now you play it: " + enc.bestSan); paintSelection(); renderPowers();
  }
  function whyGate(enc) {
    return new Promise((resolve) => {
      const targets = enc.whyTargets.squares.slice();
      state.gate = { targets, found: [], wrong: 0, resolve };
      // Rewind to the moment the reason is visible, so the prompt matches the board.
      const start = F.piecesFromList(enc.pieces), nav = state.nav;
      const rewind = enc.whyTargets.at !== "after";
      const played = F.applyUci(start, enc.best);
      // A good-but-not-best move still wins, but the gate is about the best move. Say so, and play it
      // on the board from the start, so the board never changes to a move the kid did not see.
      const other = state.lastUci && state.lastUci !== enc.best && !state.guided;
      const open = () => {
        if (stale(nav) || state.gate === null) return;
        state.phase = "gate";
        banner(rewind ? "REWIND" : "LOCK IT IN", "tease");
        glitchMoment("whyGate");
        prompt(enc.whyTargets.prompt);
        clearMarks(); renderDots(); $("prompt").classList.add("gate-prompt");
      };
      if (!other) { if (rewind) setPieces(start, F.arriveOf(enc)); else setPieces(played.pieces, played); return open(); }
      state.phase = "busy"; setPieces(start, F.arriveOf(enc));
      banner("BEST WAS " + enc.bestSan, "win"); prompt("Your move works. The best was " + enc.bestSan + ". Watch.");
      setTimeout(() => {
        if (stale(nav)) return;
        if (!rewind) { setPieces(played.pieces, played); const d = sq(played.to) && sq(played.to).querySelector(".piece"); if (d) d.classList.add("pop"); sfx("move"); }
        setTimeout(open, T(rewind ? 300 : 900));
      }, T(1400));
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
      if (g.wrong === 1) glitchToast("whyNope");
      if (g.wrong >= 2) { const hint = g.targets.find((t) => !g.found.includes(t)); if (hint) sq(hint).classList.add("gate-hint"); }
    }
  }
  function showCard(enc, tier, crit) {
    state.phase = "card"; renderPath(); $("prompt").classList.remove("gate-prompt");
    $("card-title").textContent = crit ? "CRITICAL KNOCKDOWN" : (state.tries > 0 ? "YOU BEAT GLITCH after " + (state.tries + 1) + " tries" : "YOU BEAT GLITCH");
    if ($("card-spoils")) { $("card-spoils").hidden = false; $("card-spoils").textContent = enc.title; }
    if ($("card-art")) $("card-art").innerHTML = window.ShockmateMotifs ? window.ShockmateMotifs.icon(enc.motif, 86) : "";
    if ($("why-card")) { $("why-card").classList.toggle("crit", !!crit); $("why-card").classList.remove("deal"); void $("why-card").offsetWidth; $("why-card").classList.add("deal"); }
    const short = wantsShort();
    if (!(short && voice(voiceKeyFor(enc, "short")))) voice(voiceKeyFor(enc, "why"));
    $("why-mascot").textContent = enc.mascot; $("why-text").textContent = H.whyFor(enc, short); $("why-long").textContent = enc.whyLong;
    // The words-style kid gets the rule behind the fight, not just the fight. Once per motif per day,
    // so a card he has seen four times does not keep repeating it. The map lives in memory on purpose.
    const pl = $("card-principle");
    if (pl) {
      const rule = S.principleFor(enc.motif), seen = S.dateKey(now()) + ":" + state.active + ":" + enc.motif;
      const showRule = coachStyle() === "words" && !!rule && !state.seen[seen];
      pl.hidden = !showRule; pl.textContent = showRule ? rule : "";
      if (showRule) state.seen[seen] = true;
    }
    $("glitch-line-2").textContent = enc.glitch.rage;
    // A cracked or repaired card is said once, the moment it happens, in his register, and Glitch
    // answers it in his own voice on the card: a gloat for a crack, a tantrum for a repair.
    const news = state.cardNews; state.cardNews = null;
    const crackLine = $("card-crack"), cracked = S.cardCracked(state.stats, enc.id);
    if ($("why-card")) $("why-card").classList.toggle("cracked", cracked);
    if (crackLine) {
      crackLine.hidden = !news;
      crackLine.textContent = news ? coach({ kind: news }) : "";
      crackLine.classList.toggle("fixed", news === "repaired");
    }
    if (news) { const g = glitchMoment(news, null, "next"); $("glitch-line-2").textContent = g.text; }   // after the why, not over it
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
      tick.innerHTML = fell > 0 ? "<b>\u2212" + fell + "</b><span>Glitch " + before + " \u2192 " + after.real + "</span>" : "";
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
      banner("HOT SEAT", "tease"); glitchMoment("hotSeat");
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

  /* ---------- camp: the daily tournament-prep session ----------
     Fixed shape, about eight to ten minutes, one per kid per day, and it never locks anything:
       1. three "spot the attack" warm-ups — Glitch's arriving move plays, the kid taps what it hit
       2. four prep fights with the ritual on
       3. two counter-attack boards from the defence pack, or two more prep fights while it is absent
       4. a debrief in his own register, and the two questions read aloud again.
     Everything it says goes through S.coachLine, so the two kids get two different sessions off one
     run of code. Warm-ups reuse the why-gate mechanics: same dots, same shake, same hint after two. */
  function campOn() { return !!state.camp; }
  function hasThreat(e) { return F.threatTargets(e).length > 0; }
  function startCamp() {
    useProfile(state.settings.profile);
    const style = coachStyle(state.active);
    const plan = S.campPlan(state.stats, playPool(), { hasThreat: hasThreat, supports: flashSupports(style) });
    state.camp = { plan: plan, style: style, stage: "flash", w: 0, i: 0,
      threatsAsked: 0, threatsFound: 0, wrongTaps: 0, clean: 0, firstTry: 0, fights: 0,
      flashAsked: 0, flashRight: 0 };
    state.prep = false; state.day = 0; state.mode = "solo"; state.duel = null;
    state.sitting = (state.sitting || 0) + 1;
    state.settings.lastPlayed = now();
    state.session = { count: 0, reviews: 0, won: 0, crits: 0, rage: 0 };
    state.encounters = plan.warmups.length ? plan.warmups : plan.boards;
    state.index = 0; state.phase = "busy";
    show("screen-play"); banner("CAMP", "tease"); glitchMoment("campStart");
    prompt(S.coachLine(style, { kind: "campStart" }));
    voiceNext(["prep-q1", "prep-q2"]);     // the two questions, at the start of every camp, after Glitch
    hud(); renderPowers();
    setTimeout(campFlash, T(1200));
  }
  // Camp opens on two Flash boards, then two spot-the-attack boards. Both are the same habit — look
  // at the whole board before you touch anything — asked two different ways in the same four minutes.
  function campFlash() {
    const c = state.camp; if (!c) return;
    const items = flashItems(c.plan.flash, c.style);
    if (!items.length) return campWarmups();
    openFlash(items, c.style, true);
    toast(S.coachLine(c.style, { kind: "flashStart", count: items.length, revealMs: state.flash.revealMs }), 2600);
    flashNext();
  }
  function campWarmups() {
    const c = state.camp; if (!c) return;
    c.stage = "warm"; c.w = 0;
    state.encounters = c.plan.warmups.length ? c.plan.warmups : c.plan.boards;
    state.index = 0;
    toast(S.coachLine(c.style, { kind: "phase", phase: "warm" }), 2600);
    nextWarmup();
  }
  async function nextWarmup() {
    const c = state.camp; if (!c) return;
    const nav = state.nav;
    if (c.w >= c.plan.warmups.length) return campFights();
    state.encounters = c.plan.warmups; state.index = c.w;
    const enc = c.plan.warmups[c.w], targets = F.threatTargets(enc);
    if (!targets.length) { c.w += 1; return nextWarmup(); }   // a move that attacks nothing has no question
    state.phase = "busy"; state.selected = null; state.tries = 0; state.guided = false; state.gate = null;
    clearMarks(); $("fx").innerHTML = ""; $("board").classList.remove("dim"); $("gate-dots").innerHTML = "";
    $("btn-hint").hidden = true; $("btn-skip").hidden = true; $("prompt").classList.remove("gate-prompt");
    banner("SPOT THE ATTACK  " + (c.w + 1) + "/" + c.plan.warmups.length, "tease");
    glitchMoment("campWatch"); prompt("Glitch is moving…");
    if ($("ritual")) { $("ritual").hidden = false; $("ritual").textContent = S.PREP_QUESTIONS[0]; }
    show("screen-play"); renderPath(); hud(); renderPowers();
    const after = F.piecesFromList(enc.pieces), arrive = F.arriveOf(enc);
    if (enc.arrivePosition) {
      setPieces(F.piecesFromPack(enc.arrivePosition)); await sleep(650); if (stale(nav) || !state.camp) return;
    }
    setPieces(after, arrive);
    const dest = sq(arrive.to) && sq(arrive.to).querySelector(".piece"); if (dest) dest.classList.add("pop");
    sfx("move"); await sleep(400); if (stale(nav) || !state.camp) return;
    state.phase = "threat";
    state.gate = { targets: targets.slice(), found: [], wrong: 0, resolve: null, camp: true };
    prompt(S.coachLine(c.style, { kind: "threat", count: targets.length }));
    $("prompt").classList.add("gate-prompt"); renderDots(); voiceNext(["prep-q1"]);
    $("btn-skip").hidden = false;
  }
  /* ---------- look first: one tap on what Glitch's move attacked, then the think window ----------
     The Camp warm-up mechanic, cut to one tap. A right tap opens the think window; two wrong taps
     light the hint; a third shows him the answer and opens it anyway. It never holds him longer. */
  function lookFirstGate(enc, targets) {
    return new Promise((resolve) => {
      state.phase = "threat";
      state.gate = { targets: targets.slice(), found: [], wrong: 0, resolve: resolve, look: true };
      banner("LOOK FIRST", "tease");
      prompt(coach({ kind: "lookFirst" })); $("prompt").classList.add("gate-prompt");
      $("gate-dots").innerHTML = "<span></span>";
      voiceNext(["prep-q1"]);                // after his move line in Play, never over it
      $("btn-skip").hidden = false;
    });
  }
  function lookRecord(g, found) {
    state.stats = S.recordThreat(state.stats, { targets: 1, found: found ? 1 : 0, wrongTaps: g.wrong }).stats; save();
    const c = state.camp;
    if (c) { c.threatsAsked += 1; c.threatsFound += found ? 1 : 0; c.wrongTaps += g.wrong; }
  }
  function lookDone(found) {
    const g = state.gate; if (!g || !g.look) return;
    const nav = state.nav;
    state.gate = null; state.phase = "busy";
    lookRecord(g, found);
    $("prompt").classList.remove("gate-prompt");
    if (found) { $("gate-dots").innerHTML = '<span class="on"></span>'; banner("SEEN", "win"); prompt(coach({ kind: "lookSeen" })); glitchMoment("lookRight"); }
    else {
      g.targets.forEach((t) => sq(t) && sq(t).classList.add("gate-ok"));
      banner("THERE", "tease"); prompt(coach({ kind: "lookGive" })); glitchMoment("lookGive");
    }
    setTimeout(() => {
      $("gate-dots").innerHTML = "";
      if (stale(nav)) return;
      clearMarks(); g.resolve("open");
    }, T(found ? 700 : 1300));
  }
  function lookTap(name) {
    const g = state.gate;
    if (g.targets.indexOf(name) >= 0) { g.found.push(name); sq(name).classList.add("gate-ok"); sfx("win"); return lookDone(true); }
    g.wrong += 1; const el = sq(name); el.classList.remove("nope"); void el.offsetWidth; el.classList.add("nope"); sfx("nope");
    glitchMoment("lookWrong");
    if (g.wrong >= S.LOOK.giveAfter) return lookDone(false);
    if (g.wrong >= S.LOOK.hintAfter) {
      const hint = g.targets[0]; if (hint && sq(hint)) sq(hint).classList.add("gate-hint");
      prompt(coach({ kind: "threatHint", count: 1 }));
    }
  }
  function threatTap(name) {
    if (state.gate && state.gate.look) return lookTap(name);
    const g = state.gate, c = state.camp; if (!g || !c) return;
    if (g.targets.indexOf(name) >= 0 && g.found.indexOf(name) < 0) {
      g.found.push(name); sq(name).classList.add("gate-ok"); sq(name).classList.remove("gate-hint"); sfx("win"); renderDots();
      if (g.found.length === g.targets.length) threatDone();
      return;
    }
    if (g.found.indexOf(name) >= 0) return;
    g.wrong += 1; const el = sq(name); el.classList.remove("nope"); void el.offsetWidth; el.classList.add("nope"); sfx("nope");
    if (g.wrong === 1) glitchToast("campNope");
    if (g.wrong >= 2) {
      const hint = g.targets.find((t) => g.found.indexOf(t) < 0);
      if (hint) sq(hint).classList.add("gate-hint");
      prompt(S.coachLine(c.style, { kind: "threatHint", count: g.targets.length - g.found.length }));
    }
  }
  function threatDone() {
    const g = state.gate, c = state.camp;
    state.phase = "busy"; state.gate = null; $("gate-dots").innerHTML = ""; $("prompt").classList.remove("gate-prompt");
    c.threatsAsked += g.targets.length; c.threatsFound += g.found.length; c.wrongTaps += g.wrong;
    if (!g.wrong) c.clean += 1;
    state.stats = S.recordThreat(state.stats, { targets: g.targets.length, found: g.found.length, wrongTaps: g.wrong }).stats;
    save();
    banner("SPOTTED", "win"); glitchMoment("campSpotted");
    prompt(S.coachLine(c.style, { kind: "threatDone", count: g.targets.length, wrong: g.wrong }));
    c.w += 1;
    setTimeout(function () { if (state.camp) nextWarmup(); }, T(1100));
  }
  function campFights() {
    const c = state.camp; if (!c) return;
    c.stage = "fights"; c.i = 0;
    state.encounters = c.plan.boards; state.index = 0;
    if ($("ritual")) $("ritual").textContent = S.PREP_QUESTIONS.join("   ");
    toast(S.coachLine(c.style, { kind: "phase", phase: "fights" }), 2600);
    startEncounter();
  }
  function campNext() {
    const c = state.camp;
    c.i += 1;
    if (c.i >= state.encounters.length) return endSession();
    if (c.i === c.plan.fights.length) {
      c.stage = "counter";
      banner("COUNTER-ATTACK", "tease");
      toast(S.coachLine(c.style, { kind: "phase", phase: "counter" }), 2800);
    }
    state.index = c.i; startEncounter();
  }
  function campEnd() {
    const c = state.camp; if (!c || state.phase === "end") return;   // a double tap on the last card must not count twice
    const style = c.style;
    const at = now(), key = S.dateKey(at);
    const already = S.campDoneToday(state.stats, at);   // read before the day is marked, so a replay can say so
    state.stats.camp = S.recordCampDay(state.stats.camp, key);
    const d = S.campDebrief(state.stats, { threatsAsked: c.threatsAsked, threatsFound: c.threatsFound,
      firstTry: c.firstTry, fights: c.fights }, style);
    save(); hud();
    const who = activeName();
    $("end-title").textContent = "Camp done, " + who + "!";
    $("session-summary").textContent = d.line;
    $("end-rank").textContent = already ? "That is camp again today. It counted once; the practice counts every time."
      : "Camp days: " + S.campDaysDone(state.stats) + ". Best run: " + S.campOf(state.stats).best + ".";
    if ($("end-say")) { $("end-say").hidden = false; $("end-say").textContent = d.say; }
    if ($("end-nudge")) $("end-nudge").hidden = true;
    if ($("btn-next-day")) $("btn-next-day").hidden = true;
    $("session-next").textContent = style === "numbers"
      ? "Camp is 2 flash, 2 spot checks, 4 fights, 2 counters. Same tomorrow."
      : "Tomorrow is the same shape: two flashes, spot what he attacks, four fights, two where he attacks you.";
    const mini = $("next-mini"); if (mini) { mini.innerHTML = ""; mini.hidden = true; }   // no next board to peek at
    voiceSeq(["prep-q1", "prep-q2"]);      // and again at the end, so they are the last thing he hears
    $("session-end").hidden = false; state.phase = "end";
  }

  /* ---------- flash: two minutes of board vision ----------
     A position goes up for a few seconds and is taken away, and he is asked one thing about what it
     MEANT — what was hanging, where Glitch's queen stood, what the last move hit, how many pieces
     were on his king. The harder rung leaves the board alone and makes him hold a move in his head.

     Rules kept: the reveal window is quiet (Glitch says his line before the board arrives and then
     shuts up), one tap or one chip per item, a hint after two wrong and the answer on the third, and
     nothing on the screen counts down — the ring empties instead. Every question a board can carry
     is computed in web/flash.js, which never touches the DOM. */
  function flashOn() { return !!state.flash; }
  function flashSupports(style) { return function (e, t) { return X.supports(e, t, { style: style }); }; }
  function flashItems(planItems, style) {
    const out = [];
    (planItems || []).forEach(function (it) {
      const item = X.makeItem(it.enc, it.type, { style: style });
      if (item) { item.enc = it.enc; out.push(item); }
    });
    return out;
  }
  function openFlash(items, style, inCamp) {
    state.flash = { items: items, i: 0, correct: 0, wrong: 0, style: style, inCamp: !!inCamp,
      revealMs: S.flashRevealMs(state.stats) };
    state.encounters = items.map(function (i) { return i.enc; });
    state.index = 0; state.phase = "busy";
  }
  function startFlash() {
    useProfile(state.settings.profile);
    const style = coachStyle(state.active);
    const plan = S.flashPlan(state.stats, playPool(), S.FLASH_N, { supports: flashSupports(style) });
    const items = flashItems(plan.items, style);
    if (!items.length) return toast("Flash needs a board or two first. Win a fight.", 2600);
    state.camp = null; state.prep = false; state.day = 0; state.mode = "solo"; state.duel = null;
    state.sitting = (state.sitting || 0) + 1; state.settings.lastPlayed = now();
    state.session = { count: 0, reviews: 0, won: 0, crits: 0, rage: 0 };
    openFlash(items, style, false);
    show("screen-play"); banner("FLASH", "tease"); glitchMoment("flashReveal");
    prompt(S.coachLine(style, { kind: "flashStart", count: items.length, revealMs: state.flash.revealMs }));
    hud(); renderPowers();
    setTimeout(flashNext, T(1200));
  }
  // The ring is a meter: it empties over the reveal and is never a digit on screen.
  const RING = 106.8;                     // 2 pi r for the r=17 circle in index.html
  function flashRing(ms, ghost) {
    const box = $("flash-ring"), run = $("flash-ring-run"); if (!box || !run) return;
    box.hidden = false; box.classList.toggle("ghost", !!ghost);
    run.style.transition = "none"; run.style.strokeDashoffset = "0";
    void run.getBoundingClientRect();
    run.style.transition = "stroke-dashoffset " + Math.max(60, T(ms)) + "ms linear";
    run.style.strokeDashoffset = String(RING);
  }
  function flashRingOff() { const box = $("flash-ring"); if (box) box.hidden = true; }
  // The imagine move, said once on the board and then withdrawn. After this he is on his own.
  function ghostArrow(from, to) {
    const fx = $("fx"), a = sq(from), b = sq(to); if (!fx || !a || !b) return;
    const p = fx.getBoundingClientRect(), r1 = a.getBoundingClientRect(), r2 = b.getBoundingClientRect();
    const x1 = r1.left - p.left + r1.width / 2, y1 = r1.top - p.top + r1.height / 2;
    const x2 = r2.left - p.left + r2.width / 2, y2 = r2.top - p.top + r2.height / 2;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "ghost-arrow");
    svg.setAttribute("width", String(Math.round(p.width))); svg.setAttribute("height", String(Math.round(p.height)));
    svg.innerHTML = '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"/>' +
      '<circle cx="' + x2 + '" cy="' + y2 + '" r="11"/>';
    fx.appendChild(svg);
  }
  function clearGhost() { const fx = $("fx"); if (fx) fx.innerHTML = ""; }
  function flashChips(list, answered) {
    const host = $("flash-chips"); if (!host) return;
    if (!list) { host.hidden = true; host.innerHTML = ""; return; }
    host.hidden = false;
    host.innerHTML = list.map(function (n) { return '<button class="chip" data-flash="' + n + '">' + n + "</button>"; }).join("");
    Array.prototype.forEach.call(host.querySelectorAll("button[data-flash]"), function (b) {
      b.onclick = function () { flashAnswer(Number(b.dataset.flash), b); };
    });
    if (answered) answered.forEach(function (n) { const b = host.querySelector('[data-flash="' + n + '"]'); if (b) b.disabled = true; });
  }
  async function flashNext() {
    const f = state.flash; if (!f) return;
    if (f.i >= f.items.length) return flashEnd();
    const nav = state.nav, item = f.items[f.i];
    state.index = f.i; state.phase = "busy"; state.selected = null; state.gate = null;
    clearMarks(); clearGhost(); flashChips(null); flashRingOff();
    $("board").classList.remove("dim"); $("gate-dots").innerHTML = ""; $("prompt").classList.remove("gate-prompt");
    $("btn-hint").hidden = true; $("btn-skip").hidden = true;
    if ($("ritual")) $("ritual").hidden = true;
    banner("FLASH  " + (f.i + 1) + "/" + f.items.length, "tease");
    prompt(item.style);
    show("screen-play"); renderPath(); hud(); renderPowers();
    setPieces({});
    // He says his line to an empty board, and then the looking happens in silence.
    glitchMoment(item.type === "imagine" ? "flashImagine" : "flashReveal");
    await sleep(900); if (stale(nav) || !state.flash) return;
    setPieces(item.position);
    if (item.type === "imagine") {
      prompt(item.prompt);
      if (sq(item.move.from)) sq(item.move.from).classList.add("flash-from");
      ghostArrow(item.move.from, item.move.to);
      flashRing(item.arrow.ms, true);
      await sleep(item.arrow.ms); if (stale(nav) || !state.flash) return;
      clearGhost(); clearMarks();
    } else {
      flashRing(f.revealMs, false);
      await sleep(f.revealMs); if (stale(nav) || !state.flash) return;
      setPieces(item.hidden);
      glitchMoment("flashHide");
    }
    flashRingOff();
    flashAsk(item);
  }
  function flashAsk(item) {
    state.phase = "flash";
    state.gate = { flash: true, item: item, wrong: 0, tried: [], targets: item.squares.slice(), found: [] };
    prompt(item.type === "imagine" ? item.prompt + " " + item.question : item.question);
    $("prompt").classList.add("gate-prompt");
    $("gate-dots").innerHTML = "<span></span>";
    flashChips(item.kind === "chip" ? X.CHIPS : null);
    $("btn-skip").hidden = false;
  }
  function flashTap(name) {
    const g = state.gate; if (!g || !g.flash || g.item.kind === "chip") return;
    flashAnswer(name, sq(name));
  }
  function flashAnswer(answer, el) {
    const g = state.gate, f = state.flash;
    if (!g || !g.flash || !f) return;
    const item = g.item;
    if (X.check(item, answer)) {
      if (el) el.classList.add(item.kind === "chip" ? "active" : "gate-ok");
      sfx("win");
      return flashSettle(true);
    }
    g.wrong += 1; g.tried.push(answer);
    if (el) { el.classList.remove("nope"); void el.offsetWidth; el.classList.add("nope"); if (item.kind === "chip") el.disabled = true; }
    sfx("nope"); glitchMoment("flashWrong");
    if (g.wrong >= 3) return flashSettle(false);          // the answer on the third; it never holds him longer
    if (g.wrong >= 2) {
      // The hint narrows it: one more square lit, or one more number taken off the chip row.
      if (item.kind === "chip") {
        const host = $("flash-chips");
        const dead = X.CHIPS.filter(function (n) { return n !== item.count && g.tried.indexOf(n) < 0; })[0];
        const btn = dead != null && host ? host.querySelector('[data-flash="' + dead + '"]') : null;
        if (btn) btn.disabled = true;
      } else { const hint = X.hintFor(item); if (hint && sq(hint)) sq(hint).classList.add("gate-hint"); }
      prompt(S.coachLine(f.style, { kind: "flashHint", chip: item.kind === "chip" }));
    }
  }
  function flashSettle(correct) {
    const g = state.gate, f = state.flash, c = state.camp; if (!g || !f) return;
    const nav = state.nav, item = g.item;
    state.gate = null; state.phase = "busy";
    $("prompt").classList.remove("gate-prompt"); flashChips(null);
    /* What is recorded is the FIRST look: he still gets two more tries and still hears "seen", but a
       board he only found on the third tap is not a board he saw. That is the same rule as a card's
       `tries`, which is why Progress can put Flash accuracy and first-try rate side by side at all. */
    const first = correct && !g.wrong;
    state.stats = S.recordFlash(state.stats, { type: item.type, correct: first,
      revealMs: item.reveal ? f.revealMs : 0, t: now() }).stats;
    save();
    if (first) f.correct += 1; else f.wrong += 1;
    if (c) { c.flashAsked += 1; c.flashRight += first ? 1 : 0; }
    $("gate-dots").innerHTML = correct ? '<span class="on"></span>' : "";
    if (correct) {
      banner("SEEN", "win"); prompt(S.coachLine(f.style, { kind: "flashRight" })); glitchMoment("flashRight");
    } else {
      banner("THERE", "tease");
      setPieces(item.position);                       // the board comes back so the answer has somewhere to stand
      item.squares.forEach(function (s) { if (sq(s)) sq(s).classList.add("gate-ok"); });
      prompt(S.coachLine(f.style, { kind: "flashGive" }) + " " + X.answerText(item));
    }
    f.i += 1;
    setTimeout(function () { if (!stale(nav) && state.flash) flashNext(); }, T(correct ? 900 : 1700));
  }
  function flashEnd() {
    const f = state.flash; if (!f) return;
    const style = f.style, n = f.items.length, got = f.correct;
    flashRingOff(); flashChips(null); clearGhost();
    glitchMoment("flashDone");
    if (f.inCamp) { state.flash = null; return campWarmups(); }
    if (state.phase === "end") return;                 // a double tap must not write the debrief twice
    state.flash = null;
    const fl = S.flashOf(state.stats);
    $("end-title").textContent = "Flash done, " + activeName() + "!";
    $("session-summary").textContent = S.coachLine(style, { kind: "flashDone", correct: got, count: n, run: fl.bestRun });
    $("end-rank").textContent = "Flash days: " + S.flashDaysDone(state.stats) + ". Best run: " + (fl.bestRun || 0) + ".";
    if ($("end-say")) { $("end-say").hidden = false; $("end-say").textContent = S.coachLine(style, { kind: "say", question: S.PREP_QUESTIONS[0] }); }
    if ($("end-nudge")) $("end-nudge").hidden = true;
    if ($("btn-next-day")) $("btn-next-day").hidden = true;
    $("session-next").textContent = style === "numbers"
      ? "Flash is " + S.FLASH_N + " boards, a few seconds each. Same tomorrow."
      : "Two minutes tomorrow. Looking at the whole board is the point, not the score.";
    const mini = $("next-mini"); if (mini) { mini.innerHTML = ""; mini.hidden = true; }
    $("session-end").hidden = false; state.phase = "end";
  }

  /* ================= PLAY: a whole game against Glitch =================
     The fights teach one move. A game is where a kid finds out whether the move comes to him when
     nobody has told him there is one to find. Rules that do not bend here either: the engine is the
     judge (it scores every move of his, silently, and not one of those numbers reaches the screen),
     nothing on screen goes down, and there is no lockout — every crony is one tap away, always.

     Glitch folds theatrically when he is lost, so a won game ends while it is still a good story. */

  function playing() { return !!state.game; }
  function gameFightsOf(stats) { return ((stats && stats.gameFights) || []).slice(); }
  // Everything a drill can draw on: his own games first, then the authored set.
  function playPool() { return gameFightsOf(state.stats).concat(ALL); }
  function savedGame(i) { return (state.settings.play || [])[i == null ? state.settings.profile : i] || null; }
  function clearSavedGame() { (state.settings.play || (state.settings.play = [null, null]))[state.active] = null; }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const el = document.createElement("script");
      el.src = src; el.async = true;
      el.onload = function () { resolve(); };
      el.onerror = function () { reject(new Error("could not load " + src)); };
      document.head.appendChild(el);
    });
  }
  // Stockfish and chess.js are 650 KB between them. Nothing that opens a fight should pay for that,
  // so they arrive the first time Play is tapped and the service worker keeps them from then on.
  function loadEngine() {
    if (!state.engineScripts) {
      state.engineScripts = Promise.all([
        window.Chess ? Promise.resolve() : loadScript("vendor/chess.js"),
        window.ShockmateEngine ? Promise.resolve() : loadScript("engine.js"),
      ]);
    }
    return state.engineScripts.then(function () {
      CHESS = window.Chess;
      if (!CHESS || !E()) throw new Error("Play did not load.");
      return E().init();
    });
  }

  // Against a crony, his own personality lines join Glitch's for that moment (P.poolFor).
  function playSay(kind, how) {
    const table = P.poolFor(kind, state.game && state.game.level) || P.SAY[kind];
    const l = sayFrom(table, "play." + kind, null, how);
    state.lastPlay[kind] = l;
    return l;
  }
  function sanOf(fen, uci) {
    if (!uci) return "";
    try { const m = P.moveAt(new CHESS(fen), uci); return m ? m.san : ""; } catch (e) { return ""; }
  }
  // Auto-queen: a pawn reaching the last rank has one move in this list, not four. A chip to pick a
  // rook is a choice an eight-year-old has never wanted and a dialogue in the middle of his game.
  function playLegal(chess) {
    const out = {};
    chess.moves({ verbose: true }).forEach(function (m) {
      if (m.flags.indexOf("p") >= 0 && m.promotion !== "q") return;
      (out[m.from] = out[m.from] || []).push({ to: m.to, uci: m.lan, san: m.san,
        capture: m.flags.indexOf("c") >= 0 || m.flags.indexOf("e") >= 0 });
    });
    return out;
  }
  // The board is redrawn from chess.js rather than walked forward a square at a time, because
  // castling, en passant and promotion are four things happening at once and futures.js moves one.
  function syncBoard(step) {
    const map = {};
    P.boardList(state.game.chess).forEach(function (p) { map[p.sq] = { color: p.color, role: p.role }; });
    setPieces(map, step || null);
  }
  function paintPlay() {
    const g = state.game;
    document.querySelectorAll(".sq").forEach(function (el) { el.classList.remove("sel", "legal", "cap"); });
    if (!state.selected || !g) return;
    const cell = sq(state.selected); if (cell) cell.classList.add("sel");
    (g.legal[state.selected] || []).forEach(function (m) {
      const el = sq(m.to); if (!el) return;
      el.classList.add("legal"); if (m.capture) el.classList.add("cap");
    });
  }
  function playSquare(name) {
    const g = state.game; if (!g) return;
    // Two phones: only his own pieces, only on his own move.
    if (g.live && (state.phase !== "think" || g.chess.turn() !== g.colour)) return;
    if (state.selected) {
      const opt = (g.legal[state.selected] || []).filter(function (m) { return m.to === name; })[0];
      if (opt) return g.live ? liveMove(opt) : g.versus ? versusMove(opt) : kidMove(opt);
    }
    const p = state.pieces[name];
    // Against Glitch the side to move is always White. In versus it is whoever's turn it is.
    if (p && p.color === g.chess.turn() && g.legal[name]) { state.selected = name; sfx("select"); } else state.selected = null;
    paintPlay();
  }
  function renderPlayFoot() {
    const g = state.game, foot = $("play-foot");
    if (!foot) return;
    foot.hidden = !g;
    if (g && $("play-moves")) $("play-moves").textContent = "Move " + g.chess.moveNumber();
  }

  /* ---------- the pre-game card: pick a crony ---------- */
  function openPregame() {
    useProfile(state.settings.profile);
    const sug = S.suggestLevel(state.stats);
    const last = savedGame();
    state.pre = { suggest: sug, level: (last && last.level) || sug.level, ready: false, problem: "" };
    renderPregame(); show("screen-pregame");
    loadEngine().then(function () {
      if (!state.pre) return;
      state.pre.ready = true; renderPregame();
    }).catch(function (err) {
      if (!state.pre) return;
      state.pre.problem = String((err && err.message) || err); renderPregame();
    });
  }
  function renderPregame() {
    const pre = state.pre; if (!pre) return;
    const host = $("level-row"); if (!host) return;
    host.innerHTML = S.LEVELS.map(function (l) {
      const cls = ["chip", "level"];
      if (l.id === pre.level) cls.push("active");
      if (l.id === pre.suggest.level) cls.push("suggest");
      return '<button class="' + cls.join(" ") + '" data-level="' + l.id + '">' + esc(l.name) +
        "<small>" + esc(l.blurb) + "</small></button>";
    }).join("");
    Array.prototype.forEach.call(host.querySelectorAll("button[data-level]"), function (b) {
      b.onclick = function () { pre.level = b.dataset.level; sfx("select"); renderPregame(); };
    });
    const asleep = !!pre.problem;
    const glitch = window.ShockmateGlitch;
    if (glitch && $("pre-glitch")) $("pre-glitch").innerHTML = glitch.svg(asleep ? "hide" : "smug");
    // Said once per pick, not once per redraw: the card redraws when the engine wakes up.
    if (!pre.said || pre.said.level !== pre.level || pre.said.asleep !== asleep) {
      const sug = pre.suggest;
      const l = asleep ? pickFrom(P.SAY.asleep, "play.asleep")
        : pre.level === sug.level ? pickFrom(S.SUGGEST_SAY[sug.sayKind], "suggest." + sug.sayKind, sug.vars)
        : { text: (S.levelById(pre.level) || {}).say || "", key: S.levelSayKey(pre.level) };
      pre.said = { level: pre.level, asleep: asleep, text: l.text };
      speak(l.key);
    }
    const line = pre.said.text;
    if ($("pre-line")) { $("pre-line").textContent = line; $("pre-line").hidden = !line; }
    if ($("pre-why")) $("pre-why").textContent = asleep
      ? "This phone cannot run the engine. Everything else still works."
      : "Glitch would send " + S.levelName(pre.suggest.level) + " at you. Send anyone you like.";
    const go = $("btn-play-go");
    if (go) { go.disabled = asleep || !pre.ready; go.textContent = pre.ready ? "Play " + S.levelName(pre.level) : "Waking Glitch…"; }
  }

  /* ---------- the game ---------- */
  function startGame(levelId, chess, saved) {
    const lv = S.levelById(levelId) || S.LEVELS[1];
    state.pre = null; state.review = null; state.fromGame = false;
    state.camp = null; state.duel = null; state.mode = "solo"; state.prep = false;
    state.playIdx = {}; state.selected = null; state.gate = null;
    state.settings.lastPlayed = now();
    state.game = { level: lv.id, chess: chess || new CHESS(), legal: {}, rec: (saved && saved.rec) || [],
      evals: (saved && saved.evals) || [], jobs: [], moves: (saved && saved.moves) || 0,
      blunders: (saved && saved.blunders) || 0, lastGlitch: (saved && saved.lastGlitch) || null,
      resigned: false, done: false, startedAt: now() };
    E().setLevel(lv);
    document.body.dataset.play = "1";
    clearMarks(); $("fx").innerHTML = ""; $("board").classList.remove("dim"); $("gate-dots").innerHTML = "";
    $("btn-hint").hidden = true; $("btn-skip").hidden = true; $("timelines").hidden = true;
    if ($("ritual")) $("ritual").hidden = true;
    banner("", ""); show("screen-play"); hud(); renderPlayFoot();
    syncBoard(state.game.lastGlitch ? { from: state.game.lastGlitch.uci.slice(0, 2), to: state.game.lastGlitch.uci.slice(2, 4) } : null);
    playSay(saved ? "quiet" : "start");
    openPlayTurn(state.nav);
  }
  // The kid's turn. In Tournament week his own game gets the same discipline a fight gets: one tap
  // on what Glitch's move just attacked, then the two questions, then he may move.
  async function openPlayTurn(nav) {
    const g = state.game; if (!g || g.done) return;
    g.legal = playLegal(g.chess);
    state.selected = null;
    const kind = outcomeOf(g.chess);
    if (kind) return endGame(nav, kind);
    if (state.settings.tournament && g.lastGlitch) {
      const synth = { id: "play", pieces: P.boardList(g.chess), arrive: g.lastGlitch.uci, arrivePosition: g.lastGlitch.pack };
      const targets = F.threatTargets(synth);
      if (S.lookFirst(state.settings, false, synth, targets)) {
        const seen = await lookFirstGate(synth, targets);
        if (stale(nav) || !state.game || state.game !== g) return;
        if (seen !== "open") return;
      }
    }
    if (stale(nav) || state.game !== g) return;
    banner("", ""); clearMarks(); $("btn-skip").hidden = true;   // the look-first gate is the only thing that shows it
    if ($("ritual")) {
      $("ritual").hidden = !state.settings.tournament;
      $("ritual").textContent = S.PREP_QUESTIONS.join("   ");
    }
    prompt(g.chess.isCheck() ? "You are in check. Get him out of it." : "Your move.");
    state.phase = "think"; state.thinkAt = now();
    paintPlay();
    // Score the position he is sitting in while he thinks about it. Free: it is cached by the time
    // he taps, and it is what tells us afterwards which of his moves cost him a piece.
    warmEval(g.chess.fen());
  }
  function warmEval(fen) {
    try { E().evaluate(fen, { depth: EVAL_DEPTH }).catch(function () {}); } catch (e) {}
  }
  function outcomeOf(c) {
    if (c.isCheckmate()) return c.turn() === "b" ? "glitchMated" : "kidMated";
    if (c.isStalemate()) return "stalemate";
    if (c.isThreefoldRepetition()) return "repetition";
    if (c.isInsufficientMaterial()) return "material";
    if (c.isDraw()) return "fifty";
    return null;
  }
  function resultOf(kind) {
    if (kind === "glitchMated" || kind === "resign") return "win";
    if (kind === "kidMated" || kind === "quit") return "loss";
    return "draw";
  }

  async function kidMove(opt) {
    const g = state.game, nav = state.nav;
    state.phase = "busy"; state.selected = null; paintPlay();
    stopBlitz();
    const fenBefore = g.chess.fen();
    const m = g.chess.move(opt.san);
    if (!m) { state.phase = "think"; return; }
    syncBoard({ from: m.from, to: m.to });
    const dest = sq(m.to) && sq(m.to).querySelector(".piece"); if (dest) dest.classList.add("pop");
    sfx("move"); if (m.captured) explode(m.to, false);
    g.moves += 1; renderPlayFoot(); saveGame();
    const rec = { n: Number(String(fenBefore).split(" ")[5]) || g.chess.moveNumber(),
      fen: fenBefore, bait: { uci: m.lan, san: m.san }, took: !!m.captured,
      arrive: g.lastGlitch ? g.lastGlitch.uci : null, arrivePosition: g.lastGlitch ? g.lastGlitch.pack : null };
    g.rec.push(rec);
    // What the position was worth before he touched it, and what the engine would have played.
    const job = E().evaluate(fenBefore, { depth: EVAL_DEPTH }).then(function (s) {
      rec.before = { cp: s.cp, mate: s.mate };
      rec.best = { uci: s.best, san: sanOf(fenBefore, s.best), pv: (s.pv || []).slice(0, 4) };
    }).catch(function () {});
    g.jobs.push(job);
    const kind = outcomeOf(g.chess);
    if (kind) { await job.catch(function () {}); return endGame(nav, kind); }
    glitchTurn(nav, rec, job);
  }

  async function glitchTurn(nav, rec, beforeJob) {
    const g = state.game;
    const lv = S.levelById(g.level) || S.LEVELS[1];
    const fen = g.chess.fen();
    const packBefore = P.packList(P.boardList(g.chess));
    let ev = null, res = null;
    try {
      const jobs = [
        sleep(P.moveDelay(Math.random)),
        E().evaluate(fen, { depth: EVAL_DEPTH }).catch(function () { return null; }),
        E().search(fen, { depth: lv.depth, multipv: lv.multipv, skill: lv.skill }).catch(function () { return null; }),
        beforeJob.catch(function () {}),
      ];
      const done = await Promise.all(jobs);
      ev = done[1]; res = done[2];
    } catch (e) { return gameAsleep(nav); }
    if (stale(nav) || state.game !== g || g.done) return;
    if (!res || !res.lines) return gameAsleep(nav);

    // The silent judge. `ev` is read with Glitch to move, so it is already his own point of view.
    if (ev) {
      rec.after = { cp: ev.cp, mate: ev.mate };
      rec.punish = (ev.pv || []).slice(0, 3);
      g.evals.push({ cp: ev.cp, mate: ev.mate });
    }
    const dropped = !!(rec.before && rec.after && P.isBlunder(rec.before, rec.after));
    if (dropped) g.blunders += 1;
    // One reaction, then his move. He gloats at a dropped piece, rages at a taken one, and gets
    // nervous when the position is going. No number is ever said out loud.
    let reacted = true;
    if (dropped) playSay("gloat");
    else if (rec.took) playSay("rage");
    else if (ev && P.cpOf({ cp: ev.cp, mate: ev.mate }) <= -300 && Math.random() < 0.4) playSay("nervous");
    else reacted = false;
    const fold = P.shouldResign(g.evals);
    if (fold.resign && g.moves >= 5) return glitchResigns(nav);
    await sleep(dropped || rec.took ? 700 : 250);
    if (stale(nav) || state.game !== g || g.done) return;

    const legalUcis = g.chess.moves({ verbose: true }).map(function (x) { return x.lan; });
    // He does not shrug or clown when the obvious move is taking back on the square the kid just
    // captured on. A crony who ignores a free recapture reads as broken, not as weak.
    const obvious = !!(rec.took && g.chess.moves({ verbose: true }).some(function (x) {
      return x.to === rec.bait.uci.slice(2, 4) && x.flags.indexOf("c") >= 0;
    }));
    const choice = P.chooseMove(res, lv, legalUcis, Math.random, { obvious: obvious });
    const mv = P.moveAt(g.chess, choice.uci) || g.chess.moves({ verbose: true })[0];
    if (!mv) return endGame(nav, outcomeOf(g.chess) || "stalemate");
    g.chess.move(mv.san);
    syncBoard({ from: mv.from, to: mv.to });
    const cell = sq(mv.to) && sq(mv.to).querySelector(".piece"); if (cell) cell.classList.add("pop");
    sfx("move"); if (mv.captured) explode(mv.to, false);
    g.lastGlitch = { uci: mv.lan, pack: packBefore };
    // His move gets a line in the bubble; it is spoken only when he has not just reacted out loud, so the
    // reaction to the kid's move is never cut off, and nothing new starts in the kid's think window.
    playSay(P.moveKind(mv.san), reacted ? "quiet" : "now");
    renderPlayFoot(); saveGame();
    warmEval(g.chess.fen());
    openPlayTurn(nav);
  }

  async function glitchResigns(nav) {
    const g = state.game; if (!g || g.done) return;
    g.resigned = true;
    banner("TIME GLITCH", "win"); playSay("resign"); sfx("crit");
    await sleep(1500);
    if (stale(nav) || state.game !== g) return;
    endGame(nav, "resign");
  }
  function gameAsleep(nav) {
    if (stale(nav)) return;
    playSay("asleep"); toast("Glitch is asleep. The fights still work.", 3000);
    if (state.game) state.game.done = true;
    setTimeout(goHome, T(1800));
  }

  // The game is over. Everything the kid earned is written down once, here, and nothing written
  // down anywhere can go down: games played, games won, and the highest crony he has beaten.
  async function endGame(nav, kind) {
    const g = state.game; if (!g || g.done) return;
    g.done = true; state.phase = "busy"; stopBlitz();
    const result = resultOf(kind);
    banner(result === "win" ? "YOU WIN" : result === "loss" ? "GLITCH WINS" : "DRAW", result === "win" ? "win" : result === "loss" ? "miss" : "tease");
    if (kind !== "resign") playSay(kind);
    if (result === "win") { sfx("win"); voiceNext(["sys-ko"]); }
    // Let the outstanding silent scoring land, but never hang the screen on it.
    await Promise.race([Promise.all(g.jobs.map(function (j) { return j.catch(function () {}); })), sleep(4000)]);
    let fights = [];
    try {
      fights = P.gameFights(g.rec, { Chess: CHESS, F: F, profile: state.active, t: now(), level: g.level });
    } catch (e) { fights = []; }
    state.stats = S.recordGame(state.stats, { level: g.level, result: result, blunders: g.blunders,
      moves: g.moves, resigned: !!g.resigned, t: now() }).stats;
    if (fights.length) state.stats.gameFights = P.storeFights(state.stats.gameFights, fights);
    clearSavedGame(); save(); hud(); syncSoon();
    state.review = fights;
    const level = g.level;
    state.game = null; document.body.dataset.play = ""; renderPlayFoot();
    if (E()) E().quit();
    if (stale(nav)) return;
    showGameOver(kind, result, level, fights);
  }

  const OVER_TITLE = { glitchMated: "CHECKMATE. YOU WIN.", resign: "HE RAN AWAY. YOU WIN.",
    kidMated: "HE GOT YOU THIS TIME", stalemate: "STALEMATE. HALF EACH.",
    repetition: "DRAWN BY REPETITION", fifty: "DRAWN. FIFTY MOVES.", material: "DRAWN. NOBODY CAN MATE.",
    quit: "YOU STOPPED THIS ONE" };
  function showGameOver(kind, result, level, fights) {
    state.phase = "over";
    const lv = S.levelById(level) || S.LEVELS[1];
    $("over-title").textContent = OVER_TITLE[kind] || "GAME OVER";
    $("over-level").textContent = lv.name + " · " + (state.stats.games ? state.stats.games.played : 1) + " played";
    $("over-mascot").textContent = result === "win" ? "FULL GAME WIN" : result === "loss" ? "FULL GAME" : "HALF A POINT";
    if ($("over-art")) $("over-art").innerHTML = window.ShockmateMotifs
      ? window.ShockmateMotifs.icon(fights.length ? fights[0].motif : "counting", 72) : "";
    $("over-text").textContent = fights.length
      ? (fights.length === 1 ? "One move turned this game. It is a fight now." : fights.length + " of your moves turned this game. They are fights now.")
      : "Not one of your moves dropped a piece. There is nothing to fight.";
    $("over-sub").textContent = result === "win"
      ? "A whole game, no hints, no second try. That is the one that counts at a real board."
      : result === "draw" ? "Half a point off " + lv.name + ". Nothing here goes backwards."
      : fights.length ? "He took this one. The board he took it on is waiting for you."
      : "He took this one on the clock, not on a blunder. Same crony is still there when you want him.";
    $("over-said").textContent = (state.lastPlay[kind] || {}).text || "";
    const card = $("over-card");
    if (card) { card.classList.remove("deal"); void card.offsetWidth; card.classList.add("deal"); }
    $("btn-review").hidden = !fights.length;
    show("screen-gameover");
  }

  /* ---------- the review: the moment it turned ----------
     His move, the punishment he walked into, then the move that was there. Same board, same
     animation, same order as a fight's confession — because it is the same lesson. */
  async function runReview() {
    const fights = state.review || [];
    if (!fights.length) return goHome();
    const f = fights[0], nav = state.nav;
    state.phase = "busy"; document.body.dataset.play = "";
    clearMarks(); $("fx").innerHTML = ""; $("gate-dots").innerHTML = ""; $("btn-hint").hidden = true; $("btn-skip").hidden = true;
    if ($("ritual")) $("ritual").hidden = true;
    renderPlayFoot(); show("screen-play"); hud();
    const start = F.piecesFromList(f.pieces);
    setPieces(start, F.arriveOf(f));
    banner("YOUR GAME", "tease"); glitchSay(f.glitch.taunt, "smug", voiceKeyFor(f, "taunt"));
    prompt("Move " + String(f.title).replace(/^\D+/, "") + ". You played " + f.temptingSan + ".");
    await sleep(1200); if (stale(nav)) return;
    banner("WHAT HE DID", "miss"); glitchSay(f.glitch.gloat, "smug", voiceKeyFor(f, "gloat"));
    await playLine(f.temptingLineUci, start); await sleep(800); if (stale(nav)) return;
    banner("WHAT WAS THERE", "win"); glitchSay(f.glitch.rage, "rage", voiceKeyFor(f, "rage"));
    setPieces(start, F.arriveOf(f)); prompt(f.bestSan + " — the move he was scared of.");
    await sleep(600); if (stale(nav)) return;
    await playLine(f.bestLineUci, start); finisher(f); await sleep(1100);
    if (stale(nav)) return;
    showReviewCard(f);
  }
  function showReviewCard(f) {
    state.phase = "over";
    $("review-mascot").textContent = f.mascot;
    $("review-title").textContent = f.title;
    if ($("review-art")) $("review-art").innerHTML = window.ShockmateMotifs ? window.ShockmateMotifs.icon(f.motif, 72) : "";
    $("review-text").textContent = H.whyFor(f, wantsShort());
    $("review-long").textContent = f.whyLong;
    show("screen-review");
  }
  // "Fight it now" runs the generated board through the ordinary fight flow: think, tease, futures,
  // why-gate, card. The card lands in the binder room called Your games.
  function fightFromGame() {
    const fights = state.review || [];
    if (!fights.length) return goHome();
    document.body.dataset.play = ""; state.game = null;
    state.fromGame = true; state.camp = null; state.prep = false; state.mode = "solo";
    state.session = { count: 0, reviews: 0, won: 0, crits: 0, rage: 0 };
    state.encounters = fights.slice(); state.index = 0;
    startEncounter();
  }

  function saveGame() {
    const g = state.game;
    if (!g || g.done) return;
    const list = state.settings.play || (state.settings.play = [null, null]);
    list[state.active] = { level: g.level, pgn: g.chess.pgn(), fen: g.chess.fen(), moves: g.moves,
      blunders: g.blunders, rec: g.rec, evals: g.evals, lastGlitch: g.lastGlitch, at: now() };
    save();
  }
  function resumeGame() {
    const saved = savedGame();
    if (!saved) return openPregame();
    useProfile(state.settings.profile);
    show("screen-pregame");
    state.pre = { suggest: S.suggestLevel(state.stats), level: saved.level, ready: false, problem: "" };
    renderPregame();
    loadEngine().then(function () {
      let c = new CHESS();
      try { c.loadPgn(saved.pgn || ""); } catch (e) { c = new CHESS(); }
      if (c.fen() !== saved.fen) { c = new CHESS(); c.load(saved.fen); }
      startGame(saved.level, c, saved);
    }).catch(function (err) {
      if (!state.pre) return;
      state.pre.problem = String((err && err.message) || err); renderPregame();
    });
  }
  function renderResume() {
    const chip = $("btn-resume"), saved = savedGame();
    if (!chip) return;
    chip.hidden = !saved;
    if (saved) chip.textContent = "Resume · " + S.levelName(saved.level);
  }

  /* ================= VERSUS: the two of them, one phone =================
     The engine is still the judge, but it is judging nobody against anybody: it watches both kids in
     silence and turns each one's own mistakes into that one's own training. There is no tally, there
     is no comparison, and there is nowhere in this section where one kid's number is put next to his
     sibling's — the result is two separate cards built from two separate walks of the record.

     The board FLIPS to the side of the kid to move, which nothing else in the app does. A fight is a
     puzzle on a screen and always faces the one person holding it; a versus game is two people at a
     table, and a board that does not turn round makes one of them read every move upside down. The
     turn chip says whose go it is in words, because the board turning is exactly the moment somebody
     could lose track. */
  function versusOn() { return !!(state.game && state.game.versus); }
  function versusProfile(g, side) { return side === "w" ? g.seats.white : g.seats.black; }
  function versusSaved() { return (state.settings.versus || {}).saved || null; }
  function clearVersusSaved() {
    state.settings.versus = Object.assign({ lastWhite: null, saved: null }, state.settings.versus, { saved: null });
  }
  function versusSay(kind, name, how) { return sayFrom(V.SAY[kind], "ref." + kind, { name: name }, how); }
  // Whose go it is, in the prompt. It opens the think window, so it is shown and never spoken.
  function versusTurn(name) { return pickFrom(V.SAY.turn, "ref.turn", { name: name }); }
  // On the pre-game card Glitch has his own bubble, because the in-game one belongs to the board.
  function versusLine(kind) {
    const vs = state.vs; if (!vs) return;
    const l = pickFrom(V.SAY[kind], "ref." + kind, { name: state.settings.names[vs.seats.white] });
    vs.line = l.text; vs.mood = l.mood; speak(l.key);
  }
  function stopThinkMeter() { const m = $("think-meter"); if (m) m.classList.remove("fill"); }
  // It fills and it stops. No time control, no forfeit, and nothing on it ever goes down.
  function startThinkMeter() {
    const m = $("think-meter"); if (!m) return;
    m.classList.remove("fill"); void m.offsetWidth; m.classList.add("fill");
  }
  function renderVersusChip() {
    const host = $("versus-turn"), chip = $("versus-chip"), g = state.game;
    if (!host || !chip) return;
    host.hidden = !versusOn();
    if (host.hidden) return stopThinkMeter();
    const side = g.chess.turn(), name = g.names[versusProfile(g, side)] || "";
    chip.textContent = name.toUpperCase() + " · " + (side === "w" ? "White" : "Black") + " to move";
  }
  function renderVersusResume() {
    const chip = $("btn-versus-resume"), saved = versusSaved();
    if (!chip) return;
    chip.hidden = !saved;
    if (saved) chip.textContent = "Resume · move " + Math.max(1, Math.floor((saved.moves || 0) / 2) + 1);
  }

  /* ---------- the pre-game card ---------- */
  function openVersusPre(resume) {
    setSeats(2);
    const last = (state.settings.versus || {}).lastWhite;
    const saved = resume ? versusSaved() : null;
    state.vs = { seats: V.seatsFor(saved ? saved.white : V.nextWhite(last == null ? 1 : last)),
      ready: false, problem: "", sayIdx: {}, resume: !!saved };
    versusLine("start");
    renderVersusPre(); show("screen-versus-pre");
    loadEngine().then(function () {
      if (!state.vs) return;
      state.vs.ready = true; renderVersusPre();
    }).catch(function (err) {
      if (!state.vs) return;
      // Two humans do not need Stockfish to play chess. Without it there is simply nothing to learn
      // from afterwards, and the card says so rather than blocking the game.
      state.vs.problem = String((err && err.message) || err); renderVersusPre();
    });
  }
  function renderVersusPre() {
    const vs = state.vs; if (!vs) return;
    const names = state.settings.names;
    if ($("vs-white-name")) $("vs-white-name").textContent = names[vs.seats.white];
    if ($("vs-black-name")) $("vs-black-name").textContent = names[vs.seats.black];
    const glitch = window.ShockmateGlitch;
    if (glitch && $("vs-glitch")) $("vs-glitch").innerHTML = glitch.svg(vs.problem ? "hide" : vs.mood || "smug");
    if ($("vs-line")) { $("vs-line").textContent = vs.line || ""; $("vs-line").hidden = !vs.line; }
    if ($("vs-why")) $("vs-why").textContent = vs.problem
      ? "Glitch is asleep on this phone, so nobody is watching the moves. You can still play the whole game."
      : vs.resume ? "Picking up the game you left. Same colours."
      : names[vs.seats.white] + " is White this time. It swaps itself every game.";
    const go = $("btn-vs-go");
    if (go) {
      go.disabled = !vs.ready && !vs.problem;
      go.textContent = vs.ready || vs.problem ? (vs.resume ? "Carry on" : "Start") : "Waking the referee…";
    }
    const swap = $("btn-vs-swap");
    if (swap) swap.hidden = !!vs.resume;
  }

  /* ---------- the game ---------- */
  function startVersus(seats, chess, saved) {
    const vs = state.vs;
    state.vs = null; state.review = null; state.fromGame = false; state.versusResult = null;
    state.camp = null; state.duel = null; state.mode = "solo"; state.prep = false;
    state.selected = null; state.gate = null; state.playIdx = {};
    state.settings.lastPlayed = now();
    state.game = { versus: true, seats: seats, names: state.settings.names.slice(),
      chess: chess || new CHESS(), legal: {}, rec: (saved && saved.rec) || [], jobs: [],
      moves: (saved && saved.moves) || 0, lastMove: (saved && saved.lastMove) || null,
      watched: !(vs && vs.problem), sayIdx: (vs && vs.sayIdx) || {}, done: false, startedAt: now() };
    if (state.game.watched && E()) E().setLevel(null);
    document.body.dataset.play = "1";
    clearMarks(); $("fx").innerHTML = ""; $("board").classList.remove("dim"); $("gate-dots").innerHTML = "";
    $("btn-hint").hidden = true; $("btn-skip").hidden = true; $("timelines").hidden = true;
    if ($("ritual")) $("ritual").hidden = true;
    banner("", ""); show("screen-play"); hud(); renderPlayFoot();
    if (!saved) versusSay("start", state.settings.names[seats.white]);
    openVersusTurn(state.nav);
  }
  function versusOutcome(c) {
    if (c.isCheckmate()) return "mate";
    if (c.isStalemate()) return "stalemate";
    if (c.isThreefoldRepetition()) return "repetition";
    if (c.isInsufficientMaterial()) return "material";
    if (c.isDraw()) return "fifty";
    return null;
  }
  function openVersusTurn(nav) {
    const g = state.game; if (!versusOn() || g.done) return;
    g.legal = playLegal(g.chess);
    state.selected = null;
    const kind = versusOutcome(g.chess);
    if (kind) return endVersus(nav, kind, null);
    const side = g.chess.turn(), who = versusProfile(g, side);
    // The active profile follows the board, so a card earned straight off this game lands on the
    // right kid and `save()` writes to the right slot.
    useProfile(who);
    state.flip = side === "b";
    banner("", ""); clearMarks(); $("btn-skip").hidden = true;
    syncBoard(g.lastMove ? { from: g.lastMove.uci.slice(0, 2), to: g.lastMove.uci.slice(2, 4) } : null);
    renderVersusChip();
    const turn = versusTurn(g.names[who]);
    prompt(g.chess.isCheck() ? g.names[who] + ", you are in check. Get out of it." : turn.text);
    state.phase = "think";
    state.thinkAt = now();
    paintPlay(); startThinkMeter();
    if (g.watched) warmEval(g.chess.fen());
  }
  // The referee reacts once the silent scoring lands. He names the kid every time, so a line that
  // arrives a beat after the phone has been slid across is still unmistakably about the right person.
  function versusReact(nav, g, rec) {
    if (stale(nav) || state.game !== g || g.done) return;
    versusSay(V.reactionTo(rec), g.names[rec.profile]);
  }
  async function versusMove(opt) {
    const g = state.game, nav = state.nav;
    state.phase = "busy"; state.selected = null; paintPlay(); stopThinkMeter();
    const side = g.chess.turn(), who = versusProfile(g, side);
    const fenBefore = g.chess.fen(), packBefore = P.packList(P.boardList(g.chess));
    const m = g.chess.move(opt.san);
    if (!m) { state.phase = "think"; return; }
    syncBoard({ from: m.from, to: m.to });
    const dest = sq(m.to) && sq(m.to).querySelector(".piece"); if (dest) dest.classList.add("pop");
    sfx("move"); if (m.captured) explode(m.to, false);
    g.moves += 1; renderPlayFoot();
    const rec = { n: Number(String(fenBefore).split(" ")[5]) || 1, side: side, profile: who,
      fen: fenBefore, bait: { uci: m.lan, san: m.san }, took: !!m.captured,
      arrive: g.lastMove ? g.lastMove.uci : null, arrivePosition: g.lastMove ? g.lastMove.pack : null };
    g.rec.push(rec);
    g.lastMove = { uci: m.lan, pack: packBefore };
    const kind = versusOutcome(g.chess);
    /* Both ends of the move, scored at the same depth Play uses. `before` is read with the mover to
       move and `after` with his sibling to move, which is exactly what P.dropOf expects, so the same
       blunder bar works for a Black kid without a single sign flip. A finished position is never sent
       to the engine: there is no move to search and nothing to learn from the number. */
    let job = Promise.resolve();
    if (g.watched) {
      const fenAfter = g.chess.fen();
      job = Promise.all([
        E().evaluate(fenBefore, { depth: EVAL_DEPTH }).then(function (s) {
          rec.before = { cp: s.cp, mate: s.mate };
          rec.best = { uci: s.best, san: sanOf(fenBefore, s.best), pv: (s.pv || []).slice(0, 4) };
        }).catch(function () {}),
        kind ? Promise.resolve() : E().evaluate(fenAfter, { depth: EVAL_DEPTH }).then(function (s) {
          rec.after = { cp: s.cp, mate: s.mate }; rec.punish = (s.pv || []).slice(0, 3);
        }).catch(function () {}),
      ]).then(function () { versusReact(nav, g, rec); });
      g.jobs.push(job.catch(function () {}));
    }
    saveVersus();
    if (kind) { await job.catch(function () {}); return endVersus(nav, kind, null); }
    if (!g.watched) versusSay(P.moveKind(m.san), g.names[who]);
    openVersusTurn(nav);
  }

  /* The end. Each kid's half is written to his own profile, out of his own moves only. Nothing that
     lands in storage names the other kid: a best moment records `vs: "sibling"` and nothing else. */
  const VERSUS_TITLE = { mate: "CHECKMATE", resign: "RESIGNED", stalemate: "STALEMATE. HALF EACH.",
    repetition: "DRAWN BY REPETITION", fifty: "DRAWN. FIFTY MOVES.", material: "DRAWN. NOBODY CAN MATE." };
  async function endVersus(nav, kind, loser) {
    const g = state.game; if (!versusOn() || g.done) return;
    g.done = true; state.phase = "busy"; stopThinkMeter();
    const lose = loser || (kind === "mate" ? g.chess.turn() : null);
    banner(VERSUS_TITLE[kind] || "GAME OVER", kind === "mate" || kind === "resign" ? "win" : "tease");
    versusSay(kind, lose ? g.names[versusProfile(g, lose)] : g.names[g.seats.white]);
    sfx(kind === "mate" ? "win" : "select");
    await Promise.race([Promise.all(g.jobs.map(function (j) { return j.catch(function () {}); })), sleep(4000)]);
    const t = now();
    let res = { t: t, kind: kind, cards: [] };
    try {
      res = V.resultCards({ kind: kind, records: g.rec, names: g.names, white: g.seats.white, loser: lose, t: t },
        { Chess: CHESS, F: F });
    } catch (e) { res = { t: t, kind: kind, cards: [] }; }
    res.cards.forEach(function (c) {
      let st = state.profiles[c.profile] || freshStats();
      if (c.fights && c.fights.length) st = Object.assign({}, st, { gameFights: P.storeFights(st.gameFights, c.fights) });
      st = S.recordVersus(st, { colour: c.colour, result: c.result, blunders: c.blunders, matched: c.matched,
        moves: c.moves, bestMoves: c.best ? [c.best] : [], t: t }).stats;
      state.profiles[c.profile] = st;
    });
    state.settings.versus = Object.assign({ lastWhite: null, saved: null }, state.settings.versus,
      { lastWhite: g.seats.white, saved: null });
    state.game = null; state.flip = false; document.body.dataset.play = "";
    renderPlayFoot(); renderVersusChip();
    if (E()) E().quit();
    useProfile(state.settings.profile); save(); hud(); syncSoon();
    state.versusResult = res;
    if (stale(nav)) return;
    showVersusOver(res, kind, lose, g);
  }

  /* ---------- the result: two cards, never a scoreboard ---------- */
  function mapFromFen(fen) {
    const map = {};
    try { P.boardList(new CHESS(fen)).forEach(function (p) { map[p.sq] = { color: p.color, role: p.role }; }); }
    catch (e) { return {}; }
    return map;
  }
  function miniBoardHtml(map, hot, flip) {
    const ranks = flip ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
    const files = flip ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
    let html = "";
    ranks.forEach(function (r) { files.forEach(function (f) {
      const name = FILES[f] + r, p = map[name], light = ((f + r) % 2 !== 0);
      html += '<div class="' + (light ? "light" : "dark") + ((hot || []).indexOf(name) >= 0 ? " hot" : "") + '">' +
        (p && window.ShockmatePieces ? window.ShockmatePieces.svg(p.color, p.role) : "") + "</div>";
    }); });
    return html;
  }
  // The board as it stood the instant after the move, from that kid's own side of the table.
  function momentMini(moment, flip) {
    if (!moment || !moment.fen) return "";
    let map = mapFromFen(moment.fen);
    let hot = [];
    if (moment.uci && moment.uci.length >= 4) {
      try { const step = F.applyUci(map, moment.uci); map = step.pieces; hot = [step.from, step.to]; } catch (e) {}
    }
    return '<div class="vs-mini">' + miniBoardHtml(map, hot, flip) + "</div>";
  }
  function showVersusOver(res, kind, lose, g) {
    state.phase = "over";
    $("vs-over-title").textContent = VERSUS_TITLE[kind] || "GAME OVER";
    $("vs-over-sub").textContent = "One card each. What is on yours is yours — there is no score between you.";
    renderVersusCards(res);
    // One line per card, each about its own kid, after the result line has finished.
    voiceNext((res.cards || []).map(function (c) { return c.sayKey; }).filter(Boolean));
    show("screen-versus-over");
  }
  function renderVersusCards(res) {
    const root = $("vs-cards"); if (!root) return;
    root.innerHTML = (res.cards || []).map(function (c) {
      const flip = c.colour === "b";
      const best = c.best
        ? '<div class="vs-moment">' + momentMini(c.best, flip) +
            '<p><span class="vs-move">' + esc(c.best.san) + "</span>Your best move of the game. The engine would have played it too.</p></div>"
        : '<p class="vs-none">No stand-out move this time. Next game.</p>';
      const worst = c.worst
        ? '<div class="vs-moment">' + momentMini(c.worst, flip) +
            '<p><span class="vs-move">' + esc(c.worst.san) + "</span>The moment it turned. " +
            (c.fights.length ? "It is a fight now." : "") + "</p></div>"
        : '<p class="vs-none">Nothing you played dropped a piece. There is nothing to fight.</p>';
      return '<section class="why-card vs-card">' +
        '<div class="card-head"><span class="mascot">' + esc(c.name) + '</span>' +
          '<span class="card-name">played ' + (c.colour === "w" ? "White" : "Black") + "</span></div>" +
        best + worst +
        '<p class="said">' + esc(c.say) + "</p>" +
        (c.fights.length
          ? '<div class="actions"><button class="cta" data-vs-fight="' + c.profile + '">Fight it now</button>' +
            '<button class="chip" data-vs-later="' + c.profile + '">Later</button></div>'
          : "") +
        "</section>";
    }).join("");
    Array.prototype.forEach.call(root.querySelectorAll("button[data-vs-fight]"), function (b) {
      b.onclick = function () { versusFightNow(Number(b.dataset.vsFight)); };
    });
    Array.prototype.forEach.call(root.querySelectorAll("button[data-vs-later]"), function (b) {
      b.onclick = function () { toast("Saved. Prep and Camp will start with it.", 2600); goHome(); };
    });
  }
  // Straight into the ordinary fight flow, on that kid's own boards, in his own profile.
  function versusFightNow(profile) {
    const res = state.versusResult;
    const card = ((res && res.cards) || []).filter(function (c) { return c.profile === profile; })[0];
    if (!card || !card.fights.length) return goHome();
    document.body.dataset.play = ""; state.game = null; state.flip = false;
    state.fromGame = true; state.camp = null; state.prep = false; state.mode = "solo"; state.duel = null;
    state.settings.profile = profile; useProfile(profile); setSeats(2); save();
    state.session = { count: 0, reviews: 0, won: 0, crits: 0, rage: 0 };
    state.encounters = card.fights.slice(); state.index = 0;
    hud(); startEncounter();
  }

  function saveVersus() {
    const g = state.game;
    if (!versusOn() || g.done) return;
    state.settings.versus = Object.assign({ lastWhite: null, saved: null }, state.settings.versus, {
      saved: { pgn: g.chess.pgn(), fen: g.chess.fen(), moves: g.moves, rec: g.rec,
        white: g.seats.white, lastMove: g.lastMove, at: now() } });
    save();
  }
  // Start, for a fresh game and for a resumed one. Both arrive here from the same card and the same
  // button, so a phone whose engine never woke still gets a game rather than a dead screen.
  function versusGo() {
    const vs = state.vs; if (!vs || (!vs.ready && !vs.problem)) return;
    const saved = vs.resume ? versusSaved() : null;
    if (!CHESS && window.Chess) CHESS = window.Chess;
    if (!CHESS) { toast("The board did not load on this phone.", 3000); return goHome(); }
    let c = new CHESS();
    if (saved) {
      try { c.loadPgn(saved.pgn || ""); } catch (e) { c = new CHESS(); }
      if (c.fen() !== saved.fen) { c = new CHESS(); c.load(saved.fen); }
    } else { clearVersusSaved(); save(); }
    startVersus(vs.seats, c, saved);
  }

  /* ================= FAMILY: one-tap setup =================
     First launch, a ?family=CODE link, or Settings -> Family. New family: the kids' names, each kid
     picks his own 4-digit PIN on the keypad (twice), and the phone gets a code to share. Join: the
     code, the roster, "which one is this phone's player?", his PIN, done. Skip keeps the phone local.
     The coach PIN is a different thing and never leaves the phone. */
  const FAM = { step: "choose", mode: "new", from: "first", names: ["", ""], pins: ["", ""], kid: 0,
    typed: "", first: "", code: "", roster: [], pick: null, busy: false, me: 0 };
  const FAM_STEPS = ["choose", "names", "pin", "code-card", "join", "pick"];
  // The family card has its own Glitch; his lines there come off the same tables as everywhere else.
  function famLine(kind) {
    const l = pickFrom(S.GLITCH_LINES[kind], "moment." + kind);
    const g = window.ShockmateGlitch;
    if (g && $("fam-glitch")) $("fam-glitch").innerHTML = g.svg(l.mood || "taunt");
    if ($("fam-line")) { $("fam-line").textContent = l.text || ""; $("fam-line").hidden = !l.text; }
    speak(l.key);
  }
  function famState(text) { if ($("fam-state")) $("fam-state").textContent = text || ""; }
  function famShow(step) {
    FAM.step = step;
    FAM_STEPS.forEach(function (id) { const el = $("fam-" + id); if (el) el.hidden = id !== step; });
    // "Skip" already says it on the first card, and "Done" says it once there is a code.
    if ($("btn-fam-back")) $("btn-fam-back").hidden = (step === "choose" && FAM.from === "first") || step === "code-card";
    famState("");
    show("screen-family");
  }
  function openFamily(from, code) {
    Object.assign(FAM, { step: "choose", mode: "new", from: from || "first", names: ["", ""], pins: ["", ""], kid: 0,
      typed: "", first: "", code: "", roster: [], pick: null, busy: false, me: 0 });
    if (!Y.configured(syncCfg())) { toast("Family sync is not set up on this build.", 2600); return goHome(); }
    if (code) {
      famLine("famCode");
      famShow("join"); $("fam-code-input").value = code; return famFind();
    }
    famLine("famNew");
    famShow("choose");
  }
  function famLeave() {
    const from = FAM.from;
    if (!Y.validCode(fam().code) && from === "first") fam().skipped = true;
    save(); restartLivePoller();
    if (from === "settings") { renderSettings(); return show("screen-settings"); }
    goHome();
  }
  function renderFamKeypad() {
    const host = $("fam-keypad"); if (!host || host.childElementCount) return;
    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "back", "0"];
    host.innerHTML = keys.map(function (k) {
      return k === "back" ? '<button type="button" class="token key del" data-fkey="back" aria-label="Delete">&#9003;</button>'
        : '<button type="button" class="token key" data-fkey="' + k + '">' + k + "</button>";
    }).join("") + "<span></span>";
    Array.prototype.forEach.call(host.querySelectorAll("button[data-fkey]"), function (b) {
      b.onclick = function () { famKey(b.dataset.fkey); };
    });
  }
  function famDots() {
    const host = $("fam-pin-dots"); if (!host) return;
    let h = ""; for (let i = 0; i < 4; i++) h += '<span class="' + (i < FAM.typed.length ? "on" : "") + '"></span>';
    host.innerHTML = h;
  }
  function famShake(msg) {
    const c = $("fam-pin"); if (c) { c.classList.remove("wrong"); void c.offsetWidth; c.classList.add("wrong"); }
    sfx("nope"); FAM.typed = ""; famDots(); if (msg) famState(msg);
  }
  function famPin() {
    renderFamKeypad(); FAM.typed = "";
    const who = FAM.mode === "new" ? FAM.names[FAM.kid] : (FAM.roster.filter(function (r) { return r.slot === FAM.pick; })[0] || {}).name;
    $("fam-pin-title").textContent = FAM.mode === "new"
      ? (FAM.first ? who + ", type it again" : who + ", pick a secret PIN")
      : who + ", type your PIN";
    $("fam-pin-hint").textContent = FAM.mode === "new"
      ? "Four digits only you know. It joins your games and keeps your cards safe. The coach's PIN is a different one."
      : "The four digits you picked when the family was made.";
    famDots(); famShow("pin");
  }
  function famKey(k) {
    if (FAM.busy) return;
    if (k === "back") { FAM.typed = FAM.typed.slice(0, -1); return famDots(); }
    if (FAM.typed.length >= 4) return;
    FAM.typed += k; sfx("select"); famDots();
    if (FAM.typed.length === 4) setTimeout(famPinDone, T(160));
  }
  function famPinDone() {
    const typed = FAM.typed;
    if (FAM.mode === "join") return famJoinPin(typed);
    if (!FAM.first) { FAM.first = typed; return famPin(); }
    if (typed !== FAM.first) { FAM.first = ""; famPin(); return famShake("Those two did not match. Pick again."); }
    FAM.pins[FAM.kid] = typed; FAM.first = "";
    if (FAM.kid === 0 && FAM.names[1]) { FAM.kid = 1; return famPin(); }
    famCreate();
  }
  function famCreate() {
    const kids = FAM.names.map(function (n, i) { return { name: n, pin: FAM.pins[i] }; }).filter(function (k) { return k.name; });
    FAM.busy = true; famState("Making your family…");
    Y.familyCreate(syncCfg(), "", kids).then(function (code) {
      FAM.busy = false; FAM.code = code;
      state.settings.family = { code: code, me: 0, pins: [FAM.pins[0] || "", FAM.pins[1] || ""],
        roster: kids.map(function (k, i) { return { slot: i, name: k.name }; }), skipped: false };
      kids.forEach(function (k, i) { state.settings.names[i] = k.name; });
      state.settings.profile = 0; useProfile(0); save(); hud();
      syncNow(true);
      famLine("famMade");
      renderFamCode(); famShow("code-card");
    }).catch(function (err) {
      FAM.busy = false; FAM.kid = 0; FAM.first = "";
      famShow("names"); famState(err && err.code === "offline" ? "No connection. Try again with signal." : String((err && err.message) || err));
    });
  }
  function renderFamCode() {
    const f = fam();
    $("fam-code-big").textContent = f.code;
    const host = $("fam-me"); if (!host) return;
    const both = (f.roster || []).length > 1;
    $("fam-me-row").hidden = !both;
    host.innerHTML = (f.roster || []).map(function (r) {
      return '<button type="button" class="chip' + (r.slot === f.me ? " active" : "") + '" data-me="' + r.slot + '">' + esc(r.name) + "</button>";
    }).join("");
    Array.prototype.forEach.call(host.querySelectorAll("button[data-me]"), function (b) {
      b.onclick = function () {
        const slot = Number(b.dataset.me); fam().me = slot; state.settings.profile = slot; useProfile(slot); save(); hud(); renderFamCode();
      };
    });
  }
  function shareFamily(code) {
    const text = Y.shareText(code);
    const copy = function () {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        // A clipboard write can hang waiting on a permission; after a second and a half, show the text.
        const slow = new Promise(function (r) { setTimeout(function () { r("slow"); }, 1500); });
        return Promise.race([navigator.clipboard.writeText(text).then(function () { return "ok"; }), slow])
          .then(function (how) { toast(how === "ok" ? "Copied. Paste it to the other phone." : text, how === "ok" ? 2400 : 6000); },
            function () { toast(text, 6000); });
      }
      toast(text, 6000); return Promise.resolve();
    };
    if (navigator.share) return navigator.share({ title: "Shockmate", text: text }).catch(function (err) {
      if (err && err.name === "AbortError") return; return copy();
    });
    return copy();
  }
  function famFind() {
    const code = Y.normaliseCode($("fam-code-input").value);
    $("fam-code-input").value = code;
    if (!Y.validCode(code)) return famState("A family code is 8 letters and numbers.");
    FAM.busy = true; famState("Looking for that family…");
    Y.familyRoster(syncCfg(), code).then(function (rows) {
      FAM.busy = false;
      if (!rows.length) return famState("No family has that code. Check it with whoever set it up.");
      FAM.code = code; FAM.roster = rows; FAM.mode = "join";
      famLine("famFound");
      const host = $("fam-roster");
      host.innerHTML = rows.map(function (r) { return '<button type="button" class="cta play" data-pick="' + r.slot + '">' + esc(r.name) + "</button>"; }).join("");
      Array.prototype.forEach.call(host.querySelectorAll("button[data-pick]"), function (b) {
        b.onclick = function () { FAM.pick = Number(b.dataset.pick); famPin(); };
      });
      famShow("pick");
    }).catch(function (err) {
      FAM.busy = false;
      famState(err && err.code === "offline" ? "No connection. Try again with signal." : String((err && err.message) || err));
    });
  }
  // The PIN is checked by pulling his own progress, which is also the first half of his first sync.
  function famJoinPin(pin) {
    const slot = FAM.pick, code = FAM.code;
    FAM.busy = true; famState("Checking…");
    Y.pull(syncCfg(), code, slot, pin).then(function (remote) {
      FAM.busy = false;
      const was = fam(), same = was.code === code;
      const pins = same ? was.pins.slice() : ["", ""]; pins[slot] = pin;
      state.settings.family = { code: code, me: slot, pins: pins, roster: FAM.roster.slice(), skipped: false };
      applyRoster(FAM.roster);
      state.profiles[slot] = Object.assign(freshStats(), Y.mergeStats(state.profiles[slot], remote || {}));
      state.settings.profile = slot; setSeats(1); useProfile(slot); save(); hud();
      syncNow(true);
      toast("This phone is " + state.settings.names[slot] + "'s now.", 2400);
      FAM.from === "settings" ? (renderSettings(), show("screen-settings")) : goHome();
      restartLivePoller();
    }).catch(function (err) {
      FAM.busy = false;
      if (err && err.code === "pin") return famShake("Not that one. Try again.");
      if (err && err.code === "locked") return famShake("Too many wrong tries. Wait 15 minutes.");
      famShake(err && err.code === "offline" ? "No connection. Try again with signal." : String((err && err.message) || err));
    });
  }
  function bindFamily() {
    if (!$("screen-family")) return;
    $("btn-fam-new").onclick = function () {
      FAM.mode = "new";
      [0, 1].forEach(function (i) {
        const n = state.settings.names[i];
        $("fam-name-" + i).value = /^Player [12]$/.test(n) ? "" : n;
      });
      famLine("famNames");
      famShow("names");
    };
    $("btn-fam-join").onclick = function () { famLine("famJoin"); famShow("join"); };
    $("btn-fam-skip").onclick = function () { fam().skipped = true; save(); famLeave(); };
    $("btn-fam-names-go").onclick = function () {
      FAM.names = [Y.cleanName($("fam-name-0").value), Y.cleanName($("fam-name-1").value)];
      if (!FAM.names[0]) return famState("The first kid needs a name.");
      FAM.kid = 0; FAM.first = ""; FAM.pins = ["", ""]; famPin();
    };
    $("btn-fam-find").onclick = famFind;
    $("fam-code-input").onkeydown = function (ev) { if (ev.key === "Enter") famFind(); };
    $("btn-fam-share").onclick = function () { shareFamily(fam().code); };
    $("btn-fam-done").onclick = function () { famLeave(); };
    $("btn-fam-back").onclick = function () {
      if (FAM.step === "choose" || FAM.from === "settings" || FAM.step === "code-card") return famLeave();
      FAM.first = ""; famShow("choose");
    };
  }

  /* ================= LIVE: two phones, one game =================
     Each phone shows its own kid's colour at the bottom and never flips. Each phone scores only its
     own kid's moves, at the same depth one-phone versus uses, and builds only his card. The other
     kid's moves arrive over sm_live_get, animate in with the last-move highlight, and get a line
     from the referee. There is no tally anywhere, on either phone. */
  const LIVE = { poller: null, pollerSlot: null, session: null, sent: {}, invites: [], resumable: [], same: false, scratch: null };
  function siblingSlot() { return fam().me === 1 ? 0 : 1; }
  function hasSibling() { return (fam().roster || []).some(function (r) { return r.slot === siblingSlot(); }); }
  function liveTransport() { const f = fam(); return L.transport(Y, syncCfg(), { code: f.code, slot: f.me, pin: f.pins[f.me] }); }
  function liveReady() { return !!(L && familyJoined() && hasSibling()); }
  function sentIds() {
    const out = Object.assign({}, LIVE.sent);
    if (state.settings.live && state.settings.live.id && state.settings.live.sent) out[state.settings.live.id] = 1;
    return out;
  }
  function restartLivePoller() {
    if (LIVE.poller) { LIVE.poller.stop(); LIVE.poller = null; }
    LIVE.invites = []; LIVE.resumable = []; LIVE.same = false;
    if (!liveReady()) return renderLive();
    LIVE.pollerSlot = fam().me;
    LIVE.poller = L.homePoller({ transport: { list: function () { return liveTransport().list(); } }, slot: fam().me,
      sent: sentIds,
      when: function () { return document.body.dataset.screen === "screen-title" && !document.hidden && navigator.onLine !== false; },
      onList: function (r) { LIVE.invites = r.invites; LIVE.resumable = r.resumable; LIVE.same = r.sameProfile; renderLive(); },
      onError: function () {} });
    LIVE.poller.start();
    renderLive();
  }
  function renderLive() {
    const row = $("live-row"), card = $("live-invite");
    if (!row || !card) return;
    const ready = liveReady();
    row.hidden = !ready;
    card.hidden = true;
    if (!ready) return;
    const sib = state.settings.names[siblingSlot()], me = state.settings.names[fam().me];
    const res = LIVE.resumable[0] || null;
    const inv = LIVE.invites[0] || null;
    // One open game per family: while one is open (or offered), the way in is that game, not a new
    // invite that would replace it.
    $("btn-live-invite").textContent = "Play " + sib + " on their phone";
    $("btn-live-invite").hidden = !!(res || inv || LIVE.same);
    $("btn-live-resume").hidden = !res;
    if (res) $("btn-live-resume").textContent = res.status === "invited" ? "Waiting for " + sib + " · open" : "Resume game with " + sib;
    if (!LIVE.same && !inv) return;
    const l = LIVE.same ? V.say("same", 0, me) : V.say("invite", (String(inv.id).charCodeAt(0) % V.SAY.invite.lines.length) - 1, state.settings.names[inv.inviter_slot]);
    card.hidden = false;
    card.classList.toggle("same", !!LIVE.same);
    if (window.ShockmateGlitch && $("live-invite-glitch")) $("live-invite-glitch").innerHTML = window.ShockmateGlitch.svg(l.mood);
    $("live-invite-line").textContent = l.text;
    // The card redraws on every poll; he says it once per invite.
    const said = LIVE.same ? "same" : "invite:" + inv.id;
    if (LIVE.said !== said) { LIVE.said = said; speak(l.key); }
    $("btn-live-accept").hidden = !!LIVE.same;
    $("btn-live-decline").hidden = !!LIVE.same;
  }

  function liveInvite() {
    if (!liveReady()) return;
    const f = fam(), last = (state.settings.versus || {}).lastWhite;
    const white = V.nextWhite(last == null ? (f.me === 0 ? 1 : 0) : last);
    const btn = $("btn-live-invite"); if (btn) btn.disabled = true;
    liveTransport().invite(siblingSlot(), white).then(function (id) {
      if (btn) btn.disabled = false;
      LIVE.sent[id] = 1;
      state.settings.live = { id: id, rec: [], sent: true, at: now() }; save();
      return openLive({ id: id, white_slot: white, black_slot: white === f.me ? siblingSlot() : f.me, inviter_slot: f.me,
        status: "invited", moves: [], updated_at: now() });
    }).catch(function (err) {
      if (btn) btn.disabled = false;
      toast(err && err.code === "offline" ? "No connection. The other phone can't hear you." : String((err && err.message) || err), 2600);
    });
  }
  function liveAccept() {
    const inv = LIVE.invites[0]; if (!inv) return;
    $("btn-live-accept").disabled = true;
    liveTransport().accept(inv.id).then(function (game) {
      $("btn-live-accept").disabled = false;
      state.settings.live = { id: game.id, rec: [], sent: false, at: now() }; save();
      openLive(game);
    }).catch(function (err) {
      $("btn-live-accept").disabled = false;
      if (err && err.code === "same") { LIVE.same = true; return renderLive(); }
      toast(String((err && err.message) || err), 2600);
      if (LIVE.poller) LIVE.poller.poke();
    });
  }
  function liveDecline() {
    const inv = LIVE.invites[0]; if (!inv) return;
    LIVE.invites = []; renderLive();
    liveTransport().end(inv.id, "declined").catch(function () {});
  }
  function liveResume() {
    const res = LIVE.resumable[0]; if (!res) return;
    liveTransport().get(res.id).then(function (game) {
      if (game.status === "over") { toast("That game has finished.", 2000); if (LIVE.poller) LIVE.poller.poke(); return; }
      openLive(game);
    }).catch(function (err) { toast(String((err && err.message) || err), 2600); });
  }
  function stopLiveSession() { if (LIVE.session) { LIVE.session.stop(); LIVE.session = null; } }

  // Replays the server's list on a fresh board, as far as chess.js can play it.
  function replayMoves(list) {
    const c = new CHESS(); const played = []; let last = null;
    for (let i = 0; i < (list || []).length; i++) {
      const pack = P.packList(P.boardList(c));
      const m = P.moveAt(c, list[i]); if (!m) break;
      c.move(m.san); played.push(list[i]); last = { uci: m.lan, pack: pack };
    }
    return { chess: c, moves: played, last: last };
  }

  async function openLive(game) {
    if (!L) return;
    let watched = true;
    try { await loadEngine(); } catch (e) { watched = false; if (!CHESS && window.Chess) CHESS = window.Chess; }
    if (!CHESS) { toast("The board did not load on this phone.", 3000); return goHome(); }
    const f = fam(), me = f.me, colour = L.colourOf(game, me);
    if (!colour) { toast("That game is not this phone's.", 2400); return goHome(); }
    const saved = state.settings.live && state.settings.live.id === game.id ? state.settings.live : null;
    const replay = replayMoves(game.moves || []);
    stopLiveSession();
    state.vs = null; state.review = null; state.fromGame = false; state.versusResult = null;
    state.camp = null; state.duel = null; state.mode = "solo"; state.prep = false;
    state.selected = null; state.gate = null; state.playIdx = {};
    state.settings.lastPlayed = now();
    state.settings.live = { id: game.id, rec: (saved && saved.rec) || [], sent: !!(saved && saved.sent) || game.inviter_slot === me, at: now() };
    const names = state.settings.names.slice();
    state.game = { versus: true, live: true, id: game.id, me: me, colour: colour, opp: L.opponentOf(game, me),
      seats: { white: game.white_slot, black: game.black_slot }, names: names,
      chess: replay.chess, legal: {}, rec: state.settings.live.rec, jobs: [], moves: replay.moves.length,
      lastMove: replay.last, watched: watched && !!E(), sayIdx: {}, done: false, startedAt: now(), status: game.status };
    const g = state.game;
    if (g.watched) E().setLevel(null);
    // His own colour at the bottom, the whole game. Nobody slides this phone across a table.
    state.flip = colour === "b";
    useProfile(me);
    document.body.dataset.play = "1";
    clearMarks(); $("fx").innerHTML = ""; $("board").classList.remove("dim"); $("gate-dots").innerHTML = "";
    $("btn-hint").hidden = true; $("btn-skip").hidden = true; $("timelines").hidden = true;
    if ($("ritual")) $("ritual").hidden = true;
    banner("", ""); show("screen-play"); hud(); renderPlayFoot();
    save();
    LIVE.session = L.gameSession({ transport: liveTransport(), id: game.id, slot: me,
      game: Object.assign({}, game, { moves: replay.moves }),
      legal: function (uci, ply) {
        if (state.game !== g) return false;
        if (!LIVE.scratch || ply === g.chess.history().length) LIVE.scratch = new CHESS(g.chess.fen());
        const m = P.moveAt(LIVE.scratch, uci); if (!m) return false;
        LIVE.scratch.move(m.san); return true;
      },
      prefix: function (list) { return replayMoves(list).moves; },
      on: {
        accepted: function () {
          if (state.game !== g) return;
          g.status = "active"; sfx("select");
          versusSay("start", names[g.seats.white]); openLiveTurn();
        },
        moves: function (played) { liveArrived(g, played); },
        resync: function (moves) { liveResync(g, moves); },
        illegal: function () { if (state.game === g) toast("That move did not arrive right. Catching up…", 1800); },
        waiting: function (on) { liveWaiting(g, on); },
        over: function (game2, out) { liveServerOver(g, game2, out); },
      } });
    if (game.status === "invited") {
      g.status = "invited";
      syncBoard(null); renderVersusChip();
      prompt("Waiting for " + names[g.opp] + " to say yes…");
      versusSay("waiting", names[g.opp]);
      state.phase = "wait";
    } else {
      if (!g.moves) versusSay("start", names[g.seats.white]);
      openLiveTurn();
    }
    LIVE.session.start();
  }
  function liveMine(g) { return g.chess.turn() === g.colour; }
  function openLiveTurn() {
    const g = state.game; if (!g || !g.live || g.done) return;
    g.legal = playLegal(g.chess); state.selected = null;
    syncBoard(g.lastMove ? { from: g.lastMove.uci.slice(0, 2), to: g.lastMove.uci.slice(2, 4) } : null);
    renderVersusChip(); renderPlayFoot();
    banner("", ""); clearMarks(); $("btn-skip").hidden = true;
    if (liveMine(g)) {
      const turn = versusTurn(g.names[g.me]);
      prompt(g.chess.isCheck() ? g.names[g.me] + ", you are in check. Get out of it." : turn.text);
      state.phase = "think"; state.thinkAt = now();
      paintPlay(); startThinkMeter();
      if (g.watched) warmEval(g.chess.fen());
    } else {
      state.phase = "wait"; stopThinkMeter(); paintPlay();
      prompt(g.names[g.opp] + "'s move.");
    }
  }
  // The other kid's move, from his phone. Played on this board, highlighted, and refereed — never scored.
  function liveArrived(g, played) {
    if (state.game !== g || g.done) return;
    played.forEach(function (p) {
      const packBefore = P.packList(P.boardList(g.chess));
      const m = P.moveAt(g.chess, p.uci); if (!m) return;
      g.chess.move(m.san); g.moves += 1;
      g.lastMove = { uci: m.lan, pack: packBefore };
      syncBoard({ from: m.from, to: m.to });
      const dest = sq(m.to) && sq(m.to).querySelector(".piece"); if (dest) dest.classList.add("pop");
      sfx("move"); if (m.captured) explode(m.to, false);
      versusSay(P.moveKind(m.san), g.names[g.opp]);
    });
    saveLive();
    const kind = versusOutcome(g.chess);
    if (kind) return finishLive(g, kind);
    openLiveTurn();
  }
  function liveResync(g, moves) {
    if (state.game !== g || g.done) return;
    const r = replayMoves(moves);
    g.chess = r.chess; g.moves = r.moves.length; g.lastMove = r.last;
    // Drop scored rows for moves that are no longer on the board.
    g.rec = g.rec.filter(function (row) { return (row.ply == null ? 0 : row.ply) < r.moves.length; });
    state.settings.live.rec = g.rec;
    saveLive(); openLiveTurn();
  }
  function liveWaiting(g, on) {
    if (state.game !== g || g.done) return;
    if (on && !liveMine(g)) { prompt("Waiting for " + g.names[g.opp] + "…"); versusSay("waiting", g.names[g.opp]); }
    else if (!on && !liveMine(g) && g.status !== "invited") prompt(g.names[g.opp] + "'s move.");
  }
  function liveServerOver(g, game, out) {
    if (state.game !== g || g.done) return;
    if (out.unfinished) return endLive("abandon", null, true, out.why);
    endLive(out.kind, out.loser, false);
  }
  async function liveMove(opt) {
    const g = state.game, nav = state.nav;
    if (!g || !g.live || g.done || !liveMine(g) || state.phase !== "think") return;
    state.phase = "busy"; state.selected = null; paintPlay(); stopThinkMeter();
    const side = g.chess.turn(), ply = g.chess.history().length;
    const fenBefore = g.chess.fen(), packBefore = P.packList(P.boardList(g.chess));
    const m = g.chess.move(opt.san);
    if (!m) { state.phase = "think"; return; }
    if (!LIVE.session || !LIVE.session.move(m.lan, g.chess.fen())) {
      g.chess.undo(); state.phase = "think"; toast("Hang on, catching up with the other phone.", 1600);
      if (LIVE.session) LIVE.session.poke();
      return openLiveTurn();
    }
    syncBoard({ from: m.from, to: m.to });
    const dest = sq(m.to) && sq(m.to).querySelector(".piece"); if (dest) dest.classList.add("pop");
    sfx("move"); if (m.captured) explode(m.to, false);
    g.moves += 1; renderPlayFoot();
    const rec = { n: Number(String(fenBefore).split(" ")[5]) || 1, side: side, profile: g.me, ply: ply,
      fen: fenBefore, bait: { uci: m.lan, san: m.san }, took: !!m.captured,
      arrive: g.lastMove ? g.lastMove.uci : null, arrivePosition: g.lastMove ? g.lastMove.pack : null };
    g.rec.push(rec);
    g.lastMove = { uci: m.lan, pack: packBefore };
    const kind = versusOutcome(g.chess);
    // His own move only, scored exactly the way one-phone versus scores it.
    let job = Promise.resolve();
    if (g.watched) {
      const fenAfter = g.chess.fen();
      job = Promise.all([
        E().evaluate(fenBefore, { depth: EVAL_DEPTH }).then(function (s) {
          rec.before = { cp: s.cp, mate: s.mate };
          rec.best = { uci: s.best, san: sanOf(fenBefore, s.best), pv: (s.pv || []).slice(0, 4) };
        }).catch(function () {}),
        kind ? Promise.resolve() : E().evaluate(fenAfter, { depth: EVAL_DEPTH }).then(function (s) {
          rec.after = { cp: s.cp, mate: s.mate }; rec.punish = (s.pv || []).slice(0, 3);
        }).catch(function () {}),
      ]).then(function () { saveLive(); versusReact(nav, g, rec); });
      g.jobs.push(job.catch(function () {}));
    }
    saveLive();
    if (kind) { await job.catch(function () {}); return finishLive(g, kind); }
    if (!g.watched) versusSay(P.moveKind(m.san), g.names[g.me]);
    openLiveTurn();
  }
  // Mate and the draws: both boards see them; whichever phone gets there first tells the server.
  function finishLive(g, kind) {
    if (LIVE.session) LIVE.session.end(kind).catch(function () {});
    endLive(kind, kind === "mate" ? g.chess.turn() : null, false);
  }
  function liveResign() {
    const g = state.game; if (!g || !g.live || g.done) return;
    if (LIVE.session) LIVE.session.end(g.status === "invited" ? "abandon" : "resign").catch(function () {});
    if (g.status === "invited") return endLive("abandon", null, true, "abandon");
    endLive("resign", g.colour, false);
  }
  function saveLive() {
    const g = state.game; if (!g || !g.live) return;
    state.settings.live = Object.assign({}, state.settings.live || {}, { id: g.id, rec: g.rec, at: now() });
    save();
  }
  const LIVE_TITLE = { abandon: "NOBODY FINISHED" };
  async function endLive(kind, loser, unfinished, why) {
    const g = state.game; if (!g || !g.live || g.done) return;
    const nav = state.nav;
    g.done = true; state.phase = "busy"; stopThinkMeter();
    stopLiveSession();
    const title = unfinished ? LIVE_TITLE.abandon : (VERSUS_TITLE[kind] || "GAME OVER");
    banner(title, kind === "mate" || kind === "resign" ? "win" : "tease");
    if (!unfinished) versusSay(kind, loser ? g.names[loser === "w" ? g.seats.white : g.seats.black] : g.names[g.seats.white]);
    sfx(kind === "mate" ? "win" : "select");
    await Promise.race([Promise.all(g.jobs.map(function (j) { return j.catch(function () {}); })), sleep(4000)]);
    const t = now();
    let res = { t: t, kind: kind, live: true, cards: [] };
    try {
      res = V.liveResult({ me: g.me, names: g.names, kind: kind, records: g.rec, white: g.seats.white, loser: loser, t: t,
        unfinished: !!unfinished }, { Chess: CHESS, F: F });
    } catch (e) { res = { t: t, kind: kind, live: true, cards: [] }; }
    const c = res.cards[0];
    if (c && g.rec.length) {
      let st = state.profiles[g.me] || freshStats();
      if (c.fights && c.fights.length) st = Object.assign({}, st, { gameFights: P.storeFights(st.gameFights, c.fights) });
      if (!unfinished) {
        st = S.recordVersus(st, { colour: c.colour, result: c.result, blunders: c.blunders, matched: c.matched,
          moves: c.moves, bestMoves: c.best ? [c.best] : [], t: t }).stats;
      } else if (c.best) st = Object.assign({}, st, { bestMoves: S.storeBestMoves(S.bestMovesOf(st), [c.best], S.BEST_MOVES_MAX) });
      state.profiles[g.me] = st;
    }
    if (!unfinished) state.settings.versus = Object.assign({ lastWhite: null, saved: null }, state.settings.versus, { lastWhite: g.seats.white });
    state.settings.live = null;
    state.game = null; state.flip = false; document.body.dataset.play = "";
    renderPlayFoot(); renderVersusChip();
    if (E()) E().quit();
    useProfile(state.settings.profile); save(); hud(); syncSoon();
    state.versusResult = res;
    if (stale(nav)) return;
    if (unfinished && !g.rec.length) {
      toast(why === "declined" ? g.names[g.opp] + " said not now." : "No game this time.", 2400);
      return goHome();
    }
    showVersusOver(res, unfinished ? "abandon" : kind, loser, g);
    $("vs-over-title").textContent = title;
    $("vs-over-sub").textContent = "Your card. The other phone has its own — there is no score between you.";
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
    // Straight off the back of a game: run the fights it made, in order, then stop. No day, no cap,
    // no picker — he asked for this one board and the card for it is already in the binder.
    if (state.fromGame) {
      state.index += 1;
      if (state.index < state.encounters.length) return startEncounter();
      state.fromGame = false; goHome();
      return toast("That one lives in Your games now.", 2400);
    }
    if (campOn()) return campNext();           // camp runs its own fixed order, not the adaptive picker
    if (dayDone()) return endSession();
    if (state.session.count >= state.settings.cap) return endSession();
    if (state.mode === "coop") { useProfile(state.active === 0 ? 1 : 0); toast(activeName() + "'s turn.", 1600); }
    state.index = pickNext(); startEncounter();
  }
  function endSession() {
    stopBlitz();
    if (campOn()) return campEnd();            // camp closes on its own debrief card
    const prep = !!state.prep;
    const day = prep ? { n: 0, title: "Prep" } : D.dayByNumber(state.day || 1);
    const pr = prep
      ? { complete: dayDone(), done: state.encounters.filter(function (e) { return !!state.stats.cardsEarned[e.id]; }).length, total: state.encounters.length }
      : D.dayProgress(state.stats, day.n);
    const rank = S.agentRank(state.stats);
    const c = S.dailyChallenger(state.stats, now());
    const nxt = prep ? null : D.nextDay(day.n);
    const who = state.mode === "solo" ? activeName() : state.settings.names.join(" and ");

    if (pr.complete && !prep && !state.endCounted) {       // per kid; a co-op day counts for both of them
      (state.mode === "solo" ? [state.active] : [0, 1]).forEach((i) => { state.sittingDays[i] += 1; });
      state.endCounted = true;
    }
    const boss = S.bossHp(state.stats, now());
    $("end-title").textContent = pr.complete
      ? (boss.ko ? "KNOCKOUT! You beat " + boss.name + ", " + who + "!" : (prep ? "Prep done, " : "Day " + day.n + " done, ") + who + "!")
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
      if (peek) { if ($("next-mini")) $("next-mini").hidden = false; renderMini(peek); }
    }
    $("session-end").hidden = false; state.phase = "end";
  }
  function startSession(mode) {
    state.camp = null;
    state.mode = mode || "solo";
    state.settings.lastPlayed = now(); state.sitting = (state.sitting || 0) + 1; state.endCounted = false;
    state.session = { count: 0, reviews: 0, won: 0, crits: 0, rage: 0 };
    useProfile(state.mode === "solo" ? state.settings.profile : 0);
    const dk0 = S.dateKey(now());
    if (S.bootsFree(state.stats.battle, dk0)) {
      state.stats.battle = S.useBoots(state.stats.battle, dk0); save();
      toast("Rewind Boots: your first miss today is shielded.", 2200);
    }
    state.index = pickNext(-1); startEncounter();
  }
  function goHome() {
    // Leave at any moment. Cards already earned are saved; only the unfinished fight is dropped.
    state.nav += 1; skipAhead(); voiceStop();
    // Release a why-gate waiting on taps. A camp warm-up uses the same gate with no promise behind
    // it, so Home during "spot the attack" used to throw and strand the kid on the board.
    if (state.gate) { const r = state.gate.resolve; state.gate = null; if (r) r(); }
    document.querySelectorAll(".modal").forEach((m) => { m.hidden = true; });
    const leavingCamp = campOn() || flashOn();
    state.flash = null; flashRingOff(); flashChips(null); clearGhost();
    // A game in progress is kept, not dropped: the resume chip on the map picks it back up on the
    // move he left it on. Stockfish is let go, because 40 MB of idle WASM on a phone is not free.
    // A two-phone game stays open on the server; the Resume chip picks it up from sm_live_get.
    if (state.game && !state.game.done) { if (state.game.live) saveLive(); else if (state.game.versus) saveVersus(); else saveGame(); }
    stopLiveSession();
    if (state.game) { state.game = null; if (E()) E().quit(); }
    state.flip = false; state.vs = null; state.versusResult = null;
    stopThinkMeter(); if ($("versus-turn")) $("versus-turn").hidden = true;
    document.body.dataset.play = ""; state.review = null; state.fromGame = false;
    state.mode = "solo"; state.duel = null; state.camp = null; state.phase = "home"; stopBlitz();
    useProfile(state.settings.profile);
    if (leavingCamp) setDay(state.settings.day || 1);   // camp is not a stop on the map; put the map back on a real day
    renderTeam(); renderPath(); hud(); show("screen-title"); renderDayStrip();
    if (LIVE.poller) LIVE.poller.poke(); }

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
    // His own games get a room of their own at the end of the binder. Those cards are not part of
    // the "x of y" count, because that count is the authored set and it must not move under him.
    const mine = gameFightsOf(state.stats);
    const rooms = {};
    ALL.concat(mine).forEach((e) => { (rooms[e.palaceRoom] = rooms[e.palaceRoom] || []).push(e); });
    const root = $("palace-rooms"); root.innerHTML = "";
    const earned = state.stats.cardsEarned || {};
    const mineWon = mine.filter((e) => earned[e.id]).length;
    $("collection-summary").textContent = activeName() + ": " + ALL.filter((e) => earned[e.id]).length + " of " + ALL.length + " cards"
      + (mineWon ? ", and " + mineWon + " off " + (mineWon === 1 ? "a board" : "boards") + " from your own games." : ".");
    Object.keys(rooms).forEach((name) => {
      const div = document.createElement("div"); div.className = "room"; div.innerHTML = "<h3>" + name + "</h3>";
      rooms[name].forEach((e) => {
        const c = earned[e.id], f = document.createElement("div");
        const cracked = !!(c && c.clean === false);
        f.className = "fig" + (c ? (c.critical ? " crit" : "") + (cracked ? " cracked" : "") : " locked");
        const art = window.ShockmateMotifs ? window.ShockmateMotifs.icon(e.motif, 28) : "";
        f.innerHTML = '<div class="art">' + art + '</div><div class="txt"><b>' + (c ? (c.critical ? "★ " : "") + e.title : "? ? ?") + "</b><small>" + (c ? H.whyFor(e, wantsShort()) : "Beat Glitch on this board to unlock.") + "</small>" +
          (cracked ? '<em class="crack-word">cracked</em>' : "") + "</div>";
        div.appendChild(f);
      });
      root.appendChild(div);
    });
  }

  /* ---------- bindings ---------- */
  /* Three control kinds only, so every checkbox and select on this screen became a chip that fills
     when it is on. `state.settings` keeps the exact shapes it always had; only the thing the parent
     taps changed. Fights per session is an <output>, whose .value is its text, so the old read still works. */
  function setChip(id, on) {
    const el = $(id); if (!el) return;
    el.classList.toggle("active", !!on); el.setAttribute("aria-pressed", on ? "true" : "false");
  }
  function chipOn(id) { const el = $(id); return !!(el && el.classList.contains("active")); }
  function setPair(id, value) {
    const host = $(id); if (!host) return;
    host.dataset.value = value;
    Array.prototype.forEach.call(host.querySelectorAll("button[data-coach]"), function (b) {
      b.classList.toggle("active", b.dataset.coach === value);
    });
  }
  function pairValue(id, fallback) { const host = $(id); return (host && host.dataset.value) || fallback; }
  function stepCap(d) {
    const el = $("opt-cap"); if (!el) return;
    el.value = String(Math.max(3, Math.min(12, (Number(el.value) || 6) + d)));
  }
  function renderSettings() {
    const coach = S.parentOf(state.settings);
    if ($("settings-head")) $("settings-head").textContent = "Coach: " + (coach.name || "you");
    if ($("opt-parent-name")) $("opt-parent-name").value = coach.name;
    $("opt-name-0").value = state.settings.names[0]; $("opt-name-1").value = state.settings.names[1]; $("opt-cap").value = String(state.settings.cap);
    setChip("opt-sound", state.settings.sound); setChip("opt-coords", state.settings.coords); setChip("opt-hurry", state.settings.hurry);
    setChip("opt-tournament", !!state.settings.tournament); setChip("opt-readaloud", state.settings.readAloud !== false);
    [0, 1].forEach(function (i) {
      setChip("opt-blitz-" + i, !!state.settings.blitz[i]);
      setChip("opt-short-" + i, !!state.settings.short[i]);
      // Shows the style in force, which is the short-lines default until the parent picks one.
      setPair("opt-coach-" + i, coachStyle(i));
    });
    renderFamilyCard();
  }
  function switchProfile(i) { setSeats(1); state.settings.profile = i; useProfile(i); save(); hud(); }

  /* ---------- the coach's gate ----------
     Say what it is in the hint: a speed bump, not security. The PIN is stored in clear and travels in
     the backup file. Its whole job is that a kid who taps the cog lands back on the map instead of
     inside Progress, so a wrong PIN only shakes and there is no lockout to lock a parent out with.
     Modes: setup / setup2 (choose then confirm), change / change2, ask (unlock). S.parentGate holds
     the decision; this only draws it. */
  const GATE = { mode: null, target: "settings", typed: "", first: "" };
  function renderPinDots() {
    const host = $("pin-dots"); if (!host) return;
    let h = ""; for (let i = 0; i < 4; i++) h += '<span class="' + (i < GATE.typed.length ? "on" : "") + '"></span>';
    host.innerHTML = h;
  }
  function gateShake() {
    const c = $("gate-card"); if (!c) return;
    c.classList.remove("wrong"); void c.offsetWidth; c.classList.add("wrong"); sfx("nope");
  }
  function gateShow(mode, target) {
    GATE.mode = mode; if (target) GATE.target = target;
    GATE.typed = "";
    if (mode === "setup" || mode === "change") GATE.first = "";
    const setup = mode === "setup", name = S.parentOf(state.settings).name;
    $("gate-name-row").hidden = !setup;
    $("btn-forgot").hidden = mode !== "ask";
    $("gate-forgot").hidden = true;
    $("gate-title").textContent = setup ? "Who is the coach?"
      : mode === "ask" ? (name ? name + "'s PIN" : "Coach PIN")
      : mode === "change" ? "New PIN" : "Type it again";
    $("gate-hint").textContent = setup
      ? "Pick a 4-digit PIN. It keeps a kid out of Settings and Progress. It is a speed bump, not a lock: it is stored on this device in clear and it travels in the backup file."
      : mode === "ask" ? "Four digits. Home, fights, cards and Camp never ask for this."
      : "Four digits, and once more to be sure.";
    if (setup && $("gate-name")) $("gate-name").value = name;
    renderPinDots(); show("screen-gate");
  }
  function gateKey(k) {
    if (k === "back") { GATE.typed = GATE.typed.slice(0, -1); return renderPinDots(); }
    if (GATE.typed.length >= 4) return;
    GATE.typed += k; sfx("select"); renderPinDots();
    if (GATE.typed.length === 4) setTimeout(gateDone, T(160));
  }
  function gateDone() {
    const m = GATE.mode, typed = GATE.typed;
    if (m === "ask") {
      if (!S.parentGate(state.settings, typed).open) {
        GATE.typed = ""; renderPinDots(); gateShake(); toast("Not that one.", 1400); return;
      }
      return gateOpen();
    }
    if (m === "setup" || m === "change") { GATE.first = typed; return gateShow(m === "setup" ? "setup2" : "change2"); }
    if (typed !== GATE.first) {
      gateShake(); toast("Those two did not match.", 2200);
      return gateShow(m === "setup2" ? "setup" : "change");
    }
    const was = S.parentOf(state.settings).name;
    const name = m === "setup2" ? ((($("gate-name") || {}).value || "").trim().slice(0, 16) || was) : was;
    state.settings.parent = { name: name, pin: typed };
    save();
    toast(m === "setup2" ? "Coach set. The cog asks for this from now on." : "PIN changed.", 2200);
    gateOpen();
  }
  function gateOpen() {
    const target = GATE.target;
    GATE.mode = null; GATE.typed = ""; GATE.first = "";
    if (target === "progress") { renderProgress(); return show("screen-progress"); }
    renderSettings(); show("screen-settings");
  }
  // The one door into the parent's half of the app. No PIN set yet means the setup card, not the keypad.
  function openParent(target) {
    GATE.target = target || "settings";
    gateShow(S.parentSet(state.settings) ? "ask" : "setup", GATE.target);
  }

  function bind() {
    $("prof-0").onclick = () => switchProfile(0); $("prof-1").onclick = () => switchProfile(1);
    $("seat-1").onclick = () => { setSeats(1); save(); hud(); };
    $("seat-2").onclick = () => { setSeats(2); save(); hud(); };
    $("btn-names").onclick = () => { $("btn-settings").click(); };
    $("btn-start").onclick = () => (pacingOn() ? startCamp() : startSession("solo"));
    if ($("btn-anyway")) $("btn-anyway").onclick = () => startSession("solo");
    $("btn-coop").onclick = () => { startSession("coop"); toast(state.settings.names[0] + " starts. Take turns.", 2000); };
    $("btn-duel").onclick = startDuel;
    $("btn-duel-next").onclick = duelNextBoard;
    $("btn-duel-home").onclick = goHome;
    $("btn-next").onclick = nextEncounter;
    $("btn-peek").onclick = async function () {
      const enc = current(); $("btn-peek").hidden = true; show("screen-play"); state.phase = "busy";
      const start = F.piecesFromList(enc.pieces); banner("THE BIGGEST ONE", "win"); glitchMoment("peek"); prompt("Best was " + enc.bestSan + ".");
      await playLine(enc.bestLineUci, start); finisher(enc); await sleep(900); showCard(enc, "best", false);
    };
    $("btn-replay").onclick = async function () {
      const enc = current(); show("screen-play"); state.phase = "busy"; const start = F.piecesFromList(enc.pieces);
      banner("GLITCH'S FUTURE", "miss"); glitchSay(enc.glitch.gloat, "smug", voiceKeyFor(enc, "gloat")); prompt(enc.temptingSan + " — the bait."); clearMarks();
      await playLine(enc.temptingLineUci, start); await sleep(500);
      banner("YOUR FUTURE", "win"); glitchSay(enc.glitch.rage, "rage", voiceKeyFor(enc, "rage")); prompt(enc.bestSan + " — the move Glitch fears."); clearMarks();
      await playLine(enc.bestLineUci, start); finisher(enc); await sleep(900); showCard(enc, state.lastTier || "best", false);
    };
    // Play: the second arcade button in the dock, the resume chip, and the quiet way out of a game.
    if ($("btn-play")) $("btn-play").onclick = openPregame;
    if ($("btn-resume")) $("btn-resume").onclick = resumeGame;
    if ($("btn-play-back")) $("btn-play-back").onclick = function () { state.pre = null; goHome(); };
    if ($("btn-play-go")) $("btn-play-go").onclick = function () {
      if (!state.pre || !state.pre.ready) return;
      const level = state.pre.level;
      clearSavedGame(); save();
      loadEngine().then(function () { startGame(level, null, null); })
        .catch(function () { toast("Glitch is asleep. The fights still work.", 3000); goHome(); });
    };
    if ($("btn-resign")) $("btn-resign").onclick = function () {
      if (!playing() || state.game.done) return;
      if (state.game.live) return liveResign();
      if (state.game.versus) return endVersus(state.nav, "resign", state.game.chess.turn());
      endGame(state.nav, "quit");           // endGame says the line
    };
    // Versus: the arcade button under "Both", the resume chip, the colour swap and the way out.
    if ($("btn-versus")) $("btn-versus").onclick = function () { openVersusPre(false); };
    if ($("btn-versus-resume")) $("btn-versus-resume").onclick = function () { openVersusPre(true); };
    if ($("btn-vs-swap")) $("btn-vs-swap").onclick = function () {
      if (!state.vs || state.vs.resume) return;
      state.vs.seats = V.swapSeats(state.vs.seats); sfx("select");
      versusLine("turn"); renderVersusPre();
    };
    if ($("btn-vs-go")) $("btn-vs-go").onclick = versusGo;
    if ($("btn-vs-back")) $("btn-vs-back").onclick = function () { state.vs = null; goHome(); };
    if ($("btn-vs-done")) $("btn-vs-done").onclick = goHome;
    // Two phones: invite the sibling, accept or wave off his invite, pick a game back up.
    if ($("btn-live-invite")) $("btn-live-invite").onclick = liveInvite;
    if ($("btn-live-accept")) $("btn-live-accept").onclick = liveAccept;
    if ($("btn-live-decline")) $("btn-live-decline").onclick = liveDecline;
    if ($("btn-live-resume")) $("btn-live-resume").onclick = liveResume;
    bindFamily();
    if ($("btn-review")) $("btn-review").onclick = runReview;
    if ($("btn-over-home")) $("btn-over-home").onclick = goHome;
    if ($("btn-fight-now")) $("btn-fight-now").onclick = fightFromGame;
    if ($("btn-fight-later")) $("btn-fight-later").onclick = function () {
      toast("Saved. Prep and Camp will start with it.", 2600); goHome();
    };
    $("btn-home").onclick = goHome;
    $("btn-collection").onclick = function () { renderCollection(); show("screen-collection"); };
    $("btn-back-play").onclick = function () { show(state.phase === "card" ? "screen-card" : state.phase === "duel" ? "screen-duel" : state.phase === "think" || state.phase === "gate" ? "screen-play" : "screen-title"); };
    $("btn-settings").onclick = function () { openParent("settings"); };
    // Progress sits inside Settings, so reaching this button already meant passing the keypad.
    if ($("btn-progress")) $("btn-progress").onclick = function () { renderProgress(); show("screen-progress"); };
    if ($("btn-progress-back")) $("btn-progress-back").onclick = function () { renderSettings(); show("screen-settings"); };
    Array.prototype.forEach.call(document.querySelectorAll("#keypad .key"), function (b) {
      b.onclick = function () { gateKey(b.dataset.key); };
    });
    $("btn-gate-back").onclick = function () { GATE.mode = null; GATE.typed = ""; GATE.first = ""; goHome(); };
    $("btn-forgot").onclick = function () { const el = $("gate-forgot"); el.hidden = !el.hidden; };
    if ($("btn-change-pin")) $("btn-change-pin").onclick = function () { gateShow("change", "settings"); };
    Array.prototype.forEach.call(document.querySelectorAll("#screen-settings .chip.toggle"), function (b) {
      b.onclick = function () { setChip(b.id, !chipOn(b.id)); };
    });
    [0, 1].forEach(function (i) {
      const host = $("opt-coach-" + i); if (!host) return;
      Array.prototype.forEach.call(host.querySelectorAll("button[data-coach]"), function (b) {
        b.onclick = function () { setPair("opt-coach-" + i, b.dataset.coach); };
      });
    });
    if ($("cap-down")) $("cap-down").onclick = function () { stepCap(-1); };
    if ($("cap-up")) $("cap-up").onclick = function () { stepCap(1); };
    $("btn-export").onclick = exportBackup;
    $("btn-import").onclick = function () { $("file-import").click(); };
    $("file-import").onchange = function (ev) {
      const file = ev.target.files && ev.target.files[0]; if (!file) return;
      const r = new FileReader();
      r.onload = function () { importBackup(String(r.result)); };
      r.onerror = function () { toast("Could not read that file.", 2400); };
      r.readAsText(file); ev.target.value = "";
    };
    // Settings -> Family: the code, Share, sync now, change player, leave (local only), or set up.
    if ($("btn-family-setup")) $("btn-family-setup").onclick = function () { openFamily("settings"); };
    if ($("btn-family-share")) $("btn-family-share").onclick = function () { shareFamily(fam().code); };
    if ($("btn-family-switch")) $("btn-family-switch").onclick = function () { openFamily("settings", fam().code); };
    if ($("btn-family-leave")) $("btn-family-leave").onclick = function () {
      if (!confirm("Leave the family on this phone? Cards stay here; this phone just stops syncing.")) return;
      state.settings.family = blankFamily(true); state.settings.syncedAt = 0; state.settings.live = null;
      restartLivePoller(); save(); renderFamilyCard(); toast("This phone is on its own now.", 2200);
    };
    $("btn-sync").onclick = function () {
      if (!syncOn()) { renderFamilyCard("Pick this phone's player to sync."); return; }
      renderFamilyCard("Syncing…"); syncNow(false);
    };
    $("btn-close-settings").onclick = function () {
      const oldNames = state.settings.names.slice();
      state.settings.names = [$("opt-name-0").value.trim() || "Player 1", $("opt-name-1").value.trim() || "Player 2"];
      // A rename reaches the family when this phone knows that kid's PIN; otherwise the roster wins next sync.
      Y.syncSlots(fam()).forEach(function (i) {
        if (state.settings.names[i] === oldNames[i]) return;
        Y.rename(syncCfg(), fam().code, i, fam().pins[i], state.settings.names[i]).catch(function () {});
      });
      state.settings.cap = Math.max(3, Math.min(12, Number($("opt-cap").value) || 6));
      state.settings.sound = chipOn("opt-sound"); state.settings.coords = chipOn("opt-coords"); state.settings.hurry = chipOn("opt-hurry");
      state.settings.tournament = chipOn("opt-tournament"); state.settings.readAloud = chipOn("opt-readaloud");
      state.settings.blitz = [chipOn("opt-blitz-0"), chipOn("opt-blitz-1")];
      state.settings.short = [chipOn("opt-short-0"), chipOn("opt-short-1")];
      state.settings.coach = [0, 1].map((i) => pairValue("opt-coach-" + i, state.settings.coach[i]));
      // The PIN is only ever changed through the keypad; this carries the name alone.
      state.settings.parent = Object.assign({ name: "", pin: "" }, state.settings.parent,
        { name: $("opt-parent-name") ? $("opt-parent-name").value.trim().slice(0, 16) : "" });
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
      const dkT = S.dateKey(now());
      if (S.tellFree(state.stats.battle, dkT)) { state.stats.battle = S.useTell(state.stats.battle, dkT); toast("Tell Goggles: free today.", 1400); }
      else if (!S.canAfford(state.stats.battle, "tell")) { toast("Glitch's Tell needs 1 power. Win a fight.", 1800); return; }
      else state.stats.battle = S.armAbility(state.stats.battle, "tell");
      save(); renderPowers();
      const el = sq(enc.tempting.slice(2, 4)); if (el) el.classList.add("tempt-glow"); toast("Glitch flinches at THAT one. So don't.", 2000);
    };
    $("btn-skip").onclick = function () {
      // A flash item he cannot see: show the answer, count it as a miss, move on. Honest, and brief.
      if (state.phase === "flash" && state.gate && state.gate.flash) return flashSettle(false);
      if (state.phase === "threat" && state.gate && state.gate.look) {   // skip the board from the look-first tap: count it honestly
        const g = state.gate; state.gate = null; state.phase = "busy";
        lookRecord(g, false); $("gate-dots").innerHTML = ""; $("prompt").classList.remove("gate-prompt");
        // Inside a game there is no next board to skip to; the gate just lets go and he moves.
        if (playing()) { g.targets.forEach((t) => sq(t) && sq(t).classList.add("gate-ok")); g.resolve("open"); return; }
        g.resolve("skip"); nextEncounter(); return;
      }
      if (state.phase === "threat" && state.camp) {      // a warm-up he cannot see: show it, count it honestly, move on
        const g = state.gate, c = state.camp;
        c.threatsAsked += g.targets.length; c.threatsFound += g.found.length; c.wrongTaps += g.wrong;
        state.stats = S.recordThreat(state.stats, { targets: g.targets.length, found: g.found.length, wrongTaps: g.wrong }).stats; save();
        g.targets.forEach((t) => sq(t) && sq(t).classList.add("gate-ok"));
        state.phase = "busy"; state.gate = null; $("gate-dots").innerHTML = ""; $("prompt").classList.remove("gate-prompt");
        prompt("That is what he was attacking."); c.w += 1;
        setTimeout(function () { if (state.camp) nextWarmup(); }, T(1200));
        return;
      }
      if (state.phase !== "think" || playing()) return;   // there is no next board inside a game
      nextEncounter();
    };
    $("btn-end-ok").onclick = function () { $("session-end").hidden = true; goHome(); };
    if ($("btn-next-day")) $("btn-next-day").onclick = function () {
      const nxt = D.nextDay(state.day || 1);
      $("session-end").hidden = true;
      if (nxt) { setDay(nxt); save(); startSession(state.mode === "coop" ? "coop" : "solo"); }
      else goHome();
    };
    // Tap to skip an animation — but never the flash reveal: the reveal IS the exercise.
    document.querySelector(".board-wrap").addEventListener("click", function () { if (state.phase === "busy" && !flashOn()) skipAhead(); }, true);
  }
  function selfTest() {
    const errors = []; const list = ALL;
    if (ALL.filter((e) => e.pack === "tactics").length < 12) errors.push("tactics pack should hold at least the 12 original fights");
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
  // First launch, or a ?family=CODE share link: the one-tap setup card. "Skip" is remembered.
  (function firstRun() {
    const link = Y.codeFromSearch(location.search);
    if (link && !(fam().code === link && familyJoined())) return openFamily("first", link);
    if (!Y.validCode(fam().code) && !fam().skipped) return openFamily("first");
  })();
  restartLivePoller();
  // Back from the background: ask the server straight away rather than waiting out a poll.
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) return;
    if (LIVE.session) LIVE.session.poke();
    if (LIVE.poller) LIVE.poller.poke();
  });
  window.addEventListener("online", function () { if (LIVE.poller) LIVE.poller.poke(); if (LIVE.session) LIVE.session.poke(); });
  window.__shockmate = { state, startEncounter, nextEncounter, current, startSession, startDuel, startCamp, campOn, coachStyle, setDay, setSeats, syncNow, exportBackup, importBackup, openParent, gateKey, renderProgress, renderSettings, renderCollection, save, all: ALL, BUILD,
    startFlash, flashOn, flashAnswer, flashItems,
    openPregame, startGame, resumeGame, loadEngine, playing, kidMove, runReview, fightFromGame, playPool, gameFightsOf,
    openVersusPre, versusGo, startVersus, versusMove, versusOn, endVersus, versusFightNow, renderVersusCards,
    openFamily, openLive, liveInvite, liveAccept, liveResign, restartLivePoller, live: LIVE, fam: fam,
    engine: E, chess: function () { return CHESS; } };
})();
