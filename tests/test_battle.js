#!/usr/bin/env node
"use strict";
const assert = require("assert");
const S = require("../web/score.js");
const Y = require("../web/sync.js");

// Noon local keeps the date key clear of any timezone or daylight-saving edge.
const T = new Date(2026, 8, 18, 12).getTime();
const KEY = S.dateKey(T);

function statsWith(ids, crits, battle) {
  const st = Object.assign(S.emptyStats(), { won: 0, criticals: 0, cardsEarned: {}, tiers: [] });
  (ids || []).forEach(function (id) { st.cardsEarned[id] = { t: T, critical: (crits || []).indexOf(id) >= 0, tries: 1, tier: "best" }; });
  if (battle) st.battle = battle;
  return st;
}

function run() {
  /* The boss is today's crony read as health. It starts full and falls as cards land. */
  let b0 = S.bossHp(statsWith([]), T);
  assert.strictEqual(b0.hp, b0.max, "an untouched boss is at full health");
  assert.strictEqual(b0.max, b0.claimed);
  assert.ok(!b0.ko);
  assert.ok(b0.weak, "every crony has a weakness for Plan C");

  const b3 = S.bossHp(statsWith(["01", "02", "03"]), T);
  assert.ok(b3.hp < b3.max, "three cards take health off the boss");
  assert.strictEqual(b3.cardsToday, 3);

  /* Abilities deal extra damage through a per-day bonus. The floor still holds, and KO is the floor. */
  let battle = S.addBonus(S.emptyBattle(), KEY, 5000);
  const ko = S.bossHp(statsWith(["01"], [], battle), T);
  assert.strictEqual(ko.hp, ko.floor, "bonus damage cannot push a boss below the floor");
  assert.ok(ko.ko, "reaching the floor is a knockout");
  assert.ok(!S.bossHp(statsWith(["01"], [], S.addBonus(S.emptyBattle(), KEY, 10)), T).ko, "a small bonus is not a knockout");
  assert.strictEqual(S.addBonus(S.emptyBattle(), KEY, -50).bonus[KEY], 0, "negative damage is ignored");

  /* Power is the kid's number. It climbs on wins, more on a Critical, caps, and only falls when he spends it. */
  let p = S.emptyBattle();
  p = S.earnPower(p, false); assert.strictEqual(p.power, 1);
  p = S.earnPower(p, true); assert.strictEqual(p.power, 3, "a Critical is worth an extra point");
  for (let i = 0; i < 10; i++) p = S.earnPower(p, true);
  assert.strictEqual(p.power, S.POWER_CAP, "power caps");

  assert.ok(S.canAfford(p, "double"));
  const armed = S.armAbility(p, "double");
  assert.strictEqual(armed.power, S.POWER_CAP - 2, "Double Strike costs two");
  assert.ok(armed.next.double, "Double Strike arms for the next hit");
  assert.ok(!armed.next.shield && !armed.next.overcharge, "arming one does not arm the others");

  const told = S.armAbility(p, "tell");
  assert.strictEqual(told.power, S.POWER_CAP - 1, "the Tell costs one");
  assert.ok(!told.next.double && !told.next.shield && !told.next.overcharge, "the Tell is instant, it arms nothing");

  const broke = S.armAbility(S.emptyBattle(), "overcharge");
  assert.strictEqual(broke.power, 0, "you cannot spend what you do not have");
  assert.ok(!broke.next.overcharge, "an unaffordable ability does not arm");
  assert.ok(S.armAbility(S.earnPower(S.emptyBattle(), false), "double").power >= 0, "power never goes negative");

  assert.ok(!S.disarm(armed, "double").next.double, "a used ability disarms");
  assert.strictEqual(S.recordKo(S.emptyBattle()).kos, 1);

  // Old saves have no battle record and null stats reach these during load. Neither may throw.
  assert.doesNotThrow(function () { S.battleOf(null); S.battleOf({}); S.bossHp(null, T); S.bossHp({ cardsEarned: {} }, T); });
  assert.strictEqual(S.battleOf({}).power, 0);

  /* Two devices merge. The kid's numbers take the larger value; nothing he earned is lost. */
  const phone = statsWith(["01", "02"], [], Object.assign(S.emptyBattle(), { power: 3, kos: 1, bonus: { [KEY]: 100 } }));
  const tablet = statsWith(["01", "03"], ["03"], Object.assign(S.emptyBattle(), { power: 5, kos: 2, bonus: { [KEY]: 250 } }));
  tablet.cardsEarned["01"].tier = "good"; tablet.cardsEarned["01"].t = T + 1000;   // tablet saw 01 later, as a good-tier win
  const m = Y.mergeStats(phone, tablet);
  assert.strictEqual(m.battle.power, 5, "power takes the larger of the two devices");
  assert.strictEqual(m.battle.kos, 2, "knockouts take the larger");
  assert.strictEqual(m.battle.bonus[KEY], 250, "bonus damage per day takes the larger");
  assert.strictEqual(m.cardsEarned["01"].tier, "good", "the tier follows the later sighting of the card");
  assert.strictEqual(m.cardsEarned["02"].tier, "best", "a card seen on one device keeps its tier");
  assert.strictEqual(m.cardsEarned["03"].tier, "best");
  assert.ok(m.cardsEarned["03"].critical, "a Critical on either device stays a Critical");

  const flipped = Y.mergeStats(tablet, phone);
  assert.strictEqual(flipped.battle.power, 5, "merge order does not matter");
  assert.strictEqual(flipped.cardsEarned["01"].tier, "good");
  const twice = Y.mergeStats(m, m);
  assert.deepStrictEqual(twice.battle, m.battle, "merging with itself changes nothing");

  const legacy = Y.mergeStats(statsWith(["01"]), statsWith(["02"]));
  assert.strictEqual(legacy.battle.power, 0, "two saves without a battle record merge to defaults, not to a crash");

  console.log("OK battle: boss health floors and KOs, power climbs and caps and only falls on spend, abilities arm and disarm, merge keeps power, KOs, bonus and card tiers");
}

run();
