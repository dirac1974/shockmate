/* Pure two-futures engine. No DOM. Testable in Node. */
(function (root) {
  function clonePieces(map) {
    const out = {};
    Object.keys(map).forEach((sq) => { out[sq] = { color: map[sq].color, role: map[sq].role }; });
    return out;
  }
  function applyUci(map, uci) {
    if (!uci || uci.length < 4) throw new Error("bad uci " + uci);
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const mover = map[from];
    if (!mover) throw new Error("no piece on " + from + " for " + uci);
    const captured = map[to] ? { color: map[to].color, role: map[to].role, sq: to } : null;
    const next = clonePieces(map);
    delete next[from];
    next[to] = { color: mover.color, role: mover.role };
    return { pieces: next, from: from, to: to, captured: captured, uci: uci };
  }
  function applyLine(startMap, ucis) {
    const snapshots = [];
    let cur = clonePieces(startMap);
    (ucis || []).forEach((uci) => {
      const step = applyUci(cur, uci);
      snapshots.push(step);
      cur = step.pieces;
    });
    return snapshots;
  }
  function piecesFromList(list) {
    const map = {};
    (list || []).forEach((p) => { map[p.sq] = { color: p.color, role: p.role }; });
    return map;
  }
  function buildPlan(enc, playerUci) {
    const start = piecesFromList(enc.pieces);
    const best = enc.bestLineUci && enc.bestLineUci.length ? enc.bestLineUci : [enc.best];
    const tempting = enc.temptingLineUci && enc.temptingLineUci.length ? enc.temptingLineUci : [enc.tempting];
    const hit = playerUci === enc.best;
    const acts = [];
    if (hit) {
      const rest = best.slice(1);
      acts.push({ kind: "banner", text: "YOUR FUTURE", tone: "win" });
      if (rest.length) acts.push({ kind: "line", label: "best-rest", ucis: rest, resetFirst: false });
      else acts.push({ kind: "hold", ms: 400 });
    } else {
      acts.push({ kind: "banner", text: "WEAK FUTURE", tone: "miss" });
      acts.push({ kind: "reset" });
      acts.push({ kind: "line", label: "weak", ucis: tempting, resetFirst: false });
      acts.push({ kind: "hold", ms: 350 });
      acts.push({ kind: "banner", text: "BETTER FUTURE", tone: "win" });
      acts.push({ kind: "reset" });
      acts.push({ kind: "line", label: "best", ucis: best, resetFirst: false });
    }
    acts.push({ kind: "card" });
    return { hit: hit, start: start, best: best, tempting: tempting, acts: acts };
  }
  function motifTargets(enc) {
    if (enc.id === "02") return ["g8", "d5"];
    if (enc.id === "03") return ["b6", "d6"];
    if (enc.id === "12") return ["e8", "a8"];
    if (enc.id === "07") return ["e8", "a8"];
    return [enc.best.slice(2, 4)];
  }
  const api = { clonePieces, applyUci, applyLine, piecesFromList, buildPlan, motifTargets };
  root.ShockmateFutures = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
