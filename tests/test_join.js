#!/usr/bin/env node
"use strict";
/* Joining a family must not move one kid's cards into the other kid's slot. The phone's two local
   profiles are in whatever order this phone happened to use; the family's two slots are in the
   family's order. These are the pure parts of the join that reconcile them. */
const assert = require("assert");
const S = require("../web/score.js");
const Y = require("../web/sync.js");

const DAY = 24 * 60 * 60 * 1000;
function withCards(n, at) {
  const earned = {};
  for (let i = 0; i < n; i++) earned["c" + i] = { critical: false, tries: 1, t: (at || Date.now()) - i * DAY };
  return Object.assign(S.emptyStats(), { cardsEarned: earned, cards: {} });
}
function withGames(stats, played) {
  return Object.assign({}, stats, { games: Object.assign(S.emptyGames(), { played: played, wins: played }) });
}
const EMPTY = S.emptyStats();

function names() {
  // A name nobody typed is not a name: the placeholders and the empty string all mean "unnamed".
  assert.strictEqual(S.localName("  Sarah "), "Sarah");
  assert.strictEqual(S.localName("Player 1"), "");
  assert.strictEqual(S.localName("player2"), "");
  assert.strictEqual(S.localName(""), "");
  assert.strictEqual(S.localName(null), "");
  assert.ok(S.sameLocalName("sarah", " SARAH "));
  assert.ok(!S.sameLocalName("Player 1", "Player 2"), "two placeholders are not the same kid");
  assert.ok(!S.sameLocalName("", ""), "nameless never matches nameless");
}

function summary() {
  const s = S.profileSummary(withGames(withCards(12, Date.UTC(2026, 3, 10)), 3));
  assert.strictEqual(s.cards, 12);
  assert.strictEqual(s.games, 3);
  assert.strictEqual(s.days, 12, "a card a day for twelve days");
  const one = S.profileSummary(Object.assign(S.emptyStats(), { cardsEarned: { a: { t: 1 }, b: { t: 1 }, c: {} } }));
  assert.deepStrictEqual(one, { cards: 3, games: 0, days: 1 }, "cards with no stamp count, but name no day");
  assert.deepStrictEqual(S.profileSummary(null), { cards: 0, games: 0, days: 0 });
  assert.ok(S.profileEmpty(EMPTY) && S.profileEmpty(null));
  assert.ok(!S.profileEmpty(withCards(1)), "one card is not empty");
  assert.ok(!S.profileEmpty(withGames(S.emptyStats(), 1)), "a game with no card is not empty either");
}

function picks() {
  const full = [withCards(12), withCards(5)];

  // The name decides, whichever index it is on, and however it is typed.
  assert.strictEqual(S.pickLocalProfile(["Sarah", "Alex"], full, 0, "sarah"), 0);
  assert.strictEqual(S.pickLocalProfile(["Alex", "Sarah"], full, 0, " SARAH "), 1, "his cards are in the other index");
  assert.strictEqual(S.pickLocalProfile(["Alex", "Sarah"], full, 1, "Alex"), 0);
  assert.strictEqual(S.pickLocalProfile(["Sarah", "Alex"], full, 1, "Sarah"), 0, "slot 1 in the family, index 0 here");

  // Nothing in the other index that could be lost: take the slot and merge in place.
  assert.strictEqual(S.pickLocalProfile(["Player 1", "Player 2"], [withCards(4), EMPTY], 0, "Sarah"), 0);
  assert.strictEqual(S.pickLocalProfile(["Player 1", "Player 2"], [EMPTY, EMPTY], 1, "Sarah"), 1, "a fresh phone never asks");
  assert.strictEqual(S.pickLocalProfile(["Player 1", "Player 2"], [EMPTY, withCards(9)], 1, "Sarah"), 1);

  // Two profiles under one name tell you nothing, so the slot is as good an answer as any.
  assert.strictEqual(S.pickLocalProfile(["Sarah", "Sarah"], full, 1, "Sarah"), 1);
  assert.strictEqual(S.pickLocalProfile(["Sam", "Sam"], full, 0, "Sarah"), 0);

  // Two lots of cards and no name that matches: only the kid knows. Ask.
  assert.strictEqual(S.pickLocalProfile(["Player 1", "Player 2"], full, 0, "Sarah"), null);
  assert.strictEqual(S.pickLocalProfile(["Alex", "Bo"], full, 1, "Sarah"), null);
  assert.strictEqual(S.pickLocalProfile(["Player 1", "Player 2"], full, 0, ""), null, "an unnamed kid is no answer");
  // The risky shape: his own slot is empty, the other holds cards that are not his by name.
  assert.strictEqual(S.pickLocalProfile(["Player 1", "Alex"], [EMPTY, withCards(7)], 0, "Sarah"), null);
}

/* The join, as game.js famLand does it: place the local profile, then merge the family's copy into
   the slot. Both kids' progress has to come out the other side, each under its own name. */
function join(profiles, names, slot, kidName, remote, roster, chosen) {
  const idx = chosen === undefined ? S.pickLocalProfile(names, profiles, slot, kidName) : chosen;
  if (idx === null && chosen === undefined) return { ask: true, profiles: profiles, names: names };
  const placed = S.placeLocal(profiles, names, idx, slot);
  const local = idx === null ? S.emptyStats() : placed.profiles[slot];
  const out = placed.profiles.slice(), ns = placed.names.slice();
  (roster || []).forEach(function (r) { ns[r.slot] = r.name; });   // applyRoster: the family's names win
  out[slot] = Y.mergeStats(local, remote || {});
  return { ask: false, profiles: out, names: ns, idx: idx };
}

function swap() {
  // Sarah has been Player 2 on this phone; the family gives her slot 0, where Alex's cards sit.
  const sarah = withGames(withCards(12), 3), alex = withCards(5);
  const remote = { cardsEarned: { far: { critical: true, tries: 1, t: 2 } } };
  const r = join([alex, sarah], ["Alex", "Sarah"], 0, "Sarah", remote, [{ slot: 0, name: "Sarah" }]);
  assert.strictEqual(r.idx, 1, "her cards were in the other index");
  assert.strictEqual(S.profileSummary(r.profiles[0]).cards, 13, "her twelve and the family's one");
  assert.strictEqual(S.profileSummary(r.profiles[0]).games, 3, "her games came with her");
  assert.strictEqual(S.profileSummary(r.profiles[1]).cards, 5, "Alex keeps his, in the other slot");
  assert.deepStrictEqual(r.names, ["Sarah", "Alex"], "the roster names her slot; his name went with his cards");

  // Alex joins slot 1 on the same phone next. He must find his own five, not hers.
  const r2 = join(r.profiles, r.names, 1, "Alex", {}, [{ slot: 0, name: "Sarah" }, { slot: 1, name: "Alex" }]);
  assert.strictEqual(r2.idx, 1, "no swap needed the second time");
  assert.strictEqual(S.profileSummary(r2.profiles[1]).cards, 5);
  assert.strictEqual(S.profileSummary(r2.profiles[0]).cards, 13, "hers are untouched by his join");
  assert.deepStrictEqual(r2.names, ["Sarah", "Alex"]);

  // No swap when he is already in the right index, and the merge still happens.
  const r3 = join([withCards(2), EMPTY], ["Bo", "Player 2"], 0, "Bo", { cardsEarned: { z: { t: 1 } } }, [{ slot: 0, name: "Bo" }]);
  assert.strictEqual(r3.idx, 0);
  assert.strictEqual(S.profileSummary(r3.profiles[0]).cards, 3);
}

function chooser() {
  const mine = withCards(12), theirs = withCards(5);
  const asked = join([mine, theirs], ["Player 1", "Player 2"], 0, "Sarah", {}, [{ slot: 0, name: "Sarah" }]);
  assert.ok(asked.ask, "two nameless piles: the kid is asked");

  // He points at index 1: it swaps into his slot and the other pile keeps its own index.
  const picked = join([mine, theirs], ["Player 1", "Player 2"], 0, "Sarah", {}, [{ slot: 0, name: "Sarah" }], 1);
  assert.strictEqual(S.profileSummary(picked.profiles[0]).cards, 5);
  assert.strictEqual(S.profileSummary(picked.profiles[1]).cards, 12, "the pile he did not pick is still there");
  assert.deepStrictEqual(picked.names, ["Sarah", "Player 1"], "it keeps the name it had");

  // "Neither — start fresh": the slot takes the family's copy alone, and nothing local is merged in.
  const fresh = join([mine, theirs], ["Player 1", "Player 2"], 1, "Sarah",
    { cardsEarned: { far: { t: 1 } } }, [{ slot: 1, name: "Sarah" }], null);
  assert.strictEqual(S.profileSummary(fresh.profiles[1]).cards, 1, "the family's card and nothing else");
  assert.strictEqual(S.profileSummary(fresh.profiles[0]).cards, 12, "the other index is left where it was");
  assert.deepStrictEqual(fresh.names, ["Player 1", "Sarah"]);
}

function summaryChip() {
  const s = S.profileSummary(withGames(withCards(12), 3));
  assert.strictEqual(s.cards + " cards · " + s.games + " games", "12 cards · 3 games");
}

names(); summary(); picks(); swap(); chooser(); summaryChip();
console.log("OK join v0.29: a kid's cards follow his name into his family slot whatever index they were in, "
  + "the other kid's stay his, and a phone that cannot tell asks instead of guessing");
