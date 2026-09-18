const assert = require("assert");
const Y = require("../web/sync.js");

function card(over) {
  return Object.assign({ attempts: 0, founds: 0, misses: 0, whys: 0, hits: 0, lastFound: 0, lastCorrect: 0, mastered: false }, over);
}

function run() {
  /* Camp, threats, rush and cracks survive a two-device merge: counts take the larger side, camp
     days union, a crack repaired anywhere stays repaired. Order-free. */
  const devA = { cardsEarned: { "01": { t: 1, clean: false }, "02": { t: 2, clean: false } },
    threats: { asked: 6, found: 4, wrongTaps: 3 }, rush: { moves: 10, rushed: 4 },
    camp: { days: { "2026-09-18": 1 }, total: 1, best: 1, run: 1, last: "2026-09-18" } };
  const devB = { cardsEarned: { "01": { t: 5, clean: true }, "02": { t: 3, clean: false } },
    threats: { asked: 3, found: 3, wrongTaps: 0 }, rush: { moves: 12, rushed: 2 },
    camp: { days: { "2026-09-19": 1 }, total: 1, best: 1, run: 1, last: "2026-09-19" } };
  [Y.mergeStats(devA, devB), Y.mergeStats(devB, devA)].forEach(function (m) {
    assert.strictEqual(m.cardsEarned["01"].clean, true, "a clean win on either device repairs the crack");
    assert.strictEqual(m.cardsEarned["02"].clean, false, "cracked on both stays cracked");
    assert.deepStrictEqual([m.threats.asked, m.threats.found, m.threats.wrongTaps], [6, 4, 3], "threat counts take the larger side");
    assert.deepStrictEqual([m.rush.moves, m.rush.rushed], [12, 4], "rush counts take the larger side");
    assert.strictEqual(m.camp.total, 2, "camp days union across devices");
    assert.strictEqual(m.camp.last, "2026-09-19");
  });
  assert.strictEqual(Y.mergeStats({}, {}).camp, undefined, "no camp data invents none");

  /* Play. Games played and won only ever climb, so two devices take the larger of each; the best
     level beaten takes the higher rung whichever side it came from; `recent` unions by when the
     game ended, because the level suggestion reads it and half a history suggests the wrong crony;
     boards made out of his own games union by position and cap like a binder room. */
  const playA = { games: { played: 4, wins: 3, draws: 0, losses: 1, bestLevelWon: "cadet",
      byLevel: { cadet: { played: 3, wins: 2 }, rookie: { played: 1, wins: 1 } },
      recent: [{ level: "cadet", result: "win", blunders: 1, moves: 30, t: 300 },
               { level: "cadet", result: "loss", blunders: 5, moves: 28, t: 100 }] },
    gameFights: [{ id: "G01", fen: "fen-a", t: 300 }, { id: "G02", fen: "fen-shared", t: 100 }] };
  const playB = { games: { played: 6, wins: 2, draws: 1, losses: 3, bestLevelWon: "agent",
      byLevel: { cadet: { played: 2, wins: 1 }, agent: { played: 4, wins: 1 } },
      recent: [{ level: "agent", result: "win", blunders: 0, moves: 41, t: 400 },
               { level: "cadet", result: "loss", blunders: 5, moves: 28, t: 100 }] },
    gameFights: [{ id: "G03", fen: "fen-b", t: 400 }, { id: "G04", fen: "fen-shared", t: 100 }] };
  [Y.mergeStats(playA, playB), Y.mergeStats(playB, playA)].forEach(function (m) {
    assert.strictEqual(m.games.played, 6, "games played takes the larger side, never the sum");
    assert.strictEqual(m.games.wins, 3, "so do wins");
    assert.strictEqual(m.games.bestLevelWon, "agent", "the higher rung beaten wins the merge");
    assert.strictEqual(m.games.byLevel.cadet.played, 3, "per level too");
    assert.strictEqual(m.games.byLevel.agent.wins, 1, "including a level only one device has seen");
    assert.strictEqual(m.games.recent.length, 3, "the same game on both devices is one row");
    assert.deepStrictEqual(m.games.recent.map(function (r) { return r.t; }), [400, 300, 100], "newest first");
    assert.strictEqual(m.gameFights.length, 3, "one fight per position across both devices");
    assert.strictEqual(m.gameFights[0].fen, "fen-b", "newest first here as well");
  });
  const wide = { games: { recent: [] } };
  for (let i = 0; i < 9; i++) wide.games.recent.push({ level: "rookie", result: "draw", blunders: 0, moves: 9, t: 1000 + i });
  const other = { games: { recent: [{ level: "agent", result: "win", blunders: 0, moves: 30, t: 2000 }] } };
  assert.strictEqual(Y.mergeStats(wide, other).games.recent.length, Y.GAMES_RECENT, "the recent window is capped after merging");
  const manyA = [], manyB = [];
  for (let i = 0; i < 15; i++) { manyA.push({ fen: "a" + i, t: i }); manyB.push({ fen: "b" + i, t: 100 + i }); }
  assert.strictEqual(Y.mergeStats({ gameFights: manyA }, { gameFights: manyB }).gameFights.length, Y.GAME_FIGHTS_MAX,
    "and so is the room they live in");
  assert.strictEqual(Y.mergeStats({}, {}).games, undefined, "a profile that has never played a game invents none");
  assert.strictEqual(Y.mergeStats({}, {}).gameFights, undefined);

  /* Versus. Same rule again: every counter only ever climbs, so two devices take the larger of each
     rather than summing a game they both saw, and best moments union newest first and cap. There is
     nothing head-to-head to merge here, because there is nothing head-to-head stored. */
  const vsA = { versus: { played: 4, asWhite: 2, asBlack: 2, results: { win: 2, draw: 1, loss: 1 },
      recent: [{ colour: "w", result: "win", blunders: 1, moves: 30, t: 300 }, { colour: "b", result: "loss", blunders: 4, moves: 26, t: 100 }] },
    bestMoves: [{ t: 300, san: "Qxf7", fen: "fen-a", gain: 320, vs: "sibling" },
      { t: 100, san: "Nd5", fen: "fen-shared", gain: 180, vs: "sibling" }] };
  const vsB = { versus: { played: 6, asWhite: 3, asBlack: 3, results: { win: 1, draw: 3, loss: 2 },
      recent: [{ colour: "w", result: "draw", blunders: 0, moves: 40, t: 400 }, { colour: "b", result: "loss", blunders: 4, moves: 26, t: 100 }] },
    bestMoves: [{ t: 400, san: "Rxe8", fen: "fen-b", gain: 260, vs: "sibling" },
      { t: 100, san: "Nd5", fen: "fen-shared", gain: 180, vs: "sibling" }] };
  [Y.mergeStats(vsA, vsB), Y.mergeStats(vsB, vsA)].forEach(function (m) {
    assert.strictEqual(m.versus.played, 6, "versus games played takes the larger side, never the sum");
    assert.deepStrictEqual([m.versus.asWhite, m.versus.asBlack], [3, 3], "and so does each colour");
    assert.deepStrictEqual([m.versus.results.win, m.versus.results.draw, m.versus.results.loss], [2, 3, 2],
      "his own win, draw and loss counts each take the larger side and never go down");
    assert.strictEqual(m.versus.recent.length, 3, "the same game on both devices is one row");
    assert.deepStrictEqual(m.versus.recent.map(function (r) { return r.t; }), [400, 300, 100], "newest first");
    assert.strictEqual(m.bestMoves.length, 3, "best moments union, one per move");
    assert.strictEqual(m.bestMoves[0].san, "Rxe8", "newest first here as well");
    assert.ok(m.bestMoves.every(function (b) { return b.vs === "sibling"; }), "and none of them names the other kid");
  });
  const bestA = [], bestB = [];
  for (let i = 0; i < 15; i++) { bestA.push({ t: i, san: "a" + i, fen: "a" + i }); bestB.push({ t: 100 + i, san: "b" + i, fen: "b" + i }); }
  assert.strictEqual(Y.mergeStats({ bestMoves: bestA }, { bestMoves: bestB }).bestMoves.length, Y.BEST_MOVES_MAX,
    "and the list they live in is capped at twenty");
  assert.strictEqual(Y.mergeStats({}, {}).versus, undefined, "a profile that has never played his sibling invents none");
  assert.strictEqual(Y.mergeStats({}, {}).bestMoves, undefined);

  // --- the family login shared with the other kid apps ---
  assert.strictEqual(Y.normaliseCode("abcd 1234"), "ABCD1234", "codes are read out in caps");
  assert.strictEqual(Y.normaliseUser("  Mia_B "), "mia_b", "usernames are lowercase");
  assert.strictEqual(Y.normalisePin("12a345"), "1234", "pins are four digits");
  assert.ok(Y.validCode("ABCD1234") && !Y.validCode("ABC"), "short codes rejected");
  assert.ok(Y.validPin("1234") && !Y.validPin("123"), "a pin must be four digits");
  assert.ok(Y.boundSlot({ username: "mia", pin: "1234" }), "a slot with a name and pin syncs");
  assert.ok(!Y.boundSlot({ username: "mia", pin: "" }), "no pin, no sync");
  assert.ok(!Y.boundSlot({ username: "", pin: "1234" }), "no name, no sync");

  // --- merge: a card won on either device survives ---
  const phone = { won: 3, criticals: 1, hits: 5, bestStreak: 3, session: 4,
    cardsEarned: { "01": { critical: false, tries: 2, t: 100 } },
    cards: { "01": card({ attempts: 2, founds: 1, lastFound: 100 }) },
    figurines: ["01"], ledger: [{ t: 100, id: "01", san: "Rxa5" }], tiers: ["best", "good"] };
  const tablet = { won: 2, criticals: 2, hits: 4, bestStreak: 5, session: 1,
    cardsEarned: { "02": { critical: true, tries: 1, t: 200 } },
    cards: { "02": card({ attempts: 1, founds: 1, lastFound: 200 }) },
    figurines: ["02"], ledger: [{ t: 200, id: "02", san: "Nf6+" }], tiers: ["bait"] };

  const m = Y.mergeStats(phone, tablet);
  assert.deepStrictEqual(Object.keys(m.cardsEarned).sort(), ["01", "02"], "both cards kept");
  assert.strictEqual(m.cardsEarned["02"].critical, true, "a critical stays a critical");
  assert.strictEqual(m.won, 3, "counters take the larger side, never the sum");
  assert.strictEqual(m.criticals, 2);
  assert.strictEqual(m.bestStreak, 5, "best streak is the better of the two");
  assert.strictEqual(m.session, 0, "a session belongs to one sitting on one device");
  assert.deepStrictEqual(m.figurines.sort(), ["01", "02"]);
  assert.strictEqual(m.ledger.length, 2, "history from both, oldest first");
  assert.strictEqual(m.ledger[0].t, 100);

  // --- merge is order-independent and idempotent ---
  const flipped = Y.mergeStats(tablet, phone);
  assert.deepStrictEqual(Object.keys(flipped.cardsEarned).sort(), ["01", "02"]);
  assert.strictEqual(flipped.won, m.won);
  const twice = Y.mergeStats(m, m);
  assert.strictEqual(twice.won, m.won, "merging with itself changes nothing");
  assert.strictEqual(twice.ledger.length, m.ledger.length, "no duplicated history rows");

  // --- merge never rolls a review schedule backwards ---
  const old = { cards: { "01": card({ founds: 1, attempts: 3, lastCorrect: 10, mastered: false }) } };
  const fresh = { cards: { "01": card({ founds: 4, attempts: 5, lastCorrect: 999, mastered: true }) } };
  const sched = Y.mergeStats(old, fresh).cards["01"];
  assert.strictEqual(sched.founds, 4, "the more advanced side leads");
  assert.strictEqual(sched.mastered, true, "mastered is never un-mastered");
  assert.strictEqual(sched.lastCorrect, 999, "latest correct answer wins");
  assert.strictEqual(sched.attempts, 5, "attempts take the larger count");

  // --- caps hold so a row cannot grow without limit ---
  const long = { ledger: [], tiers: [] };
  for (let i = 0; i < 90; i++) { long.ledger.push({ t: i, id: "x" + i, san: "a" + i }); long.tiers.push("best"); }
  const capped = Y.mergeStats(long, long);
  assert.strictEqual(capped.ledger.length, Y.LEDGER_MAX, "ledger trimmed to its cap");
  assert.strictEqual(capped.tiers.length, Y.TIERS_MAX, "tier window trimmed to its cap");
  assert.strictEqual(capped.ledger[capped.ledger.length - 1].t, 89, "the newest rows are the ones kept");

  // --- backup file round trip, and restoring an old file cannot delete a new card ---
  const settings = { names: ["Mia", "Leo"], parent: { name: "Dad", pin: "9175" } };
  const blob = Y.exportBlob(settings, [phone, tablet]);
  const text = JSON.stringify(blob);
  const back = Y.importBlob(text, [{ cardsEarned: { "09": { critical: false, tries: 1, t: 300 } } }, {}]);
  assert.deepStrictEqual(back.names, ["Mia", "Leo"], "names come back too");
  assert.deepStrictEqual(Object.keys(back.profiles[0].cardsEarned).sort(), ["01", "09"], "restore merges, it does not replace");
  assert.throws(() => Y.importBlob('{"app":"something-else"}', []), /not a Shockmate backup/, "a stray json file is refused");
  assert.throws(() => Y.importBlob("not json at all", []), /not a Shockmate backup/);

  // --- the coach rides in the same file: it is the only answer "Forgot?" can give ---
  assert.deepStrictEqual(blob.parent, { name: "Dad", pin: "9175" }, "the coach's name and PIN are in the file");
  assert.deepStrictEqual(Y.exportBlob({ names: [] }, []).parent, { name: "", pin: "" }, "no coach set, no coach saved");
  assert.deepStrictEqual(back.parent, { name: "Dad", pin: "9175" }, "restoring onto a device with no coach adopts his");
  const held = Y.importBlob(text, [{}, {}], { parent: { name: "Mum", pin: "2468" } });
  assert.strictEqual(held.parent.pin, "2468", "a PIN set on this device is never blanked by a restore");
  assert.strictEqual(held.parent.name, "Mum");
  assert.deepStrictEqual(Y.importBlob(JSON.stringify({ app: "shockmate", profiles: [{}, {}] }), [{}, {}]).parent,
    { name: "", pin: "" }, "a file written before the coach existed still restores");
  assert.strictEqual(Y.exportBlob({ parent: { name: "Dad", pin: "91a7 5x" } }, []).parent.pin, "9175",
    "whatever is in settings, only four digits are written");

  // --- transport: the three chess_* rpcs, with the code, name and pin the other apps use ---
  assert.ok(!Y.configured({ url: "", anonKey: "" }), "empty config is off");
  assert.ok(Y.configured({ url: "https://x.supabase.co", anonKey: "k" }));
  const calls = [];
  const fakeFetch = (url, opts) => { calls.push([url, opts]); return Promise.resolve({ ok: true, json: () => Promise.resolve([]) }); };
  const cfg = { url: "https://proj.supabase.co/", anonKey: "anon-key" };
  const slot = { username: "Mia_B", pin: "1234" };

  return Y.roster(cfg, "abcd 1234", fakeFetch)
    .then(() => Y.pull(cfg, "abcd1234", slot, fakeFetch))
    .then(() => Y.push(cfg, "abcd1234", slot, { won: 1 }, fakeFetch))
    .then(() => {
      assert.strictEqual(calls[0][0], "https://proj.supabase.co/rest/v1/rpc/chess_roster", "roster endpoint, no double slash");
      assert.strictEqual(calls[1][0], "https://proj.supabase.co/rest/v1/rpc/chess_pull");
      assert.strictEqual(calls[2][0], "https://proj.supabase.co/rest/v1/rpc/chess_push");
      assert.strictEqual(calls[0][1].headers.apikey, "anon-key");
      assert.strictEqual(calls[0][1].headers.Authorization, "Bearer anon-key");
      assert.deepStrictEqual(JSON.parse(calls[0][1].body), { p_code: "ABCD1234" }, "roster asks by code alone — it must never carry a pin");
      assert.deepStrictEqual(JSON.parse(calls[1][1].body), { p_code: "ABCD1234", p_username: "mia_b", p_pin: "1234" });
      assert.deepStrictEqual(JSON.parse(calls[2][1].body), { p_code: "ABCD1234", p_username: "mia_b", p_pin: "1234", p_progress: { won: 1 } });
      return Y.pull({ url: "", anonKey: "" }, "ABCD1234", slot, fakeFetch).then(
        () => { throw new Error("unconfigured sync should refuse"); },
        (err) => assert.ok(/not set up/.test(err.message), "unconfigured sync refuses instead of calling out")
      );
    })
    .then(() => {
      const failing = () => Promise.resolve({ ok: false, status: 401, text: () => Promise.resolve("no key") });
      return Y.push(cfg, "ABCD1234", slot, {}, failing).then(
        () => { throw new Error("a 401 should reject"); },
        (err) => assert.ok(/401/.test(err.message), "server errors surface with their status")
      );
    })
    .then(() => console.log("OK sync: family login, merge (order-free, idempotent, capped), backup round trip, games and game fights, chess_* rpc shape, failure paths"));
}

run().catch((err) => { console.error(err); process.exit(1); });
