#!/usr/bin/env node
"use strict";
const assert = require("assert");
const score = require("../web/score.js");
const encA = { id: "01", title: "Snack vs Crown", motif: "hanging", bestSan: "Rxa5", why: "Eat the queen.", palaceRoom: "Hanging Buffet", mascot: "LOOSE LUNCH" };
const encB = { id: "02", title: "Two-Headed Knight", motif: "fork", bestSan: "Nf6+", why: "Two heads.", palaceRoom: "Fork Hall", mascot: "TWO HEADS" };
const encC = { id: "03", title: "Tiny Double Bite", motif: "pawnFork", bestSan: "c5+", why: "Tiny fork.", palaceRoom: "Fork Hall", mascot: "TWO HEADS" };
const list = [encA, encB, encC];
function run() {
  let s = score.emptyStats();
  assert.strictEqual(score.reasonsKept(s), 0);
  let r = score.recordAttempt(s, encA, { correct: false, san: "Qxh5", t: 1 });
  s = r.stats;
  assert.ok(score.needsRetry(s, "01"));
  r = score.recordAttempt(s, encA, { correct: true, san: "Rxa5", t: 2 });
  s = r.stats;
  assert.strictEqual(score.reasonsKept(s), 1);
  assert.strictEqual(r.card.mastered, false);
  r = score.recordAttempt(s, encA, { correct: true, san: "Rxa5", t: 3 });
  s = r.stats;
  assert.ok(r.card.mastered);
  r = score.recordAttempt(s, encA, { correct: false, san: "Qxh5", t: 4 });
  s = r.stats;
  assert.ok(score.needsRetry(s, "01"));
  s = score.emptyStats();
  s = score.recordAttempt(s, encA, { correct: true, san: "Rxa5", t: 1 }).stats;
  s = score.recordAttempt(s, encB, { correct: false, san: "Nxd6", t: 2 }).stats;
  assert.strictEqual(list[score.pickNextIndex(list, s, 0)].id, "02");
  const rows = score.historyRows(list, s);
  assert.strictEqual(rows[1].status, "retry");
  
// --- Glitch's bragged rating: his number falls, the kid's never does ---
{
  const r0 = score.glitchRating({});
  assert.strictEqual(r0.real, 1500, "untested Glitch starts at his brag");
  assert.strictEqual(r0.claimed, 1500);

  const one = score.glitchRating({ cardsEarned: { "01": { critical: false } } });
  assert.strictEqual(one.real, 1415, "the first card knocks 85 off — visible movement");
  assert.strictEqual(one.claimed, 1500, "his claim never moves - that is the joke");

  const crit = score.glitchRating({ cardsEarned: { "01": { critical: true } } });
  assert.strictEqual(crit.real, 1375, "a critical hurts him more");

  // Monotonic: replaying a fight or earning more can never push his rating back up.
  let prev = 1500, earned = {};
  for (let i = 0; i < 23; i++) {
    earned["c" + i] = { critical: i % 3 === 0 };
    const now = score.glitchRating({ cardsEarned: earned }).real;
    assert.ok(now <= prev, "rating never rises");
    prev = now;
  }
  assert.ok(prev >= 300, "never below the floor: " + prev);
  assert.ok(prev > 300 && prev < 600, "clearing every fight should drag him to the kids' own level: " + prev);
  const f = score.glitchRating({ cardsEarned: earned }).fraction;
  assert.ok(f > 0 && f < 0.3, "the meter has visibly emptied: " + f);

  const flooded = { cardsEarned: {} };
  for (let i = 0; i < 400; i++) flooded.cardsEarned["x" + i] = { critical: true };
  assert.strictEqual(score.glitchRating(flooded).real, 300, "floor holds however many packs arrive");
  assert.ok(score.glitchRating({ cardsEarned: { a: {}, b: {}, c: {} } }).real > 1200, "three cards do not finish him");
  assert.ok(score.glitchRating(flooded).floored, "floored is reported so the taunt can change");

  assert.ok(/not been tested/.test(score.ratingTaunt(r0)), "no cards yet, no excuses yet");
  assert.ok(/1500/.test(score.ratingTaunt(score.glitchRating(flooded))), "he still claims 1500 at the floor");
}

console.log("OK score, including Glitch's deflating brag");
}
run();

/* ---------- v0.19: think time, rushed moves, cracked cards, Glitch's lines ---------- */
function rush() {
  let s = score.emptyStats();
  assert.deepStrictEqual(score.rushOf(s), { moves: 0, rushed: 0, rate: 0 }, "a fresh profile has no timed moves");
  // an untimed attempt (older build, or a path with no clock) counts nowhere
  s = score.recordMove(s, encA, { correct: false, san: "x", t: 1 }).stats;
  assert.strictEqual(score.rushOf(s).moves, 0, "no thinkMs, no rush data");
  assert.strictEqual(s.cards["01"].thinkMs, undefined);
  // wrong and fast: rushed
  let r = score.recordMove(s, encA, { correct: false, san: "x", t: 2, thinkMs: 1800 });
  assert.strictEqual(r.rushed, true);
  s = r.stats;
  assert.strictEqual(s.cards["01"].thinkMs, 1800, "the card keeps the last think time");
  assert.strictEqual(s.cards["01"].rushed, 1);
  assert.deepStrictEqual(s.rush, { moves: 1, rushed: 1 });
  // right and fast: a kid who saw it is never counted as rushing
  r = score.recordMove(s, encA, { correct: true, san: "Rxa5", t: 3, thinkMs: 900 });
  assert.strictEqual(r.rushed, false); s = r.stats;
  assert.deepStrictEqual(s.rush, { moves: 2, rushed: 1 });
  assert.strictEqual(s.cards["01"].thinkMs, 900, "last, not first");
  assert.strictEqual(s.cards["01"].rushed, 1, "the per-card count only climbs");
  // wrong but slow: not rushed. The boundary is 4000 exactly: under it is rushed.
  s = score.recordMove(s, encB, { correct: false, san: "x", t: 4, thinkMs: score.RUSH_MS }).stats;
  s = score.recordMove(s, encB, { correct: false, san: "x", t: 5, thinkMs: score.RUSH_MS - 1 }).stats;
  assert.deepStrictEqual(s.rush, { moves: 4, rushed: 2 });
  assert.strictEqual(score.rushOf(s).rate, 0.5);
  // junk is ignored rather than stored
  const junk = score.recordMove(s, encC, { correct: false, san: "x", t: 6, thinkMs: NaN }).stats;
  assert.deepStrictEqual(junk.rush, s.rush, "a NaN think time is not a move");
  assert.strictEqual(score.recordMove(s, encC, { correct: false, t: 7, thinkMs: -5 }).stats.rush.moves, 4, "negative is not a move");
  // pure: the input stats are untouched
  const before = JSON.stringify(s);
  score.recordMove(s, encA, { correct: false, t: 8, thinkMs: 10 });
  assert.strictEqual(JSON.stringify(s), before, "recordMove never mutates its input");
  // the numbers only ever climb, whatever happens
  let prev = { moves: 0, rushed: 0 }, t = score.emptyStats();
  for (let i = 0; i < 40; i++) {
    t = score.recordMove(t, list[i % 3], { correct: i % 3 === 0, t: i, thinkMs: (i * 977) % 9000 }).stats;
    const now = score.rushOf(t);
    assert.ok(now.moves >= prev.moves && now.rushed >= prev.rushed, "rush counts never go down");
    prev = now;
  }
}

function cracked() {
  const E = score.earnCard;
  // first try and second try are clean; the confession path (guided) is cracked
  const first = E(undefined, { tries: 1, t: 1, tier: "best", guided: false });
  assert.strictEqual(first.earned.clean, true); assert.strictEqual(first.cracked, false);
  assert.strictEqual(E(undefined, { tries: 2, t: 1, guided: false }).earned.clean, true, "second try is clean");
  const conf = E(undefined, { tries: 3, t: 1, tier: "best", guided: true });
  assert.strictEqual(conf.earned.clean, false, "a confession win is cracked");
  assert.strictEqual(conf.cracked, true, "and it is news, once");
  assert.strictEqual(conf.repaired, false);
  // a cracked card replayed on the confession path again stays cracked, and is not news again
  const again = E(conf.earned, { tries: 3, t: 2, guided: true });
  assert.strictEqual(again.earned.clean, false); assert.strictEqual(again.cracked, false, "cracked is said once");
  // a clean win repairs it: the only transition
  const fixed = E(conf.earned, { tries: 1, t: 3, guided: false });
  assert.strictEqual(fixed.earned.clean, true); assert.strictEqual(fixed.repaired, true);
  // and once clean it can never crack again, even through another confession
  const stays = E(fixed.earned, { tries: 3, t: 4, guided: true });
  assert.strictEqual(stays.earned.clean, true, "clean never goes back to cracked");
  assert.strictEqual(stays.cracked, false); assert.strictEqual(stays.repaired, false);
  // a card earned before the field existed reads as clean, so the update cracks nothing
  const legacy = E({ critical: true, tries: 1, t: 1 }, { tries: 3, t: 5, guided: true });
  assert.strictEqual(legacy.earned.clean, true, "legacy cards are clean");
  assert.strictEqual(legacy.earned.critical, true, "a critical is never taken back");
  assert.strictEqual(score.cardCracked({ cardsEarned: { a: { clean: false }, b: {} } }, "a"), true);
  assert.strictEqual(score.cardCracked({ cardsEarned: { a: { clean: false }, b: {} } }, "b"), false);
  assert.deepStrictEqual(score.crackedIds({ cardsEarned: { a: { clean: false }, b: { clean: true }, c: {} } }), ["a"]);
  assert.doesNotThrow(function () { score.cardCracked(null, "a"); score.crackedIds(null); E(null, null); });
  // exhaustive: from every state, under every win kind, clean never falls
  [undefined, { clean: true }, { clean: false }, {}].forEach(function (prev) {
    [true, false].forEach(function (guided) {
      const out = E(prev, { tries: guided ? 3 : 1, guided: guided }).earned;
      const was = prev ? prev.clean !== false : null;
      if (was === true) assert.strictEqual(out.clean, true, "clean stays clean");
    });
  });
  // a cracked card still counts: Glitch's rating and the rank read it like any other
  const withCrack = { cardsEarned: { a: conf.earned, b: first.earned } };
  assert.strictEqual(score.agentRank(withCrack).cards, 2, "a cracked card counts toward rank");
  assert.strictEqual(score.glitchRating(withCrack).cards, 2);
  // the words said about it, in both registers
  assert.strictEqual(score.coachLine("words", { kind: "cracked" }), "Card earned, but cracked. Win it clean to repair it.");
  assert.strictEqual(score.coachLine("numbers", { kind: "cracked" }), "Cracked card. Clean win repairs it.");
  assert.ok(score.coachLine("words", { kind: "repaired" }).length > 5);
}

function glitchLines() {
  ["lookRight", "lookWrong", "lookGive", "cracked", "repaired", "pacing"].forEach(function (k) {
    const g = score.GLITCH_LINES[k];
    assert.ok(g && g.lines.length >= 3, k + " has three variants or more");
    assert.ok(typeof g.mood === "string" && g.mood.length, k + " has a mood");
    let prev, seen = {};
    for (let i = 0; i < g.lines.length * 2; i++) {
      const l = score.glitchLine(k, prev);
      assert.ok(l.text && l.mood === g.mood);
      if (prev !== undefined) assert.notStrictEqual(l.index, prev, k + " never repeats back to back");
      seen[l.index] = true; prev = l.index;
    }
    assert.strictEqual(Object.keys(seen).length, g.lines.length, k + " walks every variant");
  });
  assert.strictEqual(score.GLITCH_LINES.lookRight.mood, "nervous");
  assert.strictEqual(score.GLITCH_LINES.lookWrong.mood, "smug");
  assert.strictEqual(score.GLITCH_LINES.cracked.mood, "smug");
  assert.strictEqual(score.GLITCH_LINES.repaired.mood, "rage");
  assert.strictEqual(score.glitchLine("nope").text, "", "an unknown moment says nothing rather than throwing");
}

// v0.23: S.pickLine never repeats any of the last five lines said at a moment, whatever the dice say.
function pickLine() {
  let seed = 7;
  const rng = function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  ["lookRight", "lookWrong", "cracked", "repaired", "campStart"].forEach(function (k) {
    const t = score.GLITCH_LINES[k];
    let hist = [];
    const said = [];
    for (let i = 0; i < 300; i++) {
      const l = score.pickLine(t, hist, rng);
      assert.ok(l.text && l.key && l.mood === t.mood, k + " picks a real line with a key");
      assert.ok(said.slice(-score.LINE_WINDOW).indexOf(l.key) < 0, k + " repeated one of its last five: " + l.key);
      said.push(l.key); hist = l.history;
      assert.ok(hist.length <= score.LINE_WINDOW, "the history stays short");
    }
    assert.strictEqual(new Set(said).size, t.lines.length, k + " gets round every line");
  });
  // Always the lowest roll: it cycles instead of repeating.
  let hist = [], keys = [];
  for (let i = 0; i < 20; i++) { const l = score.pickLine(score.GLITCH_LINES.lookGive, hist, function () { return 0; }); keys.push(l.key); hist = l.history; }
  for (let i = 1; i < keys.length; i++) assert.ok(keys.slice(Math.max(0, i - 5), i).indexOf(keys[i]) < 0, "a fixed roll never lands inside the window");
  // A two-line table cannot hold a five-line window: it alternates.
  const two = score.lineTable("smug", "g-test", ["a", "b"]);
  let h2 = [], prev = null;
  for (let i = 0; i < 10; i++) { const l = score.pickLine(two, h2, rng); assert.notStrictEqual(l.key, prev); prev = l.key; h2 = l.history; }
  // Names are shown, never spoken; silent tables have no key.
  const ko = score.pickLine(score.GLITCH_LINES.ko, [], function () { return 0; });
  assert.ok(ko.text.indexOf("{name}") >= 0 && ko.speak.indexOf("{") < 0, "the bubble carries the name, the audio does not");
  assert.strictEqual(score.fillLine(ko.text, { name: "PASTE" }).indexOf("PASTE"), 0);
  assert.strictEqual(score.pickLine(score.GLITCH_LINES.blitz, []).key, null, "the think-window hint is never spoken");
  assert.strictEqual(score.pickLine(null, ["x"]).text, "", "no table, no line, no throw");
  // The suggestion always says line one; the screen may pick any line of its kind.
  const sug = score.suggestLevel({});
  assert.strictEqual(sug.sayKind, "first"); assert.strictEqual(sug.sayKey, "g-suggest-first-1");
  assert.strictEqual(sug.say, score.SUGGEST_SAY.first.lines[0]);
}

rush(); cracked(); glitchLines(); pickLine();
console.log("OK score v0.23: think time and rushed moves, cracked cards only ever repair, Glitch's lines never repeat inside a window of " + score.LINE_WINDOW);
