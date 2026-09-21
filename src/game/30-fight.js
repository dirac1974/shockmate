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

