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

