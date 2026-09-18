// Every line Glitch says outside the per-fight data, read from the one copy the game uses, as
// [{key, voice, text, table}]. `text` is the SPOKEN text: the name-free half of a [shown, spoken]
// entry. Silent tables (shown in the think window only) are left out. Run: node tools/voice/glitch_lines.js
const path = require("path");
const web = (f) => path.join(__dirname, "..", "..", "web", f);
const S = require(web("score.js"));
const P = require(web("play.js"));
const V = require(web("versus.js"));

function fromTable(out, name, t, voice) {
  if (!t || t.silent) return;
  t.lines.forEach(function (shown, i) {
    const key = t.keys ? t.keys[i] : t.vk + "-" + (i + 1);
    const text = (t.speak && t.speak[i]) || shown;
    out.push({ key: key, voice: t.voice || voice, text: text, table: name });
  });
}

function all() {
  const out = [];
  Object.keys(S.GLITCH_LINES).forEach((k) => fromTable(out, "score.GLITCH_LINES." + k, S.GLITCH_LINES[k], "glitch"));
  Object.keys(S.SUGGEST_SAY).forEach((k) => fromTable(out, "score.SUGGEST_SAY." + k, S.SUGGEST_SAY[k], "glitch"));
  S.LEVELS.forEach((l) => out.push({ key: S.levelSayKey(l.id), voice: "glitch", text: l.say, table: "score.LEVELS" }));
  Object.keys(P.SAY).forEach((k) => fromTable(out, "play.SAY." + k, P.SAY[k], "glitch"));
  Object.keys(P.CRONY).forEach((lv) => Object.keys(P.CRONY[lv]).forEach((slot) => P.CRONY[lv][slot].forEach((text, i) =>
    out.push({ key: P.cronyKey(lv, slot, i), voice: "glitch", text: text, table: "play.CRONY." + lv + "." + slot }))));
  // A fight built out of a kid's own game speaks as game-<motif>-<kind> (P.buildFight sets `voice`).
  Object.keys(P.TEXT).forEach((motif) => {
    const t = P.TEXT[motif];
    [["hook", "narrator"], ["why", "narrator"], ["short", "narrator"], ["taunt", "glitch"], ["gloat", "glitch"], ["rage", "glitch"]]
      .forEach(([kind, voice]) => out.push({ key: "game-" + motif + "-" + kind, voice: voice, text: t[kind], table: "play.TEXT." + motif }));
  });
  Object.keys(V.SAY).forEach((k) => fromTable(out, "versus.SAY." + k, V.SAY[k], "glitch"));
  return out;
}

module.exports = { all };
if (require.main === module) console.log(JSON.stringify(all()));
