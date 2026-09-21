// One runner for the gate, so `npm test`, CI and a contributor's shell all mean the same thing.
//   node tools/run_suites.js js      every tests/test_*.js
//   node tools/run_suites.js check   node --check on every shipped script
//   node tools/run_suites.js e2e     every tests/e2e/phase*.py; keeps going, exits red if any failed
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const mode = process.argv[2];
const python = process.env.PYTHON || "python";
let failed = 0;

function run(cmd, args, label) {
  console.log("== " + label);
  try { execFileSync(cmd, args, { cwd: root, stdio: "inherit" }); }
  catch (e) { failed += 1; if (mode !== "e2e") process.exit(1); }
}

if (mode === "js") {
  fs.readdirSync(path.join(root, "tests")).filter((f) => /^test_.*\.js$/.test(f)).sort()
    .forEach((f) => run("node", ["tests/" + f], "tests/" + f));
} else if (mode === "check") {
  fs.readdirSync(path.join(root, "web")).filter((f) => f.endsWith(".js")).sort()
    .forEach((f) => run("node", ["--check", "web/" + f], "node --check web/" + f));
} else if (mode === "e2e") {
  fs.readdirSync(path.join(root, "tests", "e2e")).filter((f) => /^phase.*\.py$/.test(f)).sort()
    .forEach((f) => run(python, ["tests/e2e/" + f], "tests/e2e/" + f));
} else {
  console.error("usage: node tools/run_suites.js js|check|e2e");
  process.exit(2);
}
process.exit(failed ? 1 : 0);
