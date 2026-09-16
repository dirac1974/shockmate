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
  console.log("OK score");
}
run();
