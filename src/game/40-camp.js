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

