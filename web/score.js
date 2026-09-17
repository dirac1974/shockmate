/* A correct move is a hit (fairness tiers decide "correct"); the why-gate confirms it. Palace due 1d/3d/7d. Duel verdict. */
(function (root) {
  const LEDGER_MAX = 40;
  const DAY = 24 * 60 * 60 * 1000;
  const INTERVALS = { real: [1 * DAY, 3 * DAY, 7 * DAY], hurry: [60 * 1000, 3 * 60 * 1000, 7 * 60 * 1000] };
  function intervalList(hurry) { return hurry ? INTERVALS.hurry : INTERVALS.real; }
  function scheduleAfterKeep(card, now, hurry) {
    const steps = intervalList(hurry);
    const step = Math.max(0, Math.min(card.reviewStep || 0, steps.length - 1));
    card.nextReview = now + steps[step];
    card.reviewStep = Math.min(step + 1, steps.length - 1);
    return card;
  }
  function scheduleAfterFail(card, now) { card.reviewStep = 0; card.nextReview = now; return card; }
  function dueReviews(encounters, stats, now) {
    const cards = (stats && stats.cards) || {};
    return (encounters || []).filter((e) => {
      const c = cards[e.id];
      return !!(c && typeof c.nextReview === "number" && c.nextReview <= now);
    });
  }
  function pickWalkTarget(encounters, stats, now) {
    const due = dueReviews(encounters, stats, now);
    if (due.length) return due[0];
    const retry = (encounters || []).find((e) => needsRetry(stats, e.id));
    if (retry) return retry;
    return (encounters || []).find((e) => (stats.cards || {})[e.id]) || null;
  }
  function emptyStats() {
    return { hits: 0, misses: 0, streak: 0, bestStreak: 0, session: 0, figurines: [], cards: {}, ledger: [] };
  }
  function cardOf(stats, id) {
    const c = (stats.cards || {})[id];
    if (c) return c;
    return { id: id, attempts: 0, founds: 0, misses: 0, whys: 0, hits: 0, lastFound: null, lastCorrect: null, lastSan: "", why: "", mastered: false };
  }
  function touchFigurine(next, enc, mastered) {
    const fig = next.figurines.find((f) => f.id === enc.id);
    if (fig) { fig.seen = (fig.seen || 0) + 1; fig.mastered = !!mastered; fig.why = enc.why; }
    else next.figurines.push({ id: enc.id, title: enc.title, room: enc.palaceRoom, mascot: enc.mascot, why: enc.why, mastered: !!mastered, seen: 1 });
  }
  function pushLedger(next, row) {
    next.ledger.push(row);
    if (next.ledger.length > LEDGER_MAX) next.ledger = next.ledger.slice(-LEDGER_MAX);
  }
  function recordMove(stats, enc, attempt) {
    const next = Object.assign({}, stats);
    next.cards = Object.assign({}, stats.cards || {});
    next.figurines = (stats.figurines || []).slice();
    next.ledger = (stats.ledger || []).slice();
    const correct = !!attempt.correct;
    const card = Object.assign({}, cardOf(next, enc.id));
    card.attempts += 1; card.lastSan = attempt.san || ""; card.why = enc.why;
    card.title = enc.title; card.motif = enc.motif; card.bestSan = enc.bestSan; card.lastFound = correct;
    if (correct) {
      card.founds = (card.founds || 0) + 1; card.hits += 1; card.lastCorrect = true;
      scheduleAfterKeep(card, attempt.t || 0, !!attempt.hurry);
      next.hits = (next.hits || 0) + 1; next.streak = (next.streak || 0) + 1;
      next.bestStreak = Math.max(next.bestStreak || 0, next.streak);
      if (card.hits >= 2) card.mastered = true;
    } else { card.misses += 1; card.lastCorrect = false; card.mastered = false; scheduleAfterFail(card, attempt.t || 0); next.misses = (next.misses || 0) + 1; next.streak = 0; }
    next.cards[enc.id] = card; touchFigurine(next, enc, card.mastered);
    pushLedger(next, { id: enc.id, title: enc.title, motif: enc.motif, san: attempt.san || "", bestSan: enc.bestSan, correct: correct, kind: "move", why: enc.why, t: attempt.t || 0 });
    return { stats: next, card: card, correct: correct };
  }
  function recordAttempt(stats, enc, attempt) { return recordMove(stats, enc, attempt); }
  function recordWhy(stats, enc, result) {
    const next = Object.assign({}, stats);
    next.cards = Object.assign({}, stats.cards || {});
    next.figurines = (stats.figurines || []).slice();
    next.ledger = (stats.ledger || []).slice();
    const card = Object.assign({}, cardOf(next, enc.id));
    const found = card.lastFound === true; const ok = !!result.ok;
    if (ok && found) {
      card.whys = (card.whys || 0) + 1; card.lastCorrect = true;
    } else {
      card.lastCorrect = false;
      if (found && !ok) card.copied = (card.copied || 0) + 1;
      scheduleAfterFail(card, result.t || 0);
      next.streak = 0;
    }
    next.cards[enc.id] = card; touchFigurine(next, enc, card.mastered);
    pushLedger(next, { id: enc.id, title: enc.title, kind: "why", ok: ok, found: found, why: enc.why, t: result.t || 0 });
    return { stats: next, card: card, kept: !!(ok && found) };
  }
  function reasonsKept(stats) {
    const cards = stats.cards || {};
    return Object.keys(cards).filter((id) => cards[id].lastCorrect === true).length;
  }
  function needsRetry(stats, id) {
    const c = (stats.cards || {})[id];
    return !!(c && c.lastCorrect !== true && c.attempts > 0);
  }
  function canAdvance(card) { return !!(card && card.lastCorrect === true); }
  function pickNextIndex(encounters, stats, currentIndex) {
    const list = encounters || []; if (!list.length) return 0;
    const cards = stats.cards || {}; const missed = []; const unseen = [];
    for (let i = 0; i < list.length; i++) {
      if (i === currentIndex) continue;
      const c = cards[list[i].id];
      if (c && c.lastCorrect !== true && c.attempts > 0) missed.push(i);
      else if (!c) unseen.push(i);
    }
    if (missed.length) return missed[0];
    if (unseen.length) return unseen[0];
    return (currentIndex + 1) % list.length;
  }
  function historyRows(encounters, stats) {
    const cards = stats.cards || {};
    return (encounters || []).map((e) => {
      const c = cards[e.id] || null; const kept = !!(c && c.lastCorrect === true);
      return { id: e.id, title: e.title, motif: e.motif, why: e.why, bestSan: e.bestSan, attempts: c ? c.attempts : 0, hits: c ? c.hits : 0, misses: c ? c.misses : 0, lastCorrect: c ? c.lastCorrect : null, lastSan: c ? c.lastSan : "", mastered: !!(c && c.mastered), needsRetry: !!(c && c.lastCorrect !== true && c.attempts > 0), status: !c ? "new" : c.mastered ? "kept" : kept ? "hot" : "retry" };
    });
  }
  function emptyDuel(nameA, nameB, encId) {
    const a = String(nameA || "Kid A").trim() || "Kid A";
    const b = String(nameB || "Kid B").trim() || "Kid B";
    return { names: [a, b], encId: encId || null, turn: 0, seats: [{ name: a, found: null, kept: null, san: "" }, { name: b, found: null, kept: null, san: "" }] };
  }
  function recordDuelSeat(duel, result) {
    const next = { names: duel.names.slice(), encId: duel.encId, turn: duel.turn, seats: duel.seats.map((s) => Object.assign({}, s)) };
    const seat = next.seats[next.turn];
    seat.found = !!result.found; seat.kept = !!result.kept; seat.san = result.san || "";
    return next;
  }
  function duelVerdict(duel) {
    const a = duel.seats[0]; const b = duel.seats[1];
    if (a.kept && b.kept) return { winner: "both", line: a.name + " and " + b.name + " both kept the why. Rematch the snack." };
    if (a.kept && !b.kept) return { winner: a.name, line: a.name + " kept the reason. " + b.name + " ate the snack story." };
    if (b.kept && !a.kept) return { winner: b.name, line: b.name + " kept the reason. " + a.name + " ate the snack story." };
    return { winner: "basement", line: "The basement wins. Neither kept the why. Try the same board again." };
  }
  const api = { emptyStats, cardOf, recordMove, recordAttempt, recordWhy, reasonsKept, needsRetry, canAdvance, pickNextIndex, historyRows, scheduleAfterKeep, scheduleAfterFail, dueReviews, pickWalkTarget, intervalList, INTERVALS, LEDGER_MAX, emptyDuel, recordDuelSeat, duelVerdict };
  root.ShockmateScore = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
