#!/usr/bin/env node
"use strict";
const assert = require("assert");
const path = require("path");
const fs = require("fs");
const vm = require("vm");
const futures = require("../web/futures.js");
function loadEncounters() {
  const src = fs.readFileSync(path.join(__dirname, "../web/encounters.js"), "utf8");
  const sandbox = { window: {}, console };
  vm.runInNewContext(src, sandbox);
  return sandbox.window.SHOCKMATE_ENCOUNTERS;
}
function run() {
  const list = loadEncounters();
  assert.strictEqual(list.length, 12);
  list.forEach((e) => {
    const start = futures.piecesFromList(e.pieces);
    const best = e.bestLineUci || [e.best];
    const temp = e.temptingLineUci || [e.tempting];
    assert.strictEqual(futures.applyLine(start, best).length, best.length);
    assert.strictEqual(futures.applyLine(start, temp).length, temp.length);
  });
  const snack = list[0];
  const miss = futures.buildPlan(snack, snack.tempting);
  assert.strictEqual(miss.hit, false);
  assert.ok(miss.acts.some((a) => a.label === "weak"));
  assert.ok(miss.acts.some((a) => a.label === "best"));
  const hit = futures.buildPlan(snack, snack.best);
  assert.strictEqual(hit.hit, true);
  console.log("OK futures tests");
}
run();
