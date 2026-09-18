#!/usr/bin/env node
"use strict";
/* Play mode, without the engine and without a screen. Everything asserted here is a pure function:
   the level table, which crony to offer next, whether a move dropped material, when Glitch folds,
   and what a lost game leaves behind. The one thing that needs a board is the fight extraction, and
   that runs the produced object back through futures.js — the same code the arena animates with —
   so a fight that would throw in the kid's hands throws here first. */
const assert = require("assert");
const S = require("../web/score.js");
const P = require("../web/play.js");
const F = require("../web/futures.js");
const { Chess } = require("../web/vendor/chess.js");

const T0 = new Date(2026, 8, 18, 12).getTime();
const DAY = 24 * 60 * 60 * 1000;

function games(rows) {
  return { games: { played: rows.length, wins: 0, draws: 0, losses: 0, byLevel: {}, recent: rows, bestLevelWon: null } };
}
function row(level, result, blunders, moves, ago) {
  return { level: level, result: result, blunders: blunders, moves: moves, t: T0 - (ago || 0) * DAY };
}
function rng(values) { let i = 0; return function () { return values[Math.min(i++, values.length - 1)]; }; }

/* A recorded kid move, built by actually playing the moves, so every square and every SAN in it is
   real. `before` and `after` are the two evaluations the engine would have taken silently. */
function record(setup, baitSan, bestSan, punishSans, before, after, n) {
  const c = new Chess();
  setup.forEach(function (s) { assert.ok(c.move(s), "setup move " + s); });
  const fen = c.fen();
  // SAN carries + and # that the caller should not have to spell out.
  const bare = function (san) { return String(san).replace(/[+#]/g, ""); };
  const find = function (ch, san) { return ch.moves({ verbose: true }).filter(function (m) { return bare(m.san) === bare(san); })[0]; };
  const bait = find(c, baitSan), best = find(c, bestSan);
  assert.ok(bait && best, "bait " + baitSan + " and best " + bestSan + " must both be legal");
  const punished = new Chess(fen); punished.move(baitSan);
  const punish = punishSans.map(function (s) { const m = find(punished, s); punished.move(s); return m.lan; });
  const before2 = new Chess(); setup.slice(0, -1).forEach(function (s) { before2.move(s); });
  const last = c.history({ verbose: true }).slice(-1)[0];
  return { n: n || 1, fen: fen, took: false,
    bait: { uci: bait.lan, san: bait.san },
    best: { uci: best.lan, san: best.san, pv: [best.lan] },
    punish: punish, arrive: last ? last.lan : null,
    arrivePosition: last ? P.packList(P.boardList(before2)) : null,
    before: before, after: after };
}

function run() {
  /* ---------- the level table ---------- */
  assert.strictEqual(S.LEVELS.length, 5, "five cronies, one per rung");
  const ids = S.LEVELS.map(function (l) { return l.id; });
  assert.deepStrictEqual(ids, ["sleepy", "rookie", "cadet", "agent", "marshal"]);
  S.LEVELS.forEach(function (l, i) {
    assert.ok(l.name && l.blurb && l.say, l.id + " needs a name, a blurb and a line in his voice");
    assert.ok(l.depth >= 1 && l.skill >= 0 && l.multipv >= 1, l.id + " needs engine settings");
    assert.ok(l.blunder >= 0 && l.blunder <= 1 && l.random >= 0 && l.random <= 1, l.id + " chances are fractions");
    if (i) {
      const prev = S.LEVELS[i - 1];
      assert.ok(l.rating > prev.rating, l.id + " must be rated above " + prev.id);
      assert.ok(l.skill >= prev.skill && l.depth >= prev.depth, l.id + " must search at least as hard as " + prev.id);
      assert.ok(l.blunder <= prev.blunder + 0.26, l.id + " must not be clumsier than " + prev.id);
    }
  });
  assert.strictEqual(S.LEVELS[0].random, 0.5, "Sleepy shrugs half the time");
  assert.strictEqual(S.LEVELS[4].blunder, 0, "Marshal is never made to blunder on purpose");
  assert.strictEqual(S.levelIndex("cadet"), 2);
  assert.strictEqual(S.levelIndex("nobody"), -1, "an unknown rung is below every real one");
  assert.strictEqual(S.levelName("marshal"), "Marshal");

  /* ---------- which crony to offer ---------- */
  const fresh = S.suggestLevel(S.emptyStats());
  assert.strictEqual(fresh.level, "rookie", "a first game starts at Rookie");
  assert.ok(fresh.reason && fresh.say, "the parent gets a reason, the kid gets a Glitch line");

  const sharp = Object.assign(S.emptyStats(), { cardsEarned: {} });
  for (let i = 0; i < 12; i++) sharp.cardsEarned["f" + i] = { t: T0, tries: i < 10 ? 1 : 3 };
  assert.strictEqual(S.suggestLevel(sharp).level, "cadet", "10 of 12 cards first try earns a start at Cadet");

  const won = S.suggestLevel(games([row("rookie", "win", 1, 24), row("rookie", "loss", 4, 30, 1)]));
  assert.strictEqual(won.level, "cadet", "a win with one blunder moves him up a rung");

  const lost = S.suggestLevel(games([row("cadet", "loss", 3, 28), row("cadet", "loss", 2, 26, 1), row("cadet", "win", 1, 30, 2)]));
  assert.strictEqual(lost.level, "rookie", "two losses in the window moves him down");

  const sloppy = S.suggestLevel(games([row("cadet", "draw", 15, 30)]));
  assert.strictEqual(sloppy.level, "rookie", "better than a third of his moves dropping material moves him down");

  const steady = S.suggestLevel(games([row("agent", "draw", 2, 40)]));
  assert.strictEqual(steady.level, "agent", "a draw with a clean scoresheet leaves him where he is");

  const top = S.suggestLevel(games([row("marshal", "win", 0, 35)]));
  assert.strictEqual(top.level, "marshal", "there is no rung above Marshal to promote him to");
  const bottom = S.suggestLevel(games([row("sleepy", "loss", 9, 20), row("sleepy", "loss", 8, 22, 1)]));
  assert.strictEqual(bottom.level, "sleepy", "there is no rung below Sleepy to drop him to");

  /* ---------- did that move cost him a piece? ----------
     `before` is read with the kid to move, `after` with Glitch to move, so the two have to be
     flipped onto one side. Mates come back as `mate: n`, not as a number of pawns. */
  assert.strictEqual(P.dropOf({ cp: 20 }, { cp: -10 }), 10, "a position that barely moved is not a drop");
  assert.ok(!P.isBlunder({ cp: 20 }, { cp: -10 }));
  assert.strictEqual(P.dropOf({ cp: 20 }, { cp: 400 }), 420, "his own score is the kid's loss, sign flipped");
  assert.ok(P.isBlunder({ cp: 20 }, { cp: 400 }));
  assert.ok(P.isBlunder({ cp: 0 }, { cp: 150 }), "exactly the bar counts");
  assert.ok(!P.isBlunder({ cp: 0 }, { cp: 149 }), "one centipawn under the bar does not");
  assert.ok(P.isBlunder({ mate: 2 }, { cp: 50 }), "throwing away a forced mate is a blunder");
  assert.ok(P.isBlunder({ cp: 0 }, { mate: 1 }), "walking into mate in one is a blunder");
  assert.ok(!P.isBlunder({ mate: 3 }, { mate: -2 }), "still mating, one move later, is not a drop");
  assert.ok(Math.abs(P.cpOf({ mate: -1 })) <= P.MATE_CLAMP, "mate is clamped so one swing cannot drown the ranking");
  assert.ok(P.cpOf({ cp: 99999 }) === P.MATE_CLAMP, "so is a runaway centipawn score");
  assert.strictEqual(P.cpOf(null), 0, "a position the engine never scored is worth nothing either way");

  /* ---------- when Glitch folds ---------- */
  assert.strictEqual(P.shouldResign([]).resign, false, "he does not fold before he has played");
  assert.strictEqual(P.shouldResign([{ cp: -900 }]).resign, false, "one bad look is not enough");
  assert.strictEqual(P.shouldResign([{ cp: -900 }, { cp: -950 }]).why, "hopeless", "two turns eight hundred down and he goes");
  assert.strictEqual(P.shouldResign([{ cp: -900 }, { cp: -200 }]).resign, false, "he comes back if the position does");
  assert.strictEqual(P.shouldResign([{ cp: 100 }, { mate: -2 }]).why, "mate", "mate inside three and he goes at once");
  assert.strictEqual(P.shouldResign([{ mate: -5 }]).resign, false, "mate in five is not inside three, and one look is not two");

  /* ---------- his move ---------- */
  const result = { best: "a1a2", lines: [
    { uci: "a1a2", cp: 30, mate: null, multipv: 1, pv: ["a1a2"] },
    { uci: "b1b2", cp: -40, mate: null, multipv: 2, pv: ["b1b2"] },
    { uci: "c1c2", cp: -300, mate: null, multipv: 3, pv: ["c1c2"] },
  ] };
  const legal = ["a1a2", "b1b2", "c1c2", "d1d2"];
  const marshal = S.levelById("marshal");
  assert.strictEqual(P.chooseMove(result, marshal, legal, rng([0, 0])).uci, "a1a2", "Marshal always plays the move");
  const sleepy = S.levelById("sleepy");
  assert.strictEqual(P.chooseMove(result, sleepy, legal, rng([0.1, 0.99])).why, "shrug", "Sleepy shrugs under his own number");
  assert.strictEqual(P.chooseMove(result, sleepy, legal, rng([0.9])).why, "best", "and plays properly over it");
  const mateUp = { best: "a1a8", lines: [{ uci: "a1a8", cp: null, mate: 1, multipv: 1, pv: ["a1a8"] }, result.lines[1]] };
  assert.strictEqual(P.chooseMove(mateUp, sleepy, legal, rng([0.01, 0.01])).uci, "a1a8", "he never sleeps through a mate in one");
  const rookie = S.levelById("rookie");
  const bad = P.chooseMove(result, rookie, legal, rng([0.01, 0.9]));
  assert.strictEqual(bad.why, "blunder", "Rookie takes a worse move out of MultiPV");
  assert.ok(legal.indexOf(bad.uci) >= 0, "and it is still a legal move, never a random square");
  assert.notStrictEqual(bad.uci, "a1a2", "a blunder is not the best move");
  assert.strictEqual(P.chooseMove(result, rookie, legal, rng([0.01, 0.9]), { obvious: true }).why, "best",
    "he takes the obvious capture back rather than clowning");
  assert.strictEqual(P.chooseMove({ best: null, lines: [] }, rookie, legal, rng([0.9, 0.9])).uci, "a1a2",
    "an engine that said nothing still gets a legal move out");
  const d = P.moveDelay(rng([0]));
  assert.ok(d >= P.DELAY.min && d <= P.DELAY.max, "he thinks for between six tenths and one and a half seconds");

  /* ---------- what he says ---------- */
  ["capture", "check", "quiet"].forEach(function (k) {
    assert.ok(P.SAY[k].lines.length >= 6, k + " needs at least six lines so a long game never repeats");
  });
  assert.strictEqual(P.moveKind("Qxf7#"), "check");
  assert.strictEqual(P.moveKind("Nxe5"), "capture");
  assert.strictEqual(P.moveKind("Nf3"), "quiet");
  const first = P.say("quiet", -1), second = P.say("quiet", first.index);
  assert.notStrictEqual(first.text, second.text, "the same line never lands twice running");

  /* ---------- a game becomes fights ----------
     One hung knight and one missed mate, recorded as the game would record them. */
  const hung = record(["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5"], "Nxe5", "c3", ["Nxe5"], { cp: 25 }, { cp: 280 }, 4);
  const mate = record(["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6"], "d3", "Qxf7", [], { mate: 1 }, { cp: 20 }, 4);
  const quiet = record(["d4", "d5", "c4", "e6"], "Nc3", "Nf3", [], { cp: 30 }, { cp: -20 }, 3);

  const made = P.gameFights([quiet, hung, mate], { Chess: Chess, F: F, profile: 1, t: T0 });
  assert.strictEqual(made.length, 2, "only the moves that cost him something become fights");
  assert.ok(made[0].drop >= made[1].drop, "worst first");
  assert.ok(made.every(function (f) { return f.id.indexOf("G1" + T0) === 0; }), "the id carries the kid and the game");
  assert.ok(made.every(function (f) { return f.pack === "game" && f.generated === true && f.palaceRoom === "Your games"; }));
  assert.ok(made.every(function (f) { return ["hanging", "mateThreat", "fork", "counting"].indexOf(f.motif) >= 0; }),
    "the classifier only ever names a motif the app has art and a principle for");
  assert.strictEqual(P.gameFights([quiet, hung, mate], { Chess: Chess, F: F, cap: 1 }).length, 1, "the cap holds");

  /* The shape is the contract with game.js. Run every piece of it through the code that will
     actually animate it: pieces unpack, both lines are legal one square at a time, the packed legal
     map holds the best move and the bait, and the why-gate points at a square on the board it is
     shown on. */
  made.forEach(function (f) {
    const start = F.piecesFromList(f.pieces);
    assert.ok(Object.keys(start).length > 10, f.id + " unpacks to a board");
    assert.ok((f.legal[f.best.slice(0, 2)] || []).some(function (m) { return m.uci === f.best; }), f.id + " best is in the legal map");
    assert.ok((f.legal[f.bait.slice(0, 2)] || []).some(function (m) { return m.uci === f.bait; }), f.id + " bait is in the legal map");
    assert.strictEqual(f.moves[f.best].tier, "best");
    assert.strictEqual(f.moves[f.tempting].tier, "bait");
    assert.strictEqual(f.turn, "w", "the kid is always White");
    assert.ok(f.bestLineUci.length >= 1 && f.temptingLineUci.length >= 1, f.id + " has both futures");
    assert.strictEqual(f.bestLineUci[0], f.best);
    assert.strictEqual(f.temptingLineUci[0], f.tempting);
    [f.bestLineUci, f.temptingLineUci].forEach(function (line) {
      let map = F.clonePieces(start);
      line.forEach(function (u) { map = F.applyUci(map, u).pieces; });   // throws on a line that cannot be animated
    });
    assert.ok(f.whyTargets.squares.length >= 1 && f.whyTargets.prompt, f.id + " has a why-gate");
    const board = f.whyTargets.at === "after" ? F.applyUci(start, f.best).pieces : start;
    f.whyTargets.squares.forEach(function (sq) {
      assert.ok(board[sq], f.id + " asks for " + sq + ", and something has to be standing there to tap");
    });
    assert.ok(f.hook && f.why && f.whyLong && f.short && f.mascot, f.id + " has all the card text");
    assert.ok(f.glitch.taunt && f.glitch.gloat && f.glitch.rage, f.id + " has all three Glitch lines");
    assert.ok(f.candidates.length >= 2, f.id + " has candidates for the helping hand");
    assert.ok(/^Your game, move \d+$/.test(f.title), f.id + " is titled for the game it came from");
    // the look-first tap has to have something to point at, or it is skipped rather than empty
    assert.ok(Array.isArray(F.threatTargets(f)), f.id + " survives a threat scan");
  });
  const hungFight = made.filter(function (f) { return f.motif === "hanging"; })[0];
  assert.ok(hungFight, "the hung knight is classified as a free piece");
  assert.strictEqual(hungFight.whyTargets.at, "start", "the piece he walked into it is tapped on the board he walked it from");
  const mateFight = made.filter(function (f) { return f.motif === "mateThreat"; })[0];
  assert.ok(mateFight, "the missed mate is classified as a mate threat");
  assert.ok(/king/i.test(mateFight.whyTargets.prompt), "and it asks for the king");

  /* ---------- storing them ---------- */
  const kept = P.storeFights(made, made, 20);
  assert.strictEqual(kept.length, made.length, "the same board is never stored twice");
  const many = [];
  for (let i = 0; i < 25; i++) many.push({ fen: "fen" + i, t: i });
  assert.strictEqual(P.storeFights([], many, 20).length, 20, "the binder room is capped");
  assert.strictEqual(P.storeFights(many, [{ fen: "new", t: 99 }], 20)[0].fen, "new", "newest first");

  /* ---------- the counters ---------- */
  let st = S.emptyStats();
  st = S.recordGame(st, { level: "cadet", result: "win", blunders: 1, moves: 30, t: T0 }).stats;
  assert.deepStrictEqual([st.games.played, st.games.wins, st.games.losses], [1, 1, 0]);
  assert.strictEqual(st.games.bestLevelWon, "cadet");
  st = S.recordGame(st, { level: "sleepy", result: "win", blunders: 0, moves: 20, t: T0 + 1 }).stats;
  assert.strictEqual(st.games.bestLevelWon, "cadet", "beating an easier crony never lowers the best one beaten");
  st = S.recordGame(st, { level: "marshal", result: "loss", blunders: 6, moves: 40, t: T0 + 2 }).stats;
  assert.deepStrictEqual([st.games.played, st.games.wins, st.games.losses], [3, 2, 1], "played and won only ever climb");
  assert.strictEqual(st.games.bestLevelWon, "cadet", "a loss takes nothing away");
  assert.strictEqual(st.games.byLevel.cadet.wins, 1);
  assert.strictEqual(st.games.recent[0].level, "marshal", "newest first");
  for (let i = 0; i < 15; i++) st = S.recordGame(st, { level: "rookie", result: "draw", blunders: 0, moves: 10, t: T0 + 10 + i }).stats;
  assert.strictEqual(st.games.recent.length, S.GAMES_RECENT, "the recent window is capped");
  assert.strictEqual(st.games.played, 18, "but the lifetime count is not");
  assert.strictEqual(S.recordGame(S.emptyStats(), { level: "nonsense", result: "wat" }).stats.games.byLevel.sleepy.played, 1,
    "junk from an old save is read as the easiest crony and a loss, never as a crash");

  /* ---------- his own boards lead the drills ---------- */
  const authored = [
    { id: "01", pack: "tactics", motif: "fork" },
    { id: "02", pack: "openings", motif: "hanging" },
    { id: "03", pack: "tactics", motif: "pin" },
  ];
  const drill = S.prepFights(S.emptyStats(), made.concat(authored), 4);
  assert.strictEqual(drill[0].pack, "game", "Prep opens on a board from his own game");
  assert.strictEqual(drill.filter(function (e) { return e.pack === "game"; }).length, made.length, "all of them, before anything else");
  const plan = S.campPlan(S.emptyStats(), made.concat(authored), { hasThreat: function () { return true; } });
  assert.ok(plan.fights.filter(function (e) { return e.pack === "game"; }).length > 0, "Camp drills them too");

  console.log("test_play.js OK");
}

run();
