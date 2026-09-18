#!/usr/bin/env node
"use strict";
/* Flash: the two-minute board-vision drill. Everything here runs against the REAL fights, because
   the one way this feature can quietly break is by asking a question whose answer is not on the
   board it was asked about — an empty square, a piece of his own, a square that only exists after a
   move the kid was never shown. Every generator is therefore checked against the board it names.

   Also held: the plan composes six items with no repeats and a difficulty mix; the imagine rung
   stays shut until three clean days; the reveal shrinks once and never below three seconds; and
   every counter recordFlash writes only ever climbs. */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const S = require("../web/score.js");
const F = require("../web/futures.js");
const X = require("../web/flash.js");

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "encounters.v2.json"), "utf8"));
const ALL = Array.isArray(raw) ? raw : (raw.encounters || []);
const HAND = ALL.filter(function (e) { return !e.generated; });
const byId = {}; ALL.forEach(function (e) { byId[e.id] = e; });
const STYLES = ["words", "numbers"];
const T0 = new Date(2026, 8, 18, 12).getTime();
const DAY = 24 * 60 * 60 * 1000;

function statsOf(earnedIds) {
  const st = Object.assign(S.emptyStats(), { cardsEarned: {} });
  (earnedIds || []).forEach(function (id) { st.cardsEarned[id] = { t: T0, critical: false, tries: 1 }; });
  return st;
}
function supportsFor(style) { return function (e, t) { return X.supports(e, t, { style: style }); }; }

/* ---------- the generators, on every real fight ---------- */
function generators() {
  let recalls = 0, gones = 0, imagines = 0, chips = 0;
  ALL.forEach(function (enc) {
    const map = X.mapOf(enc);
    assert.ok(Object.keys(map).length, enc.id + " has no board to flash");

    STYLES.forEach(function (style) {
      const r = X.makeItem(enc, "recall", { style: style });
      if (!r) return;
      recalls += 1;
      assert.ok(r.question && r.style, enc.id + " recall needs a question and a coach line");
      assert.deepStrictEqual(r.hidden, {}, enc.id + ": a recall hides every piece; the empty board stays");
      if (r.kind === "chip") {
        chips += 1;
        assert.ok(r.count >= 1 && r.count <= X.MAX_COUNT, enc.id + " count " + r.count + " is off the 1-4 chip row");
        assert.strictEqual(r.squares.length, 0, "a counting question has no square answer");
        assert.ok(/^How many/.test(r.question), enc.id + ": " + r.question);
      } else {
        assert.ok(r.squares.length >= 1, enc.id + " recall has no answer");
        r.squares.forEach(function (sq) {
          assert.ok(map[sq], enc.id + " recall answers " + sq + ", which had nothing on it");
        });
        // Every tap answer is derivable from the board he was shown, and from nothing else.
        if (r.variant === "queen") {
          assert.strictEqual(map[r.squares[0]].color, "b", enc.id + ": Glitch's queen is a black piece");
          assert.strictEqual(map[r.squares[0]].role, "q");
        }
        if (r.variant === "threat") assert.deepStrictEqual(r.squares, F.threatTargets(enc), enc.id + " threat answer");
        if (r.variant === "why") {
          assert.deepStrictEqual(r.squares, enc.whyTargets.squares, enc.id + " why answer");
          assert.notStrictEqual(enc.whyTargets.at, "after", enc.id + ": an after-the-move why cannot be asked of the start board");
        }
      }
    });

    const g = X.makeItem(enc, "gone", { style: "words" });
    assert.ok(g, enc.id + " must be able to lose a piece");
    gones += 1;
    const sq = g.squares[0];
    assert.ok(map[sq], enc.id + ": the gone piece was never on the board");
    assert.notStrictEqual(map[sq].role, "k", enc.id + ": a king never vanishes");
    assert.strictEqual(Object.keys(g.hidden).length, Object.keys(map).length - 1, enc.id + ": exactly one piece goes");
    assert.ok(!g.hidden[sq], enc.id + ": and it is the one he is asked about");
    Object.keys(g.hidden).forEach(function (k) {
      assert.deepStrictEqual(g.hidden[k], map[k], enc.id + ": nothing else on the board moved");
    });
    assert.strictEqual(g.gone.name, X.ROLE[map[sq].role]);

    const im = X.makeItem(enc, "imagine", { style: "words" });
    if (im) {
      imagines += 1;
      assert.strictEqual(im.reveal, false, "the imagine board never goes away; that is the point");
      assert.deepStrictEqual(im.hidden, map, "and it does not change either");
      assert.strictEqual(im.move.from + im.move.to, String(enc.best).slice(0, 4), enc.id + ": the move is the fight's best move");
      assert.ok(im.prompt.indexOf(im.move.to) > 0 && im.prompt.indexOf(im.move.name) > 0, enc.id + ": " + im.prompt);
      assert.ok(im.arrow && im.arrow.ms > 0, "the ghost arrow has a life span");
      // The answer is computed on the board AFTER the move, which is the board he is never shown.
      const after = F.applyUci(map, enc.best).pieces;
      assert.deepStrictEqual(im.squares, F.enemyAttacked(after, im.move.to).map(function (h) { return h.sq; }),
        enc.id + ": imagine answers what the piece attacks from its destination");
      assert.ok(im.squares.length, enc.id + ": an imagine with no answer must not be offered");
      im.squares.forEach(function (s) {
        assert.ok(after[s], enc.id + ": " + s + " is empty after the move");
        assert.notStrictEqual(after[s].color, after[im.move.to].color, enc.id + ": " + s + " is one of his own pieces");
        // It is tappable on the board that is actually on screen, which is the one BEFORE the move.
        assert.ok(map[s], enc.id + ": " + s + " is not on the board he is looking at");
      });
    }
  });
  assert.ok(recalls >= ALL.length, "every fight carries a recall question in at least one register");
  assert.strictEqual(gones, ALL.length, "every fight can lose a piece");
  assert.ok(imagines >= ALL.length / 2, "the imagine rung has plenty of boards, found " + imagines);
  assert.ok(chips > 20, "and the counting register has real work to do, found " + chips);

  /* the same fight asks the same question tomorrow: no randomness anywhere */
  const twice = [X.makeItem(byId["01"], "recall", { style: "words" }), X.makeItem(byId["01"], "recall", { style: "words" })];
  assert.deepStrictEqual(twice[0], twice[1], "two calls, one question");
  assert.notStrictEqual(X.seedOf(byId["01"]), X.seedOf(byId["02"]), "different fights, different seeds");

  /* checking an answer: one tap, or one chip */
  const tap = HAND.map(function (e) { return X.makeItem(e, "gone", { style: "words" }); })[0];
  assert.strictEqual(X.check(tap, tap.squares[0]), true);
  assert.strictEqual(X.check(tap, "a1" === tap.squares[0] ? "h8" : "a1"), false);
  assert.strictEqual(X.hintFor(tap), tap.squares[0], "the hint is the answer square");
  const chip = ALL.map(function (e) { return X.makeItem(e, "recall", { style: "numbers" }); })
    .filter(function (i) { return i && i.kind === "chip"; })[0];
  assert.ok(chip, "some board asks a counting question");
  assert.strictEqual(X.check(chip, chip.count), true);
  assert.strictEqual(X.check(chip, String(chip.count)), true, "a chip's value arrives as a string from the DOM");
  assert.strictEqual(X.check(chip, chip.count === 4 ? 1 : chip.count + 1), false);
  assert.strictEqual(X.hintFor(chip), null, "there is no square to light for a count");
  assert.ok(X.answerText(chip) === String(chip.count) && X.answerText(tap).indexOf(tap.squares[0]) > 0);

  /* nothing to flash */
  assert.strictEqual(X.makeItem(null, "recall", {}), null);
  assert.strictEqual(X.makeItem({ id: "x" }, "gone", {}), null, "a fight with no board is not an item");
  assert.strictEqual(X.check(null, "a1"), false);
  assert.deepStrictEqual(X.build(null, {}), []);
}

/* ---------- the plan ---------- */
function plan() {
  STYLES.forEach(function (style) {
    const st = statsOf(["01", "02", "03"]);
    const p = S.flashPlan(st, ALL, S.FLASH_N, { supports: supportsFor(style) });
    assert.strictEqual(p.items.length, 6, "six items");
    assert.strictEqual(new Set(p.items.map(function (i) { return i.id; })).size, 6, "no board is asked about twice");
    assert.strictEqual(p.imagine, false, "the imagine rung is shut on a fresh profile");
    assert.ok(p.types.indexOf("imagine") < 0, "so no item is one");
    assert.ok(p.types.filter(function (t) { return t === "gone"; }).length >= 2, "two easy rungs in the mix: " + p.types);
    assert.ok(p.types.filter(function (t) { return t === "recall"; }).length >= 3, "and the rest are recalls: " + p.types);
    const items = X.build(p, { style: style });
    assert.strictEqual(items.length, 6, "every planned item builds; supports() and makeItem() agree");
    items.forEach(function (it) { assert.ok(it.question && it.style, it.encId + " is missing its words"); });
    // His own material first: the pool is ordered, and every slot takes the first unspent board in
    // that order which can honestly carry its question. Nothing else decides anything.
    const order = S.flashOrder(st, ALL);
    assert.deepStrictEqual(order.slice(0, 3).map(function (e) { return e.id; }), ["01", "02", "03"],
      "boards he has already won lead the pool");
    const spent = {};
    p.items.forEach(function (it) {
      const first = order.filter(function (e) { return !spent[e.id] && X.supports(e, it.type, { style: style }); })[0];
      assert.strictEqual(it.id, first.id, "a " + it.type + " slot took " + it.id + " over " + first.id);
      spent[it.id] = true;
    });
  });

  /* a board out of his own game leads everything, the way it does in Prep */
  const mine = Object.assign({}, byId["01"], { id: "G1", pack: "game", generated: true });
  const withGame = S.flashPlan(statsOf(["02"]), [mine].concat(ALL), 6, { supports: supportsFor("words") });
  assert.strictEqual(withGame.items[0].id, "G1", "his own game is the most meaningful board there is");

  /* the ladder is last: generated fights are the filler, not the content */
  const order = S.flashOrder(statsOf([]), ALL).map(function (e) { return e.id; });
  const firstGenerated = order.findIndex(function (id) { return byId[id].generated; });
  assert.strictEqual(firstGenerated, HAND.length, "every hand-authored board comes before the first ladder one");

  /* the imagine rung, once it is open */
  const open = S.flashPlan(statsOf([]), ALL, 6, { supports: supportsFor("words"), imagine: true });
  assert.strictEqual(open.imagine, true);
  assert.strictEqual(open.types.filter(function (t) { return t === "imagine"; }).length, 1, "one hard item, not a whole drill of them");
  assert.strictEqual(new Set(open.items.map(function (i) { return i.id; })).size, 6);
  X.build(open, { style: "words" }).filter(function (i) { return i.type === "imagine"; })
    .forEach(function (i) { assert.ok(i.squares.length, "an imagine item always has an answer"); });

  /* a slot no board can carry falls to an easier rung rather than leaving a hole */
  const thin = S.flashPlan(statsOf([]), ALL, 6, { supports: function (e, t) { return t === "gone"; } });
  assert.strictEqual(thin.items.length, 6, "six items even when only one question can be asked");
  assert.ok(thin.types.every(function (t) { return t === "gone"; }), thin.types.join(","));

  /* fewer boards than slots, and no boards at all */
  const two = S.flashPlan(statsOf([]), HAND.slice(0, 2), 6, { supports: supportsFor("words") });
  assert.strictEqual(two.items.length, 2, "two boards make a two-item drill, never a repeat");
  assert.deepStrictEqual(S.flashPlan(statsOf([]), [], 6, {}).items, []);
  assert.doesNotThrow(function () { S.flashPlan(null, null, null, null); S.flashOrder(null, null); });
  assert.deepStrictEqual(S.flashPlan(statsOf([]), ALL, 0, {}).items, []);
  const avoided = S.flashPlan(statsOf(["01"]), ALL, 6, { supports: supportsFor("words"), avoid: ["01"] });
  assert.ok(avoided.items.every(function (i) { return i.id !== "01"; }), "a board camp has already spent is skipped");
}

/* ---------- the adaptive reveal ---------- */
function reveal() {
  let st = S.emptyStats();
  assert.strictEqual(S.flashRevealMs(st), 5000, "a new kid gets the full five seconds");
  // Eleven right is not yet a window.
  for (let i = 0; i < 11; i++) st = S.recordFlash(st, { type: "recall", correct: true, revealMs: 5000, t: T0 }).stats;
  assert.strictEqual(S.flashRolling(st).n, 11);
  assert.strictEqual(S.flashRevealMs(st), 5000, "eleven items is not the twelve the rule asks for");
  st = S.recordFlash(st, { type: "gone", correct: true, revealMs: 5000, t: T0 }).stats;
  assert.strictEqual(S.flashRevealMs(st), 3000, "twelve at 100 percent shortens the window");
  // Three misses in the window drops it to 9/12 = 75 percent, under the bar, and it goes back up.
  for (let i = 0; i < 3; i++) st = S.recordFlash(st, { type: "recall", correct: false, revealMs: 3000, t: T0 }).stats;
  assert.strictEqual(S.flashRolling(st).n, 12, "the window never grows past twelve");
  assert.ok(Math.abs(S.flashRolling(st).rate - 0.75) < 1e-9);
  assert.strictEqual(S.flashRevealMs(st), 5000, "under the bar, he gets his five seconds back");
  // Exactly the bar is the bar: 10 of 12 is over it, 9 of 12 is not.
  const window12 = function (nRight) {
    let s = S.emptyStats();
    for (let i = 0; i < 12; i++) s = S.recordFlash(s, { type: "recall", correct: i < nRight, revealMs: 5000, t: T0 }).stats;
    return S.flashRevealMs(s);
  };
  assert.strictEqual(window12(10), 3000, "10 of 12 is over eighty percent");
  assert.strictEqual(window12(9), 5000, "9 of 12 is not");
  assert.strictEqual(window12(12), 3000);
  // The floor holds whatever the rule says.
  assert.ok(S.FLASH_FAST_MS >= 3000, "the window never goes below three seconds");
  [0, 6, 12].forEach(function (n) { assert.ok(window12(n) >= 3000); });
}

/* ---------- the counters, and the rung that unlocks ---------- */
function counters() {
  let st = S.emptyStats();
  assert.deepStrictEqual([S.flashRate(st), S.flashDaysDone(st), S.flashCleanDays(st)], [0, 0, 0]);
  assert.strictEqual(S.flashUnlocked(st), false);
  assert.strictEqual(S.flashDoneToday(st, T0), false);

  const r = S.recordFlash(st, { type: "recall", correct: true, revealMs: 5000, t: T0 });
  assert.strictEqual(r.stats.flash.items, 1);
  assert.deepStrictEqual(st.flash, undefined, "recording never mutates the stats it was handed");
  st = r.stats;
  st = S.recordFlash(st, { type: "gone", correct: false, revealMs: 5000, t: T0 }).stats;
  st = S.recordFlash(st, { type: "imagine", correct: true, revealMs: 0, t: T0 }).stats;
  const f = S.flashOf(st);
  assert.deepStrictEqual([f.items, f.correct], [3, 2]);
  assert.deepStrictEqual([f.byType.recall.items, f.byType.gone.items, f.byType.imagine.items], [1, 1, 1], "counted per rung");
  assert.deepStrictEqual([f.byType.gone.correct, f.byType.imagine.correct], [0, 1]);
  assert.deepStrictEqual(f.days[S.dateKey(T0)], { items: 3, correct: 2 });
  assert.strictEqual(S.flashDoneToday(st, T0), true);
  assert.strictEqual(S.flashDoneToday(st, T0 + DAY), false, "tomorrow is a new drill");
  assert.strictEqual(S.flashDaysDone(st), 1);
  assert.strictEqual(f.bestRun, 1, "one right, then a miss, then one right");

  /* every counter only ever climbs, whatever arrives */
  const before = S.flashOf(st);
  const junk = S.recordFlash(st, { type: "nonsense", correct: false, revealMs: -5, t: T0 }).stats;
  const after = S.flashOf(junk);
  // Everything a screen could ever read only climbs. `cleanDays` and `last12` are derived working
  // memory for the unlock and the reveal rule, are never drawn, and are asserted separately.
  ["items", "correct", "fast", "bestRun"].forEach(function (k) {
    assert.ok(after[k] >= before[k], k + " went down");
  });
  assert.ok(after.imagineOpen === before.imagineOpen || after.imagineOpen, "the imagine latch never closes");
  assert.strictEqual(after.byType.recall.items, before.byType.recall.items + 1, "an unknown rung is read as a recall");
  assert.ok(S.flashOf(junk).items > before.items);
  assert.doesNotThrow(function () { S.recordFlash(null, null); S.flashOf(null); S.flashRate(null); });

  /* the fast counter: items answered at the shortened window */
  let fast = S.recordFlash(S.emptyStats(), { type: "gone", correct: true, revealMs: 3000, t: T0 }).stats;
  assert.strictEqual(S.flashOf(fast).fast, 1);
  fast = S.recordFlash(fast, { type: "gone", correct: true, revealMs: 5000, t: T0 }).stats;
  assert.strictEqual(S.flashOf(fast).fast, 1, "a full window is not a fast one");

  /* the unlock: three clean days, and it never shuts again */
  let u = S.emptyStats();
  const drill = function (s, day, right, wrong) {
    for (let i = 0; i < right; i++) s = S.recordFlash(s, { type: "recall", correct: true, revealMs: 5000, t: T0 + day * DAY }).stats;
    for (let i = 0; i < wrong; i++) s = S.recordFlash(s, { type: "recall", correct: false, revealMs: 5000, t: T0 + day * DAY }).stats;
    return s;
  };
  u = drill(u, 0, 6, 0);
  assert.strictEqual(S.flashCleanDays(u), 1);
  u = drill(u, 1, 5, 1);
  assert.strictEqual(S.flashCleanDays(u), 1, "a day with a miss in it is not clean");
  u = drill(u, 2, 6, 0);
  u = drill(u, 3, 3, 0);
  assert.strictEqual(S.flashCleanDays(u), 2, "three right is not a day's drill");
  assert.strictEqual(S.flashUnlocked(u), false, "still shut at two clean days");
  u = drill(u, 4, 6, 0);
  assert.strictEqual(S.flashCleanDays(u), 3);
  assert.strictEqual(S.flashUnlocked(u), true, "three clean days opens the imagine rung");
  assert.strictEqual(S.flashPlan(u, ALL, 6, { supports: supportsFor("words") }).imagine, true,
    "and the plan reads the unlock without being told");
  const spoiled = drill(u, 4, 0, 4);
  assert.strictEqual(S.flashCleanDays(spoiled), 2, "a miss later that day stops the day being clean");
  assert.strictEqual(S.flashUnlocked(spoiled), true, "but the rung is a latch and never shuts again");
  assert.strictEqual(S.flashOf(spoiled).imagineOpen, true);
  assert.strictEqual(S.flashDayClean({ items: 4, correct: 4 }), true);
  assert.strictEqual(S.flashDayClean({ items: 3, correct: 3 }), false, "a short day is not a clean day");
  assert.strictEqual(S.flashDayClean(null), false);
}

/* ---------- Progress: the tile and the note the parent reads ---------- */
function progress() {
  const empty = S.progressSummary(null, ALL, T0);
  assert.deepStrictEqual([empty.flash.items, empty.flash.days, empty.flash.best], [0, 0, 0], "a profile that has never drilled still renders");
  assert.strictEqual(empty.flash.rate, 0, "never NaN");
  assert.strictEqual(empty.flash.unlocked, false);
  assert.strictEqual(empty.flash.trend, null, "and no trend is claimed off no data");

  let st = statsOf([]);
  st = S.recordFlash(st, { type: "recall", correct: true, revealMs: 5000, t: T0 }).stats;
  st = S.recordFlash(st, { type: "recall", correct: false, revealMs: 5000, t: T0 }).stats;
  const p = S.progressSummary(st, ALL, T0);
  assert.strictEqual(p.flash.rate, 0.5);
  assert.strictEqual(p.flash.days, 1);
  assert.ok(p.flash.byType.recall.items === 2);

  /* the trend: two weeks of both numbers, or it says nothing at all */
  const build = function (thisWeek, prevWeek, ftNow, ftWas) {
    let s = statsOf([]);
    const add = function (day, right, n) {
      for (let i = 0; i < n; i++) s = S.recordFlash(s, { type: "recall", correct: i < right, revealMs: 5000, t: T0 - day * DAY }).stats;
    };
    add(2, Math.round(thisWeek * 8), 8);
    add(9, Math.round(prevWeek * 8), 8);
    const cards = function (day, rate, n) {
      for (let i = 0; i < n; i++) s.cardsEarned["c" + day + i] = { t: T0 - day * DAY, tries: i < Math.round(rate * n) ? 1 : 3 };
    };
    cards(2, ftNow, 4);
    cards(9, ftWas, 4);
    return s;
  };
  const up = S.progressSummary(build(1, 0.5, 1, 0.5), ALL, T0);
  assert.ok(up.flash.trend && up.flash.trend.flashUp && up.flash.trend.firstTryUp);
  assert.ok(up.coachNotes.indexOf(S.FLASH_TOGETHER) >= 0, "both climbing is the note the parent asked for: " + up.coachNotes.join(" | "));
  assert.ok(/climbing together/.test(S.FLASH_TOGETHER));

  const apart = S.progressSummary(build(1, 0.5, 0.5, 1), ALL, T0).coachNotes.join(" | ");
  assert.ok(/Flash is climbing but first-try is not/.test(apart), apart);
  const flat = S.progressSummary(build(0.5, 0.5, 0.5, 0.5), ALL, T0).coachNotes.join(" | ");
  assert.ok(/both flat over two weeks/.test(flat), flat);
  const other = S.progressSummary(build(0.5, 1, 1, 0.5), ALL, T0).coachNotes.join(" | ");
  assert.ok(/First-try is climbing while Flash is flat/.test(other), other);

  /* one week of drill says nothing: the whole point is that it takes two to tell */
  let oneWeek = statsOf([]);
  for (let i = 0; i < 8; i++) oneWeek = S.recordFlash(oneWeek, { type: "recall", correct: true, revealMs: 5000, t: T0 - DAY }).stats;
  for (let i = 0; i < 4; i++) oneWeek.cardsEarned["z" + i] = { t: T0 - DAY, tries: 1 };
  assert.strictEqual(S.flashTrend(oneWeek, T0), null, "one week is not a trend");
  assert.strictEqual(S.flashNote(null), "", "and no trend says nothing rather than guessing");
  S.progressSummary(oneWeek, ALL, T0).coachNotes.forEach(function (n) {
    assert.ok(!/Flash and first-try/.test(n), "including in the notes: " + n);
  });
  assert.doesNotThrow(function () { S.flashTrend(null, T0); S.flashNote(null); });
}

generators();
plan();
reveal();
counters();
progress();
console.log("OK flash: recall/gone/imagine built on all " + ALL.length + " real fights with answers that are on the board they are asked about, "
  + "imagine answers computed after applyUci, a deterministic question per fight, six items with no repeats and a difficulty mix, "
  + "his own material first, the 12-item 80 percent reveal rule with a 3 s floor, counters that only climb, three clean days to unlock, "
  + "the Progress tile and the two-week Flash-against-first-try note");
