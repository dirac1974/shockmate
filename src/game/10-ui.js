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
  // One kid's week as a message, from his own profile only. It goes wherever the phone can send text.
  function shareWeek(i) {
    const st = state.profiles[i] || freshStats(), name = state.settings.names[i] || ("Player " + (i + 1));
    return shareText(S.weeklySummary(st, ALL, name, now()), "Copied. Paste it into a message.");
  }
  function renderProgress() {
    const root = $("progress-root"); if (!root) return;
    root.onclick = function (ev) {
      const b = ev.target && ev.target.closest ? ev.target.closest("button[data-share-week]") : null;
      if (b) shareWeek(Number(b.dataset.shareWeek));
    };
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
        /* Real boards against random ones (the Flash control, Chase & Simon). The parent's line only:
           the kid is never told which board was which beyond Glitch owning up to the joke. */
        (p.flash.items
          ? '<p class="prog-line flash-gap"><b>Flash, real vs random:</b> ' + esc(p.flash.control.line) +
            (p.flash.control.note ? " " + esc(p.flash.control.note) : "") + "</p>"
          : "") +
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
        '<div class="chip-row"><button type="button" class="chip" data-share-week="' + i + '">Share ' + esc(name) + "’s week</button></div>" +
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
  /* iPad and iPhone Safari only let a page start sound from inside a tap, and every `new Audio()` is a
     fresh element that needs its own tap. Glitch mostly speaks a beat AFTER a tap (the animation runs
     first), so on iOS almost every line was silently refused. Fix: ONE audio element for all speech,
     unlocked by the first tap anywhere (it plays a 60 ms silent clip), then reused by swapping `src`,
     which iOS allows once an element has been unlocked. A line refused anyway is kept and played on
     the next tap, so he is late rather than mute. The same first tap resumes the sfx AudioContext. */
  const SILENT = "data:audio/wav;base64,UklGRgQCAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YeABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIA=";
  function voiceEl() {
    if (!VOICE.el) { VOICE.el = new Audio(); VOICE.el.preload = "auto"; VOICE.el.setAttribute("playsinline", ""); }
    return VOICE.el;
  }
  function voiceUnlock() {
    if (VOICE.unlocked) return;
    const el = voiceEl();
    try {
      el.src = SILENT; const p = el.play();
      const ok = function () { VOICE.unlocked = true; const k = VOICE.pending; VOICE.pending = null; if (k) voicePlay(k); };
      if (p && p.then) p.then(ok).catch(function () {}); else ok();
    } catch (e) {}
    try { if (ac && ac.state === "suspended") ac.resume(); } catch (e) {}
  }
  ["pointerdown", "touchend", "keydown"].forEach(function (ev) { document.addEventListener(ev, voiceUnlock, { capture: true, passive: true }); });
  function voicePlay(key) {
    if (!voiceOn()) return false;
    const file = VOICE.manifest.files[key]; if (!file) return false;
    const a = voiceEl(), token = (VOICE.token || 0) + 1; VOICE.token = token; VOICE.current = a;
    try { a.pause(); } catch (e) {}
    const done = function () {
      if (VOICE.token !== token) return; VOICE.current = null;
      const next = VOICE.queue.shift(); if (next) voicePlay(next);
    };
    a.onended = done; a.onerror = done;
    a.src = "voice/" + file;
    const p = a.play();
    if (p && p.catch) p.catch(function (err) {
      // Refused (no tap yet on iOS): keep the line for the next tap instead of dropping it.
      if (err && err.name === "NotAllowedError") { VOICE.unlocked = false; VOICE.pending = key; VOICE.queue = []; return; }
      done();
    });
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

