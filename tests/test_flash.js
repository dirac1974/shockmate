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
  assert.deepStrictEqual(S.FLASH_RUNGS, [10000, 7000, 5000, 3000], "ten seconds down to three, four rungs");
  assert.strictEqual(S.flashRevealMs(st), 10000, "a new kid gets the full ten seconds");
  const rec = function (s, ok) { return S.recordFlash(s, { type: "recall", correct: ok, revealMs: S.flashRevealMs(s), t: T0 }).stats; };
  // Eleven right is not yet a window.
  for (let i = 0; i < 11; i++) st = rec(st, true);
  assert.strictEqual(S.flashRolling(st).n, 11);
  assert.strictEqual(S.flashRevealMs(st), 10000, "eleven items is not the twelve the rule asks for");
  st = rec(st, true);
  assert.strictEqual(S.flashRevealMs(st), 7000, "twelve at 100 percent steps down one rung, not to the floor");
  assert.strictEqual(S.flashRolling(st).n, 0, "a step empties the window, so the next decision is made at the new speed");
  // A weak window at 7 s steps back up; a middling one holds and keeps rolling.
  for (let i = 0; i < 12; i++) st = rec(st, i < 5);
  assert.strictEqual(S.flashRevealMs(st), 10000, "5 of 12 is under half: back up a rung");
  for (let i = 0; i < 12; i++) st = rec(st, i < 8);
  assert.strictEqual(S.flashRevealMs(st), 10000, "8 of 12 is between the bars: hold");
  assert.strictEqual(S.flashRolling(st).n, 12, "a held rung keeps its window rolling");
  // Down the whole ladder on strong windows, then the floor holds.
  st = S.emptyStats();
  [7000, 5000, 3000, 3000].forEach(function (ms) {
    for (let i = 0; i < 12; i++) st = rec(st, i < 10);
    assert.strictEqual(S.flashRevealMs(st), ms, "10 of 12 steps down to " + ms);
  });
  assert.ok(S.FLASH_FAST_MS >= 3000, "the window never goes below three seconds");
  // Exactly the bar is the bar: 10 of 12 steps down, 9 of 12 holds; there is no rung above ten seconds.
  const window12 = function (nRight) {
    let s = S.emptyStats();
    for (let i = 0; i < 12; i++) s = rec(s, i < nRight);
    return S.flashRevealMs(s);
  };
  assert.strictEqual(window12(10), 7000, "10 of 12 is over eighty percent");
  assert.strictEqual(window12(9), 10000, "9 of 12 is not");
  assert.strictEqual(window12(0), 10000, "there is no rung above ten seconds");
  // Old profiles without a rung read as rung 0; a nonsense rung is clamped.
  assert.strictEqual(S.flashRevealMs({ flash: { items: 3 } }), 10000);
  assert.strictEqual(S.flashRevealMs({ flash: { rung: 99 } }), 3000);
  assert.strictEqual(S.flashRevealMs({ flash: { rung: -4 } }), 10000);
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

/* ---------- the control board (Chase & Simon) ----------
   One GONE item a drill on a real board's pieces scattered at random. It must look like a board, be
   the same pieces, never be the real position, and never touch a single real Flash number. */
function sameSet(a, b) {
  const bag = function (m) { return Object.keys(m).map(function (sq) { return m[sq].color + m[sq].role; }).sort().join(","); };
  return bag(a) === bag(b);
}
function adjacent(a, b) {
  return Math.max(Math.abs(a.charCodeAt(0) - b.charCodeAt(0)), Math.abs(Number(a[1]) - Number(b[1]))) <= 1;
}
function randomBoards() {
  ALL.forEach(function (enc) {
    const real = X.mapOf(enc);
    [1, 2, "Ben|2026-09-18|0"].forEach(function (seed) {
      const r = X.randomBoard(real, seed);
      assert.ok(r, enc.id + ": a random board always forms (seed " + seed + ")");
      assert.ok(sameSet(r, real), enc.id + ": exactly the same pieces, nothing added or lost");
      assert.strictEqual(Object.keys(r).length, Object.keys(real).length, "one piece a square");
      assert.ok(X.movedShare(r, real) >= X.CONTROL_MOVED, enc.id + ": at least 70% of pieces moved");
      assert.notDeepStrictEqual(r, real, "never the real position");
      Object.keys(r).forEach(function (sq) {
        assert.ok(/^[a-h][1-8]$/.test(sq), sq);
        if (r[sq].role === "p") assert.ok(sq[1] !== "1" && sq[1] !== "8", enc.id + ": a pawn on " + sq);
      });
      const wk = F.findKing(r, "w"), bk = F.findKing(r, "b");
      if (wk && bk) assert.ok(!adjacent(wk, bk), enc.id + ": kings side by side");
      [["w", "b"], ["b", "w"]].forEach(function (c) {
        const k = F.findKing(r, c[0]);
        if (k) assert.strictEqual(X.attackersOf(r, k, c[1]).length, 0, enc.id + ": the " + c[0] + " king is in check");
      });
      assert.ok(X.randomBoardLegal(r));
      assert.deepStrictEqual(X.randomBoard(real, seed), r, "the same seed is the same board");
    });
    assert.notDeepStrictEqual(X.randomBoard(real, 1), X.randomBoard(real, 2), enc.id + ": a new seed is a new board");
  });
  // A list works as well as a map, and nonsense is refused rather than drawn.
  const list = [{ color: "w", role: "k", sq: "e1" }, { color: "b", role: "k", sq: "e8" }, { color: "w", role: "p", sq: "e2" }];
  assert.ok(X.randomBoard(list, 5));
  assert.strictEqual(X.randomBoard({}, 1), null);
  assert.strictEqual(X.randomBoard(null, 1), null);
  assert.strictEqual(X.randomBoardLegal({ e1: { color: "w", role: "k" }, e2: { color: "b", role: "k" } }), false, "kings apart");
  assert.strictEqual(X.randomBoardLegal({ a1: { color: "w", role: "k" }, h8: { color: "b", role: "k" }, c8: { color: "w", role: "p" } }), false, "no pawn on the back rank");
  assert.strictEqual(X.randomBoardLegal({ a1: { color: "w", role: "k" }, h8: { color: "b", role: "k" }, a5: { color: "b", role: "r" } }), false, "no king in check");

  // The item: the real GONE question on the scattered board, never a king.
  STYLES.forEach(function (style) {
    const it = X.makeControl(byId["01"], 42, { style: style });
    const real = X.makeItem(byId["01"], "gone", { style: style });
    assert.ok(it.control && it.type === "gone" && it.kind === "tap" && it.reveal, "a GONE tap item with a reveal");
    assert.strictEqual(it.question, real.question, "the same words as a real GONE item");
    assert.strictEqual(it.style, real.style, "and the same coach line");
    assert.strictEqual(it.pairedId, "01");
    assert.notStrictEqual(it.encId, "01", "its own id, so a drill still has six different ones");
    assert.ok(it.position[it.squares[0]], "the answer square had a piece on it");
    assert.notStrictEqual(it.position[it.squares[0]].role, "k", "a king never vanishes");
    assert.ok(!it.hidden[it.squares[0]] && Object.keys(it.hidden).length === Object.keys(it.position).length - 1);
    assert.ok(X.check(it, it.squares[0]));
  });
}

function controlPlan() {
  STYLES.forEach(function (style) {
    ["a", "b", "c", "d", "Ben|2026-09-18|0", "Sam|2026-09-19|6"].forEach(function (seed) {
      const st = statsOf(["01", "02", "03"]);
      const p = S.flashPlan(st, ALL, S.FLASH_N, { supports: supportsFor(style), control: true, seed: seed });
      assert.strictEqual(p.items.length, 6, "six items, control included: the drill is the same length");
      const ctl = p.items.filter(function (i) { return i.control; });
      assert.strictEqual(ctl.length, 1, "exactly one control a drill");
      const at = p.items.indexOf(ctl[0]);
      assert.ok(at >= 1 && at <= 4, "at slot 2..5, got " + (at + 1));
      assert.strictEqual(ctl[0].type, "gone");
      const paired = p.items.filter(function (i) { return i.paired; });
      assert.strictEqual(paired.length, 1, "paired with exactly one real item");
      assert.strictEqual(paired[0].type, "gone", "a real GONE item");
      assert.strictEqual(paired[0].id, ctl[0].pairedId, "whose piece set it borrows");
      assert.strictEqual(ctl[0].enc, paired[0].enc);
      assert.strictEqual(new Set(p.items.map(function (i) { return i.id; })).size, 6, "six different ids");
      assert.deepStrictEqual(S.flashPlan(st, ALL, S.FLASH_N, { supports: supportsFor(style), control: true, seed: seed }).control, p.control,
        "the same session places the same control");
      const items = X.build(p, { style: style });
      assert.strictEqual(items.length, 6, "every planned item builds, the control too");
      assert.strictEqual(items.filter(function (i) { return i.control; }).length, 1);
      assert.strictEqual(items.filter(function (i) { return i.paired; }).length, 1);
      assert.ok(sameSet(items.filter(function (i) { return i.control; })[0].position, items.filter(function (i) { return i.paired; })[0].position),
        "the control's pieces are its paired board's pieces");
    });
  });
  // Camp's warm-up never asks for one, and a plan without the flag has none.
  const camp = S.campPlan(statsOf([]), ALL, { supports: supportsFor("words") });
  assert.strictEqual(camp.flash.length, 2);
  assert.ok(camp.flash.every(function (i) { return !i.control && !i.paired; }), "no control in Camp's warm-up");
  assert.ok(S.flashPlan(statsOf([]), ALL, 6, { supports: supportsFor("words") }).items.every(function (i) { return !i.control; }));
  // No real GONE board to borrow from: no control that day, and still six real items.
  const noGone = S.flashPlan(statsOf([]), ALL, 6, { supports: function (e, t) { return t === "recall"; }, control: true, seed: "x" });
  assert.strictEqual(noGone.items.length, 6);
  assert.strictEqual(noGone.control, null);
  assert.ok(noGone.items.every(function (i) { return !i.control; }), "skip the control that day");
  // Too few boards for a drill: no control either.
  assert.ok(S.flashPlan(statsOf([]), HAND.slice(0, 2), 6, { supports: supportsFor("words"), control: true, seed: 1 }).items.every(function (i) { return !i.control; }));
}

function controlLedger() {
  // A kid with a real history, in the middle of a rung.
  let st = statsOf([]);
  for (let i = 0; i < 9; i++) st = S.recordFlash(st, { type: i % 2 ? "gone" : "recall", correct: i % 3 !== 0, revealMs: 10000, t: T0 }).stats;
  const snapshot = JSON.parse(JSON.stringify(st));
  const realOf = function (s) { const f = Object.assign({}, s.flash); delete f.control; delete f.paired; return f; };
  const r = S.recordFlashControl(st, { correct: false, revealMs: 10000, pairedCorrect: true });
  assert.deepStrictEqual(st, snapshot, "recording never mutates the stats it was handed");
  assert.deepStrictEqual(realOf(r.stats), realOf(st), "not one real Flash field moved: items, correct, byType, days, run, last12, rung");
  Object.keys(r.stats).forEach(function (k) { if (k !== "flash") assert.deepStrictEqual(r.stats[k], st[k], k + " moved"); });
  assert.deepStrictEqual(S.flashOf(r.stats).rung, S.flashOf(st).rung);
  assert.strictEqual(S.flashRevealMs(r.stats), S.flashRevealMs(st));
  assert.deepStrictEqual(S.flashRolling(r.stats), S.flashRolling(st));
  assert.strictEqual(S.flashRate(r.stats), S.flashRate(st), "a wrong control answer does not dent his accuracy");
  assert.deepStrictEqual(r.stats.flash.control, { items: 1, correct: 0, firstLook: 0, byRung: { "10000": { items: 1, correct: 0 } } });
  assert.deepStrictEqual(r.stats.flash.paired, { items: 1, correct: 1, byRung: { "10000": { items: 1, correct: 1 } } });
  // Found on a later tap counts as found, not as a first look; the counters only climb.
  let s2 = S.recordFlashControl(r.stats, { correct: false, found: true, revealMs: 7000, pairedCorrect: false }).stats;
  s2 = S.recordFlashControl(s2, { correct: true, revealMs: 7000, pairedCorrect: true }).stats;
  assert.deepStrictEqual([s2.flash.control.items, s2.flash.control.correct, s2.flash.control.firstLook], [3, 2, 1]);
  assert.deepStrictEqual(s2.flash.control.byRung["7000"], { items: 2, correct: 1 });
  assert.deepStrictEqual([s2.flash.paired.items, s2.flash.paired.correct], [3, 2]);
  assert.deepStrictEqual(realOf(s2), realOf(st));
  // A real item after a control leaves the control alone too.
  const s3 = S.recordFlash(s2, { type: "gone", correct: true, revealMs: 10000, t: T0 }).stats;
  assert.deepStrictEqual([s3.flash.control, s3.flash.paired], [s2.flash.control, s2.flash.paired]);
  assert.doesNotThrow(function () { S.recordFlashControl(null, null); S.flashRecallGap(null); S.flashControlOf(undefined); });

  // The gap, and when it is enough to say anything.
  assert.deepStrictEqual(S.flashRecallGap(statsOf([])), { real: 0, random: 0, n: 0, pairedN: 0, enough: false });
  let g = statsOf([]);
  for (let i = 0; i < 9; i++) g = S.recordFlashControl(g, { correct: i < 4, revealMs: 10000, pairedCorrect: i < 8 }).stats;
  let gap = S.flashRecallGap(g);
  assert.strictEqual(gap.n, 9);
  assert.strictEqual(gap.enough, false, "nine random boards is not enough");
  assert.strictEqual(S.flashControlText(gap).line, "Collecting: 9 of 10 random boards.");
  assert.strictEqual(S.flashControlText(gap).note, "");
  g = S.recordFlashControl(g, { correct: true, revealMs: 10000, pairedCorrect: false }).stats;
  gap = S.flashRecallGap(g);
  assert.deepStrictEqual([gap.n, gap.enough, gap.real, gap.random], [10, true, 0.8, 0.5]);
  const txt = function (real, random) { return S.flashControlText({ enough: true, n: 10, real: real, random: random }); };
  assert.strictEqual(txt(0.8, 0.45).line, "Real boards 80% · random boards 45%");
  assert.ok(/pattern knowledge is building/.test(txt(0.8, 0.45).note), "35 points");
  assert.ok(/pattern knowledge is building/.test(txt(0.7, 0.5).note), "20 points is much better");
  assert.strictEqual(txt(0.69, 0.5).note, "A gap is opening.", "19 points");
  assert.strictEqual(txt(0.6, 0.5).note, "A gap is opening.", "10 points");
  assert.ok(/memorising squares, not patterns yet/.test(txt(0.59, 0.5).note), "9 points");
  assert.ok(/memorising squares/.test(txt(0.4, 0.6).note), "random better than real reads as the same");
  assert.strictEqual(S.flashControlText(null).line, "Collecting: 0 of 10 random boards.");

  // Progress carries both, for the parent only.
  const p = S.progressSummary(g, ALL, T0);
  assert.strictEqual(p.flash.control.line, "Real boards 80% · random boards 50%");
  assert.ok(/pattern knowledge is building/.test(p.flash.control.note), "30 points: " + p.flash.control.note);
  assert.strictEqual(p.flash.items, 0, "the control boards are not Flash items on the tile");
  const one = S.recordFlashControl(statsOf([]), { correct: false, revealMs: 10000, pairedCorrect: true }).stats;
  assert.strictEqual(S.progressSummary(one, ALL, T0).flash.control.line, "Collecting: 1 of 10 random boards.");
}

generators();
plan();
reveal();
counters();
progress();
randomBoards();
controlPlan();
controlLedger();
console.log("OK flash: recall/gone/imagine built on all " + ALL.length + " real fights with answers that are on the board they are asked about, "
  + "imagine answers computed after applyUci, a deterministic question per fight, six items with no repeats and a difficulty mix, "
  + "his own material first, the 12-item 80 percent reveal rule with a 3 s floor, counters that only climb, three clean days to unlock, "
  + "the Progress tile and the two-week Flash-against-first-try note, "
  + "and one seeded control board a drill (same pieces, scattered legally, 70% moved) whose ledger never touches a real number");
