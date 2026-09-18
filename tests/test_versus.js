#!/usr/bin/env node
"use strict";
/* Versus, without a screen and without an engine. Every evaluation here is faked, because the point
   of versus.js is that it is engine-agnostic: hand it two numbers per move and it says whose move
   dropped what, whose move was the best thing either of them did, and which boards become fights.

   The two things this file exists to hold:
     1. the Black kid's boards come out mirrored and white-to-move, and actually run — they are put
        back through futures.js, the code that will animate them in the kid's hands;
     2. nothing anywhere pairs the two kids' numbers. The last block walks the whole result object
        and the whole of each kid's Progress row looking for a scoreboard, and fails if it finds one. */
const assert = require("assert");
const S = require("../web/score.js");
const P = require("../web/play.js");
const F = require("../web/futures.js");
const V = require("../web/versus.js");
const { Chess } = require("../web/vendor/chess.js");

const T0 = new Date(2026, 8, 18, 12).getTime();
const NAMES = ["Sam", "Ben"];

/* A game, played for real, so every SAN, every square and every position in the record is one that
   actually occurred. `evals` maps a ply index to the pair of faked evaluations for that move:
   `before` read with the mover to move, `after` with his sibling to move — exactly what the app
   hands over. A ply with no entry is a move nobody scored. */
function playGame(sans, evals, seats) {
  const c = new Chess(), rec = [];
  let lastMove = null;
  sans.forEach(function (san, i) {
    const side = c.turn();
    const fenBefore = c.fen(), packBefore = P.packList(P.boardList(c));
    const m = c.move(san);
    assert.ok(m, "move " + san + " at ply " + i + " has to be legal");
    const e = (evals || {})[i] || {};
    const row = { n: Number(String(fenBefore).split(" ")[5]) || 1, side: side,
      profile: side === "w" ? seats.white : seats.black,
      fen: fenBefore, bait: { uci: m.lan, san: m.san }, took: !!m.captured,
      arrive: lastMove ? lastMove.uci : null, arrivePosition: lastMove ? lastMove.pack : null };
    if (e.before) row.before = e.before;
    if (e.after) row.after = e.after;
    rec.push(row);
    lastMove = { uci: m.lan, pack: packBefore };
  });
  // The engine's own move for a ply is named by SAN in the fixture; resolve it on the position the
  // move was played from, so the uci in the record is a real move of that board.
  rec.forEach(function (row, i) {
    const e = (evals || {})[i] || {};
    if (!e.bestSan) return;
    const b = new Chess(row.fen);
    const bare = function (s) { return String(s).replace(/[+#]/g, ""); };
    const m = b.moves({ verbose: true }).filter(function (x) { return bare(x.san) === bare(e.bestSan); })[0];
    assert.ok(m, "engine best " + e.bestSan + " must be legal on ply " + i);
    row.best = { uci: m.lan, san: m.san, pv: [m.lan] };
    if (e.punishSan) {
      const after = new Chess(row.fen); after.move(row.bait.san);
      const pm = after.moves({ verbose: true }).filter(function (x) { return bare(x.san) === bare(e.punishSan); })[0];
      if (pm) row.punish = [pm.lan];
    }
  });
  return { chess: c, records: rec };
}

// Every fight, run through the code that will animate it. Lifted from test_play.js on purpose: a
// versus fight and a Glitch fight are the same object and the same contract.
function checkFight(f) {
  const start = F.piecesFromList(f.pieces);
  assert.ok(Object.keys(start).length > 10, f.id + " unpacks to a board");
  assert.strictEqual(f.turn, "w", f.id + " is white-to-move: the kid always plays White in a fight");
  assert.strictEqual(new Chess(f.fen).turn(), "w", f.id + " fen is white-to-move too");
  assert.ok((f.legal[f.best.slice(0, 2)] || []).some(function (m) { return m.uci === f.best; }), f.id + " best is in the legal map");
  assert.ok((f.legal[f.bait.slice(0, 2)] || []).some(function (m) { return m.uci === f.bait; }), f.id + " bait is in the legal map");
  assert.strictEqual(f.moves[f.best].tier, "best");
  assert.strictEqual(f.moves[f.tempting].tier, "bait");
  [f.bestLineUci, f.temptingLineUci].forEach(function (line) {
    assert.ok(line.length >= 1, f.id + " has both futures");
    let map = F.clonePieces(start);
    line.forEach(function (u) { map = F.applyUci(map, u).pieces; });   // throws on a line that cannot be animated
  });
  const board = f.whyTargets.at === "after" ? F.applyUci(start, f.best).pieces : start;
  f.whyTargets.squares.forEach(function (sq) {
    assert.ok(board[sq], f.id + " asks for " + sq + " and something has to be standing there to tap");
  });
  assert.ok(f.hook && f.why && f.whyLong && f.short && f.mascot, f.id + " has all the card text");
  assert.ok(f.glitch.taunt && f.glitch.gloat && f.glitch.rage, f.id + " has all three Glitch lines");
  assert.strictEqual(f.palaceRoom, "Your games", f.id + " lands in his own binder room");
  assert.ok(Array.isArray(F.threatTargets(f)), f.id + " survives a threat scan");
}

/* Anything that would let one kid's number be read against the other's. Keys first, then strings:
   a "3 - 1" is a scoreboard whatever it is called. FEN-shaped fields are skipped, because a board
   is a board. */
const BAD_KEY = /(head.?to.?head|headTwoHead|scoreboard|standings|tally|crosstable|versusScore|vsWins|againstSibling|opponentName|winnerName|series)/i;
const SCORELINE = /\d+\s*[-–—:]\s*\d+/;
const BOARDISH = /^(fen|position|arrivePosition|pgn|uci|bait|best|punish|bestLineUci|temptingLineUci|legal|pieces|candidates|id|key|last)$/;
const DATEISH = /^\d{4}-\d{1,2}-\d{1,2}$/;
function walk(node, key, visit, path) {
  visit(node, key, path);
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) return node.forEach(function (v, i) { walk(v, key, visit, path + "[" + i + "]"); });
  Object.keys(node).forEach(function (k) { walk(node[k], k, visit, path + "." + k); });
}
function assertNoScoreboard(obj, label, names) {
  walk(obj, "", function (node, key, path) {
    assert.ok(!BAD_KEY.test(key), label + " must not hold a field called " + key + " (" + path + ")");
    if (typeof node !== "string" || BOARDISH.test(key) || DATEISH.test(node)) return;
    assert.ok(!SCORELINE.test(node), label + " must not print a scoreline: " + node + " (" + path + ")");
    (names || []).forEach(function (pair) {
      assert.ok(!(node.indexOf(pair[0]) >= 0 && node.indexOf(pair[1]) >= 0),
        label + " must not name both kids in one string: " + node + " (" + path + ")");
    });
  }, label);
}

function run() {
  /* ---------- who is White ---------- */
  assert.strictEqual(V.nextWhite(0), 1, "colours alternate");
  assert.strictEqual(V.nextWhite(1), 0);
  assert.strictEqual(V.nextWhite(null), 0, "a first-ever game starts with the first player as White");
  assert.deepStrictEqual(V.seatsFor(0), { white: 0, black: 1 });
  assert.deepStrictEqual(V.seatsFor(1), { white: 1, black: 0 });
  assert.deepStrictEqual(V.swapSeats(V.seatsFor(0)), { white: 1, black: 0 }, "the chip swaps them for this one game");
  assert.strictEqual(V.colourOf(V.seatsFor(1), 1), "w");
  assert.strictEqual(V.colourOf(V.seatsFor(1), 0), "b");
  // Six games running, nobody ever gets White twice in a row.
  let w = null; const run6 = [];
  for (let i = 0; i < 6; i++) { w = V.nextWhite(w == null ? 1 : w); run6.push(w); }
  assert.deepStrictEqual(run6, [0, 1, 0, 1, 0, 1], "and it keeps alternating without anyone deciding");

  /* ---------- mirroring ---------- */
  assert.strictEqual(V.mirrorSquare("e2"), "e7");
  assert.strictEqual(V.mirrorUci("e7e5"), "e2e4");
  assert.strictEqual(V.mirrorUci("a7a8q"), "a2a1q", "a promotion keeps its piece");
  const startFen = new Chess().fen();
  assert.strictEqual(V.mirrorFen(V.mirrorFen(startFen)), startFen, "mirroring twice is the position you started with");
  const mirroredStart = V.mirrorFen(startFen);
  assert.strictEqual(mirroredStart.split(" ")[1], "b", "the side to move flips with the board");
  assert.ok(new Chess(mirroredStart).moves().length > 0, "and the result is a position chess.js will accept");
  const epFen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
  assert.strictEqual(V.mirrorFen(epFen).split(" ")[3], "e6", "the en-passant square comes with it");
  assert.strictEqual(V.mirrorFen(epFen).split(" ")[2], "KQkq", "so do the castling rights, swapped");
  assert.strictEqual(V.mirrorPack("wpe2bke8"), "wke1bpe7", "the packed board swaps colour and flips rank, re-sorted by square");

  /* ---------- one game, two kids, two sets of fights ----------
     Sam is White. He hangs a knight on move 4. Ben is Black, and two moves later he walks his queen
     into a fork. Both drops are real moves on a real board; only the numbers are invented. */
  const seats = V.seatsFor(0);
  const game = playGame(
    ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "Nxe5", "Nxe5", "d3", "Qh4", "Nc3", "Qxf2"],
    {
      // ply 6: Sam plays Nxe5?, which loses a piece to Nxe5. c3 was the move.
      6: { before: { cp: 20 }, after: { cp: 300 }, bestSan: "c3", punishSan: "Nxe5" },
      // ply 9: Ben plays Qh4??, which hangs the queen; Nf3 was the move. (Black kid, black numbers.)
      9: { before: { cp: -30 }, after: { cp: 260 }, bestSan: "Nf6", punishSan: "Nxh4" },
      // ply 11: Ben plays Qxf2, which is also the engine's move and swings it his way: a best moment.
      11: { before: { cp: -20 }, after: { cp: -400 }, bestSan: "Qxf2" },
      // ply 8: Sam's d3 is quiet and costs nothing.
      8: { before: { cp: -260 }, after: { cp: 250 }, bestSan: "d3" },
    }, seats);

  const white = V.summarise(game.records, "w", { Chess: Chess });
  const black = V.summarise(game.records, "b", { Chess: Chess });
  assert.strictEqual(white.moves, 6, "White's half of the record is White's moves and nobody else's");
  assert.strictEqual(black.moves, 6);
  assert.strictEqual(white.blunders, 1, "Sam dropped one");
  assert.strictEqual(black.blunders, 1, "so did Ben");
  assert.ok(white.worst && white.worst.bait.san === "Nxe5", "and his worst moment is the move he dropped it on");
  assert.ok(black.worst && black.worst.bait.san === "Qh4");
  assert.strictEqual(white.given, 1, "a drop punished by a capture is a piece handed over");
  assert.ok(white.matched >= 1, "the quiet move that matched the engine is counted");

  /* ---------- the best-moment rule ---------- */
  assert.ok(black.best, "Ben has a best moment");
  assert.strictEqual(black.best.bait.san, "Qxf2#", "the move that ended it, which is the best move there is");
  assert.strictEqual(white.best, null, "Sam has none: matching the engine on a quiet move is not a moment");
  const swingOnly = [{ side: "w", bait: { uci: "a2a3", san: "a3" }, best: { uci: "b2b3" },
    before: { cp: 0 }, after: { cp: -400 } }];
  assert.strictEqual(V.bestMoment(swingOnly), null, "a swing the engine did not agree with is his sibling's mistake, not his move");
  const matchedSmall = [{ side: "w", bait: { uci: "a2a3", san: "a3" }, best: { uci: "a2a3" },
    before: { cp: 0 }, after: { cp: -20 } }];
  assert.strictEqual(V.bestMoment(matchedSmall), null, "matching the engine without a swing is just a move");
  const matchedBig = [{ side: "w", bait: { uci: "a2a3", san: "a3" }, best: { uci: "a2a3" },
    before: { cp: 0 }, after: { cp: -150 } }];
  assert.ok(V.bestMoment(matchedBig), "exactly the bar counts");
  const mated = [{ side: "b", bait: { uci: "d8h4", san: "Qh4#" }, before: { cp: 0 } }];
  assert.ok(V.bestMoment(mated), "mate is a best moment whatever the engine said");
  const both = matchedBig.concat(mated);
  assert.strictEqual(V.bestMoment(both).bait.san, "Qh4#", "and mate outranks everything else");
  const card = V.momentCard(V.bestMoment(mated), T0);
  assert.strictEqual(card.vs, "sibling", "what gets stored never names the other kid");
  assert.ok(card.san && card.fen !== undefined && card.gain >= V.BEST_GAIN && card.t === T0);

  /* ---------- the fights, one binder each ---------- */
  const samFights = V.kidFights(game.records, "w", { Chess: Chess, F: F, profile: 0, t: T0 });
  const benFights = V.kidFights(game.records, "b", { Chess: Chess, F: F, profile: 1, t: T0 });
  assert.strictEqual(samFights.length, 1, "one drop, one fight");
  assert.strictEqual(benFights.length, 1);
  assert.ok(samFights.every(function (f) { return f.id.indexOf("V0" + T0) === 0; }), "ids carry the kid and the game");
  assert.ok(benFights.every(function (f) { return f.id.indexOf("V1" + T0) === 0; }));
  samFights.concat(benFights).forEach(checkFight);
  assert.strictEqual(V.kidFights(game.records, "w", { Chess: Chess, F: F, cap: 0 }).length, 0, "the cap holds");

  /* The Black kid's fight is the mirror of what he actually saw: the same lesson, white-to-move,
     his pieces at the bottom. His queen sat on h4, so on the fight board it sits on h5. */
  const ben = benFights[0];
  const benBoard = F.piecesFromList(ben.pieces);
  assert.ok(benBoard.e1 && benBoard.e1.color === "w" && benBoard.e1.role === "k",
    "Ben's black king on e8 is a white king on e1 once the board is turned round: his pieces are at the bottom");
  assert.ok(benBoard.d1 && benBoard.d1.color === "w" && benBoard.d1.role === "q",
    "and the queen he was about to move is his, at the bottom, ready to play");
  assert.strictEqual(ben.bait, V.mirrorUci("d8h4"), "the move he actually played is the mirrored one");
  assert.strictEqual(ben.bait, "d1h5");
  assert.ok(benBoard.e8 && benBoard.e8.color === "b", "and his sibling's king is the black one at the top");

  /* ---------- the counters ---------- */
  let st = S.emptyStats();
  const before = S.suggestLevel(st);
  st = S.recordVersus(st, { colour: "w", result: "win", blunders: 2, matched: 9, moves: 30, t: T0,
    bestMoves: [card] }).stats;
  assert.deepStrictEqual([st.versus.played, st.versus.asWhite, st.versus.asBlack], [1, 1, 0]);
  assert.deepStrictEqual([st.versus.results.win, st.versus.results.draw, st.versus.results.loss], [1, 0, 0]);
  assert.strictEqual(st.bestMoves.length, 1, "the best moment is kept");
  st = S.recordVersus(st, { colour: "b", result: "loss", blunders: 5, matched: 4, moves: 28, t: T0 + 1 }).stats;
  assert.deepStrictEqual([st.versus.played, st.versus.asWhite, st.versus.asBlack], [2, 1, 1], "played only ever climbs");
  assert.strictEqual(st.versus.results.win, 1, "and a loss takes the win away from nobody");
  st = S.recordVersus(st, { colour: "w", result: "draw", moves: 12, t: T0 + 2 }).stats;
  assert.deepStrictEqual([st.versus.results.win, st.versus.results.draw, st.versus.results.loss], [1, 1, 1]);
  assert.strictEqual(st.versus.recent[0].t, T0 + 2, "newest first");
  assert.strictEqual(st.bestMoves.length, 1, "a game with no best moment adds none and removes none");
  for (let i = 0; i < 14; i++) st = S.recordVersus(st, { colour: "w", result: "draw", moves: 9, t: T0 + 10 + i }).stats;
  assert.strictEqual(st.versus.recent.length, S.VERSUS_RECENT, "the recent window is capped");
  assert.strictEqual(st.versus.played, 17, "the lifetime count is not");
  assert.deepStrictEqual(S.suggestLevel(st), before,
    "and none of it touches which crony he is offered: his sibling has nothing to do with his chess");
  const many = [];
  for (let i = 0; i < 25; i++) many.push({ t: i, san: "N" + i, fen: "fen" + i, gain: 200, vs: "sibling" });
  assert.strictEqual(S.storeBestMoves([], many, S.BEST_MOVES_MAX).length, S.BEST_MOVES_MAX, "best moments are capped");
  assert.strictEqual(S.storeBestMoves(many, [{ t: 99, san: "Qxf7", fen: "new", gain: 300, vs: "sibling" }], 20)[0].san,
    "Qxf7", "newest first");
  assert.strictEqual(S.storeBestMoves(many, many, 20).length, 20, "and the same moment is never kept twice");

  /* ---------- the referee ---------- */
  ["blunder", "great", "check", "capture", "quiet"].forEach(function (k) {
    assert.ok(V.SAY[k].lines.length >= 6, k + " needs six lines so a long game never repeats");
  });
  Object.keys(V.SAY).forEach(function (k) {
    assert.ok(V.SAY[k].lines.length >= 3, k + " needs at least three variants");
    assert.ok(V.SAY[k].mood, k + " needs a mood for the sprite");
  });
  ["won", "lost", "drew", "mate", "resign"].forEach(function (k) {
    assert.ok(V.SAY[k].lines.length >= 3, k + " is a result moment and needs three");
  });
  assert.ok(/Enjoy it, it never happens again/.test(V.SAY.won.lines.join(" ")), "he mocks the winner too");
  const l1 = V.say("blunder", -1, "Sam"), l2 = V.say("blunder", l1.index, "Sam");
  assert.notStrictEqual(l1.text, l2.text, "the same line never lands twice running");
  assert.ok(l1.text.indexOf("Sam") >= 0 || l2.text.indexOf("Sam") >= 0, "a gloat names the kid it is about");
  [["blunder", "Sam"], ["great", "Ben"], ["turn", "Sam"]].forEach(function (pair) {
    const seen = {}; const n = V.SAY[pair[0]].lines.length;
    let idx = -1;
    for (let i = 0; i < n; i++) { const l = V.say(pair[0], idx, pair[1]); idx = l.index; seen[l.text] = 1;
      assert.ok(l.text.indexOf("{name}") < 0, pair[0] + " must never show the raw template"); }
    assert.strictEqual(Object.keys(seen).length, n, pair[0] + " walks every line before repeating one");
  });
  assert.strictEqual(V.reactionTo({ bait: { san: "Nxe5" }, best: { uci: "x" }, before: { cp: 20 }, after: { cp: 300 } }), "blunder");
  assert.strictEqual(V.reactionTo({ bait: { uci: "a", san: "Qh4#" } }), "great", "mate gets the nervous line, not the quiet one");
  assert.strictEqual(V.reactionTo({ bait: { san: "Nxe5" }, before: { cp: 20 }, after: { cp: 10 } }), "capture");
  assert.strictEqual(V.reactionTo({ bait: { san: "Qd8+" } }), "check");
  assert.strictEqual(V.reactionTo({ bait: { san: "Nf3" } }), "quiet");

  /* ---------- the result: two cards, and no scoreboard anywhere ---------- */
  // Ben mated Sam on move six, so White is the side that lost.
  const res = V.resultCards({ kind: "mate", records: game.records, names: NAMES, white: 0, loser: "w", t: T0 },
    { Chess: Chess, F: F });
  assert.strictEqual(res.cards.length, 2, "one card per kid");
  assert.deepStrictEqual(res.cards.map(function (c) { return c.profile; }), [0, 1]);
  assert.deepStrictEqual(res.cards.map(function (c) { return c.colour; }), ["w", "b"]);
  assert.deepStrictEqual(res.cards.map(function (c) { return c.result; }), ["loss", "win"],
    "each kid is told his own result, the way a scoresheet does");
  assert.strictEqual(res.cards[0].name, "Sam");
  assert.ok(res.cards[1].best && res.cards[1].best.san === "Qxf2#", "each card carries that kid's own best moment");
  assert.ok(res.cards[0].worst && res.cards[0].worst.san === "Nxe5", "and that kid's own moment it turned");
  assert.ok(res.cards.every(function (c) { return c.say; }), "and a Glitch line of his own");
  res.cards.forEach(function (c) { c.fights.forEach(checkFight); });

  // No key that could hold a tally, no string that reads as a score, and no string naming both kids.
  assertNoScoreboard(res, "the versus result", [NAMES, [NAMES[1], NAMES[0]]]);
  // Stronger still: one kid's card may not mention the other kid at all.
  const other = { 0: NAMES[1], 1: NAMES[0] };
  res.cards.forEach(function (c) {
    assert.ok(JSON.stringify(c).indexOf(other[c.profile]) < 0,
      c.name + "'s card must not contain " + other[c.profile] + " anywhere in it");
  });
  // The drawn results reach both of them as a draw and nothing else.
  const drawn = V.resultCards({ kind: "stalemate", records: game.records, names: NAMES, white: 1, t: T0 }, { Chess: Chess, F: F });
  assert.deepStrictEqual(drawn.cards.map(function (c) { return c.result; }), ["draw", "draw"]);
  assert.deepStrictEqual(drawn.cards.map(function (c) { return c.colour; }), ["b", "w"], "and the seats follow who was White");
  const quit = V.resultCards({ kind: "resign", records: game.records, names: NAMES, white: 0, loser: "b", t: T0 }, { Chess: Chess, F: F });
  assert.deepStrictEqual(quit.cards.map(function (c) { return c.result; }), ["win", "loss"], "resigning loses the game and nothing else");

  /* Progress, per kid. Called once per profile, it can only ever see one of them, and nothing it
     returns pairs the two. */
  [0, 1].forEach(function (i) {
    let s = S.emptyStats();
    s = S.recordVersus(s, { colour: i ? "b" : "w", result: i ? "loss" : "win", blunders: 3, matched: 8,
      moves: 30, t: T0, bestMoves: [card] }).stats;
    const p = S.progressSummary(s, [], T0);
    assert.strictEqual(p.versus.played, 1, "his own versus row is on his own card");
    assert.strictEqual(p.bestMoves.length, 1);
    assert.ok(p.bestMove && p.bestMove.vs === "sibling", "and the best moment still names nobody");
    assertNoScoreboard(p, "progress for " + NAMES[i], [NAMES, [NAMES[1], NAMES[0]]]);
    assert.ok(JSON.stringify(p).indexOf(NAMES[i ? 0 : 1]) < 0, "and the other kid is not in it at all");
  });
  const blank = S.progressSummary(S.emptyStats(), [], T0);
  assert.strictEqual(blank.versus.played, 0, "a kid who has never played his sibling still renders");
  assert.deepStrictEqual(blank.bestMoves, []);
  assert.strictEqual(blank.bestMove, null);

  console.log("test_versus.js OK");
}

run();
