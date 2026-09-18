#!/usr/bin/env node
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const H = require("../web/short-lines.js");

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "encounters.v2.json"), "utf8"));
const ALL = Array.isArray(raw) ? raw : (raw.encounters || []);

function run() {
  /* Every fight has one, and no orphans. A missing short line means a kid on the short register
     silently gets the long one, which is the failure this whole split exists to prevent. */
  const ids = ALL.map(function (e) { return e.id; });
  ids.forEach(function (id) {
    assert.ok(H.SHORT[id], "no short line for fight " + id);
  });
  Object.keys(H.SHORT).forEach(function (id) {
    assert.ok(ids.indexOf(id) >= 0, "short line for a fight that does not exist: " + id);
  });
  assert.strictEqual(Object.keys(H.SHORT).length, ALL.length);

  /* The cap is the point. Nine words, every one of them. */
  ALL.forEach(function (e) {
    const w = H.words(H.SHORT[e.id]);
    assert.ok(w <= H.CAP, e.id + " is " + w + " words, over the " + H.CAP + "-word cap: " + H.SHORT[e.id]);
    assert.ok(w >= 4, e.id + " is only " + w + " words; that is too terse to teach");
  });

  /* Shorter than the line it replaces, or it is not doing anything. */
  let shorter = 0;
  ALL.forEach(function (e) {
    if (H.words(H.SHORT[e.id]) < H.words(e.why)) shorter++;
  });
  assert.ok(shorter >= ALL.length - 3, "short lines should be shorter than the originals nearly everywhere, only " + shorter + " are");

  /* No square names or piece letters. The board is on screen already saying that. */
  ALL.forEach(function (e) {
    const t = H.SHORT[e.id];
    assert.ok(!/\b[KQRBN][a-h][1-8]\b/.test(t), e.id + " leaks chess notation: " + t);
    assert.ok(!/\b(Nf6|Rxa5|Qh5)\b/.test(t), e.id + " leaks a move: " + t);
    assert.ok(!/\b[a-h][1-8]\b/.test(t), e.id + " names a square: " + t);
  });

  /* whyFor picks the register, and falls back rather than showing nothing. */
  const enc = ALL[0];
  assert.strictEqual(H.whyFor(enc, true), H.SHORT[enc.id], "short register gets the short line");
  assert.strictEqual(H.whyFor(enc, false), enc.why, "full register gets the original line");
  assert.strictEqual(H.whyFor({ id: "nope", why: "fallback text" }, true), "fallback text", "an unknown fight falls back to its own why, never to blank");
  assert.strictEqual(H.whyFor(null, true), "", "null is safe");
  assert.strictEqual(H.whyFor({ id: "nope" }, true), "", "no text anywhere is still safe");

  /* Sentences, not fragments: each ends in punctuation and starts with a capital. */
  ALL.forEach(function (e) {
    const t = H.SHORT[e.id];
    assert.ok(/[.!?]$/.test(t), e.id + " does not end as a sentence: " + t);
    assert.ok(/^[A-Z]/.test(t), e.id + " does not start with a capital: " + t);
  });

  const all = ALL.map(function (e) { return H.words(H.SHORT[e.id]); });
  const med = all.slice().sort(function (a, b) { return a - b; })[Math.floor(all.length / 2)];
  console.log("OK short lines: " + ALL.length + " fights covered, median " + med + " words, max " + Math.max.apply(null, all) + ", cap " + H.CAP + ", register picks and falls back safely");
}

run();
