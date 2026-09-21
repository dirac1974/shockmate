/* Shockmate arena v0.3 — Phase 0 "playable truth".
   States: home > think > tease > consequence > (secondTry | confession > guided) > gate > card > next | end.
   Engine is judge (pre-baked tiers). Animation is teacher. Nothing on screen goes down. Every fight is winnable. */
(function () {
  const F = window.ShockmateFutures, S = window.ShockmateScore, D = window.ShockmateDays;
  const FILES = "abcdefgh", KEY = "shockmate-v2";
  // Read this off the home screen to tell what a phone actually loaded — Pages and the
  // service worker both cache, so "I don't see the new screen" is usually a stale copy.
  // Bump it here, with CACHE in web/sw.js, then npm run build:game.
  const BUILD = "v0.32";
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
    showNames();
  }
  // Whatever is on screen follows the names in settings. Without this, a roster rename landing while
  // Settings is open leaves the old name in the box, and closing Settings writes it back over the
  // rename — and pushes it to the family. The home chips are the same names and follow too.
  function showNames() {
    if ($("opt-name-0")) $("opt-name-0").value = state.settings.names[0];
    if ($("opt-name-1")) $("opt-name-1").value = state.settings.names[1];
    [0, 1].forEach((i) => { const b = $("prof-" + i); if (b) b.textContent = state.settings.names[i]; });
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

  /* ---------- staying signed in on a phone ----------
     A join lives in localStorage, and on iOS localStorage is a loan: it is cleared after about a
     week without a visit, it starts empty in Private Browsing, and a link opened inside Messages or
     Instagram gets a jar that is thrown away with the sheet. That is why one parent retyped the
     family code every single morning while the server had his join all along.
     So the URL carries the login too. After a join the address becomes ?family=CODE&me=SLOT, which
     costs nothing, and which a bookmark — above all an Add to Home Screen icon, the only durable
     thing iOS gives a web app — freezes forever. A wiped phone opening that icon knows who it is and
     asks for one PIN, not a code, a roster and a PIN. */
  const BROWSER = Y.browserFacts(navigator, (function () { try { return window.localStorage; } catch (e) { return null; } })());
  const FORGETS_LINE = "This browser forgets logins. Open in Safari to stay signed in.";
  const ADD_HOME_LINE = "Add this to your Home Screen to stay signed in: tap Share, then Add to Home Screen.";
  function stampIdentity() {
    const f = fam();
    if (!Y.joined(f)) return;
    try {
      const q = new URLSearchParams(location.search);
      // The hub's own params did their job on arrival; the canonical pair replaces them.
      ["f", "u", "from"].forEach(function (k) { q.delete(k); });
      q.set("family", f.code); q.set("me", String(f.me));
      const next = location.pathname + "?" + q.toString() + location.hash;
      if (next !== location.pathname + location.search + location.hash) history.replaceState(null, "", next);
    } catch (e) {}
  }
  // A note is said once and waved away for good, best effort: on a phone whose storage does not work
  // the dismissal cannot be remembered either, and a line that comes back is better than a silent loss.
  function noteSeen(id) { try { return localStorage.getItem(KEY + ":note:" + id) === "1"; } catch (e) { return false; } }
  function note(id, text) {
    const host = $("app-note"); if (!host || !text || noteSeen(id)) return;
    $("app-note-text").textContent = text; host.dataset.note = id; host.hidden = false;
  }
  function noteHide() {
    const host = $("app-note"); if (!host) return;
    try { if (host.dataset.note) localStorage.setItem(KEY + ":note:" + host.dataset.note, "1"); } catch (e) {}
    host.hidden = true; if ($("btn-note-act")) $("btn-note-act").hidden = true;
  }
  // A new build installed underneath this page (sw.js took over). Never remembered as seen: the next
  // build has to be able to say it again. "got it" keeps the old build until the next open.
  function noteUpdate() {
    const host = $("app-note"); if (!host) return;
    $("app-note-text").textContent = "Shockmate updated."; host.dataset.note = ""; host.hidden = false;
    const act = $("btn-note-act"); if (act) act.hidden = false;
  }
  /* ---------- the safety net ----------
     Nothing in here should ever throw, but a phone that does throw must not freeze a kid on a board
     with no way out. The fault is kept for the coach (Settings foot), the Home button is shown, and one
     toast says what to do. Nothing is sent anywhere. */
  function recordFault(text) {
    const fault = { build: BUILD, at: new Date().toISOString(), text: String(text || "unknown").slice(0, 300) };
    try { localStorage.setItem(KEY + ":fault", JSON.stringify(fault)); } catch (e) {}
    if (state.faulted) return;
    state.faulted = true; setTimeout(function () { state.faulted = false; }, 4000);
    try { const h = $("btn-home"); if (h) h.hidden = false; toast("Something went wrong. Tap Home to keep going.", 3200); } catch (e) {}
  }
  function lastFault() { try { return JSON.parse(localStorage.getItem(KEY + ":fault") || "null"); } catch (e) { return null; } }
  function renderDiag() {
    const el = $("diag"); if (!el) return;
    const f = lastFault();
    el.textContent = "Build " + BUILD + (f ? " \u00b7 last problem " + String(f.at).slice(0, 16).replace("T", " ") + " (" + f.build + "): " + f.text : " \u00b7 no problems recorded on this phone");
  }
  // Said on arrival when the browser is one that will lose the join, and after a join on an iPhone
  // that could pin the page instead. Never a block: the fights work either way.
  function warnIfForgetful() { if (!BROWSER.storage || BROWSER.inApp) note("forgets", FORGETS_LINE); }
  function afterJoin() {
    stampIdentity();
    if (!BROWSER.storage || BROWSER.inApp) return note("forgets", FORGETS_LINE);
    if (BROWSER.canAddToHome) note("addhome", ADD_HOME_LINE);
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

