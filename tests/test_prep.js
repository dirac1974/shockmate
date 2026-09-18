#!/usr/bin/env node
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const S = require("../web/score.js");

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "encounters.v2.json"), "utf8"));
const ALL = Array.isArray(raw) ? raw : (raw.encounters || []);
const byId = {}; ALL.forEach(function (e) { byId[e.id] = e; });

// A card as recordMove writes it. Cards carry their motif, so prep needs no join.
function card(id, attempts, hits, lastCorrect) {
  const e = byId[id];
  return { id: id, motif: e.motif, attempts: attempts, hits: hits, misses: attempts - hits, lastCorrect: lastCorrect, founds: hits };
}
function statsOf(cards, earnedIds) {
  const st = Object.assign(S.emptyStats(), { cardsEarned: {} });
  st.cards = {}; (cards || []).forEach(function (c) { st.cards[c.id] = c; });
  (earnedIds || []).forEach(function (id) { st.cardsEarned[id] = { t: 1, critical: false, tries: 1 }; });
  return st;
}

function run() {
  assert.strictEqual(S.PREP_QUESTIONS.length, 2, "two questions, one for hung pieces and one for traps");

  /* motifStats aggregates per motif and skips cards with no attempts */
  const st = statsOf([
    card("02", 3, 1, false),   // fork, missed twice
    card("03", 2, 2, true),    // pawnFork, clean
    card("05", 4, 1, false),   // pin, weak
    card("06", 1, 1, true),    // pin, clean
    { id: "01", motif: "hanging", attempts: 0, hits: 0, misses: 0 },   // never played: ignored
  ]);
  const ms = S.motifStats(st);
  const fork = ms.filter(function (m) { return m.motif === "fork"; })[0];
  const pin = ms.filter(function (m) { return m.motif === "pin"; })[0];
  assert.ok(fork && pin, "motifs with attempts are present");
  assert.ok(!ms.some(function (m) { return m.motif === "hanging"; }), "a card with no attempts contributes nothing");
  assert.strictEqual(pin.attempts, 5); assert.strictEqual(pin.hits, 2); assert.strictEqual(pin.misses, 3); assert.strictEqual(pin.fights, 2);
  assert.strictEqual(pin.retry, 1, "one pin fight is still waiting to be got right");
  assert.ok(Math.abs(fork.rate - 1 / 3) < 1e-9);

  /* weakest first: pin 2/5 = 0.4 beats fork 1/3 = 0.33? No: fork is lower, so fork comes first */
  const weak = S.weakestMotifs(st).map(function (m) { return m.motif; });
  assert.strictEqual(weak[0], "fork", "lowest hit rate ranks weakest");
  assert.strictEqual(weak[1], "pin");
  assert.strictEqual(weak[weak.length - 1], "pawnFork", "a perfect motif ranks strongest");
  assert.strictEqual(S.strongestMotifs(st)[0].motif, "pawnFork");

  /* prepFights: missed fights in the weakest motifs first, then unseen fights in those motifs */
  const prep = S.prepFights(st, ALL, 4);
  assert.strictEqual(prep.length, 4, "a prep day is four fights");
  assert.strictEqual(new Set(prep.map(function (e) { return e.id; })).size, 4, "no fight twice");
  assert.strictEqual(prep[0].id, "02", "the missed fight in the weakest motif comes first");
  assert.strictEqual(prep[1].id, "05", "then the missed fight in the next weakest motif");
  assert.strictEqual(prep[2].id, "o2", "then an unseen fight in the weakest motif");
  assert.ok(!st.cards[prep[3].id], "when the weak motifs run out, the day is filled from unseen fights rather than left short");
  assert.notStrictEqual(prep[3].motif, "pin", "no unseen pin fight exists, so the fill comes from elsewhere");
  assert.ok(!prep.some(function (e) { return e.id === "03" || e.id === "06"; }), "fights he already got right are not drilled while misses remain");

  /* a fresh profile still gets a full prep day, from unseen fights */
  const fresh = S.prepFights(statsOf([]), ALL, 4);
  assert.strictEqual(fresh.length, 4, "no data still yields four fights");

  /* a perfect profile has no weak motifs; prep falls through rather than returning nothing */
  const perfectCards = ALL.map(function (e) { return card(e.id, 1, 1, true); });
  const perfect = S.prepFights(statsOf(perfectCards, ALL.map(function (e) { return e.id; })), ALL, 4);
  assert.strictEqual(perfect.length, 4, "a perfect profile still gets something to play");

  /* Prep never mirrors the day he is on: a fresh profile on day 1 gets traps, none of day 1 */
  const D = require("../web/days.js");
  const day1 = D.dayByNumber(1).ids;
  const freshPrep = S.prepFights(statsOf([]), ALL, 4, day1);
  assert.strictEqual(freshPrep.length, 4);
  assert.ok(!freshPrep.some(function (e) { return day1.indexOf(e.id) >= 0; }), "fresh prep repeats day 1: " + freshPrep.map(function (e) { return e.id; }));
  assert.ok(freshPrep.every(function (e) { return e.pack === "openings"; }), "with no misses, prep drills the opening traps");
  assert.strictEqual(S.prepSource(statsOf([])), "traps");
  assert.strictEqual(S.prepSource(st), "misses");

  /* a miss always leads, even on today's day: drilling misses is the point; only the fill avoids today */
  const missed01 = statsOf([card("01", 2, 0, false)]);
  const mp = S.prepFights(missed01, ALL, 4, day1);
  assert.strictEqual(mp[0].id, "01", "a miss on today's day still leads prep");
  assert.ok(!mp.slice(1).some(function (e) { return day1.indexOf(e.id) >= 0; }), "the fill after the miss avoids today's day");

  /* a perfect profile avoiding its day still gets four, none from that day */
  const perfAvoid = S.prepFights(statsOf(perfectCards, ALL.map(function (e) { return e.id; })), ALL, 4, day1);
  assert.strictEqual(perfAvoid.length, 4);
  assert.ok(!perfAvoid.some(function (e) { return day1.indexOf(e.id) >= 0; }));

  /* The second question only when something is on offer */
  assert.deepStrictEqual(S.prepQuestionsFor(byId["01"]), S.PREP_QUESTIONS, "01: the rim pawn is bait, both questions");
  assert.deepStrictEqual(S.prepQuestionsFor(byId["g4"]), S.PREP_QUESTIONS.slice(0, 1), "g4: a quiet endgame gets only the first question");
  assert.deepStrictEqual(S.prepQuestionsFor(byId["03"]), S.PREP_QUESTIONS.slice(0, 1), "03: the bait is a king step, nothing to take");
  const offered = ALL.filter(function (e) { return S.offersBait(e); }).length;
  assert.ok(offered > 5 && offered < ALL.length, "some fights offer bait and some do not: " + offered);
  assert.strictEqual(S.prepQuestionsFor(null).length, 1, "null-safe");

  /* n is respected */
  assert.strictEqual(S.prepFights(st, ALL, 2).length, 2);

  /* null safety: these run during load before a profile exists */
  assert.doesNotThrow(function () { S.motifStats(null); S.weakestMotifs(null); S.prepFights(null, ALL, 4); });
  assert.strictEqual(S.prepFights(null, ALL, 4).length, 4);

  console.log("OK prep: motif stats aggregate and rank, prep picks misses in weakest motifs first then unseen, fresh and perfect profiles still get a day, null-safe");
}

run();
