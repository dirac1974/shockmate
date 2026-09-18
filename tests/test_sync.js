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

  /* Flash. Same rule: every counter takes the larger side, days and rungs union by the larger, the
     imagine latch is open if it is open anywhere, and the rolling window follows the device that has
     actually answered more items rather than being spliced out of two half-windows. */
  const flashA = { flash: { items: 30, correct: 24, fast: 4, bestRun: 7, cleanDays: 2, imagineOpen: false,
      byType: { recall: { items: 20, correct: 16 }, gone: { items: 10, correct: 8 } },
      days: { "2026-09-18": { items: 6, correct: 6 }, "2026-09-19": { items: 6, correct: 4 } },
      last12: [1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1] } };
  const flashB = { flash: { items: 18, correct: 15, fast: 9, bestRun: 4, cleanDays: 3, imagineOpen: true,
      byType: { recall: { items: 12, correct: 11 }, imagine: { items: 6, correct: 4 } },
      days: { "2026-09-19": { items: 4, correct: 4 }, "2026-09-20": { items: 6, correct: 5 } },
      last12: [1, 0, 1] } };
  [Y.mergeStats(flashA, flashB), Y.mergeStats(flashB, flashA)].forEach(function (m) {
    assert.deepStrictEqual([m.flash.items, m.flash.correct], [30, 24], "flash counts take the larger side, never the sum");
    assert.deepStrictEqual([m.flash.fast, m.flash.bestRun, m.flash.cleanDays], [9, 7, 3], "and so does every other one");
    assert.strictEqual(m.flash.imagineOpen, true, "a rung opened on either phone stays open on both");
    assert.strictEqual(m.flash.byType.imagine.items, 6, "a rung only one phone has seen survives");
    assert.deepStrictEqual(m.flash.byType.recall, { items: 20, correct: 16 });
    assert.strictEqual(Object.keys(m.flash.days).length, 3, "flash days union across devices");
    assert.deepStrictEqual(m.flash.days["2026-09-19"], { items: 6, correct: 4 }, "a day both phones saw takes the larger counts");
    assert.strictEqual(m.flash.last12.length, 12, "the rolling window comes off the device that did the drilling");
    assert.ok(m.flash.last12.length <= Y.FLASH_WINDOW);
  });
  assert.strictEqual(Y.mergeStats({}, {}).flash, undefined, "a kid who has never flashed invents no flash");
  /* The control boards (random positions) and their paired real ones: counters, so the larger side
     wins, rung by rung, and a phone that never saw one keeps what the other had. */
  const ctlA = { flash: { items: 6, control: { items: 4, correct: 3, firstLook: 2, byRung: { "10000": { items: 4, correct: 2 } } },
      paired: { items: 4, correct: 3, byRung: { "10000": { items: 4, correct: 3 } } } } };
  const ctlB = { flash: { items: 12, control: { items: 3, correct: 3, firstLook: 3, byRung: { "10000": { items: 2, correct: 2 }, "7000": { items: 1, correct: 1 } } } } };
  [Y.mergeStats(ctlA, ctlB), Y.mergeStats(ctlB, ctlA)].forEach(function (m) {
    assert.deepStrictEqual([m.flash.control.items, m.flash.control.correct, m.flash.control.firstLook], [4, 3, 3], "control counters take the larger side");
    assert.deepStrictEqual(m.flash.control.byRung, { "10000": { items: 4, correct: 2 }, "7000": { items: 1, correct: 1 } }, "rung by rung");
    assert.deepStrictEqual(m.flash.paired, { items: 4, correct: 3, byRung: { "10000": { items: 4, correct: 3 } } }, "paired survives a phone that has none");
    assert.strictEqual(m.flash.items, 12);
  });
  assert.strictEqual(Y.mergeStats(flashA, flashB).flash.control, undefined, "no control data invents none");
  assert.deepStrictEqual(Y.mergeStats(ctlA, ctlA).flash.control, ctlA.flash.control, "idempotent");

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

  // --- the family is the Yomple household code: WORD-XXXX, typed any way ---
  ["maple k7q2", "MAPLEK7Q2", "maple-k7q2", "MAPLE-K7Q2", " Maple - k7q2 ", "maple_k7q2", "maple.k7q2", "\tmaple\nk7q2 "].forEach(function (t) {
    assert.strictEqual(Y.normaliseCode(t), "MAPLE-K7Q2", JSON.stringify(t) + " reads as the household code");
    assert.ok(Y.validCode(t), JSON.stringify(t) + " is a valid code");
  });
  Y.WORDS.forEach(function (w) {
    assert.strictEqual(Y.normaliseCode(w.toLowerCase() + "2abc"), w + "-2ABC", w + ": every Yomple word reads");
  });
  assert.strictEqual(Y.WORDS.join(" "), "OAK MAPLE PINE CEDAR ELM BIRCH WILLOW ASPEN LAUREL HOLLY", "the Yomple word list, in Yomple's order");
  assert.strictEqual(Y.CODE_ALPHABET, "23456789ABCDEFGHJKMNPQRSTUVWXYZ", "the Yomple tail alphabet");
  ["MAPLE-K7Q0", "MAPLE-K7QO", "MAPLE-K7Q1", "MAPLE-K7QI", "MAPLE-K7QL"].forEach(function (c) {
    assert.ok(!Y.validCode(c), c + ": the tail has no 0, O, 1, I or L, so nothing can be misread");
  });
  ["", "CEDAR", "MAPLE-K7Q", "MAPLE-K7Q25", "TREE-K7Q2", "9XPNE8T5", "K7Q2-MAPLE", "MAPLER-K7Q2"].forEach(function (c) {
    assert.ok(!Y.validCode(c), JSON.stringify(c) + " is not a household code");
  });
  assert.strictEqual(Y.normaliseCode("9xpn-e8t5"), "9XPNE8T5", "a non-code is only cleaned, never forced into shape");
  assert.ok(Y.CODE_MAX >= 12, "the code box takes at least 12 characters: MAPLE-K7Q2 must never be cut to MAPLEK7Q");
  const html = require("fs").readFileSync(require("path").join(__dirname, "..", "web", "index.html"), "utf8");
  const box = html.match(/<input id="fam-code-input"[^>]*>/);
  assert.ok(box && Number((box[0].match(/maxlength="(\d+)"/) || [])[1]) >= 12, "index.html: the code input accepts at least 12 characters");
  for (let i = 0; i < 200; i++) {
    const m = Y.mintCode();
    assert.ok(Y.validCode(m) && Y.normaliseCode(m) === m, m + ": a minted code is canonical");
  }
  assert.strictEqual(Y.mintCode(() => 0), "OAK-2222");
  assert.strictEqual(Y.mintCode(() => 0.9999), "HOLLY-ZZZZ");
  assert.strictEqual(Y.normalisePin("12a345"), "1234", "pins are four digits");
  assert.ok(Y.validPin("1234") && !Y.validPin("123"), "a pin must be four digits");
  assert.strictEqual(Y.cleanName("  Sam<b> "), "Samb", "names lose markup and spaces");
  assert.strictEqual(Y.codeFromSearch("?family=maple-k7q2"), "MAPLE-K7Q2", "a share link carries the code");
  assert.strictEqual(Y.codeFromSearch("?fast=1&family=MAPLE%20K7Q2#x"), "MAPLE-K7Q2");
  assert.strictEqual(Y.codeFromSearch("?u=sam&from=yomple&f=MAPLE-K7Q2"), "MAPLE-K7Q2", "the Yomple hub's f= works too");
  assert.strictEqual(Y.codeFromSearch("?family=OAK-2222&f=MAPLE-K7Q2"), "OAK-2222", "family= wins over f=");
  assert.strictEqual(Y.codeFromSearch("?family=nope"), null, "a broken link is ignored");
  assert.strictEqual(Y.codeFromSearch("?family=9XPNE8T5"), null, "an old 8-character code is ignored");
  assert.strictEqual(Y.codeFromSearch(""), null);
  assert.strictEqual(Y.yompleUser("?u=Sam&from=yomple"), "sam", "from yomple.com: who tapped Shockmate there");
  assert.strictEqual(Y.yompleUser("?u=sam"), null, "u= alone is not from Yomple");
  assert.strictEqual(Y.yompleUser("?u=%3Cx%3E&from=yomple"), null, "a mangled username is ignored");
  assert.strictEqual(Y.shareText("maple k7q2"),
    "Join our Shockmate family: MAPLE-K7Q2 https://dirac1974.github.io/shockmate/?family=MAPLE-K7Q2");
  assert.deepStrictEqual(Y.syncSlots({ code: "MAPLE-K7Q2", me: 0, pins: ["1111", "2222"] }), [0, 1], "the phone that made the family syncs both");
  assert.deepStrictEqual(Y.syncSlots({ code: "MAPLE-K7Q2", me: 1, pins: ["", "2222"] }), [1], "a phone that joined syncs its own kid");
  assert.deepStrictEqual(Y.syncSlots({ code: "", me: 0, pins: ["1111", ""] }), [], "no family, no sync");
  assert.deepStrictEqual(Y.syncSlots({ code: "9XPNE8T5", me: 0, pins: ["1111", ""] }), [], "a v0.22 code no longer syncs");
  assert.ok(Y.joined({ code: "MAPLE-K7Q2", me: 1, pins: ["", "2222"] }));
  assert.ok(!Y.joined({ code: "MAPLE-K7Q2", me: 0, pins: ["", "2222"] }), "joined means this phone knows its own kid's PIN");
  assert.ok(!Y.joined({ code: "MAPLE-K7Q2", me: null, pins: ["1111", "2222"] }), "and has picked a kid");

  // --- the roster a kid picks from: Yomple's players across apps, deduped, Shockmate's first ---
  const yrow = (table, username, display) => ({ table: table, username: username, display_name: display, avatar: "x", family_code: "MAPLE-K7Q2", has_pin: false });
  const yrows = [
    yrow("hop_players", "dad", "Dad"), yrow("bloom_players", "dad", "Dad"), yrow("garden_players", "dad", "Dad"),
    yrow("hop_players", "sam", "Sam"), yrow("garden_players", "sammy", "sam"), yrow("star_players", "sam", "SAM"),
    yrow("garden_players", "ben", "Ben"),
    yrow("hop_players", "player-1", "Player 1"), yrow("garden_players", "player", "Player"),
    yrow("bloom_players", "foxy-sarah-2054", "Foxy (Sarah)"), yrow("hop_players", "foxy-sarah-2054", "Foxy (Sarah)"),
    yrow("bloom_players", "camp-0288", "camp"), yrow("bloom_players", "d-6484", "D"), yrow("bloom_players", "owls-5918", "Owls"),
  ];
  let roster = Y.buildRoster(yrows, [], null);
  assert.deepStrictEqual(roster.map((r) => r.name), ["Dad", "Sam", "Ben", "Foxy (Sarah)", "camp", "D"],
    "one entry per name whatever the case; real names before test ones; the most apps first; six at most");
  assert.deepStrictEqual(roster[1].usernames, ["sam", "sammy"], "every Yomple username of that kid is kept");
  assert.ok(roster.every((r) => r.slot === null && !r.me), "nobody has a Shockmate slot yet");
  assert.ok(!roster.some((r) => /^player/i.test(r.name)), "Player / Player 1 are placeholders, not kids");
  roster = Y.buildRoster(yrows, [{ slot: 1, name: "Ben" }, { slot: 0, name: "Zed" }], "sammy");
  assert.deepStrictEqual(roster.slice(0, 3).map((r) => [r.name, r.slot, r.me]), [["Zed", 0, false], ["Ben", 1, false], ["Sam", null, true]],
    "Shockmate players first by slot (Ben's Yomple rows fold into his slot), then the kid the hub named");
  assert.strictEqual(roster.length, 6);
  assert.deepStrictEqual(Y.buildRoster([], [], null), []);
  assert.strictEqual(Y.freeSlot([]), 0);
  assert.strictEqual(Y.freeSlot([{ slot: 0, name: "a" }]), 1);
  assert.strictEqual(Y.freeSlot([{ slot: 1, name: "a" }]), 0);
  assert.strictEqual(Y.freeSlot([{ slot: 0 }, { slot: 1 }]), undefined, "two slots, both taken");

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

  // --- transport: the sm_* rpcs, against a stub fetch ---
  assert.ok(!Y.configured({ url: "", key: "" }), "empty config is off");
  assert.ok(Y.configured({ url: "https://x.supabase.co", key: "sb_publishable_x" }));
  assert.ok(Y.configured({ url: "https://x.supabase.co", anonKey: "eyJx" }), "the old field name still reads");
  const calls = [];
  const reply = { sm_family_create: { code: "maple-k7q2" }, sm_family_roster: [{ slot: 0, name: "Sam" }, { slot: 1, name: "Ben" }, { slot: 7, name: "x" }],
    sm_pull: { won: 3 }, sm_push: { updated_at: "2026-09-18T10:00:00Z" }, sm_rename: { name: "Sammy" },
    sm_family_adopt: { code: "MAPLE-K7Q2", slot: 1, name: "Ben" } };
  const fakeFetch = (url, opts) => { calls.push([url, opts]); const name = url.split("/").pop();
    return Promise.resolve({ ok: true, json: () => Promise.resolve(reply[name]) }); };
  const cfg = { url: "https://proj.supabase.co/", key: "sb_publishable_abc" };
  const body = (i) => JSON.parse(calls[i][1].body);

  return Y.familyCreate(cfg, "maple k7q2", " The Smiths ", [{ name: " Sam ", pin: "1111" }, { name: "Ben", pin: "22-22" }], fakeFetch)
    .then((code) => {
      assert.strictEqual(code, "MAPLE-K7Q2", "the code comes back canonical");
      assert.strictEqual(calls[0][0], "https://proj.supabase.co/rest/v1/rpc/sm_family_create", "no double slash");
      assert.strictEqual(calls[0][1].method, "POST");
      assert.strictEqual(calls[0][1].headers.apikey, "sb_publishable_abc");
      assert.strictEqual(calls[0][1].headers.Authorization, undefined, "a publishable key is not sent as a bearer token");
      assert.deepStrictEqual(body(0), { p_code: "MAPLE-K7Q2", p_name: "The Smiths", p_kids: [{ name: "Sam", pin: "1111" }, { name: "Ben", pin: "2222" }] },
        "the client sends the household code it minted");
      return Y.familyRoster(cfg, "maple k7q2", fakeFetch);
    })
    .then((rows) => {
      assert.deepStrictEqual(rows, [{ slot: 0, name: "Sam" }, { slot: 1, name: "Ben" }], "roster is slots and names; a bad slot is dropped");
      assert.deepStrictEqual(body(1), { p_code: "MAPLE-K7Q2" }, "roster asks by code alone — it must never carry a pin");
      return Y.pull(cfg, "maplek7q2", 1, "2222", fakeFetch);
    })
    .then((remote) => {
      assert.deepStrictEqual(remote, { won: 3 });
      assert.deepStrictEqual(body(2), { p_code: "MAPLE-K7Q2", p_slot: 1, p_pin: "2222" });
      return Y.push(cfg, "MAPLE-K7Q2", 1, "2222", { won: 4 }, fakeFetch);
    })
    .then(() => {
      assert.deepStrictEqual(body(3), { p_code: "MAPLE-K7Q2", p_slot: 1, p_pin: "2222", p_progress: { won: 4 } });
      assert.ok(/\/rpc\/sm_push$/.test(calls[3][0]));
      return Y.rename(cfg, "MAPLE-K7Q2", 0, "1111", " Sammy<> ", fakeFetch);
    })
    .then(() => {
      assert.deepStrictEqual(body(4), { p_code: "MAPLE-K7Q2", p_slot: 0, p_pin: "1111", p_name: "Sammy" });
      const jwt = [];
      return Y.pull({ url: "https://p.supabase.co", anonKey: "eyJabc" }, "MAPLE-K7Q2", 0, "1111",
        (u, o) => { jwt.push(o); return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); })
        .then(() => assert.strictEqual(jwt[0].headers.Authorization, "Bearer eyJabc", "a legacy anon JWT also goes as a bearer token"));
    })
    .then(() => Y.familyAdopt(cfg, "maple-k7q2", 1, " Ben ", "3-3-3-3", fakeFetch))
    .then((r) => {
      assert.deepStrictEqual(body(5), { p_code: "MAPLE-K7Q2", p_slot: 1, p_name: "Ben", p_pin: "3333" }, "adopt: code, slot, name, new PIN");
      assert.deepStrictEqual(r, { code: "MAPLE-K7Q2", slot: 1, name: "Ben" });
      const n = calls.length;
      return Y.familyAdopt(cfg, "MAPLE-K7Q2", 2, "Ben", "3333", fakeFetch).then(() => { throw new Error("slot 2 should be refused"); },
        (err) => { assert.strictEqual(err.code, "input"); assert.strictEqual(calls.length, n, "nothing was sent"); });
    })
    .then(() => {
      const taken = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ error: "taken" }) });
      return Y.familyAdopt(cfg, "MAPLE-K7Q2", 0, "Ben", "3333", taken).then(() => { throw new Error("taken should reject"); },
        (err) => assert.strictEqual(err.code, "taken", "a slot someone has is its own error"));
    })
    .then(() => {
      // --- Yomple: five tables asked by code, the anon JWT as a bearer, never a PIN in the body ---
      const ycalls = [];
      const ycfg = { url: "https://yomple.supabase.co", key: "eyJyomple" };
      const yr = (table, username, display) => ({ username: username, display_name: display, table: table });
      const ydata = { hop_players: [yr("hop_players", "sam", "Sam")], garden_players: [{ username: "ben", display_name: "Ben" }] };
      const yfetch = (url, opts) => { ycalls.push([url, opts]);
        const b = JSON.parse(opts.body), name = url.split("/").pop();
        const out = name === "yomple_family_players" ? (b.p_code === "MAPLE-K7Q2" ? (ydata[b.p_table] || []) : [])
          : name === "yomple_family_upsert" ? { ok: true, family_code: b.p_code }
          : name === "sm_family_roster" ? (b.p_code === "OAK-2222" ? [{ slot: 0, name: "Zed" }] : []) : null;
        return Promise.resolve({ ok: true, json: () => Promise.resolve(out) }); };
      return Y.yompleKids(ycfg, "maple k7q2", yfetch).then((rows) => {
        assert.deepStrictEqual(ycalls.map((c) => JSON.parse(c[1].body)), Y.YOMPLE_TABLES.map((t) => ({ p_code: "MAPLE-K7Q2", p_table: t })),
          "one call per Yomple app table, by code alone");
        assert.deepStrictEqual(Y.YOMPLE_TABLES, ["hop_players", "bloom_players", "garden_players", "star_players", "field_players"]);
        ycalls.forEach((c) => {
          assert.strictEqual(c[0], "https://yomple.supabase.co/rest/v1/rpc/yomple_family_players");
          assert.strictEqual(c[1].headers.apikey, "eyJyomple");
          assert.strictEqual(c[1].headers.Authorization, "Bearer eyJyomple", "Yomple's anon JWT goes as a bearer too");
        });
        assert.deepStrictEqual(rows.map((r) => [r.table, r.username]), [["hop_players", "sam"], ["garden_players", "ben"]], "rows carry their table");
        ycalls.length = 0;
        return Y.yompleRegister(ycfg, "maplek7q2", yfetch);
      }).then(() => {
        assert.deepStrictEqual(JSON.parse(ycalls[0][1].body), { p_code: "MAPLE-K7Q2", p_email: null }, "a minted code is registered, with no email");
        assert.ok(/\/rpc\/yomple_family_upsert$/.test(ycalls[0][0]));
        ycalls.length = 0;
        return Y.lookupFamily(cfg, ycfg, "maple k7q2", "sam", yfetch);
      }).then((r) => {
        assert.ok(r.found && r.yomple, "a Yomple household is found");
        assert.deepStrictEqual(r.roster.map((x) => [x.name, x.slot, x.me]), [["Sam", null, true], ["Ben", null, false]]);
        assert.strictEqual(r.free, 0, "first Shockmate player takes slot 0");
        assert.ok(!ycalls.some((c) => /yomple_family_upsert/.test(c[0])), "a lookup never registers anything");
        return Y.lookupFamily(cfg, ycfg, "oak 2222", null, yfetch);
      }).then((r) => {
        assert.ok(r.found && !r.yomple, "a Shockmate-only family is found too");
        assert.deepStrictEqual(r.roster.map((x) => [x.name, x.slot]), [["Zed", 0]]);
        assert.strictEqual(r.free, 1);
        return Y.lookupFamily(cfg, ycfg, "PINE-2345", null, yfetch);
      }).then((r) => {
        assert.ok(!r.found && r.roster.length === 0, "nobody knows the code: not found");
        return Y.lookupFamily(cfg, ycfg, "MAPLE-K7Q", null, yfetch).then(() => { throw new Error("a malformed code should be refused locally"); },
          (err) => { assert.strictEqual(err.code, "input"); assert.ok(/MAPLE-K7Q2/.test(err.message), "the refusal shows what a code looks like"); });
      }).then(() => {
        const down = (url, opts) => /yomple\.supabase/.test(url) ? Promise.reject(new TypeError("Failed to fetch")) : yfetch(url, opts);
        return Y.lookupFamily(cfg, ycfg, "OAK-2222", null, down).then((r) => assert.ok(r.found, "Yomple down: a Shockmate family still opens"))
          .then(() => Y.lookupFamily(cfg, ycfg, "PINE-2345", null, down)).then(() => { throw new Error("offline with nothing found should reject"); },
            (err) => assert.strictEqual(err.code, "offline", "and nothing found with Yomple down is 'offline', not 'not found'"));
      });
    })
    .then(() => { const n = calls.length; return Y.familyCreate(cfg, "MAPLE-K7Q2", "", [{ name: "Sam", pin: "12" }], fakeFetch).then(
      () => { throw new Error("a short PIN should never reach the server"); },
      (err) => { assert.strictEqual(err.code, "input"); assert.strictEqual(calls.length, n, "nothing was sent"); }); })
    .then(() => Y.familyCreate(cfg, "9XPNE8T5", "", [{ name: "Sam", pin: "1111" }], fakeFetch).then(
      () => { throw new Error("an old-style code should be refused"); }, (err) => assert.strictEqual(err.code, "input")))
    .then(() => Y.familyCreate(cfg, "MAPLE-K7Q2", "", [{ name: "a", pin: "1111" }, { name: "b", pin: "2222" }, { name: "c", pin: "3333" }], fakeFetch).then(
      () => { throw new Error("three kids should be refused"); }, (err) => assert.strictEqual(err.code, "input")))
    .then(() => Y.familyRoster(cfg, "ABC", fakeFetch).then(
      () => { throw new Error("a bad code should be refused locally"); }, (err) => assert.strictEqual(err.code, "input")))
    .then(() => Y.pull({ url: "", key: "" }, "MAPLE-K7Q2", 0, "1111", fakeFetch).then(
      () => { throw new Error("unconfigured sync should refuse"); },
      (err) => assert.ok(/not set up/.test(err.message) && err.code === "config", "unconfigured sync refuses instead of calling out")))
    .then(() => {
      const wrongPin = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ error: "pin" }) });
      return Y.pull(cfg, "9XPNE8T5", 0, "9999", wrongPin).then(
        () => { throw new Error("a wrong PIN should reject"); },
        (err) => { assert.strictEqual(err.code, "pin", "the server's wrong-PIN answer becomes an error with a code"); assert.ok(/PIN/.test(err.message)); });
    })
    .then(() => {
      const locked = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ error: "locked" }) });
      return Y.push(cfg, "9XPNE8T5", 0, "9999", {}, locked).then(() => { throw new Error("locked should reject"); },
        (err) => assert.strictEqual(err.code, "locked"));
    })
    .then(() => {
      const failing = () => Promise.resolve({ ok: false, status: 400, text: () => Promise.resolve("bad family code") });
      return Y.push(cfg, "9XPNE8T5", 0, "1111", {}, failing).then(
        () => { throw new Error("a 400 should reject"); },
        (err) => { assert.ok(/400/.test(err.message), "server errors surface with their status"); assert.strictEqual(err.status, 400); });
    })
    .then(() => {
      const offline = () => Promise.reject(new TypeError("Failed to fetch"));
      return Y.pull(cfg, "9XPNE8T5", 0, "1111", offline).then(() => { throw new Error("offline should reject"); },
        (err) => assert.strictEqual(err.code, "offline", "no network is its own quiet failure"));
    })
    .then(() => console.log("OK sync: household codes typed any way and links, the Yomple roster (deduped), slots and PINs, merge (order-free, idempotent, capped), backup round trip, games and game fights, flash counters and the imagine latch, sm_* and yomple_* rpc shapes, not-found and failure paths, flash control boards"));
}

run().catch((err) => { console.error(err); process.exit(1); });
