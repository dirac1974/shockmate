#!/usr/bin/env node
"use strict";
/* Camp: the daily tournament-prep session. Holds the plan's shape, the warm-up targets, the threat
   counts, both coach registers, the principle map, and the once-a-day rule. Written to stay green
   while the defence pack does not exist yet, and to stay green once it does. */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const S = require("../web/score.js");
const F = require("../web/futures.js");

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "encounters.v2.json"), "utf8"));
const ALL = Array.isArray(raw) ? raw : (raw.encounters || []);
const byId = {}; ALL.forEach(function (e) { byId[e.id] = e; });
const hasThreat = function (e) { return F.threatTargets(e).length > 0; };

function statsOf(cards, earnedIds) {
  const st = Object.assign(S.emptyStats(), { cardsEarned: {} });
  st.cards = {}; (cards || []).forEach(function (c) { st.cards[c.id] = c; });
  (earnedIds || []).forEach(function (id) { st.cardsEarned[id] = { t: 1, critical: false, tries: 1 }; });
  return st;
}
function card(id, attempts, hits, lastCorrect) {
  return { id: id, motif: byId[id].motif, attempts: attempts, hits: hits, misses: attempts - hits, lastCorrect: lastCorrect, founds: hits };
}
// A stand-in for what Data is building, so the defence branches are exercised before the pack lands.
function withDefence() {
  const src = ALL.filter(hasThreat)[0];
  return ALL.concat(["counter", "defend", "attackers", "goodBishop"].map(function (m, i) {
    return Object.assign({}, src, { id: "d" + i, motif: m, pack: "defence", title: "Defence " + i });
  }));
}

function planShape() {
  const ids = function (list) { return list.map(function (e) { return e.id; }); };

  /* composition, with no defence pack in the data */
  const st = statsOf([card("02", 3, 1, false), card("05", 4, 1, false)], ["01", "04"]);
  const p = S.campPlan(st, ALL, { hasThreat: hasThreat });
  assert.strictEqual(p.warmups.length, 3, "three warm-ups");
  assert.strictEqual(p.fights.length, 4, "four fights");
  assert.strictEqual(p.counters.length, 2, "two counters");
  assert.strictEqual(p.boards.length, 6, "six boards to play after the warm-ups");
  assert.strictEqual(new Set(ids(p.all)).size, 9, "no fight appears twice in a session: " + ids(p.all).join(","));
  assert.strictEqual(p.hasDefence, ALL.some(function (e) { return e.pack === "defence"; }), "hasDefence reflects the data");
  if (p.hasDefence) p.counters.forEach(function (e) { assert.strictEqual(e.pack, "defence", "counters come from the defence pack when it exists: " + e.id); });
  p.warmups.forEach(function (e) { assert.ok(hasThreat(e), e.id + " is a warm-up but its arriving move attacks nothing"); });
  assert.ok(ids(p.warmups).indexOf("01") >= 0 && ids(p.warmups).indexOf("04") >= 0,
    "boards he has already won come first, so the position is familiar: " + ids(p.warmups).join(","));
  // 05 is a pin at 1/4 and 02 is a fork at 1/3, so the pin is the weaker motif and leads.
  assert.strictEqual(p.fights[0].id, "05", "the fights are prepFights: his weakest missed motif leads");
  assert.strictEqual(p.fights[1].id, "02", "then the miss in the next weakest motif");

  /* a fresh profile still gets a whole session */
  const fresh = S.campPlan(statsOf([]), ALL, { hasThreat: hasThreat });
  assert.strictEqual(fresh.warmups.length, 3);
  assert.strictEqual(fresh.fights.length, 4);
  assert.strictEqual(fresh.counters.length, 2);
  assert.strictEqual(new Set(ids(fresh.all)).size, 9, "a fresh session repeats nothing either");

  /* with the defence pack present, the counters come out of it and are counter/defend first */
  const dp = S.campPlan(statsOf([]), withDefence(), { hasThreat: hasThreat });
  assert.strictEqual(dp.counters.length, 2);
  assert.ok(dp.hasDefence, "the counters come from the defence pack once it exists");
  assert.deepStrictEqual(dp.counters.map(function (e) { return e.motif; }).sort(), ["counter", "defend"],
    "counter and defend lead the counter slots, ahead of the pack's other motifs");
  assert.ok(dp.fights.some(function (e) { return e.pack === "defence"; }),
    "the defence pack also leads the four prep fights for a profile with no misses");
  assert.strictEqual(new Set(dp.all.map(function (e) { return e.id; })).size, 9, "still no repeats with the pack in");

  /* a miss still outranks the pack, because drilling misses is the point of prep */
  const missing = S.campPlan(statsOf([card("02", 3, 0, false)]), withDefence(), { hasThreat: hasThreat });
  assert.strictEqual(missing.fights[0].id, "02", "his miss leads even with a defence pack available");

  /* nothing to plan from at all, and a null profile during load */
  assert.doesNotThrow(function () { S.campPlan(null, ALL, { hasThreat: hasThreat }); S.campPlan(null, [], {}); });
  const empty = S.campPlan(null, [], {});
  assert.deepStrictEqual([empty.warmups.length, empty.fights.length, empty.counters.length], [0, 0, 0]);

  /* prepFights is untouched when no pack is preferred: the Prep chip behaves exactly as before */
  assert.deepStrictEqual(S.prepFights(statsOf([]), ALL, 4).map(function (e) { return e.id; }),
    S.prepFights(statsOf([]), ALL, 4, null, []).map(function (e) { return e.id; }));
}

function threatTargets() {
  let withTargets = 0;
  ALL.forEach(function (e) {
    const t = F.threatTargets(e);
    const arrive = F.arriveOf(e);
    assert.ok(Array.isArray(t), e.id + " must return a list");
    assert.strictEqual(new Set(t).size, t.length, e.id + " lists a square twice");
    if (!t.length) return;
    withTargets += 1;
    const after = F.piecesFromPack(e.position), mover = after[arrive.to];
    assert.ok(t.indexOf(arrive.to) < 0, e.id + ": the arriving piece's own square is never a target");
    t.forEach(function (sq) {
      assert.ok(after[sq], e.id + ": " + sq + " has nothing on it");
      assert.notStrictEqual(after[sq].color, mover.color, e.id + ": " + sq + " is one of his own pieces");
    });
  });
  assert.ok(withTargets >= 3, "the warm-up needs at least three usable boards, found " + withTargets);

  /* every fight whose arriving move attacks something yields at least one target */
  ALL.forEach(function (e) {
    const arrive = F.arriveOf(e); if (!arrive) return;
    const after = F.piecesFromPack(e.position);
    if (!after[arrive.to]) return;
    if (F.enemyAttacked(after, arrive.to).length) {
      assert.ok(F.threatTargets(e).length >= 1, e.id + ": the arriving move attacks something but no target came back");
    }
  });

  /* known boards, so a data change that breaks the warm-up is visible here */
  assert.deepStrictEqual(F.threatTargets(byId["01"]), ["a1"], "01: Qa5 hits the rook on a1");
  assert.ok(F.threatTargets(byId["o7"]).length >= 2, "o7: the arriving move hits more than one piece");
  assert.deepStrictEqual(F.threatTargets({}), [], "null-safe");
  assert.deepStrictEqual(F.threatTargets({ arrive: "a1a2" }), [], "no board, no targets");

  /* the unpacked shape the game holds works the same as the packed one straight off the data */
  const unpacked = Object.assign({}, byId["01"]);
  unpacked.pieces = Object.keys(F.piecesFromPack(byId["01"].position)).map(function (sq) {
    const p = F.piecesFromPack(byId["01"].position)[sq]; return { color: p.color, role: p.role, sq: sq };
  });
  assert.deepStrictEqual(F.threatTargets(unpacked), ["a1"], "the game's unpacked board gives the same answer");
}

function threatStats() {
  let s = S.emptyStats();
  assert.deepStrictEqual(S.threatsOf(s), { asked: 0, found: 0, wrongTaps: 0 });
  let r = S.recordThreat(s, { targets: 2, found: 2, wrongTaps: 0 });
  s = r.stats;
  assert.deepStrictEqual(s.threats, { asked: 2, found: 2, wrongTaps: 0 });
  assert.ok(r.clean, "no wrong taps and everything found is a clean board");
  r = S.recordThreat(s, { targets: 3, found: 1, wrongTaps: 4 });
  s = r.stats;
  assert.deepStrictEqual(s.threats, { asked: 5, found: 3, wrongTaps: 4 });
  assert.ok(!r.clean);
  assert.ok(Math.abs(S.threatRate(s) - 3 / 5) < 1e-9);

  /* all three only ever climb, and found can never beat asked */
  const capped = S.recordThreat(s, { targets: 1, found: 9, wrongTaps: -3 }).stats;
  assert.strictEqual(capped.threats.found, 4, "found is capped at the number of targets");
  assert.strictEqual(capped.threats.wrongTaps, 4, "a negative wrong-tap count cannot take one back");
  assert.ok(capped.threats.asked >= s.threats.asked && capped.threats.found >= s.threats.found);
  assert.deepStrictEqual(s.threats, { asked: 5, found: 3, wrongTaps: 4 }, "recording does not mutate the old stats");
  assert.doesNotThrow(function () { S.recordThreat(null, null); });
}

function coaching() {
  /* the numbers kid gets a count; the words kid gets the question */
  assert.strictEqual(S.coachLine("numbers", { kind: "threat", count: 2 }), "He attacks 2 pieces. Tap both.");
  assert.strictEqual(S.coachLine("numbers", { kind: "threat", count: 1 }), "He attacks 1 piece. Tap it.");
  assert.strictEqual(S.coachLine("numbers", { kind: "threat", count: 3 }), "He attacks 3 pieces. Tap all 3.",
    "three targets never says \"both\"");
  assert.strictEqual(S.coachLine("words", { kind: "threat", count: 2 }), "What did that move just attack? Tap it.");
  assert.strictEqual(S.coachLine("words", { kind: "threat", count: 1 }), S.coachLine("words", { kind: "threat", count: 3 }),
    "the words prompt never leaks the count, because counting it is the job");

  /* every kind answers in both registers, and the two are never the same sentence */
  ["threat", "threatHint", "threatDone", "campStart", "say"].forEach(function (kind) {
    const a = S.coachLine("numbers", { kind: kind, count: 2 }), b = S.coachLine("words", { kind: kind, count: 2 });
    assert.ok(a && b, kind + " must answer in both registers");
    assert.notStrictEqual(a, b, kind + " says the same thing to both kids");
  });
  ["warm", "fights", "counter"].forEach(function (phase) {
    const a = S.coachLine("numbers", { kind: "phase", phase: phase }), b = S.coachLine("words", { kind: "phase", phase: phase });
    assert.ok(a && b && a !== b, "phase " + phase);
  });
  assert.strictEqual(S.coachLine("numbers", { kind: "nonsense" }), "", "an unknown kind says nothing rather than throwing");
  assert.strictEqual(S.coachLine(null, null), "");

  /* the numbers debrief is counts; the words debrief is two sentences with the principle in it */
  const nums = S.coachLine("numbers", { kind: "debrief", threatsFound: 5, threatsAsked: 6, firstTry: 4, fights: 6, streak: 7 });
  assert.ok(/5\/6/.test(nums) && /4\/6/.test(nums) && /7/.test(nums), "the counts are all there: " + nums);
  const words = S.coachLine("words", { kind: "debrief", motifLabel: "counting", principle: S.PRINCIPLES.counting });
  assert.ok(words.indexOf("counting") >= 0 && words.indexOf(S.PRINCIPLES.counting) >= 0, words);
  assert.ok(words.split(". ").length >= 2, "the words note is two sentences: " + words);
  assert.ok(!/\d/.test(words), "the words note leads with the reason, not a number: " + words);

  /* the style the parent set, and the default that follows short lines */
  assert.strictEqual(S.defaultCoachStyle({ short: [true, false] }, 0), "numbers");
  assert.strictEqual(S.defaultCoachStyle({ short: [true, false] }, 1), "words");
  assert.strictEqual(S.coachStyleOf({ short: [true, false] }, 0), "numbers", "with nothing set, short lines pick the register");
  assert.strictEqual(S.coachStyleOf({ short: [true, false], coach: ["words", "numbers"] }, 0), "words", "the parent's choice wins");
  assert.strictEqual(S.coachStyleOf({ short: [true, false], coach: ["rubbish", null] }, 0), "numbers", "a bad value falls back");
  assert.strictEqual(S.coachStyleOf(null, 0), "words");

  /* the debrief, built from real data */
  const st = statsOf([card("02", 3, 1, false), card("05", 4, 1, false)]);
  st.bestStreak = 5;
  const dn = S.campDebrief(st, { threatsAsked: 6, threatsFound: 6, firstTry: 5, fights: 6 }, "numbers");
  assert.strictEqual(dn.motif, "pin", "the weakest motif drives the note");
  assert.strictEqual(dn.principle, S.PRINCIPLES.pin);
  assert.ok(/6\/6/.test(dn.line) && /5\/6/.test(dn.line) && /5/.test(dn.line), dn.line);
  assert.strictEqual(dn.question, S.PREP_QUESTIONS[1], "he spotted every threat, so tomorrow's line is the other habit");
  assert.ok(dn.say.indexOf(S.PREP_QUESTIONS[1]) >= 0);
  const dw = S.campDebrief(st, { threatsAsked: 6, threatsFound: 2, firstTry: 2, fights: 6 }, "words");
  assert.strictEqual(dw.question, S.PREP_QUESTIONS[0], "he missed threats, so tomorrow's line is the threat question");
  assert.ok(dw.line.indexOf(S.motifLabel("pin")) >= 0 && dw.line.indexOf(S.PRINCIPLES.pin) >= 0, dw.line);
  const perfect = S.campDebrief(statsOf([card("02", 2, 2, true)]), {}, "words");
  assert.ok(perfect.line.length > 20, "a profile with no weak motif still gets a note: " + perfect.line);
  assert.doesNotThrow(function () { S.campDebrief(null, null, null); });
}

function principles() {
  /* every motif in the data has a rule, and so do the five the defence pack brings */
  const inData = {}; ALL.forEach(function (e) { if (e.motif) inData[e.motif] = true; });
  Object.keys(inData).forEach(function (m) {
    assert.ok(S.PRINCIPLES[m], "no principle for the motif " + m + ", which is in encounters.v2.json");
    assert.ok(S.MOTIF_LABEL[m], "no label for the motif " + m);
  });
  ["attackers", "goodBishop", "tradeChoice", "counter", "defend"].forEach(function (m) {
    assert.ok(S.PRINCIPLES[m], "no principle for the new motif " + m);
    assert.ok(S.MOTIF_LABEL[m], "no label for the new motif " + m);
    assert.strictEqual(S.principleFor(m), S.PRINCIPLES[m]);
  });
  assert.strictEqual(S.PRINCIPLES.attackers, "Add one more attacker before you take.");
  assert.strictEqual(S.PRINCIPLES.counter, "When attacked, look for a bigger attack before you retreat.");
  assert.strictEqual(S.PRINCIPLES.defend, "Defend with a move that also does something.");
  assert.strictEqual(S.PRINCIPLES.goodBishop, "Trade the bishop stuck behind your own pawns. Keep the free one.");
  assert.ok(/Knights love closed positions/.test(S.PRINCIPLES.tradeChoice));
  assert.strictEqual(S.principleFor("nonsense"), "", "an unknown motif has no rule rather than a wrong one");
  /* the text is pitched at the kid, not at an engine: short sentences, no square names, no eval */
  Object.keys(S.PRINCIPLES).forEach(function (m) {
    const t = S.PRINCIPLES[m];
    assert.ok(t.length < 130, m + " principle is too long for a card: " + t);
    assert.ok(!/[a-h][1-8]\b/.test(t), m + " principle names a square: " + t);
    assert.ok(/\.$/.test(t), m + " principle does not end in a full stop");
  });
  /* the icon set covers them too, so a card never falls back to the wrong picture */
  const M = require("../web/motifs.js");
  Object.keys(inData).concat(["attackers", "goodBishop", "tradeChoice", "counter", "defend"]).forEach(function (m) {
    assert.ok(M.keys.indexOf(m) >= 0, "no motif icon for " + m);
    assert.ok(/^<svg /.test(M.icon(m, 30)), "icon for " + m + " is not an svg");
  });
}

function doneToday() {
  const t = Date.UTC(2026, 8, 18, 12, 0, 0);
  const day = 24 * 60 * 60 * 1000;
  let st = S.emptyStats();
  assert.strictEqual(S.campDoneToday(st, t), false, "a fresh profile has not done camp");
  assert.strictEqual(S.campDaysDone(st), 0);

  st.camp = S.recordCampDay(st.camp, S.dateKey(t));
  assert.strictEqual(S.campDoneToday(st, t), true, "the chip says done today");
  assert.strictEqual(S.campDoneToday(st, t + day), false, "tomorrow is a new camp day");
  assert.strictEqual(S.campDaysDone(st), 1);
  assert.strictEqual(S.campOf(st).best, 1);

  /* a replay on the same day counts once and takes nothing back */
  const before = S.campOf(st);
  st.camp = S.recordCampDay(st.camp, S.dateKey(t));
  assert.strictEqual(S.campDaysDone(st), 1, "a replay does not count a second day");
  assert.strictEqual(S.campOf(st).best, before.best, "and does not move the run");
  assert.strictEqual(S.campOf(st).days[S.dateKey(t)], 2, "but the replay itself is remembered");

  /* consecutive days build a run; a gap starts a new one but never lowers the best */
  st.camp = S.recordCampDay(st.camp, S.dateKey(t + day));
  assert.strictEqual(S.campOf(st).best, 2);
  st.camp = S.recordCampDay(st.camp, S.dateKey(t + 4 * day));
  assert.strictEqual(S.campOf(st).run, 1, "a missed day starts the run again");
  assert.strictEqual(S.campOf(st).best, 2, "the best run is a number that only ever climbs");
  assert.strictEqual(S.campDaysDone(st), 3);
  assert.doesNotThrow(function () { S.campDoneToday(null); S.recordCampDay(null, S.dateKey(t)); });
}

/* Look first: the gate decision as one pure function. On in Tournament week and inside Camp, only on
   a fight whose arriving move attacks something, off everywhere else. */
function lookFirstGate() {
  const withT = ALL.filter(hasThreat)[0], without = ALL.filter(function (e) { return !hasThreat(e); })[0];
  assert.ok(withT, "some board attacks something on arrival");
  const tw = { tournament: true }, off = { tournament: false };
  const tg = F.threatTargets(withT);
  assert.strictEqual(S.lookFirst(tw, false, withT, tg), true, "tournament week, a threat: look first");
  assert.strictEqual(S.lookFirst(off, true, withT, tg), true, "inside camp, whatever the toggle says");
  assert.strictEqual(S.lookFirst(off, false, withT, tg), false, "a normal day is fast by design");
  assert.strictEqual(S.lookFirst({}, false, withT, tg), false, "no toggle is off");
  assert.strictEqual(S.lookFirst(null, false, withT, tg), false, "null settings are off");
  assert.strictEqual(S.lookFirst(null, true, withT, tg), true, "camp does not need settings");
  if (without) {
    assert.strictEqual(S.lookFirst(tw, true, without, F.threatTargets(without)), false, "a move that attacks nothing has no question");
  }
  assert.strictEqual(S.lookFirst(tw, true, withT, []), false, "no targets, no gate");
  assert.strictEqual(S.lookFirst(tw, true, withT, 2), true, "a count works as well as a list");
  assert.strictEqual(S.lookFirst(tw, true, Object.assign({}, withT, { threatTargets: tg })), true, "targets carried on the fight");
  assert.strictEqual(S.lookFirst(tw, true, withT), false, "with no targets given or carried, it stays off rather than guess");
  assert.strictEqual(S.lookFirst(tw, true, null, tg), false, "no fight, no gate");
  // brief by rule: a hint after two wrong taps, the answer and the think window on the third
  assert.deepStrictEqual(S.LOOK, { hintAfter: 2, giveAfter: 3 });
  assert.ok(S.LOOK.giveAfter > S.LOOK.hintAfter, "the hint comes before he is shown");
  // generated ladder fights go through the same decision: they are ordinary fights with more fields
  const ladder = Object.assign({}, withT, { id: "L1", pack: "ladder", generated: true, rating: 700, voice: "fork-v1" });
  assert.strictEqual(S.lookFirst(tw, false, ladder, F.threatTargets(ladder)), true);
  // the words he sees, both registers
  ["numbers", "words"].forEach(function (st) {
    assert.ok(/Look first/.test(S.coachLine(st, { kind: "lookFirst" })));
    assert.strictEqual(S.coachLine(st, { kind: "lookSeen" }), "Seen. Now your move.");
    assert.ok(/Now your move/.test(S.coachLine(st, { kind: "lookGive" })));
  });
  // the look-first tap is counted the same way as a warm-up: one target asked
  let st = S.emptyStats();
  st = S.recordThreat(st, { targets: 1, found: 1, wrongTaps: 0 }).stats;
  st = S.recordThreat(st, { targets: 1, found: 0, wrongTaps: 3 }).stats;
  assert.deepStrictEqual(S.threatsOf(st), { asked: 2, found: 1, wrongTaps: 3 });
}

/* Pacing: two finished days in one sitting and FIGHT offers Camp, unless Camp is already done today. */
function pacing() {
  assert.strictEqual(S.pacingNudge(0, false), false);
  assert.strictEqual(S.pacingNudge(1, false), false, "one day is a normal sitting");
  assert.strictEqual(S.pacingNudge(2, false), true, "two days: Camp instead?");
  assert.strictEqual(S.pacingNudge(5, false), true, "and it stays for the rest of the sitting");
  assert.strictEqual(S.pacingNudge(2, true), false, "not once Camp is done today");
  assert.strictEqual(S.pacingNudge(undefined, false), false);
}

planShape();
lookFirstGate();
pacing();
threatTargets();
threatStats();
coaching();
principles();
doneToday();
console.log("OK camp: look-first gate decision and pacing nudge, 3 warm-ups + 4 fights + 2 counters with no repeats and no defence pack needed, threat targets on every real board, threat counts only climb, both coach registers, a principle and an icon per motif, camp counts once a day");
