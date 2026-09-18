/* Two-phone versus: the rules the server enforces, mirrored here as pure functions, plus the two
   polling loops the game layer drives. No DOM, no chess, no real clock: the transport and the clock
   are handed in, so tests/test_live.js can run a whole game between two fake phones in a few
   milliseconds.

   The server only ORDERS moves (supabase/migrations/0003_live_games.sql). It checks that it is the
   caller's turn by ply parity and colour, and that the ply is exactly the next one. Legality is
   chess.js's job on each phone: a move that will not play is ignored and the phone resyncs.

   What never crosses between the phones is a number about a kid. Each phone scores only its own
   kid's moves and writes only its own kid's card. */
(function (root) {
  "use strict";
  const POLL_HOME_MS = 5000;        // home screen, joined, online: is anyone inviting me?
  const POLL_GAME_MS = 1500;        // during a game: has the other move arrived?
  const EXPIRE_MS = 60 * 60 * 1000; // a game with no move for an hour is over
  const QUIET_MS = 15000;           // no word from the other phone for this long: say we are waiting
  const UCI_RE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
  const DRAWS = { stalemate: 1, repetition: 1, fifty: 1, material: 1 };
  const UNFINISHED = { abandon: 1, expired: 1, replaced: 1, declined: 1 };

  /* ---------- the turn rules, exactly as the server applies them ---------- */
  function sideAt(ply) { return (Number(ply) || 0) % 2 === 0 ? "w" : "b"; }
  function plyOf(game) { return ((game && game.moves) || []).length; }
  function slotAt(game, ply) { return sideAt(ply) === "w" ? game.white_slot : game.black_slot; }
  function colourOf(game, slot) {
    if (!game) return null;
    return game.white_slot === slot ? "w" : game.black_slot === slot ? "b" : null;
  }
  function opponentOf(game, slot) { return colourOf(game, slot) === "w" ? game.black_slot : colourOf(game, slot) === "b" ? game.white_slot : null; }
  function validUci(uci) { return UCI_RE.test(String(uci || "")); }
  function stamp(t) { if (typeof t === "number") return t; const n = Date.parse(t || ""); return isNaN(n) ? 0 : n; }
  function expired(game, now) { return !!game && game.status !== "over" && (now - stamp(game.updated_at)) > EXPIRE_MS; }
  // The game as a phone should read it at `now`: a silent hour ends it.
  function view(game, now) {
    if (!game) return null;
    const g = Object.assign({}, game, { moves: (game.moves || []).slice() });
    if (expired(g, now)) { g.status = "over"; g.result = "expired"; }
    return g;
  }
  function isMyTurn(game, slot) { return !!game && game.status === "active" && slotAt(game, plyOf(game)) === slot; }
  // Why the server would refuse this move, or null if it would take it.
  function refuse(game, slot, ply, uci, now) {
    const g = view(game, now == null ? stamp(game && game.updated_at) : now);
    if (!g) return "missing";
    if (colourOf(g, slot) == null) return "player";
    if (!validUci(uci)) return "move";
    if (g.status !== "active") return "over";
    if (ply !== plyOf(g)) return "ply";
    if (slotAt(g, ply) !== slot) return "turn";
    return null;
  }

  /* ---------- what the home screen shows ---------- */
  function openGames(list, now) { return (list || []).map((g) => view(g, now)).filter((g) => g && g.status !== "over"); }
  // Invitations to this phone's kid from his sibling.
  function invitesFor(list, slot, now) {
    return openGames(list, now).filter((g) => g.status === "invited" && g.inviter_slot !== slot && colourOf(g, slot));
  }
  // A game this phone can pick back up: active, or an invite it sent and is waiting on.
  function resumableFor(list, slot, now) {
    return openGames(list, now).filter((g) => colourOf(g, slot) && (g.status === "active" || g.inviter_slot === slot));
  }
  /* Both phones set to the same kid: an invite "from" me that this phone never sent. The other phone
     is the one that sent it, which means it thinks it is me too. */
  function sameProfile(list, slot, sentIds, now) {
    const mine = sentIds || {};
    return openGames(list, now).some((g) => g.status === "invited" && g.inviter_slot === slot && !mine[g.id]);
  }

  /* The moves the server has that this phone has not played. If the two lists disagree anywhere in
     the part both have, this phone is out of step and has to rebuild from the server's list. */
  function newMoves(local, server) {
    const a = local || [], b = server || [];
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return { resync: true, add: [] };
    if (a.length > b.length) return { resync: true, add: [] };
    return { resync: false, add: b.slice(a.length) };
  }

  /* How the game ended, from this phone's side. `loser` is a colour or null. An unfinished game —
     abandoned, expired, replaced, declined — has no winner and no loser, and is recorded as nothing. */
  function outcomeOf(game) {
    const g = game || {}, r = g.result;
    if (r === "resign") return { kind: "resign", loser: colourOf(g, g.ended_by) };
    if (r === "mate") return { kind: "mate", loser: sideAt(plyOf(g)) };
    if (DRAWS[r]) return { kind: r, loser: null };
    return { kind: "abandon", loser: null, unfinished: true, why: r || "abandon" };
  }
  function unfinished(kind) { return !!UNFINISHED[kind]; }

  /* ---------- transport: the six RPCs, bound to this phone's code, kid and PIN ---------- */
  function transport(Y, cfg, who, fetchImpl) {
    const base = function () { return Y.auth(who.code, who.slot, who.pin); };
    const call = function (name, extra) { return Y.rpc(cfg, name, Object.assign(base(), extra || {}), fetchImpl); };
    return {
      invite: function (opponent, white) { return call("sm_live_invite", { p_opponent_slot: opponent, p_white_slot: white }).then(function (r) { return r && r.id; }); },
      list: function () { return call("sm_live_list"); },
      accept: function (id) { return call("sm_live_accept", { p_id: id }); },
      move: function (id, ply, uci, fen) { return call("sm_live_move", { p_id: id, p_ply: ply, p_uci: uci, p_fen: fen || null }); },
      get: function (id) { return call("sm_live_get", { p_id: id }); },
      end: function (id, result) { return call("sm_live_end", { p_id: id, p_result: result }); },
    };
  }

  /* ---------- the clock ----------
     Real timers in the page, a hand-cranked one in the tests. */
  function realClock() {
    return { now: function () { return Date.now(); },
      set: function (fn, ms) { return setTimeout(fn, ms); }, clear: function (h) { clearTimeout(h); } };
  }

  /* ---------- home: is anyone inviting me? ----------
     Polls sm_live_list every 5 s while `when()` says so (home screen showing, joined, online,
     page visible). Reports invites for this kid and games he can resume; never throws. */
  function homePoller(opts) {
    const o = opts || {}, clock = o.clock || realClock(), every = o.every || POLL_HOME_MS;
    let timer = null, running = false, busy = false;
    function schedule() { if (running) timer = clock.set(tick, every); }
    function tick() {
      timer = null;
      if (!running) return;
      if (busy || (o.when && !o.when())) return schedule();
      busy = true;
      Promise.resolve().then(function () { return o.transport.list(); }).then(function (list) {
        busy = false;
        const now = clock.now();
        if (o.onList) o.onList({ invites: invitesFor(list, o.slot, now), resumable: resumableFor(list, o.slot, now),
          sameProfile: sameProfile(list, o.slot, o.sent && o.sent(), now), list: list || [] });
        schedule();
      }, function (err) { busy = false; if (o.onError) o.onError(err); schedule(); });
    }
    return {
      start: function () { if (running) return; running = true; tick(); },
      stop: function () { running = false; if (timer) clock.clear(timer); timer = null; },
      poke: function () { if (!running) return; if (timer) clock.clear(timer); timer = null; tick(); },
      running: function () { return running; },
    };
  }

  /* ---------- one game, from one phone ----------
     States: "waiting" (invite sent, not accepted), "mine" (my move), "theirs", "over".
     Polls sm_live_get every 1.5 s the whole time — even on my move, because a resign can arrive
     then. My move is sent with the ply it was played at; if the network drops it stays pending and
     is resent on the next tick. A move from the server that `legal` rejects is not played: the
     phone asks `onResync` to rebuild from the server's list, keeping only what it can play. */
  function gameSession(opts) {
    const o = opts || {}, clock = o.clock || realClock(), every = o.every || POLL_GAME_MS;
    const slot = o.slot, on = o.on || {};
    const s = { game: o.game ? view(o.game, clock.now()) : null, moves: ((o.game && o.game.moves) || []).slice(),
      pending: null, running: false, timer: null, busy: false, lastHeard: clock.now(), waiting: false, over: false, fails: 0 };

    function state() {
      if (s.over || !s.game || s.game.status === "over") return "over";
      if (s.game.status === "invited") return "waiting";
      const g = Object.assign({}, s.game, { moves: s.moves });
      return isMyTurn(g, slot) ? "mine" : "theirs";
    }
    function setWaiting(v) { if (s.waiting === v) return; s.waiting = v; if (on.waiting) on.waiting(v); }
    function finish(game) {
      if (s.over) return;
      s.over = true; s.game = game; stop();
      if (on.over) on.over(game, outcomeOf(game));
    }
    // Take whatever the server says and bring this phone in line with it.
    function absorb(raw) {
      const game = view(raw, clock.now());
      if (!game) return;
      const before = s.game ? s.game.status : null;
      s.game = game;
      if (before === "invited" && game.status === "active" && on.accepted) on.accepted(game);
      const diff = newMoves(s.moves, game.moves);
      if (diff.resync) {
        // Kept only when this phone is exactly one move ahead with a move still in flight.
        const ahead = s.pending && s.moves.length === game.moves.length + 1 &&
          newMoves(s.moves.slice(0, -1), game.moves).add.length === 0 && !newMoves(s.moves.slice(0, -1), game.moves).resync;
        if (!ahead) { s.pending = null; s.moves = legalPrefix(game.moves); if (on.resync) on.resync(s.moves.slice(), game); }
      } else if (diff.add.length) {
        const played = [];
        for (let i = 0; i < diff.add.length; i++) {
          const uci = diff.add[i], ply = s.moves.length;
          if (!validUci(uci) || (o.legal && !o.legal(uci, ply))) {
            // Ignore it, and rebuild from the server's list as far as this phone can play it.
            if (on.illegal) on.illegal(uci, ply);
            s.moves = legalPrefix(game.moves); if (on.resync) on.resync(s.moves.slice(), game);
            return settle(game);
          }
          s.moves.push(uci); played.push({ uci: uci, ply: ply });
        }
        s.lastHeard = clock.now(); setWaiting(false);
        if (on.moves) on.moves(played, game);
      }
      return settle(game);
    }
    function settle(game) {
      if (game.status === "over") return finish(game);
      if (state() === "theirs" || state() === "waiting") {
        if (clock.now() - s.lastHeard > QUIET_MS) setWaiting(true);
      } else setWaiting(false);
    }
    function legalPrefix(list) {
      if (!o.prefix) return (list || []).slice();
      return o.prefix((list || []).slice());
    }
    function schedule() { if (s.running) s.timer = clock.set(tick, every); }
    function tick() {
      s.timer = null;
      if (!s.running || s.over) return;
      if (s.busy) return schedule();
      s.busy = true;
      const send = s.pending
        ? o.transport.move(o.id, s.pending.ply, s.pending.uci, s.pending.fen).then(function (g) { s.pending = null; return g; })
        : o.transport.get(o.id);
      Promise.resolve(send).then(function (g) {
        s.busy = false; s.fails = 0; absorb(g); schedule();
      }, function (err) {
        s.busy = false;
        if (err && err.game) { if (s.pending && (err.code === "ply" || err.code === "turn" || err.code === "over")) s.pending = null; absorb(err.game); return schedule(); }
        s.fails += 1;
        if (s.fails >= 2 || clock.now() - s.lastHeard > QUIET_MS) setWaiting(true);
        if (on.error) on.error(err);
        schedule();
      });
    }
    function stop() { s.running = false; if (s.timer) clock.clear(s.timer); s.timer = null; }

    return {
      start: function () { if (s.running || s.over) return; s.running = true; s.lastHeard = clock.now(); tick(); },
      stop: stop,
      poke: function () { if (!s.running) return; if (s.timer) clock.clear(s.timer); s.timer = null; tick(); },
      state: state,
      moves: function () { return s.moves.slice(); },
      game: function () { return s.game; },
      waiting: function () { return s.waiting; },
      // Play my move. It is on this phone's board already; the server hears about it now or on the
      // next tick. Refused locally when it is not my turn, so a double tap cannot send two.
      move: function (uci, fen) {
        if (state() !== "mine" || s.pending || !validUci(uci)) return false;
        const ply = s.moves.length;
        s.moves.push(uci); s.pending = { ply: ply, uci: uci, fen: fen || null };
        s.lastHeard = clock.now();
        if (s.running) { if (s.timer) clock.clear(s.timer); s.timer = null; if (!s.busy) tick(); }
        return true;
      },
      // Resign, abandon, or the result both boards agree on. Idempotent on the server.
      end: function (result) {
        return Promise.resolve(o.transport.end(o.id, result)).then(function (g) { finish(view(g, clock.now())); return g; },
          function (err) { if (err && err.game) finish(view(err.game, clock.now())); throw err; });
      },
    };
  }

  const api = { POLL_HOME_MS, POLL_GAME_MS, EXPIRE_MS, QUIET_MS,
    sideAt, plyOf, slotAt, colourOf, opponentOf, validUci, expired, view, isMyTurn, refuse,
    openGames, invitesFor, resumableFor, sameProfile, newMoves, outcomeOf, unfinished,
    transport, realClock, homePoller, gameSession };
  root.ShockmateLive = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
