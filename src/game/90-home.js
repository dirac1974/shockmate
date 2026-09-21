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
    renderFamilyCard(); renderDiag();
  }
  function switchProfile(i) { setSeats(1); state.settings.profile = i; useProfile(i); save(); hud(); }

