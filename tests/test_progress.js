#!/usr/bin/env node
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const S = require("../web/score.js");

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "encounters.v2.json"), "utf8"));
const ALL = Array.isArray(raw) ? raw : (raw.encounters || []);
// These scenarios reason about the hand-authored set ("the two pin fights"); the ladder is
// generated and covered by its own suites, so it stays out of the fixtures here.
const POOL = ALL; ALL.splice(0, ALL.length, ...POOL.filter(function (e) { return !e.generated; }));
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

/* Camp days are keyed the way score.js keys them, so a synthetic run has to be built with dateKey. */
function campDays(st, ts, n) {
  st.camp = { days: {}, total: 0, best: 0, run: 0, last: "" };
  for (let i = n - 1; i >= 0; i--) st.camp = S.recordCampDay(st.camp, S.dateKey(ts - i * 24 * 60 * 60 * 1000));
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

  /* ---------- v0.18: what the parent side now tracks ---------- */

  /* threats: the camp warm-ups, counted in targets rather than boards */
  const th = statsOf([], {});
  th.threats = { asked: 10, found: 6, wrongTaps: 2 };
  const pt = S.progressSummary(th, ALL, TODAY);
  assert.deepStrictEqual({ asked: pt.threats.asked, found: pt.threats.found, wrongTaps: pt.threats.wrongTaps },
    { asked: 10, found: 6, wrongTaps: 2 }, "threats come straight off the profile");
  assert.strictEqual(pt.threats.rate, 0.6, "rate is found over asked");
  assert.strictEqual(empty.threats.rate, 0, "no warm-ups yet is a rate of nought, not a divide by zero");

  /* camp: days, best run, the run he is on, and whether today is already done */
  const cs = campDays(statsOf([], {}), TODAY, 4);
  const pc = S.progressSummary(cs, ALL, TODAY);
  assert.strictEqual(pc.camp.days, 4, "four calendar days of camp");
  assert.strictEqual(pc.camp.run, 4); assert.strictEqual(pc.camp.best, 4);
  assert.strictEqual(pc.camp.doneToday, true, "the run ends today, so today is done");
  assert.strictEqual(S.progressSummary(campDays(statsOf([], {}), YESTERDAY, 2), ALL, TODAY).camp.doneToday, false,
    "a run that stopped yesterday has not been done today");
  assert.deepStrictEqual({ days: empty.camp.days, best: empty.camp.best, run: empty.camp.run, doneToday: empty.camp.doneToday },
    { days: 0, best: 0, run: 0, doneToday: false });

  /* first try: a card earned with tries > 1 was not found first go */
  const ft = statsOf([], {});
  ft.cardsEarned = { a: { t: TODAY, tries: 1 }, b: { t: TODAY, tries: 1 }, c: { t: TODAY, tries: 3 }, d: { t: TODAY, tries: 2 } };
  const pf = S.progressSummary(ft, ALL, TODAY);
  assert.strictEqual(pf.firstTryRate, 0.5, "two of four found first go");
  assert.strictEqual(pf.firstTry.first, 2); assert.strictEqual(pf.firstTry.cards, 4);
  assert.strictEqual(empty.firstTryRate, 0, "no cards is nought, never NaN");
  assert.ok(!isNaN(empty.firstTryRate));

  /* this week: Monday to Sunday around ts, not a rolling seven days */
  const wed = noon(2026, 8, 16), mon = noon(2026, 8, 14), sun = noon(2026, 8, 13), nextMon = noon(2026, 8, 21);
  assert.strictEqual(S.weekStart(wed), noon(2026, 8, 14) - 12 * 3600 * 1000, "the week starts on Monday midnight");
  assert.strictEqual(S.weekStart(mon), S.weekStart(wed), "Monday and Wednesday share a week");
  assert.notStrictEqual(S.weekStart(sun), S.weekStart(mon), "the Sunday before is the week before");
  const wk = campDays(statsOf([], { x: mon, y: wed, z: sun, w: nextMon }), wed, 1);
  const pw = S.progressSummary(wk, ALL, wed);
  assert.strictEqual(pw.thisWeek.cards, 2, "only the cards inside Monday-to-Sunday count");
  assert.strictEqual(pw.thisWeek.campDays, 1, "the camp day is inside the week");
  assert.strictEqual(S.progressSummary(wk, ALL, sun).thisWeek.cards, 1, "read from the Sunday before, only that Sunday's card");
  assert.deepStrictEqual({ c: empty.thisWeek.cards, d: empty.thisWeek.campDays }, { c: 0, d: 0 });

  /* coach notes: two to four plain sentences, in priority order, off this kid's own numbers */
  assert.ok(empty.coachNotes.length >= 2 && empty.coachNotes.length <= 4, "always two to four");
  assert.ok(/Camp/.test(empty.coachNotes[0]), "nothing played yet points at Camp: " + empty.coachNotes[0]);

  const missing = statsOf([], {}); missing.threats = { asked: 10, found: 4, wrongTaps: 0 };
  const nMissing = S.progressSummary(missing, ALL, TODAY).coachNotes;
  assert.ok(/attacked/.test(nMissing[0]), "a low threat rate leads: " + nMissing[0]);
  assert.ok(/4 of 10/.test(nMissing[0]), "and it quotes his own count");
  const thin = statsOf([], {}); thin.threats = { asked: 3, found: 0, wrongTaps: 0 };
  assert.ok(!/attacked/.test(S.progressSummary(thin, ALL, TODAY).coachNotes[0]),
    "three targets is too thin to call, so the rule holds its tongue");

  const tappy = statsOf([], {}); tappy.threats = { asked: 8, found: 8, wrongTaps: 9 };
  const nTappy = S.progressSummary(tappy, ALL, TODAY).coachNotes;
  assert.ok(/tapping before he looks/.test(nTappy[0]), "wrong taps outnumbering targets leads: " + nTappy[0]);

  const pMotif = S.progressSummary(played, ALL, TODAY);
  const say = pMotif.coachNotes.filter(function (n) { return /^At the board, say: /.test(n); })[0];
  assert.ok(say, "a focus motif gives the parent a line to say");
  assert.ok(say.indexOf(S.PRINCIPLES.fork) >= 0, "and it is the app's own words, so both coach with one voice");

  const runner = campDays(statsOf([], { a: TODAY }), TODAY, 5);
  const nRun = S.progressSummary(runner, ALL, TODAY).coachNotes;
  assert.ok(nRun.some(function (n) { return /5 days running/.test(n); }), "a run of three or more is worth keeping: " + nRun.join(" | "));
  assert.ok(!S.progressSummary(campDays(statsOf([], { a: TODAY }), TODAY, 2), ALL, TODAY).coachNotes
    .some(function (n) { return /days running/.test(n); }), "two days is not yet a run");

  S.progressSummary(th, ALL, TODAY).coachNotes.concat(nTappy, nRun, empty.coachNotes).forEach(function (n) {
    assert.strictEqual(typeof n, "string"); assert.ok(n.length > 10, "every note is a sentence, not a label");
  });
  assert.doesNotThrow(function () { S.progressSummary(null, ALL, TODAY); S.progressSummary({}, [], TODAY); });

  /* ---------- v0.19: rushing ---------- */
  assert.deepStrictEqual(empty.rush, { moves: 0, rushed: 0, rate: 0 }, "no timed moves is nought, never NaN");
  assert.ok(!empty.coachNotes.some(function (n) { return n === S.RUSH_NOTE; }));
  const rusher = statsOf([card("02", 3, 1, false)], {}); rusher.rush = { moves: 10, rushed: 4 };
  const pr = S.progressSummary(rusher, ALL, TODAY);
  assert.deepStrictEqual(pr.rush, { moves: 10, rushed: 4, rate: 0.4 }, "rush comes off the profile with a rate");
  assert.strictEqual(pr.coachNotes[0], "He is moving before he looks. Slow the hand: write the move on the scoresheet first.",
    "over thirty percent rushed leads the notes");
  assert.ok(pr.coachNotes.length <= 4);
  const edge = statsOf([card("02", 3, 1, false)], {}); edge.rush = { moves: 10, rushed: 3 };
  assert.ok(!S.progressSummary(edge, ALL, TODAY).coachNotes.some(function (n) { return n === S.RUSH_NOTE; }),
    "exactly thirty percent is not over thirty percent");
  // the rush note sits alongside the others, it does not push the threat note out
  const both = statsOf([card("02", 3, 1, false)], {}); both.rush = { moves: 5, rushed: 5 }; both.threats = { asked: 10, found: 4, wrongTaps: 0 };
  const nb = S.progressSummary(both, ALL, TODAY).coachNotes;
  assert.strictEqual(nb[0], S.RUSH_NOTE); assert.ok(/attacked/.test(nb[1]), "threat note follows: " + nb[1]);
  // real recorded moves feed it end to end
  let live = statsOf([], {});
  for (let i = 0; i < 4; i++) live = S.recordMove(live, byId["02"], { correct: false, san: "x", t: TODAY, thinkMs: 1500 }).stats;
  live = S.recordMove(live, byId["02"], { correct: true, san: "y", t: TODAY, thinkMs: 9000 }).stats;
  const pl = S.progressSummary(live, ALL, TODAY);
  assert.deepStrictEqual({ m: pl.rush.moves, r: pl.rush.rushed }, { m: 5, r: 4 });
  assert.strictEqual(pl.coachNotes[0], S.RUSH_NOTE);

  /* cracked cards still count as cards */
  const cr = statsOf([], { "01": TODAY, "02": TODAY }); cr.cardsEarned["01"].clean = false;
  const pcr = S.progressSummary(cr, ALL, TODAY);
  assert.strictEqual(pcr.cards, 2, "a cracked card is still an earned card");
  assert.strictEqual(pcr.cracked, 1);

  /* the Games tile: played, won, the best crony beaten, the blunder trend and the suggestion line
     the parent reads. Nothing on this tile can go down, including after a losing streak. */
  const noGames = S.progressSummary(statsOf([], {}), ALL, TODAY);
  assert.deepStrictEqual([noGames.games.played, noGames.games.wins], [0, 0], "a profile with no games still renders");
  assert.strictEqual(noGames.games.bestLevelWon, null);
  assert.deepStrictEqual(noGames.blunderTrend, [], "no games, no trend");
  assert.strictEqual(noGames.suggest.level, "rookie", "and the suggestion is where a first game starts");
  assert.ok(noGames.suggest.reason, "the parent gets a sentence, not a rung id");
  assert.strictEqual(noGames.gameFights, 0);

  let gs = statsOf([], {});
  gs = S.recordGame(gs, { level: "rookie", result: "win", blunders: 2, moves: 30, t: TODAY }).stats;
  gs = S.recordGame(gs, { level: "cadet", result: "win", blunders: 1, moves: 34, t: TODAY + 1 }).stats;
  gs = S.recordGame(gs, { level: "agent", result: "loss", blunders: 7, moves: 28, t: TODAY + 2 }).stats;
  gs.gameFights = [{ id: "G1", fen: "x" }, { id: "G2", fen: "y" }];
  const pg = S.progressSummary(gs, ALL, TODAY);
  assert.deepStrictEqual([pg.games.played, pg.games.wins, pg.games.losses], [3, 2, 1], "played, won and lost");
  assert.strictEqual(pg.games.bestLevelWon, "cadet", "the best crony beaten, which a later loss does not touch");
  assert.deepStrictEqual(pg.blunderTrend.map(function (d) { return d.blunders; }), [2, 1, 7], "oldest left, newest right");
  assert.ok(pg.blunderTrend.every(function (d) { return d.moves > 0 && d.level; }), "each bar knows its level and its length");
  assert.strictEqual(pg.gameFights, 2, "and how many of his own boards are waiting");
  assert.ok(pg.suggest.level && pg.suggest.reason, "the suggestion line is always there for the parent");

  /* the versus row: his own games against his sibling, his own colours, his own best moments. It is
     called once per profile and can only ever see one of them, and it is asserted here that nothing
     it returns could be read as a score between the two kids. */
  assert.strictEqual(noGames.versus.played, 0, "a kid who has never played his sibling still renders");
  assert.deepStrictEqual(noGames.bestMoves, []);
  assert.strictEqual(noGames.bestMove, null);
  let vsStats = statsOf([], {});
  vsStats = S.recordVersus(vsStats, { colour: "w", result: "win", blunders: 2, matched: 11, moves: 30, t: TODAY,
    bestMoves: [{ t: TODAY, san: "Qxf7#", fen: "fen-x", gain: 900, vs: "sibling", n: 8 }] }).stats;
  vsStats = S.recordVersus(vsStats, { colour: "b", result: "loss", blunders: 4, matched: 6, moves: 26, t: TODAY + 1 }).stats;
  const pv = S.progressSummary(vsStats, ALL, TODAY);
  assert.deepStrictEqual([pv.versus.played, pv.versus.asWhite, pv.versus.asBlack], [2, 1, 1], "his own row, both colours");
  assert.strictEqual(pv.versus.results.win, 1, "and a later loss takes the win away from nobody");
  assert.strictEqual(pv.bestMoves.length, 1, "his best moments are kept");
  assert.strictEqual(pv.bestMove.san, "Qxf7#", "and the most recent one is the one Progress names");
  assert.strictEqual(pv.bestMove.vs, "sibling", "nothing stored ever names the other kid");
  // The guarantee, stated as an assertion: there is no field anywhere in a kid's Progress row that
  // pairs his numbers with his sibling's.
  const json = JSON.stringify(pv);
  ["headToHead", "head_to_head", "scoreboard", "standings", "tally", "crosstable", "vsWins", "againstSibling", "opponent"]
    .forEach(function (k) { assert.ok(json.indexOf('"' + k + '"') < 0, "Progress must not hold a field called " + k); });
  assert.deepStrictEqual(S.suggestLevel(vsStats), S.suggestLevel(statsOf([], {})),
    "and versus never moves which crony he is offered");

  console.log("OK progress: verdict bands, cards by local day over 14 days, one row per motif sorted focus to good, good-at and focus-on lists, threats, camp days and runs, first-try rate, Monday-to-Sunday week, coach notes in priority order, rushed moves and the scoresheet note, cracked cards still count, the Games tile and the blunder trend, null-safe");
}

run();
