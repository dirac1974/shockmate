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
    if ($("btn-note-close")) $("btn-note-close").onclick = noteHide;
    if ($("btn-note-act")) $("btn-note-act").onclick = function () { location.reload(); };
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
