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

