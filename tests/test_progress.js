#!/usr/bin/env node
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const S = require("../web/score.js");

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "encounters.v2.json"), "utf8"));
const ALL = Array.isArray(raw) ? raw : (raw.encounters || []);
const byId = {}; ALL.forEach(function (e) { byId[e.id] = e; });
const MOTIFS = new Set(ALL.map(function (e) { return e.motif; }));

const noon = function (y, m, d) { return new Date(y, m, d, 12).getTime(); };
const TODAY = noon(2026, 8, 18), YESTERDAY = noon(2026, 8, 17), LONG_AGO = noon(2026, 7, 1);

function card(id, attempts, hits, lastCorrect) {
  const e = byId[id];
  return { id: id, motif: e.motif, attempts: attempts, hits: hits, misses: attempts - hits, lastCorrect: lastCorrect, founds: hits };
}
function statsOf(cards, earned) {
  const st = Object.assign(S.emptyStats(), { cardsEarned: {} });
  st.cards = {}; (cards || []).forEach(function (c) { st.cards[c.id] = c; });
  Object.keys(earned || {}).forEach(function (id) { st.cardsEarned[id] = { t: earned[id], critical: false, tries: 1 }; });
  return st;
}

function run() {
  /* verdict thresholds */
  assert.strictEqual(S.motifVerdict(null), "new");
  assert.strictEqual(S.motifVerdict({ attempts: 0 }), "new", "never met is new");
  assert.strictEqual(S.motifVerdict({ attempts: 3, rate: 1 / 3, retry: 1 }), "focus", "low rate is focus");
  assert.strictEqual(S.motifVerdict({ attempts: 2, rate: 1, retry: 1 }), "focus", "an open retry is focus even with a good rate");
  assert.strictEqual(S.motifVerdict({ attempts: 1, rate: 1, retry: 0 }), "ok", "one clean try is not yet good");
  assert.strictEqual(S.motifVerdict({ attempts: 2, rate: 0.75, retry: 0 }), "good", "two tries at 75 percent is good");
  assert.strictEqual(S.motifVerdict({ attempts: 4, rate: 0.6, retry: 0 }), "ok", "between the bands is ok");

  /* cards by day: 14 entries, oldest first, counted by local calendar day */
  const st = statsOf([], { "01": TODAY, "02": TODAY, "03": YESTERDAY, "04": LONG_AGO });
  const days = S.cardsByDay(st, 14, TODAY);
  assert.strictEqual(days.length, 14);
  assert.strictEqual(days[13].n, 2, "two cards today");
  assert.strictEqual(days[12].n, 1, "one card yesterday");
  assert.strictEqual(days.reduce(function (a, d) { return a + d.n; }, 0), 3, "a card from long ago is outside the window");
  assert.strictEqual(days[13].key, S.dateKey(TODAY));
  assert.ok(days[0].key !== days[13].key, "keys differ across the window");

  /* progress summary: every motif in the data appears, met or not, sorted focus -> ok -> new -> good */
  const played = statsOf(
    [card("02", 3, 1, false), card("03", 2, 2, true), card("05", 1, 1, true)],
    { "03": TODAY, "05": TODAY }
  );
  const p = S.progressSummary(played, ALL, TODAY);
  assert.strictEqual(p.motifs.length, MOTIFS.size, "one row per motif in the data");
  assert.strictEqual(p.total, ALL.length);
  assert.strictEqual(p.cards, 2);
  assert.strictEqual(p.motifs[0].verdict, "focus", "focus rows come first");
  assert.strictEqual(p.motifs[0].motif, "fork");
  assert.strictEqual(p.motifs[p.motifs.length - 1].verdict, "good", "good rows come last");
  assert.deepStrictEqual(p.goodAt, [S.motifLabel("pawnFork")], "good at names the motif the parent can read");
  assert.deepStrictEqual(p.focusOn, [S.motifLabel("fork")]);
  const pinRow = p.motifs.filter(function (m) { return m.motif === "pin"; })[0];
  assert.strictEqual(pinRow.verdict, "ok", "one clean pin try is ok, not good");
  assert.strictEqual(pinRow.fights, 1); assert.strictEqual(pinRow.total, 2, "met one of the two pin fights");
  const unmet = p.motifs.filter(function (m) { return m.verdict === "new"; });
  assert.ok(unmet.length > 0 && unmet.every(function (m) { return m.attempts === 0; }), "unmet motifs are new with no attempts");
  assert.strictEqual(p.byDay.length, 14);
  assert.strictEqual(p.rank.title, "Cadet", "two cards is Cadet");

  /* null safety: a profile that has never played */
  assert.doesNotThrow(function () { S.progressSummary(null, ALL, TODAY); S.cardsByDay(null, 14, TODAY); });
  const empty = S.progressSummary(null, ALL, TODAY);
  assert.strictEqual(empty.cards, 0);
  assert.ok(empty.motifs.every(function (m) { return m.verdict === "new"; }), "nothing met means everything is new");
  assert.deepStrictEqual(empty.goodAt, []); assert.deepStrictEqual(empty.focusOn, []);

  console.log("OK progress: verdict bands, cards by local day over 14 days, one row per motif sorted focus to good, good-at and focus-on lists, null-safe");
}

run();
