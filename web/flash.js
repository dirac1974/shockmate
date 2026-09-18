/* Flash: the board-vision drill, minus the screen. Every generator here is pure — given a fight it
   hands back one position, one question and one answer that is either a square on that board or a
   number between one and four. No DOM, no clock, no randomness: the same fight asks the same
   question every morning, so tests/test_flash.js can hold the whole of it and a kid can build a
   memory of what a board asks him.

   The rules that do not bend here either: nothing on screen goes down, the reveal window is quiet,
   and the question is always about MEANING — what was hanging, where his queen stood, what the last
   move hit — never about a square name for its own sake. */
(function (root, F, S) {
  "use strict";
  const ROLE = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" };
  const MAX_COUNT = 4;                    // the chip row is 1 2 3 4; a count outside it is not asked
  const ARROW_MS = 2000;                  // the ghost move hangs for this long, then he holds it himself

  function mapOf(enc) {
    if (!enc) return {};
    if (enc.pieces) return F.piecesFromList(enc.pieces);
    if (enc.position) return F.piecesFromPack(enc.position);
    return {};
  }
  // A stable number per fight. Which of the questions a board can carry it actually asks must not
  // change between two openings of the drill, or "you asked me that yesterday" stops being true.
  function seedOf(enc) {
    const id = String((enc && enc.id) || "");
    let n = 7;
    for (let i = 0; i < id.length; i++) n = (n * 31 + id.charCodeAt(i)) % 100003;
    return n;
  }
  function line(style, kind) { return S ? S.coachLine(style, { kind: kind }) : ""; }
  // Every piece of `color` that attacks `sq`. Two board scans, the same way futures.js does it.
  function attackersOf(map, sq, color) {
    return Object.keys(map).filter(function (from) {
      if (map[from].color !== color) return false;
      return F.attacksFrom(map, from).some(function (h) { return h.sq === sq; });
    });
  }

  /* ---------- RECALL: the board goes, the meaning stays ----------
     Three tap questions and three count questions. A board offers whichever of them it can honestly
     answer; the seed picks one of those. Every answer square is a square that had a piece on it. */
  function recallTap(enc, map) {
    const out = [];
    const why = enc && enc.whyTargets;
    // The fight's own why-gate, asked about the board it was written for. Only the single-square
    // whys, and only the ones that live on the starting board: this is the board he just looked at.
    if (why && why.at !== "after" && (why.squares || []).length === 1 && map[why.squares[0]]) {
      out.push({ key: "why", question: String(why.prompt || "Tap the piece that was hanging."), squares: why.squares.slice() });
    }
    const queens = Object.keys(map).filter(function (sq) { return map[sq].color === "b" && map[sq].role === "q"; });
    if (queens.length === 1) out.push({ key: "queen", question: "Where was Glitch's queen? Tap the square.", squares: queens });
    const threat = (F.threatTargets(enc) || []).filter(function (sq) { return !!map[sq]; });
    if (threat.length) out.push({ key: "threat", question: "Tap a piece Glitch's last move attacked.", squares: threat });
    return out.length ? out[seedOf(enc) % out.length] : null;
  }
  /* The counting register. "Tap that many squares" is fiddly on a phone and turns a chess question
     into a dexterity one, so the answer is one chip out of four. A board whose honest answer is
     nought or more than four is simply not asked that question. */
  function recallCount(enc, map) {
    const out = [];
    const fits = function (n) { return n >= 1 && n <= MAX_COUNT; };
    const threat = (F.threatTargets(enc) || []).length;
    if (fits(threat)) out.push({ key: "threatN", question: "How many pieces did his last move attack?", count: threat });
    const wk = F.findKing(map, "w");
    if (wk) {
      const n = attackersOf(map, wk, "b").length;
      if (fits(n)) out.push({ key: "kingN", question: "How many pieces attacked your king?", count: n });
    }
    const hit = {};
    Object.keys(map).forEach(function (from) {
      if (map[from].color !== "b") return;
      F.enemyAttacked(map, from).forEach(function (h) { hit[h.sq] = 1; });
    });
    const under = Object.keys(hit).length;
    if (fits(under)) out.push({ key: "underN", question: "How many of your pieces was he attacking?", count: under });
    return out.length ? out[seedOf(enc) % out.length] : null;
  }

  /* ---------- GONE: the easy rung ----------
     The whole board comes back with one piece missing. A king never vanishes, because a board with
     no king reads as broken rather than as a puzzle, and a pawn out of a wall of pawns is a spot-the-
     difference test; an officer is a piece he has a reason to have noticed. */
  function goneSquare(enc, map) {
    const keys = Object.keys(map).sort();
    const officers = keys.filter(function (sq) { return map[sq].role !== "k" && map[sq].role !== "p"; });
    const pool = officers.length ? officers : keys.filter(function (sq) { return map[sq].role !== "k"; });
    return pool.length ? pool[seedOf(enc) % pool.length] : null;
  }

  /* ---------- IMAGINE: the hard rung ----------
     The board does NOT change. He is told the move, shown it once as a ghost arrow, and then has to
     hold it in his head and say what it hits. The answer is computed on the board AFTER the move
     (applyUci), which is exactly the board he is not allowed to see — that is the whole exercise. */
  function imagineOf(enc, map) {
    const best = enc && enc.best;
    if (!best || String(best).length < 4) return null;
    const from = String(best).slice(0, 2), to = String(best).slice(2, 4);
    const mover = map[from];
    if (!mover) return null;
    let after;
    try { after = F.applyUci(map, best).pieces; } catch (e) { return null; }
    const squares = F.enemyAttacked(after, to).map(function (h) { return h.sq; });
    if (!squares.length) return null;
    return { from: from, to: to, role: mover.role, squares: squares };
  }

  /* One item, ready to draw. `position` is what goes up; `hidden` is what is on the board while he
     answers (nothing at all for a recall, the board minus one piece for a gone, the untouched board
     for an imagine). `kind` is "tap" or "chip", and `style` is the one line the coach says in this
     kid's own register. Returns null when the board cannot carry that question honestly. */
  function makeItem(enc, type, opts) {
    const o = opts || {}, style = o.style === "numbers" ? "numbers" : "words";
    const map = mapOf(enc);
    if (!enc || !enc.id || !Object.keys(map).length) return null;
    const base = { encId: enc.id, type: type, position: map, kind: "tap", reveal: true,
      title: enc.title || "", motif: enc.motif || "" };

    if (type === "gone") {
      const sq = goneSquare(enc, map);
      if (!sq) return null;
      const hidden = F.clonePieces(map);
      delete hidden[sq];
      return Object.assign(base, { hidden: hidden, squares: [sq], count: null,
        gone: { sq: sq, role: map[sq].role, color: map[sq].color, name: ROLE[map[sq].role] || "piece" },
        question: "Which piece is gone? Tap its square.",
        style: line(style, "flashGone") });
    }
    if (type === "imagine") {
      const im = imagineOf(enc, map);
      if (!im) return null;
      const name = ROLE[im.role] || "piece";
      return Object.assign(base, { reveal: false, hidden: map, squares: im.squares.slice(), count: null,
        arrow: { from: im.from, to: im.to, ms: ARROW_MS },
        move: { from: im.from, to: im.to, role: im.role, name: name },
        prompt: "Imagine you play the " + name + " to " + im.to + ".",
        question: "Tap what it now attacks.",
        style: line(style, "flashImagine") });
    }
    // recall: the numbers kid is asked to count, the words kid is asked what it meant. Either falls
    // back to the other rather than dropping a board out of the drill.
    const q = style === "numbers"
      ? (recallCount(enc, map) || recallTap(enc, map))
      : (recallTap(enc, map) || recallCount(enc, map));
    if (!q) return null;
    return Object.assign(base, { hidden: {}, kind: q.count == null ? "tap" : "chip",
      squares: q.squares ? q.squares.slice() : [], count: q.count == null ? null : q.count,
      variant: q.key, question: q.question, style: line(style, "flashLook") });
  }
  function supports(enc, type, opts) { return !!makeItem(enc, type, opts); }
  // A plan from score.js, turned into drawable items. Anything that will not build is dropped rather
  // than patched: a question with no honest answer is worse than one fewer question.
  function build(plan, opts) {
    return ((plan && plan.items) || []).map(function (it) { return makeItem(it.enc, it.type, opts); })
      .filter(function (it) { return !!it; });
  }
  // One tap or one chip. A tap item accepts any of its answer squares, because it asks for one.
  function check(item, answer) {
    if (!item) return false;
    if (item.kind === "chip") return Number(answer) === item.count;
    return item.squares.indexOf(String(answer)) >= 0;
  }
  function hintFor(item) { return item && item.kind === "tap" ? item.squares[0] : null; }
  function answerText(item) {
    if (!item) return "";
    if (item.kind === "chip") return String(item.count);
    if (item.type === "gone") return "The " + item.gone.name + " on " + item.gone.sq + ".";
    return item.squares.join(" and ") + ".";
  }
  const CHIPS = [1, 2, 3, 4];

  const api = { ROLE, MAX_COUNT, ARROW_MS, CHIPS, mapOf, seedOf, attackersOf,
    recallTap, recallCount, goneSquare, imagineOf, makeItem, supports, build, check, hintFor, answerText };
  root.ShockmateFlash = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis,
  (typeof window !== "undefined" && window.ShockmateFutures) ||
  (typeof globalThis !== "undefined" && globalThis.ShockmateFutures) ||
  (typeof require === "function" ? require("./futures.js") : null),
  (typeof window !== "undefined" && window.ShockmateScore) ||
  (typeof globalThis !== "undefined" && globalThis.ShockmateScore) ||
  (typeof require === "function" ? require("./score.js") : null));
