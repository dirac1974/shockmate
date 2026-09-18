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
  // Glitch's bragged rating. It is HIS number, so it can fall — the kid's own numbers never do.
  // Monotonic in cards earned, so it never creeps back up, and adding a pack later just gives
  // him further to fall. The joke is that his claim never changes while the truth slides.
  // Glitch's brag is pitched at the kids' own world, not at Stockfish: a 450 player dragging a
  // 1500 braggart down to their own level is a story they can read off any chess app. Each card
  // knocks a slice off whatever brag is left, so the movement stays visible and the floor is an
  // asymptote — later packs push him below the kids without any rebalancing.
  const BRAG = 1500, FLOOR = 300, KEEP = 0.93, CRIT_WEIGHT = 0.5;
  function glitchRating(stats) {
    const earned = (stats && stats.cardsEarned) || {};
    const ids = Object.keys(earned);
    const crits = ids.filter((id) => earned[id] && earned[id].critical).length;
    const left = (BRAG - FLOOR) * Math.pow(KEEP, ids.length + CRIT_WEIGHT * crits);
    const real = Math.max(FLOOR, Math.round((FLOOR + left) / 5) * 5);
    return { claimed: BRAG, real: real, drop: BRAG - real, floor: FLOOR,
      cards: ids.length, criticals: crits,
      fraction: (real - FLOOR) / (BRAG - FLOOR), floored: real <= FLOOR + 40 };
  }
  function ratingTaunt(r) {
    if (!r.cards) return "Glitch says he is " + r.claimed + ". He has not been tested yet.";
    if (r.floored) return "Glitch still says " + r.claimed + ". He is a 300 in a trench coat.";
    if (r.real <= 600) return "Glitch still says " + r.claimed + ". Nobody believes him now.";
    if (r.real <= 900) return "Glitch says " + r.claimed + ". The scoreboard disagrees.";
    if (r.real <= 1200) return "Glitch says " + r.claimed + " a bit more quietly now.";
    return "Glitch says he is " + r.claimed + ".";
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
  /* The kid's rank. It is HIS number, so it only ever climbs. The villain owns the falling one. */
  const RANKS = [
    { at: 0, title: "Rookie" }, { at: 2, title: "Cadet" }, { at: 5, title: "Field Agent" },
    { at: 9, title: "Senior Agent" }, { at: 14, title: "Timeline Warden" },
    { at: 19, title: "Glitch Hunter" }, { at: 23, title: "Time Marshal" },
  ];
  function agentRank(stats) {
    const cards = Object.keys((stats && stats.cardsEarned) || {}).length;
    let i = 0;
    for (let k = 0; k < RANKS.length; k++) { if (cards >= RANKS[k].at) i = k; }
    const next = RANKS[i + 1] || null;
    return { index: i, title: RANKS[i].title, cards: cards, next: next ? next.title : null,
      cardsToNext: next ? next.at - cards : 0, top: !next,
      fraction: next ? (cards - RANKS[i].at) / (next.at - RANKS[i].at) : 1 };
  }
  function rankedUp(before, after) { return after.index > before.index; }

  /* Glitch's own rating never comes back up; that trophy is permanent. Instead he sends a
     different crony each day, so there is always a fresh brag to knock down today. The daily
     number resets, the permanent one does not, and nothing the kid earned is ever taken back. */
  const CRONIES = [
    { name: "SPLINTER", claimed: 800, weak: "fork" }, { name: "RERUN", claimed: 950, weak: "counting" },
    { name: "STATIC", claimed: 1100, weak: "pin" }, { name: "LOOPHOLE", claimed: 1250, weak: "backRank" },
    { name: "PASTE", claimed: 700, weak: "hanging" }, { name: "WOBBLE", claimed: 875, weak: "skewer" },
    { name: "FLICKER", claimed: 1025, weak: "discovery" },
  ];
  function dateKey(ts) {
    const d = new Date(ts);
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }
  function cardsOnDay(stats, ts) {
    const earned = (stats && stats.cardsEarned) || {}, key = dateKey(ts);
    return Object.keys(earned).filter((id) => earned[id] && earned[id].t && dateKey(earned[id].t) === key);
  }
  function dailyChallenger(stats, ts) {
    const at = ts || Date.now();
    const ids = cardsOnDay(stats, at);
    const earned = (stats && stats.cardsEarned) || {};
    const crits = ids.filter((id) => earned[id] && earned[id].critical).length;
    const key = dateKey(at);
    const seed = key.split("-").reduce((a, x) => a + Number(x), 0);
    const crony = CRONIES[seed % CRONIES.length];
    const left = (crony.claimed - FLOOR) * Math.pow(KEEP, ids.length + CRIT_WEIGHT * crits);
    const real = Math.max(FLOOR, Math.round((FLOOR + left) / 5) * 5);
    return { name: crony.name, claimed: crony.claimed, real: real, drop: crony.claimed - real, weak: crony.weak || null,
      cardsToday: ids.length, criticalsToday: crits, dateKey: key,
      fraction: (real - FLOOR) / (crony.claimed - FLOOR), floored: real <= FLOOR + 40 };
  }
  // Lifetime points taken off Glitch himself. Derived from cards, so it only ever grows.
  function knockedOff(stats) { return BRAG - glitchRating(stats).real; }

  /* ---------- battle layer ----------
     The boss is today's crony. Correct moves land as hits and knock his number down. Abilities
     change damage, information the app already gives, or how Glitch reacts. They never change
     which move is right, so the engine stays the judge and the animation stays the teacher. */
  const ABILITIES = [
    { id: "double", name: "Double Strike", cost: 2, blurb: "Your next hit lands twice as hard." },
    { id: "tell", name: "Glitch's Tell", cost: 1, blurb: "Glitch flinches at the bait. Shows the move he WANTS you to play." },
    { id: "shield", name: "Time Shield", cost: 1, blurb: "Your next miss costs nothing, and Glitch does not get to gloat." },
    { id: "overcharge", name: "Overcharge", cost: 3, blurb: "Your next win is a guaranteed Critical." },
  ];
  const POWER_CAP = 5;
  function emptyBattle() {
    return { power: 0, kos: 0, bonus: {}, next: { double: false, shield: false, overcharge: false }, gear: {}, tellUsed: {}, bootsUsed: {} };
  }
  function battleOf(stats) {
    const b = Object.assign(emptyBattle(), (stats && stats.battle) || {});
    b.next = Object.assign({ double: false, shield: false, overcharge: false }, b.next);
    b.bonus = Object.assign({}, b.bonus); b.gear = Object.assign({}, b.gear); b.tellUsed = Object.assign({}, b.tellUsed); b.bootsUsed = Object.assign({}, b.bootsUsed);
    return b;
  }
  // Boss health is the crony's rating minus any extra damage abilities dealt today. Floored like everything else.
  function bossHp(stats, ts) {
    const at = ts || Date.now(), c = dailyChallenger(stats, at), b = battleOf(stats);
    const extra = b.bonus[c.dateKey] || 0;
    const hp = Math.max(FLOOR, c.real - extra);
    return { name: c.name, claimed: c.claimed, hp: hp, max: c.claimed, floor: FLOOR, weak: c.weak,
      fraction: (hp - FLOOR) / (c.claimed - FLOOR), ko: hp <= FLOOR, dateKey: c.dateKey, cardsToday: c.cardsToday };
  }
  // Power is the kid's number. It climbs on wins and only falls when he chooses to spend it.
  function earnPower(battle, crit) {
    const b = battleOf({ battle: battle });
    b.power = Math.min(POWER_CAP, b.power + 1 + (crit ? 1 : 0) + (hasGear(b, "gauntlets") ? 1 : 0));
    return b;
  }
  function abilityById(id) { return ABILITIES.filter((a) => a.id === id)[0] || null; }
  function canAfford(battle, id) { const a = abilityById(id); return !!a && battleOf({ battle: battle }).power >= a.cost; }
  function armAbility(battle, id) {
    const a = abilityById(id); if (!a || !canAfford(battle, id)) return battleOf({ battle: battle });
    const b = battleOf({ battle: battle });
    b.power -= a.cost; if (id !== "tell") b.next[id] = true;
    return b;
  }
  function disarm(battle, id) { const b = battleOf({ battle: battle }); b.next[id] = false; return b; }
  function addBonus(battle, dateKey, amount) {
    const b = battleOf({ battle: battle });
    b.bonus[dateKey] = (b.bonus[dateKey] || 0) + Math.max(0, Math.round(amount));
    return b;
  }
  function recordKo(battle) { const b = battleOf({ battle: battle }); b.kos += 1; return b; }

  /* Ability resolution. Pure, so the rules live in one place and the tests can hold them to it.
     None of these looks at the board. They only touch damage, the Critical roll, or Glitch's gloat. */
  function resolveHitDamage(battle, dmg, dateKey) {
    let b = battleOf({ battle: battle });
    const base = Math.max(0, Math.round(dmg));
    if (!b.next.double) return { battle: b, dmg: base, doubled: false };
    b = addBonus(disarm(b, "double"), dateKey, base);   // the second strike is the same blow again
    return { battle: b, dmg: base * 2, doubled: true };
  }
  function resolveCritical(battle, tier, guided, lastCritical, isBoss, roll) {
    let b = battleOf({ battle: battle });
    const eligible = tier === "best" && !guided;      // a guided win was shown the answer; it cannot crit
    const forced = eligible && b.next.overcharge;
    const natural = eligible && !lastCritical && (!!isBoss || roll < (hasGear(b, "visor") ? 1 / 4 : 1 / 6));
    if (forced) b = disarm(b, "overcharge");
    return { battle: b, crit: forced || natural, forced: forced };
  }
  function resolveMiss(battle) {
    const b = battleOf({ battle: battle });
    if (!b.next.shield) return { battle: b, shielded: false };
    return { battle: disarm(b, "shield"), shielded: true };
  }

  /* ---------- gear: passive powers on the kid's Time Agent ----------
     Slots open with rank and gear opens with rank. Two pieces share slot 1, so there is a real choice.
     Every passive is off the board: more power, a free Tell, a free shield, a better Critical roll. */
  const SLOTS = 3;
  const GEAR = [
    { id: "gauntlets", name: "Shock Gauntlets", slot: 1, rank: 1, blurb: "Every win charges one extra power." },
    { id: "goggles", name: "Tell Goggles", slot: 2, rank: 2, blurb: "One free Glitch's Tell every day." },
    { id: "boots", name: "Rewind Boots", slot: 3, rank: 3, blurb: "Your first miss each day is shielded for free." },
    { id: "visor", name: "Critical Visor", slot: 1, rank: 4, blurb: "Criticals land one time in four, not one in six." },
  ];
  function rankIndex(rank) { return rank && typeof rank.index === "number" ? rank.index : 0; }
  function slotsUnlocked(rank) { return Math.max(0, Math.min(SLOTS, rankIndex(rank))); }
  function gearById(id) { return GEAR.filter((g) => g.id === id)[0] || null; }
  function gearUnlocked(rank) { const i = rankIndex(rank); return GEAR.filter((g) => g.rank <= i); }
  function hasGear(battle, id) { const g = battleOf({ battle: battle }).gear; return Object.keys(g).some((k) => g[k] === id); }
  function equipGear(battle, slot, id, rank) {
    const b = battleOf({ battle: battle }), g = gearById(id);
    if (!g || g.slot !== slot || slot < 1 || slot > slotsUnlocked(rank)) return b;
    if (!gearUnlocked(rank).some((x) => x.id === id)) return b;
    Object.keys(b.gear).forEach((k) => { if (b.gear[k] === id) delete b.gear[k]; });
    b.gear["slot" + slot] = id;
    return b;
  }
  function unequipGear(battle, slot) { const b = battleOf({ battle: battle }); delete b.gear["slot" + slot]; return b; }

  // A crony's weakness is a chess motif. Beating him with that motif hits half again as hard. That is the lesson.
  const MOTIF_LABEL = { fork: "forks", pawnFork: "pawn forks", royalFork: "royal forks", counting: "counting", pin: "pins",
    skewer: "skewers", backRank: "the back rank", hanging: "free pieces", mateOverMaterial: "mate first", discovery: "hidden attacks",
    mateThreat: "mate threats", trapped: "trapped pieces", stalemateTrap: "stalemate traps", kingMarch: "king marches" };
  function motifLabel(m) { return MOTIF_LABEL[m] || m || ""; }
  function resolveWeakness(battle, dmg, motif, weak, dateKey) {
    const b = battleOf({ battle: battle }), base = Math.max(0, Math.round(dmg));
    if (!weak || motif !== weak) return { battle: b, dmg: base, weak: false };
    const extra = Math.round(base / 2);
    return { battle: addBonus(b, dateKey, extra), dmg: base + extra, weak: true };
  }
  function tellFree(battle, dateKey) { const b = battleOf({ battle: battle }); return hasGear(b, "goggles") && !b.tellUsed[dateKey]; }
  function useTell(battle, dateKey) { const b = battleOf({ battle: battle }); b.tellUsed[dateKey] = true; return b; }
  function bootsFree(battle, dateKey) { const b = battleOf({ battle: battle }); return hasGear(b, "boots") && !b.bootsUsed[dateKey]; }
  function useBoots(battle, dateKey) { const b = battleOf({ battle: battle }); b.bootsUsed[dateKey] = true; b.next.shield = true; return b; }

  /* ---------- prep: what to drill, from what he has actually missed ----------
     Cards carry their motif, so no join is needed. Weakest means lowest hit rate among motifs he
     has met, ties to more misses. Prep fights come from those motifs, misses first, then unseen. */
  function motifStats(stats) {
    const cards = (stats && stats.cards) || {}, out = {};
    Object.keys(cards).forEach(function (id) {
      const c = cards[id]; if (!c || !c.motif || !c.attempts) return;
      const m = out[c.motif] || (out[c.motif] = { motif: c.motif, attempts: 0, hits: 0, misses: 0, fights: 0, retry: 0 });
      m.attempts += c.attempts; m.hits += c.hits || 0; m.misses += c.misses || 0; m.fights += 1;
      if (c.lastCorrect !== true) m.retry += 1;
    });
    return Object.keys(out).map(function (k) { const m = out[k]; m.rate = m.attempts ? m.hits / m.attempts : 0; return m; });
  }
  function weakestMotifs(stats) {
    return motifStats(stats).sort(function (a, b) { return (a.rate - b.rate) || (b.misses - a.misses) || (b.attempts - a.attempts); });
  }
  function strongestMotifs(stats) { return weakestMotifs(stats).slice().reverse(); }
  function prepFights(stats, encounters, n) {
    const want = n || 4, list = encounters || [];
    const earned = (stats && stats.cardsEarned) || {}, cards = (stats && stats.cards) || {};
    const weak = weakestMotifs(stats).filter(function (m) { return m.rate < 1; }).map(function (m) { return m.motif; });
    const picked = [], seen = {};
    const take = function (e) { if (!seen[e.id] && picked.length < want) { seen[e.id] = true; picked.push(e); } };
    const missed = function (e) { const c = cards[e.id]; return !!(c && c.lastCorrect !== true && c.attempts > 0); };
    weak.forEach(function (mo) { list.forEach(function (e) { if (e.motif === mo && missed(e)) take(e); }); });
    weak.forEach(function (mo) { list.forEach(function (e) { if (e.motif === mo && !cards[e.id]) take(e); }); });
    list.forEach(function (e) { if (missed(e)) take(e); });
    list.forEach(function (e) { if (!cards[e.id]) take(e); });
    list.forEach(function (e) { if (earned[e.id]) take(e); });
    return picked;
  }
  // The two questions that stop a rusher. The first stops hung pieces; the second is the trap defence.
  const PREP_QUESTIONS = ["What did that move just attack?", "Why is he letting you take that?"];

  /* ---------- progress: what a parent can read off the data ----------
     Per motif: met, hit rate, misses, and a verdict. Good is a high rate over more than one attempt.
     Focus is a low rate or an open retry. New is not met yet. Cards by day gives the trend. */
  function motifVerdict(m) {
    if (!m || !m.attempts) return "new";
    if (m.retry > 0 || m.rate < 0.5) return "focus";
    if (m.attempts >= 2 && m.rate >= 0.75) return "good";
    return "ok";
  }
  function cardsByDay(stats, days, ts) {
    const earned = (stats && stats.cardsEarned) || {}, at = ts || Date.now(), n = days || 14, out = [];
    const ids = Object.keys(earned);
    for (let i = n - 1; i >= 0; i--) {
      const key = dateKey(at - i * 24 * 60 * 60 * 1000);
      out.push({ key: key, n: ids.filter(function (id) { return earned[id] && earned[id].t && dateKey(earned[id].t) === key; }).length });
    }
    return out;
  }
  function progressSummary(stats, encounters, ts) {
    const list = encounters || [], totals = {};
    list.forEach(function (e) { if (e.motif) totals[e.motif] = (totals[e.motif] || 0) + 1; });
    const met = {}; motifStats(stats).forEach(function (m) { met[m.motif] = m; });
    const order = { focus: 0, ok: 1, new: 2, good: 3 };
    const motifs = Object.keys(totals).map(function (mo) {
      const m = met[mo] || { motif: mo, attempts: 0, hits: 0, misses: 0, fights: 0, retry: 0, rate: 0 };
      return Object.assign({}, m, { label: motifLabel(mo), total: totals[mo], verdict: motifVerdict(met[mo]) });
    }).sort(function (a, b) { return (order[a.verdict] - order[b.verdict]) || (a.rate - b.rate) || (b.misses - a.misses); });
    const b = battleOf(stats);
    return {
      rank: agentRank(stats), cards: Object.keys((stats && stats.cardsEarned) || {}).length, total: list.length,
      kos: b.kos, power: b.power, knockedOff: knockedOff(stats), motifs: motifs, byDay: cardsByDay(stats, 14, ts),
      goodAt: motifs.filter(function (m) { return m.verdict === "good"; }).map(function (m) { return m.label; }),
      focusOn: motifs.filter(function (m) { return m.verdict === "focus"; }).map(function (m) { return m.label; }),
    };
  }

  const api = { glitchRating, ratingTaunt, agentRank, rankedUp, dailyChallenger, knockedOff, ABILITIES, POWER_CAP, emptyBattle, battleOf, bossHp, earnPower, abilityById, canAfford, armAbility, disarm, addBonus, recordKo, resolveHitDamage, resolveCritical, resolveMiss, GEAR, SLOTS, slotsUnlocked, gearUnlocked, gearById, hasGear, equipGear, unequipGear, motifLabel, resolveWeakness, motifStats, weakestMotifs, strongestMotifs, prepFights, PREP_QUESTIONS, motifVerdict, cardsByDay, progressSummary, tellFree, useTell, bootsFree, useBoots, cardsOnDay, dateKey, RANKS, CRONIES, emptyStats, cardOf, recordMove, recordAttempt, recordWhy, reasonsKept, needsRetry, canAdvance, pickNextIndex, historyRows, scheduleAfterKeep, scheduleAfterFail, dueReviews, pickWalkTarget, intervalList, INTERVALS, LEDGER_MAX, emptyDuel, recordDuelSeat, duelVerdict };
  root.ShockmateScore = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
