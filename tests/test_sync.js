const assert = require("assert");
const Y = require("../web/sync.js");

function card(over) {
  return Object.assign({ attempts: 0, founds: 0, misses: 0, whys: 0, hits: 0, lastFound: 0, lastCorrect: 0, mastered: false }, over);
}

function run() {
  // --- codes ---
  const code = Y.makeCode();
  assert.strictEqual(code.length, 12, "codes are 12 characters");
  assert.ok(/^[A-HJ-NP-Z2-9]+$/.test(code), "no 0/O/1/I in a code kids have to read out");
  assert.strictEqual(Y.prettyCode(code), code.slice(0, 4) + "-" + code.slice(4, 8) + "-" + code.slice(8), "grouped for reading");
  assert.strictEqual(Y.normaliseCode("abcd-efgh jkmn"), "ABCDEFGHJKMN", "typed however, stored one way");
  assert.ok(!Y.validCode("ABC"), "short codes rejected");

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
  const blob = Y.exportBlob({ names: ["Mia", "Leo"] }, [phone, tablet]);
  const text = JSON.stringify(blob);
  const back = Y.importBlob(text, [{ cardsEarned: { "09": { critical: false, tries: 1, t: 300 } } }, {}]);
  assert.deepStrictEqual(back.names, ["Mia", "Leo"], "names come back too");
  assert.deepStrictEqual(Object.keys(back.profiles[0].cardsEarned).sort(), ["01", "09"], "restore merges, it does not replace");
  assert.throws(() => Y.importBlob('{"app":"something-else"}', []), /not a Shockmate backup/, "a stray json file is refused");
  assert.throws(() => Y.importBlob("not json at all", []), /not a Shockmate backup/);

  // --- transport: right endpoint, right headers, code normalised, nothing leaks without config ---
  assert.ok(!Y.configured({ url: "", anonKey: "" }), "empty config is off");
  assert.ok(Y.configured({ url: "https://x.supabase.co", anonKey: "k" }));
  const calls = [];
  const fakeFetch = (url, opts) => { calls.push([url, opts]); return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); };
  const cfg = { url: "https://proj.supabase.co/", anonKey: "anon-key" };

  return Y.pull(cfg, "abcd-efgh-jkmn", 1, fakeFetch)
    .then(() => Y.push(cfg, "abcd-efgh-jkmn", 0, { won: 1 }, fakeFetch))
    .then(() => {
      assert.strictEqual(calls[0][0], "https://proj.supabase.co/rest/v1/rpc/shockmate_pull", "pull endpoint, no double slash");
      assert.strictEqual(calls[1][0], "https://proj.supabase.co/rest/v1/rpc/shockmate_push");
      assert.strictEqual(calls[0][1].headers.apikey, "anon-key");
      assert.strictEqual(calls[0][1].headers.Authorization, "Bearer anon-key");
      assert.deepStrictEqual(JSON.parse(calls[0][1].body), { p_code: "ABCDEFGHJKMN", p_slot: 1 });
      assert.deepStrictEqual(JSON.parse(calls[1][1].body), { p_code: "ABCDEFGHJKMN", p_slot: 0, p_data: { won: 1 } });
      return Y.pull({ url: "", anonKey: "" }, "ABCDEFGHJKMN", 0, fakeFetch).then(
        () => { throw new Error("unconfigured sync should refuse"); },
        (err) => assert.ok(/not set up/.test(err.message), "unconfigured sync refuses instead of calling out")
      );
    })
    .then(() => {
      const failing = () => Promise.resolve({ ok: false, status: 401, text: () => Promise.resolve("no key") });
      return Y.push(cfg, "ABCDEFGHJKMN", 0, {}, failing).then(
        () => { throw new Error("a 401 should reject"); },
        (err) => assert.ok(/401/.test(err.message), "server errors surface with their status")
      );
    })
    .then(() => console.log("OK sync: codes, merge (order-free, idempotent, capped), backup round trip, rpc shape, failure paths"));
}

run().catch((err) => { console.error(err); process.exit(1); });
