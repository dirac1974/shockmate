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

