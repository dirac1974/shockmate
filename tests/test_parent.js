#!/usr/bin/env node
"use strict";
const assert = require("assert");
const S = require("../web/score.js");
const Y = require("../web/sync.js");

function settings(over) {
  return Object.assign({ names: ["Mia", "Leo"], parent: { name: "", pin: "" } }, over);
}

function run() {
  /* --- a PIN is four digits, and nothing else is --- */
  assert.ok(S.validPin("1234"));
  assert.ok(!S.validPin("123"), "three digits is not a PIN");
  assert.ok(S.validPin("12345"), "a fifth digit is cut, so the first four still stand");
  assert.strictEqual(S.normalisePin("12345"), "1234", "the keypad can only ever hold four");
  assert.strictEqual(S.normalisePin("1a2b3c4d"), "1234", "letters never reach the PIN");
  assert.ok(!S.validPin(""), "empty is not set");
  assert.ok(!S.validPin(null) && !S.validPin(undefined), "null-safe");
  assert.strictEqual(S.normalisePin(1234), "1234", "a number reads the same as the string");

  /* --- parentOf / parentSet --- */
  const blank = S.parentOf(settings());
  assert.deepStrictEqual({ name: blank.name, pin: blank.pin, set: blank.set }, { name: "", pin: "", set: false });
  assert.ok(!S.parentSet(settings()), "a fresh account has no coach");
  assert.ok(!S.parentSet(null) && !S.parentSet({}), "null-safe");
  assert.ok(!S.parentSet(settings({ parent: { name: "Dad", pin: "12" } })), "a half-typed PIN is not set");

  const dad = settings({ parent: { name: "  Dad  ", pin: "9 1 7 5" } });
  assert.strictEqual(S.parentOf(dad).name, "Dad", "the name is trimmed");
  assert.strictEqual(S.parentOf(dad).pin, "9175", "spaces never reach the PIN");
  assert.ok(S.parentSet(dad));
  assert.strictEqual(S.parentOf(settings({ parent: { name: "A".repeat(40), pin: "1111" } })).name.length, 16, "the name is capped");

  /* --- the gate itself, as a pure decision --- */
  const g0 = S.parentGate(settings(), "");
  assert.strictEqual(g0.need, "setup", "no PIN set means the setup card, never the keypad");
  assert.strictEqual(g0.open, false);
  assert.strictEqual(S.parentGate(dad, "").need, "pin", "with a PIN set, the keypad");
  assert.strictEqual(S.parentGate(dad, "917").wrong, false, "a half-typed PIN is unfinished, not wrong");
  assert.strictEqual(S.parentGate(dad, "917").open, false);
  assert.strictEqual(S.parentGate(dad, "9175").open, true, "the right four open it");
  assert.strictEqual(S.parentGate(dad, "9175").name, "Dad", "the gate knows whose it is, for the title");
  const bad = S.parentGate(dad, "1111");
  assert.ok(bad.wrong && !bad.open, "a wrong PIN is wrong, and there is no lockout to report");
  assert.strictEqual(S.parentGate(dad, "1111").wrong, true, "asking again after a wrong PIN still just says wrong");
  assert.strictEqual(S.parentGate(dad, null).need, "pin", "null-safe");
  // Setup beats everything: a kid cannot type his way in before a coach exists.
  assert.strictEqual(S.parentGate(settings(), "1234").open, false);
  assert.strictEqual(S.parentGate(settings(), "1234").need, "setup");

  /* --- the coach travels in the backup file --- */
  const blob = Y.exportBlob(dad, [{ won: 1 }, {}]);
  assert.deepStrictEqual(blob.parent, { name: "Dad", pin: "9175" }, "name and PIN ride in the file");
  const back = Y.importBlob(JSON.stringify(blob), [{}, {}], settings());
  assert.deepStrictEqual(back.parent, { name: "Dad", pin: "9175" }, "restoring onto a blank device adopts the coach");
  assert.ok(S.parentSet(settings({ parent: back.parent })), "and the gate is armed straight after the restore");

  // A PIN already set on THIS device is never blanked, whatever the file carries.
  const mum = settings({ parent: { name: "Mum", pin: "2468" } });
  const older = Y.exportBlob(settings(), [{}, {}]);            // a backup taken before there was a coach
  const kept = Y.importBlob(JSON.stringify(older), [{}, {}], mum);
  assert.strictEqual(kept.parent.pin, "2468", "an old file cannot lock the parent out of the phone he is holding");
  assert.strictEqual(kept.parent.name, "Mum");
  const overwritten = Y.importBlob(JSON.stringify(blob), [{}, {}], mum);
  assert.strictEqual(overwritten.parent.pin, "2468", "the local PIN wins over the file's");

  // The old two-argument call still works, because the e2e suite and older callers use it.
  const legacy = Y.importBlob(JSON.stringify(blob), [{}, {}]);
  assert.deepStrictEqual(legacy.parent, { name: "Dad", pin: "9175" });
  assert.deepStrictEqual(legacy.names, ["Mia", "Leo"], "names still come back too");

  // A file with no parent at all is still a valid backup; it just carries no coach.
  const noCoach = Y.importBlob(JSON.stringify({ app: "shockmate", version: 2, names: [], profiles: [{}, {}] }), [{}, {}], settings());
  assert.deepStrictEqual(noCoach.parent, { name: "", pin: "" }, "a v2 file restores without a coach");
  assert.ok(!S.parentSet(settings({ parent: noCoach.parent })), "and leaves the gate open, as it was before");

  console.log("OK parent: PIN shape, parentOf/parentSet, the gate as a pure decision (setup beats typing, wrong never locks), backup round trip carries the coach and never blanks a local PIN");
}

run();
