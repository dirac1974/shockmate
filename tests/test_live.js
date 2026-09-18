#!/usr/bin/env node
"use strict";
/* Two-phone versus without a network and without a real clock. A fake server applies the same rules
   supabase/migrations/0003_live_games.sql applies (turn by ply parity and colour, ply must be the next
   one, a silent hour ends a game), and two fake phones — each with its own chess.js board, its own
   session and its own record — play a game through it: invite, accept, alternating moves, a resign,
   and one result card per phone. */
const assert = require("assert");
const L = require("../web/live.js");
const V = require("../web/versus.js");
const F = require("../web/futures.js");
const { Chess } = require("../web/vendor/chess.js");

const T0 = Date.UTC(2026, 8, 18, 12);
const NAMES = ["Sam", "Ben"];

/* ---------- a hand-cranked clock ---------- */
function fakeClock(start) {
  const c = { t: start, timers: [], seq: 0 };
  c.now = function () { return c.t; };
  c.set = function (fn, ms) { const h = ++c.seq; c.timers.push({ h: h, at: c.t + ms, fn: fn }); return h; };
  c.clear = function (h) { c.timers = c.timers.filter(function (x) { return x.h !== h; }); };
  return c;
}
function flush() { return new Promise(function (r) { setImmediate(r); }).then(function () { return new Promise(function (r) { setImmediate(r); }); }); }
async function advance(clock, ms) {
  const end = clock.t + ms;
  await flush();
  for (;;) {
    clock.timers.sort(function (a, b) { return a.at - b.at; });
    const next = clock.timers[0];
    if (!next || next.at > end) break;
    clock.timers.shift(); clock.t = next.at; next.fn(); await flush();
  }
  clock.t = end; await flush();
}

/* ---------- a server that keeps the SQL's rules ---------- */
function err(code, game) { const e = new Error(code); e.code = code; if (game) e.game = game; return e; }
function fakeServer(clock) {
  const srv = { games: {}, n: 0, pins: ["1111", "2222"], offline: {}, calls: [] };
  const json = function (g) { return L.view(JSON.parse(JSON.stringify(g)), clock.now()); };
  const load = function (id, slot) {
    const g = srv.games[id];
    if (!g || (g.white_slot !== slot && g.black_slot !== slot)) throw err("missing");
    if (L.expired(g, clock.now())) { g.status = "over"; g.result = "expired"; }
    return g;
  };
  srv.transport = function (slot, pin) {
    const guard = function (name, fn) {
      return function () {
        const args = arguments;
        srv.calls.push([slot, name]);
        if (srv.offline[slot]) return Promise.reject(Object.assign(new Error("Failed to fetch"), { code: "offline" }));
        if (pin !== srv.pins[slot]) return Promise.reject(err("pin"));
        return new Promise(function (resolve, reject) { try { resolve(fn.apply(null, args)); } catch (e) { reject(e); } });
      };
    };
    return {
      invite: guard("invite", function (opp, white) {
        assert.notStrictEqual(opp, slot); assert.ok(white === slot || white === opp);
        Object.keys(srv.games).forEach(function (k) { const g = srv.games[k]; if (g.status !== "over") { g.status = "over"; g.result = "replaced"; } });
        const id = "g" + (++srv.n);
        srv.games[id] = { id: id, white_slot: white, black_slot: white === slot ? opp : slot, inviter_slot: slot,
          moves: [], status: "invited", result: null, ended_by: null, updated_at: clock.now() };
        return id;
      }),
      list: guard("list", function () {
        return Object.keys(srv.games).map(function (k) { return srv.games[k]; })
          .filter(function (g) { return g.status !== "over" && (g.white_slot === slot || g.black_slot === slot) && !L.expired(g, clock.now()); })
          .map(json);
      }),
      accept: guard("accept", function (id) {
        const g = load(id, slot);
        if (g.inviter_slot === slot) throw err("same");
        if (g.status === "invited") { g.status = "active"; g.updated_at = clock.now(); }
        return json(g);
      }),
      move: guard("move", function (id, ply, uci) {
        const g = load(id, slot);
        const why = L.refuse(g, slot, ply, uci, clock.now());
        if (why === "over" || why === "ply" || why === "turn") throw err(why, json(g));
        if (why) throw err(why);
        g.moves.push(uci); g.updated_at = clock.now();
        return json(g);
      }),
      get: guard("get", function (id) { return json(load(id, slot)); }),
      end: guard("end", function (id, result) {
        const g = load(id, slot);
        if (g.status !== "over") { g.status = "over"; g.result = result; g.ended_by = slot; g.updated_at = clock.now(); }
        return json(g);
      }),
    };
  };
  return srv;
}

/* ---------- a phone ----------
   Its own board, its own record of ITS kid's moves, its own session. Evaluations are faked per ply,
   the way test_versus fakes them: `before` with the mover to move, `after` with his sibling. */
function phone(srv, clock, slot, evals) {
  const p = { slot: slot, chess: new Chess(), rec: [], log: [], over: null, waiting: [], resyncs: 0, illegal: 0, lastMove: null };
  p.t = srv.transport(slot, srv.pins[slot]);
  p.open = function (game) {
    p.game = game;
    p.colour = L.colourOf(game, slot);
    p.session = L.gameSession({ transport: p.t, id: game.id, slot: slot, game: game, clock: clock,
      legal: function (uci, ply) {
        if (ply !== p.chess.history().length) return false;
        return p.chess.moves({ verbose: true }).some(function (m) { return m.lan === uci; });
      },
      prefix: function (list) {
        const c = new Chess(), out = [];
        for (let i = 0; i < list.length; i++) {
          const m = c.moves({ verbose: true }).filter(function (x) { return x.lan === list[i]; })[0];
          if (!m) break; c.move(m.san); out.push(list[i]);
        }
        return out;
      },
      on: {
        accepted: function () { p.log.push("accepted"); },
        moves: function (played) {
          played.forEach(function (x) {
            const m = p.chess.moves({ verbose: true }).filter(function (y) { return y.lan === x.uci; })[0];
            p.chess.move(m.san); p.lastMove = m.lan; p.log.push("in:" + m.san);
          });
        },
        resync: function (moves) {
          p.resyncs += 1; p.chess = new Chess();
          moves.forEach(function (u) { const m = p.chess.moves({ verbose: true }).filter(function (y) { return y.lan === u; })[0]; p.chess.move(m.san); });
        },
        illegal: function () { p.illegal += 1; },
        waiting: function (v) { p.waiting.push(v); },
        over: function (g, out) { p.over = { game: g, out: out }; },
      } });
    p.session.start();
  };
  p.play = function (san) {
    assert.strictEqual(p.chess.turn(), p.colour, "a phone only moves its own colour");
    const fen = p.chess.fen(), ply = p.chess.history().length;
    const m = p.chess.move(san);
    const e = (evals || {})[ply] || {};
    const row = { n: Number(fen.split(" ")[5]) || 1, side: m.color, profile: slot, ply: ply, fen: fen,
      bait: { uci: m.lan, san: m.san }, took: !!m.captured, arrive: p.lastMove };
    if (e.before) row.before = e.before;
    if (e.after) row.after = e.after;
    if (e.bestSan) {
      const b = new Chess(fen).moves({ verbose: true }).filter(function (x) { return x.san.replace(/[+#]/g, "") === e.bestSan; })[0];
      row.best = { uci: b.lan, san: b.san, pv: [b.lan] };
    }
    p.rec.push(row); p.lastMove = m.lan;
    assert.ok(p.session.move(m.lan, p.chess.fen()), "the session takes a move on his own turn");
    p.log.push("out:" + m.san);
  };
  return p;
}

/* The shape the guard in test_versus.js rejects; repeated here so a live result is walked too. */
const BAD_KEY = /(head.?to.?head|scoreboard|standings|tally|crosstable|versusScore|vsWins|againstSibling|opponentName|winnerName|series)/i;
function walk(node, key, visit) {
  visit(node, key);
  if (!node || typeof node !== "object") return;
  Object.keys(node).forEach(function (k) { walk(node[k], k, visit); });
}

async function run() {
  /* ---------- the turn rules ---------- */
  const g0 = { id: "x", white_slot: 1, black_slot: 0, inviter_slot: 0, moves: [], status: "active", updated_at: T0 };
  assert.strictEqual(L.sideAt(0), "w"); assert.strictEqual(L.sideAt(1), "b"); assert.strictEqual(L.sideAt(6), "w");
  assert.strictEqual(L.slotAt(g0, 0), 1, "ply 0 is White's, and White is whoever the invite said");
  assert.strictEqual(L.slotAt(g0, 1), 0);
  assert.strictEqual(L.colourOf(g0, 1), "w"); assert.strictEqual(L.colourOf(g0, 0), "b"); assert.strictEqual(L.colourOf(g0, 5), null);
  assert.strictEqual(L.opponentOf(g0, 1), 0);
  assert.ok(L.isMyTurn(g0, 1) && !L.isMyTurn(g0, 0));
  assert.strictEqual(L.refuse(g0, 1, 0, "e2e4", T0), null, "White's first move at ply 0 is taken");
  assert.strictEqual(L.refuse(g0, 0, 0, "e7e5", T0), "turn", "Black cannot move first");
  assert.strictEqual(L.refuse(g0, 1, 1, "e2e4", T0), "ply", "a ply that is not the next one is refused: optimistic concurrency");
  assert.strictEqual(L.refuse(g0, 1, 0, "e2e9", T0), "move", "a move that is not uci is refused");
  assert.strictEqual(L.refuse(g0, 3, 0, "e2e4", T0), "player", "somebody not in the game is refused");
  assert.strictEqual(L.refuse(Object.assign({}, g0, { status: "invited" }), 1, 0, "e2e4", T0), "over", "nobody moves before the invite is accepted");
  assert.strictEqual(L.refuse(Object.assign({}, g0, { moves: ["e2e4"] }), 0, 1, "e7e5", T0), null, "then Black at ply 1");
  assert.ok(L.validUci("e7e8q") && !L.validUci("e7e8k") && !L.validUci("E2E4"));

  /* ---------- an hour of silence ends it ---------- */
  assert.ok(!L.expired(g0, T0 + L.EXPIRE_MS), "exactly an hour is still alive");
  assert.ok(L.expired(g0, T0 + L.EXPIRE_MS + 1), "a second more is not");
  assert.strictEqual(L.view(g0, T0 + 2 * L.EXPIRE_MS).status, "over");
  assert.strictEqual(L.view(g0, T0 + 2 * L.EXPIRE_MS).result, "expired");
  assert.strictEqual(L.view(Object.assign({}, g0, { updated_at: new Date(T0).toISOString() }), T0 + 1000).status, "active", "server timestamps are ISO strings");
  assert.strictEqual(L.refuse(g0, 1, 0, "e2e4", T0 + 2 * L.EXPIRE_MS), "over", "and an expired game takes no moves");
  assert.deepStrictEqual(L.openGames([g0], T0 + 2 * L.EXPIRE_MS), [], "and drops off the list");

  /* ---------- what the home screen reads off the list ---------- */
  const inv = { id: "i1", white_slot: 0, black_slot: 1, inviter_slot: 0, moves: [], status: "invited", updated_at: T0 };
  assert.deepStrictEqual(L.invitesFor([inv], 1, T0).map(function (g) { return g.id; }), ["i1"], "Ben sees Sam's invite");
  assert.deepStrictEqual(L.invitesFor([inv], 0, T0), [], "Sam does not see his own invite as an invite");
  assert.deepStrictEqual(L.resumableFor([inv], 0, T0).map(function (g) { return g.id; }), ["i1"], "he can go back to waiting on it");
  assert.deepStrictEqual(L.resumableFor([inv], 1, T0), [], "Ben has not accepted, so there is nothing for him to resume");
  assert.ok(L.sameProfile([inv], 0, {}, T0), "an invite 'from me' this phone never sent: both phones are Sam");
  assert.ok(!L.sameProfile([inv], 0, { i1: 1 }, T0), "unless this phone sent it");
  assert.deepStrictEqual(L.newMoves(["e2e4"], ["e2e4", "e7e5"]), { resync: false, add: ["e7e5"] });
  assert.strictEqual(L.newMoves(["e2e4", "d7d5"], ["e2e4", "e7e5"]).resync, true, "a disagreement means rebuild from the server");
  assert.strictEqual(L.newMoves(["e2e4", "e7e5"], ["e2e4"]).resync, true);

  /* ---------- how it ended, from one phone ---------- */
  const over = function (o) { return Object.assign({ white_slot: 0, black_slot: 1, moves: ["e2e4", "e7e5", "d1h5"], status: "over" }, o); };
  assert.deepStrictEqual(L.outcomeOf(over({ result: "resign", ended_by: 1 })), { kind: "resign", loser: "b" }, "whoever resigned loses");
  assert.deepStrictEqual(L.outcomeOf(over({ result: "mate" })), { kind: "mate", loser: "b" }, "mate: the side to move after the last move lost");
  assert.deepStrictEqual(L.outcomeOf(over({ result: "stalemate" })), { kind: "stalemate", loser: null });
  ["expired", "abandon", "replaced", "declined"].forEach(function (r) {
    assert.ok(L.outcomeOf(over({ result: r })).unfinished, r + " is unfinished: no result for anyone");
  });

  /* ---------- the home poller: invites reach the other phone within a poll ---------- */
  const clock = fakeClock(T0), srv = fakeServer(clock);
  const seen = { a: null, b: null };
  let homeOn = true;
  const pollA = L.homePoller({ transport: srv.transport(0, "1111"), slot: 0, clock: clock, when: function () { return homeOn; },
    sent: function () { return sent; }, onList: function (r) { seen.a = r; } });
  const pollB = L.homePoller({ transport: srv.transport(1, "2222"), slot: 1, clock: clock, when: function () { return homeOn; },
    sent: function () { return {}; }, onList: function (r) { seen.b = r; } });
  const sent = {};
  pollA.start(); pollB.start();
  await advance(clock, 10);
  assert.deepStrictEqual(seen.b.invites, [], "nothing yet");
  const id = await srv.transport(0, "1111").invite(1, 0); sent[id] = 1;
  await advance(clock, L.POLL_HOME_MS);
  assert.strictEqual(seen.b.invites.length, 1, "within one 5-second poll Ben's phone has the invite");
  assert.strictEqual(seen.b.invites[0].inviter_slot, 0);
  assert.ok(!seen.a.sameProfile, "Sam's own phone knows it sent it");
  assert.strictEqual(seen.a.resumable.length, 1);
  const before = srv.calls.length; homeOn = false;
  await advance(clock, 3 * L.POLL_HOME_MS);
  assert.strictEqual(srv.calls.length, before, "off the home screen it does not poll at all");
  homeOn = true; pollA.stop(); pollB.stop();
  await advance(clock, 3 * L.POLL_HOME_MS);
  assert.strictEqual(srv.calls.length, before, "and stopped means stopped");
  await assert.rejects(srv.transport(0, "1111").accept(id), function (e) { return e.code === "same"; }, "the inviter cannot accept his own invite");

  /* ---------- a whole game, two phones ----------
     Sam (slot 0) is White and invited. Ben (slot 1) accepts. Sam hangs a knight on his 4th move; Ben
     finds nothing special; Ben then resigns. Each phone scores only its own kid. */
  const samEvals = { 6: { before: { cp: 20 }, after: { cp: 300 }, bestSan: "c3" } };
  const benEvals = { 7: { before: { cp: -300 }, after: { cp: 290 }, bestSan: "Nxe5" } };
  const A = phone(srv, clock, 0, samEvals), B = phone(srv, clock, 1, benEvals);
  A.open(L.view(srv.games[id], clock.now()));
  await advance(clock, 10);
  assert.strictEqual(A.session.state(), "waiting", "Sam waits for Ben to say yes");
  assert.strictEqual(A.session.move("e2e4"), false, "and cannot move before he does");
  const accepted = await B.t.accept(id);
  B.open(accepted);
  await advance(clock, L.POLL_GAME_MS);
  assert.deepStrictEqual(A.log, ["accepted"], "Sam's phone hears the accept within one 1.5-second poll");
  assert.strictEqual(A.session.state(), "mine"); assert.strictEqual(B.session.state(), "theirs");
  assert.strictEqual(B.session.move("e7e5"), false, "Ben cannot move on Sam's turn: refused on the phone before the server sees it");

  const line = ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "Nxe5", "Nxe5", "d3"];
  for (let i = 0; i < line.length; i++) {
    const mover = i % 2 === 0 ? A : B, other = mover === A ? B : A;
    mover.play(line[i]);
    await advance(clock, L.POLL_GAME_MS + 10);
    assert.strictEqual(other.chess.fen(), mover.chess.fen(), "after " + line[i] + " both boards agree");
    assert.strictEqual(other.log[other.log.length - 1], "in:" + line[i], "and it arrived as the other kid's move");
  }
  assert.deepStrictEqual(srv.games[id].moves.length, line.length, "the server holds every move once, in order");

  /* A wrong-turn move straight at the server is refused, and does not touch the game. */
  await assert.rejects(A.t.move(id, line.length, "a2a3"), function (e) { return e.code === "turn" && e.game.moves.length === line.length; });
  await assert.rejects(B.t.move(id, 3, "a7a6"), function (e) { return e.code === "ply"; }, "an old ply is refused too");
  await assert.rejects(srv.transport(1, "9999").get(id), function (e) { return e.code === "pin"; }, "a wrong PIN reads nothing");

  /* Ben's phone goes offline on his move: Sam's phone says it is waiting, and Ben's move is sent
     when he comes back. */
  srv.offline[1] = true;
  B.play("Qh4");                                  // played on Ben's board, not yet on the server
  await advance(clock, L.QUIET_MS + 3 * L.POLL_GAME_MS);
  assert.ok(A.waiting.indexOf(true) >= 0, "Sam's phone: waiting for Ben");
  assert.strictEqual(srv.games[id].moves.length, line.length, "the move is still on Ben's phone");
  srv.offline[1] = false;
  await advance(clock, 2 * L.POLL_GAME_MS);
  assert.strictEqual(srv.games[id].moves.length, line.length + 1, "back online, the pending move goes");
  assert.strictEqual(A.chess.fen(), B.chess.fen(), "and Sam's board catches up");
  assert.strictEqual(A.waiting[A.waiting.length - 1], false, "and he stops waiting");

  /* An illegal move from the server is ignored, and the phone rebuilds from what it can play. */
  srv.games[id].moves.push("a1a8"); srv.games[id].updated_at = clock.now();
  await advance(clock, L.POLL_GAME_MS + 10);
  assert.ok(A.illegal >= 1 && A.resyncs >= 1, "Sam's phone refuses a1a8 and resyncs");
  assert.strictEqual(A.chess.history().length, line.length + 1, "without playing it");
  srv.games[id].moves.pop();

  /* Backgrounded and reopened: a fresh phone for Sam resumes from sm_live_get. */
  A.session.stop();
  const A2 = phone(srv, clock, 0, samEvals);
  const resumed = await A2.t.get(id);
  A2.chess = new Chess(); resumed.moves.forEach(function (u) { const m = A2.chess.moves({ verbose: true }).filter(function (x) { return x.lan === u; })[0]; A2.chess.move(m.san); });
  A2.rec = A.rec; A2.open(resumed);
  await advance(clock, L.POLL_GAME_MS);
  assert.strictEqual(A2.chess.fen(), B.chess.fen(), "resumed on the move it was left on");
  assert.strictEqual(A2.session.state(), "mine");

  /* Ben resigns. Both phones end, each with its own result. */
  await B.session.end("resign");
  await advance(clock, L.POLL_GAME_MS + 10);
  assert.ok(B.over && A2.over, "both phones see the game end");
  assert.deepStrictEqual(A2.over.out, { kind: "resign", loser: "b" });
  assert.deepStrictEqual(B.over.out, { kind: "resign", loser: "b" });
  const callsAtEnd = srv.calls.length;
  await advance(clock, 5 * L.POLL_GAME_MS);
  assert.strictEqual(srv.calls.length, callsAtEnd, "and stop polling");
  const again = await srv.transport(0, "1111").end(id, "mate");
  assert.strictEqual(again.result, "resign", "ending an ended game changes nothing");

  /* ---------- one card per phone, and no scoreboard anywhere ---------- */
  const cardFor = function (p, out) {
    return V.liveResult({ me: p.slot, names: NAMES, kind: out.kind, records: p.rec, white: 0, loser: out.loser, t: T0 },
      { Chess: Chess, F: F });
  };
  const resA = cardFor(A2, A2.over.out), resB = cardFor(B, B.over.out);
  assert.strictEqual(resA.cards.length, 1, "Sam's phone builds Sam's card and nothing else");
  assert.strictEqual(resB.cards.length, 1);
  assert.strictEqual(resA.cards[0].profile, 0); assert.strictEqual(resB.cards[0].profile, 1);
  assert.strictEqual(resA.cards[0].result, "win"); assert.strictEqual(resB.cards[0].result, "loss");
  assert.ok(A2.rec.every(function (r) { return r.profile === 0; }) && B.rec.every(function (r) { return r.profile === 1; }),
    "each phone only ever recorded its own kid's moves");
  assert.strictEqual(resA.cards[0].moves, 5, "Sam's card counts Sam's five moves");
  assert.strictEqual(resB.cards[0].moves, 5);
  assert.strictEqual(resA.cards[0].blunders, 1, "his own dropped knight");
  assert.ok(resA.cards[0].worst && resA.cards[0].worst.san === "Nxe5", "is his moment it turned");
  assert.strictEqual(resA.cards[0].fights.length, 1, "and becomes a fight in his own binder");
  assert.strictEqual(resB.cards[0].blunders, 0, "Ben's card knows nothing about Sam's knight");
  [resA, resB].forEach(function (res, i) {
    walk(res, "", function (node, key) {
      assert.ok(!BAD_KEY.test(key), "live result must not hold " + key);
      if (typeof node === "string" && !/^(fen|uci|id|bait|best)$/.test(key)) assert.ok(!/\d+\s*[-–—:]\s*\d+/.test(node), "no scoreline: " + node);
    });
    assert.ok(JSON.stringify(res).indexOf(NAMES[1 - i]) < 0, NAMES[i] + "'s result must not mention " + NAMES[1 - i]);
  });
  const quit = V.liveResult({ me: 0, names: NAMES, kind: "abandon", records: A2.rec, white: 0, t: T0, unfinished: true }, { Chess: Chess, F: F });
  assert.strictEqual(quit.cards[0].result, "unfinished", "an unfinished game reports no result");

  /* ---------- the next invite replaces an open one; an hour of silence expires it ---------- */
  const id2 = await srv.transport(1, "2222").invite(0, 1);
  const id3 = await srv.transport(1, "2222").invite(0, 1);
  assert.strictEqual(srv.games[id2].result, "replaced", "one open game per family");
  await srv.transport(0, "1111").accept(id3);
  clock.t += L.EXPIRE_MS + 1;
  const late = await srv.transport(0, "1111").get(id3);
  assert.strictEqual(late.status, "over"); assert.strictEqual(late.result, "expired");
  assert.ok(L.outcomeOf(late).unfinished);
  assert.deepStrictEqual(await srv.transport(0, "1111").list(), [], "and it is off the list");

  console.log("OK live: turn and ply rules, expiry, invites and same-profile, home poll, a two-phone game with offline, illegal and resume, resign, one card per phone, no scoreboard");
}

run().catch(function (e) { console.error(e); process.exit(1); });
