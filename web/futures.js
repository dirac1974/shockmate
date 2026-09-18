/* Pure two-futures engine. No DOM. Testable in Node. */
(function (root) {
  const VALUE = { k: 100, q: 9, r: 5, b: 3, n: 3, p: 1 };

  function clonePieces(map) {
    const out = {};
    Object.keys(map).forEach((sq) => {
      out[sq] = { color: map[sq].color, role: map[sq].role };
    });
    return out;
  }

  function fileOf(sq) { return sq.charCodeAt(0) - 97; }
  function rankOf(sq) { return Number(sq[1]); }
  function sqName(f, r) {
    if (f < 0 || f > 7 || r < 1 || r > 8) return null;
    return String.fromCharCode(97 + f) + r;
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

  // The build packs a board as "wra1bkg8...": colour, role, square, four characters a piece.
  function piecesFromPack(p) {
    const list = [];
    for (let i = 0; i + 3 < (p || "").length; i += 4) list.push({ color: p[i], role: p[i + 1], sq: p.slice(i + 2, i + 4) });
    return piecesFromList(list);
  }
  // Glitch's move into the fight, as the two squares to shade. Null when a fight has none.
  function arriveOf(enc) {
    const u = enc && enc.arrive;
    return u && u.length >= 4 ? { from: u.slice(0, 2), to: u.slice(2, 4) } : null;
  }
  function piecesFromList(list) {
    const map = {};
    (list || []).forEach((p) => {
      map[p.sq] = { color: p.color, role: p.role };
    });
    return map;
  }

  function occKey(map) {
    return Object.keys(map).sort().map((sq) => sq + map[sq].color + map[sq].role).join(",");
  }

  function findKing(map, color) {
    const keys = Object.keys(map);
    for (let i = 0; i < keys.length; i++) {
      const p = map[keys[i]];
      if (p.color === color && p.role === "k") return keys[i];
    }
    return null;
  }

  const KNIGHT = [[1, 2], [1, -2], [-1, 2], [-1, -2], [2, 1], [2, -1], [-2, 1], [-2, -1]];
  const KING = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const ROOK = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const BISHOP = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

  function rayHits(map, from, dirs) {
    const hits = [];
    const f0 = fileOf(from);
    const r0 = rankOf(from);
    dirs.forEach((d) => {
      let f = f0 + d[0];
      let r = r0 + d[1];
      while (true) {
        const sq = sqName(f, r);
        if (!sq) break;
        const occ = map[sq];
        hits.push({ sq: sq, piece: occ || null });
        if (occ) break;
        f += d[0];
        r += d[1];
      }
    });
    return hits;
  }

  function attacksFrom(map, from) {
    const me = map[from];
    if (!me) return [];
    const f0 = fileOf(from);
    const r0 = rankOf(from);
    const step = [];
    if (me.role === "n") {
      KNIGHT.forEach((d) => {
        const sq = sqName(f0 + d[0], r0 + d[1]);
        if (sq) step.push({ sq: sq, piece: map[sq] || null });
      });
    } else if (me.role === "k") {
      KING.forEach((d) => {
        const sq = sqName(f0 + d[0], r0 + d[1]);
        if (sq) step.push({ sq: sq, piece: map[sq] || null });
      });
    } else if (me.role === "p") {
      const dir = me.color === "w" ? 1 : -1;
      [-1, 1].forEach((df) => {
        const sq = sqName(f0 + df, r0 + dir);
        if (sq) step.push({ sq: sq, piece: map[sq] || null });
      });
    } else if (me.role === "r") {
      return rayHits(map, from, ROOK);
    } else if (me.role === "b") {
      return rayHits(map, from, BISHOP);
    } else if (me.role === "q") {
      return rayHits(map, from, ROOK.concat(BISHOP));
    }
    return step;
  }

  function enemyAttacked(map, from) {
    const me = map[from];
    if (!me) return [];
    return attacksFrom(map, from).filter((h) => h.piece && h.piece.color !== me.color);
  }

  function pieceBehind(map, from, mid) {
    if (!from || !mid) return null;
    const df = fileOf(mid) - fileOf(from);
    const dr = rankOf(mid) - rankOf(from);
    const stepF = df === 0 ? 0 : df / Math.abs(df);
    const stepR = dr === 0 ? 0 : dr / Math.abs(dr);
    if (df !== 0 && dr !== 0 && Math.abs(df) !== Math.abs(dr)) return null;
    let f = fileOf(mid) + stepF;
    let r = rankOf(mid) + stepR;
    while (true) {
      const sq = sqName(f, r);
      if (!sq) return null;
      if (map[sq]) return sq;
      f += stepF;
      r += stepR;
    }
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
      if (rest.length) {
        acts.push({ kind: "line", label: "best-rest", ucis: rest, resetFirst: false });
      } else {
        acts.push({ kind: "hold", ms: 400 });
      }
      acts.push({ kind: "finisher", motif: enc.motif });
    } else {
      acts.push({ kind: "banner", text: "WEAK FUTURE", tone: "miss" });
      acts.push({ kind: "reset" });
      acts.push({ kind: "line", label: "weak", ucis: tempting, resetFirst: false });
      acts.push({ kind: "hold", ms: 350 });
      acts.push({ kind: "banner", text: "BETTER FUTURE", tone: "win" });
      acts.push({ kind: "reset" });
      acts.push({ kind: "line", label: "best", ucis: best, resetFirst: false });
      acts.push({ kind: "finisher", motif: enc.motif });
    }
    acts.push({ kind: "card" });
    return {
      hit: hit,
      start: start,
      best: best,
      tempting: tempting,
      acts: acts,
    };
  }

  function motifTargets(enc) {
    const start = piecesFromList(enc.pieces);
    const first = applyUci(start, enc.best);
    const after = first.pieces;
    const to = enc.best.slice(2, 4);
    const motif = enc.motif || "";
    const mover = after[to];
    const enemyColor = mover && mover.color === "w" ? "b" : "w";
    const king = findKing(after, enemyColor);

    if (motif === "fork" || motif === "pawnFork" || motif === "royalFork") {
      const enemies = enemyAttacked(after, to).slice();
      enemies.sort((a, b) => (VALUE[b.piece.role] || 0) - (VALUE[a.piece.role] || 0));
      const top = enemies.slice(0, 2).map((h) => h.sq);
      return top.length ? top : [to];
    }
    if (motif === "pin" || motif === "pinTake") {
      const out = [];
      if (first.captured) out.push(to);
      else {
        const onLine = enemyAttacked(after, to);
        const mid = onLine.find((h) => h.piece.role !== "k");
        if (mid) out.push(mid.sq);
      }
      if (king) out.push(king);
      return out.length ? out : [to];
    }
    if (motif === "skewer") {
      const out = [];
      if (king) out.push(king);
      const behind = pieceBehind(after, to, king);
      if (behind) out.push(behind);
      return out.length ? out : [to];
    }
    if (motif === "discovery") {
      const out = [];
      if (first.captured) out.push(first.captured.sq);
      if (king) out.push(king);
      return out.length ? out : [to];
    }
    if (motif === "backRank" || motif === "mateOverMaterial") {
      return king ? [to, king] : [to];
    }
    return first.captured ? [to] : [to];
  }

  function finisherFor(enc) {
    const targets = motifTargets(enc);
    const map = {
      fork: { kind: "fork", css: "fork-glow", sfx: "fork", label: "TWO HEADS" },
      pawnFork: { kind: "fork", css: "fork-glow", sfx: "fork", label: "TINY DOUBLE BITE" },
      royalFork: { kind: "fork", css: "fork-glow", sfx: "fork", label: "TWO CROWNS" },
      pin: { kind: "pin", css: "pin-freeze", sfx: "boom", label: "GLUED" },
      pinTake: { kind: "pin", css: "pin-freeze", sfx: "boom", label: "FROZEN LUNCH" },
      skewer: { kind: "skewer", css: "skewer-stab", sfx: "boom", label: "THROUGH" },
      backRank: { kind: "door", css: "door-slam", sfx: "win", label: "BASEMENT" },
      mateOverMaterial: { kind: "door", css: "door-slam", sfx: "win", label: "THE DOOR" },
      discovery: { kind: "laser", css: "laser", sfx: "fork", label: "LASER" },
      counting: { kind: "poison", css: "poison", sfx: "boom", label: "COUNTED" },
      hanging: { kind: "chomp", css: "best-glow", sfx: "win", label: "LOOSE LUNCH" },
    };
    const spec = map[enc.motif] || { kind: "chomp", css: "best-glow", sfx: "win", label: "BOOM" };
    return Object.assign({ targets: targets, motif: enc.motif }, spec);
  }

  function simulatePlan(enc, playerUci) {
    const plan = buildPlan(enc, playerUci);
    let board = clonePieces(plan.start);
    if (plan.hit) {
      board = applyUci(board, playerUci).pieces;
    }
    const events = [];
    const startKey = occKey(plan.start);
    plan.acts.forEach((act) => {
      if (act.kind === "reset") {
        board = clonePieces(plan.start);
        events.push({ kind: "reset", occ: occKey(board), matchesStart: occKey(board) === startKey });
      } else if (act.kind === "line") {
        const snaps = applyLine(board, act.ucis);
        snaps.forEach((s) => {
          events.push({
            kind: "move",
            label: act.label,
            uci: s.uci,
            from: s.from,
            to: s.to,
            captured: s.captured ? s.captured.role : null,
          });
          board = s.pieces;
        });
      } else if (act.kind === "finisher") {
        events.push({ kind: "finisher", motif: act.motif, targets: motifTargets(enc) });
      } else {
        events.push({ kind: act.kind, text: act.text || null, tone: act.tone || null });
      }
    });
    return { plan: plan, events: events, hit: plan.hit, endOcc: occKey(board) };
  }

  function decoyWhy(encounters, enc) {
    const others = (encounters || []).filter((e) => e.id !== enc.id);
    if (!others.length) return "The snack was actually fine.";
    return others[enc.id.charCodeAt(1) % others.length].why;
  }

  const api = {
    clonePieces,
    applyUci,
    applyLine,
    piecesFromList,
    piecesFromPack,
    arriveOf,
    occKey,
    findKing,
    attacksFrom,
    enemyAttacked,
    buildPlan,
    motifTargets,
    finisherFor,
    simulatePlan,
    decoyWhy,
  };
  root.ShockmateFutures = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
