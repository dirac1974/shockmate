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
