#!/usr/bin/env node
"use strict";
const assert = require("assert");
const path = require("path");
const fs = require("fs");
const futures = require("../web/futures.js");

function loadEncounters() {
  const src = fs.readFileSync(path.join(__dirname, "../web/encounters.js"), "utf8");
  const sandbox = { window: {}, console };
  const vm = require("vm");
  vm.runInNewContext(src, sandbox);
  return sandbox.window.SHOCKMATE_ENCOUNTERS;
}

function kinds(events) {
  return events.map((e) => e.kind);
}

function run() {
  const list = loadEncounters();
  assert.strictEqual(list.filter((e) => e.pack === "tactics").length, 12, "12 tactics fights");

  list.forEach((e) => {
    assert.ok(e.pieces && e.pieces.length, e.id + " pieces");
    assert.ok(e.bestLineUci && e.bestLineUci[0] === e.best, e.id + " best line starts with best");
    assert.ok(e.temptingLineUci && e.temptingLineUci[0] === e.tempting, e.id + " temp line starts with tempting");
    const start = futures.piecesFromList(e.pieces);
    const bestSteps = futures.applyLine(start, e.bestLineUci);
    assert.strictEqual(bestSteps.length, e.bestLineUci.length, e.id + " best steps");
    const tempSteps = futures.applyLine(start, e.temptingLineUci);
    assert.strictEqual(tempSteps.length, e.temptingLineUci.length, e.id + " temp steps");
    const first = bestSteps[0];
    assert.strictEqual(first.from, e.best.slice(0, 2));
    assert.strictEqual(first.to, e.best.slice(2, 4));
    assert.ok(!first.pieces[first.from], e.id + " origin vacated");
    assert.ok(first.pieces[first.to], e.id + " dest occupied");
  });

  const snack = list[0];
  const miss = futures.buildPlan(snack, snack.tempting);
  assert.strictEqual(miss.hit, false);
  const missKinds = miss.acts.map((a) => a.kind);
  assert.deepStrictEqual(missKinds.slice(0, 3), ["banner", "reset", "line"]);
  assert.ok(missKinds.includes("card"));
  assert.ok(missKinds.includes("finisher"));
  const weak = miss.acts.find((a) => a.label === "weak");
  const strong = miss.acts.find((a) => a.label === "best");
  assert.deepStrictEqual(weak.ucis, snack.temptingLineUci);
  assert.deepStrictEqual(strong.ucis, snack.bestLineUci);

  const hit = futures.buildPlan(snack, snack.best);
  assert.strictEqual(hit.hit, true);
  const rest = hit.acts.find((a) => a.label === "best-rest");
  if (snack.bestLineUci.length > 1) assert.deepStrictEqual(rest.ucis, snack.bestLineUci.slice(1));
  else assert.ok(!rest && hit.acts.find((a) => a.kind === "hold"), "one-ply why holds instead of playing a rest");

  const mate = list[7];
  const hitMate = futures.buildPlan(mate, mate.best);
  assert.strictEqual(hitMate.hit, true);
  assert.ok(!hitMate.acts.find((a) => a.label === "best-rest"), "mate in one has no rest");

  const poison = list[3];
  const steps = futures.applyLine(futures.piecesFromList(poison.pieces), poison.temptingLineUci);
  assert.ok(steps[0].captured && steps[0].captured.role === "b");
  assert.ok(steps[1].captured && steps[1].captured.role === "q", "pawn eats the poisoned queen");

  assert.throws(() => futures.applyUci({}, "a1a2"));

  list.forEach((e) => {
    const missSim = futures.simulatePlan(e, e.tempting);
    assert.strictEqual(missSim.hit, false, e.id + " miss is a miss");
    const mk = kinds(missSim.events);
    assert.ok(mk.includes("reset"), e.id + " miss resets to show the weak line from the start");
    assert.ok(mk.includes("finisher"), e.id + " miss ends with a motif finisher");
    assert.strictEqual(mk[mk.length - 1], "card", e.id + " miss ends on the why card");
    const resets = missSim.events.filter((ev) => ev.kind === "reset");
    assert.ok(resets.length >= 2, e.id + " miss shows weak then best (two resets)");
    resets.forEach((r) => assert.ok(r.matchesStart, e.id + " reset returns to the start position"));
    const weakMoves = missSim.events.filter((ev) => ev.label === "weak").map((ev) => ev.uci);
    const bestMoves = missSim.events.filter((ev) => ev.label === "best").map((ev) => ev.uci);
    assert.deepStrictEqual(weakMoves, Array.from(e.temptingLineUci), e.id + " weak future plays the snack line");
    assert.deepStrictEqual(bestMoves, Array.from(e.bestLineUci), e.id + " better future plays the best line");

    const hitSim = futures.simulatePlan(e, e.best);
    assert.strictEqual(hitSim.hit, true, e.id + " hit is a hit");
    const hk = kinds(hitSim.events);
    assert.ok(!hk.includes("reset"), e.id + " hit does not rewind the kid's good move");
    assert.ok(hk.includes("finisher"), e.id + " hit still gets a finisher");
    assert.strictEqual(hk[hk.length - 1], "card");
    const restMoves = hitSim.events.filter((ev) => ev.label === "best-rest").map((ev) => ev.uci);
    assert.deepStrictEqual(restMoves, Array.from(e.bestLineUci).slice(1), e.id + " hit only animates the rest of the why");

    const fin = futures.finisherFor(e);
    assert.ok(fin.targets && fin.targets.length, e.id + " finisher has targets");
    fin.targets.forEach((sq) => assert.match(sq, /^[a-h][1-8]$/, e.id + " target " + sq));
    const decoy = futures.decoyWhy(list, e);
    assert.ok(decoy && decoy !== e.why, e.id + " palace walk decoy is a different why");
  });

  const forkT = futures.motifTargets(list[1]);
  assert.ok(forkT.includes("g8") && forkT.includes("d5"), "fork bites king and rook: " + forkT);
  const pawnT = futures.motifTargets(list[2]);
  assert.ok(pawnT.includes("b6") && pawnT.includes("d6"), "pawn fork bites king and rook: " + pawnT);
  const royalT = futures.motifTargets(list[11]);
  assert.ok(royalT.includes("e8") && royalT.includes("a8"), "royal fork: " + royalT);
  const pinT = futures.motifTargets(list[4]);
  assert.ok(pinT.includes("c6") && pinT.includes("e8"), "pin glue knight + king: " + pinT);
  const skewerT = futures.motifTargets(list[6]);
  assert.ok(skewerT.includes("e8") && skewerT.includes("a8"), "skewer king then rook: " + skewerT);
  const doorT = futures.motifTargets(list[7]);
  assert.ok(doorT.includes("a8"), "basement door slams a8: " + doorT);
  const laserT = futures.motifTargets(list[10]);
  assert.ok(laserT.includes("c6") && laserT.includes("e8"), "discovery eats queen and checks king: " + laserT);

  const snackMiss = futures.simulatePlan(snack, snack.tempting);
  const lastWeak = snackMiss.events.filter((ev) => ev.label === "weak").pop();
  assert.strictEqual(lastWeak.uci, "a5a1");
  assert.strictEqual(lastWeak.captured, "r", "Qxa1+ eats the rook the queen abandoned");

  assert.ok(list.filter((e) => e.pack === "openings").length >= 5, "openings pack ships");
  list.forEach((e) => {
    assert.ok(e.moves && e.moves[e.best] && e.moves[e.best].tier === "best", e.id + " best move is tier best");
    assert.strictEqual(e.moves[e.tempting].tier, "bait", e.id + " bait move is tier bait");
    Object.keys(e.legal).forEach((fr) => e.legal[fr].forEach((m) => assert.ok(e.moves[m.uci], e.id + " every legal move is scored: " + m.uci)));
    assert.ok(e.whyTargets && e.whyTargets.squares.length >= 1 && e.whyTargets.prompt.split(" ").length <= 12, e.id + " why targets");
    assert.ok(e.candidates && e.candidates.length >= 1 && e.candidates.includes(e.best.slice(0, 2)), e.id + " candidates include the best origin");
  });
  /* Every fight opens on Glitch's move: the arriving move replays from the stored position onto the
     exact start, moves one of Glitch's pieces, and is what the board shades as the last move. */
  list.forEach((e) => {
    const a = futures.arriveOf(e);
    assert.ok(a && e.arrivePosition, e.id + " has no arriving move");
    const before = futures.piecesFromPack(e.arrivePosition);
    assert.ok(before[a.from] && before[a.from].color === "b", e.id + " arrive must move one of Glitch's pieces: " + e.arrive);
    const after = futures.applyUci(before, e.arrive).pieces, start = futures.piecesFromList(e.pieces);
    assert.deepStrictEqual(Object.keys(after).sort(), Object.keys(start).sort(), e.id + " arrive does not land on the start squares");
    Object.keys(start).forEach((s) => assert.deepStrictEqual(after[s], start[s], e.id + " arrive lands a different piece on " + s));
  });
  assert.strictEqual(futures.arriveOf({}), null, "a fight without an arrive move is safe");

  console.log("OK futures: " + list.length + " fights apply, hit+miss plans simulate, motif finishers, palace decoys.");
}

run();
