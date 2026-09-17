#!/usr/bin/env node
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const D = require("../web/days.js");
const S = require("../web/score.js");

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "encounters.v2.json"), "utf8"));
const ALL = Array.isArray(raw) ? raw : (raw.encounters || []);

function statsWith(ids, t, crits) {
  const earned = {};
  (ids || []).forEach(function (id) {
    earned[id] = { t: t || Date.now(), critical: (crits || []).indexOf(id) >= 0 };
  });
  return { cardsEarned: earned };
}

function run() {
  /* Every fight lives in exactly one day. A fight in no day is unreachable now that days,
     not packs, drive selection, so this assertion is the one that keeps the game complete. */
  const used = [];
  D.DAYS.forEach(function (d) { d.ids.forEach(function (id) { used.push(id); }); });
  assert.strictEqual(used.length, ALL.length, "days must cover every fight");
  assert.strictEqual(new Set(used).size, used.length, "no fight may appear in two days");
  const real = new Set(ALL.map(function (e) { return e.id; }));
  used.forEach(function (id) { assert.ok(real.has(id), "days reference an unknown fight: " + id); });

  const d1 = D.fightsForDay(ALL, 1);
  assert.deepStrictEqual(d1.map(function (e) { return e.id; }), D.dayByNumber(1).ids, "day order is the authored order");

  let st = statsWith([]);
  assert.strictEqual(D.dayProgress(st, 1).done, 0);
  assert.ok(!D.dayProgress(st, 1).complete);
  assert.strictEqual(D.currentDay(st), 1);

  st = statsWith(D.dayByNumber(1).ids);
  assert.ok(D.dayProgress(st, 1).complete, "all of a day's cards completes it");
  assert.strictEqual(D.currentDay(st), 2, "finishing day 1 moves him to day 2");
  assert.strictEqual(D.daysComplete(st), 1);

  assert.ok(D.dayUnlocked(statsWith([]), 1), "day 1 is always open");
  assert.ok(!D.dayUnlocked(statsWith([]), 2), "day 2 waits for day 1");
  assert.ok(D.dayUnlocked(st, 2), "finishing day 1 opens day 2");

  assert.strictEqual(D.nextDay(1), 2);
  assert.strictEqual(D.nextDay(D.DAYS.length), null, "there is no day after the last one");

  // Null stats reach these helpers during load, before a profile exists. They must not throw.
  assert.doesNotThrow(function () { D.dayProgress(null, 1); D.currentDay(null); D.dayUnlocked(null, 2); });

  /* The kid's rank is his own number, so it may never fall. */
  const ids = ALL.map(function (e) { return e.id; });
  let prev = -1;
  for (let i = 0; i <= ids.length; i++) {
    const r = S.agentRank(statsWith(ids.slice(0, i)));
    assert.ok(r.index >= prev, "rank must never go down, broke at " + i + " cards");
    prev = r.index;
  }
  assert.strictEqual(S.agentRank(statsWith([])).title, "Rookie");
  assert.ok(S.agentRank(statsWith(ids)).top, "clearing every fight reaches the top rank");
  assert.ok(S.rankedUp(S.agentRank(statsWith([])), S.agentRank(statsWith(ids.slice(0, 5)))), "five cards is a promotion");

  /* Glitch's own rating never recovers; his daily stand-in starts fresh each calendar day.
     Noon local avoids any timezone or daylight-saving edge in the date key. */
  const today = new Date(2026, 8, 18, 12).getTime();
  const tomorrow = new Date(2026, 8, 19, 12).getTime();
  const three = D.dayByNumber(1).ids.slice(0, 3);

  const cNow = S.dailyChallenger(statsWith(three, today), today);
  assert.strictEqual(cNow.cardsToday, 3, "cards earned today count against today's crony");
  assert.ok(cNow.real < cNow.claimed, "today's crony deflates as cards land");
  assert.ok(cNow.drop > 0);

  const cNext = S.dailyChallenger(statsWith(three, today), tomorrow);
  assert.strictEqual(cNext.cardsToday, 0, "yesterday's cards do not follow him into today");
  assert.strictEqual(cNext.real, cNext.claimed, "a fresh crony starts at his full brag");

  const many = [];
  for (let i = 0; i < 400; i++) many.push("x" + i);
  assert.ok(S.dailyChallenger(statsWith(many, today), today).real >= 300, "a crony never drops below the floor");

  /* The permanent trophy only ever grows. This is what a daily reset would have destroyed. */
  let last = -1;
  for (let i = 0; i <= ids.length; i++) {
    const k = S.knockedOff(statsWith(ids.slice(0, i)));
    assert.ok(k >= last, "lifetime points off Glitch must never shrink, broke at " + i);
    last = k;
  }
  assert.strictEqual(S.knockedOff(statsWith([])), 0, "nothing is knocked off before the first card");
  assert.ok(S.knockedOff(statsWith(ids)) > 900, "clearing every fight is a visible dent");

  console.log("OK days: " + D.DAYS.length + " days cover " + ALL.length + " fights, unlocking, rank only climbs, daily crony resets, floors and trophy hold");
}

run();
