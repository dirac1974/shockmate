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
    const at = next.figurines.findIndex((f) => f.id === enc.id);
    const fig = at >= 0 ? (next.figurines[at] = Object.assign({}, next.figurines[at])) : null;   // copy: the recorders are pure
    if (fig) { fig.seen = (fig.seen || 0) + 1; fig.mastered = !!mastered; fig.why = enc.why; }
    else next.figurines.push({ id: enc.id, title: enc.title, room: enc.palaceRoom, mascot: enc.mascot, why: enc.why, mastered: !!mastered, seen: 1 });
  }
  function pushLedger(next, row) {
    next.ledger.push(row);
    if (next.ledger.length > LEDGER_MAX) next.ledger = next.ledger.slice(-LEDGER_MAX);
  }
  /* Think time. The clock starts when the think window opens after Glitch's arriving move and stops
     on the tap that commits the move. A rushed move is a WRONG move made in under four seconds: a fast
     right move is a kid who saw it, and is never counted against him. Only timed attempts count, so
     profiles from before the clock existed are not diluted. Both numbers only ever climb. */
  const RUSH_MS = 4000;
  function thinkMsOf(attempt) {
    const v = attempt && attempt.thinkMs;
    return typeof v === "number" && isFinite(v) && v >= 0 ? Math.round(v) : null;
  }
  function rushOf(stats) {
    const r = Object.assign({ moves: 0, rushed: 0 }, (stats && stats.rush) || {});
    return { moves: r.moves, rushed: r.rushed, rate: r.moves ? r.rushed / r.moves : 0 };
  }
  function recordMove(stats, enc, attempt) {
    const next = Object.assign({}, stats);
    next.cards = Object.assign({}, stats.cards || {});
    next.figurines = (stats.figurines || []).slice();
    next.ledger = (stats.ledger || []).slice();
    const correct = !!attempt.correct;
    const card = Object.assign({}, cardOf(next, enc.id));
    const thinkMs = thinkMsOf(attempt);
    if (thinkMs !== null) {
      const rush = { moves: rushOf(stats).moves + 1, rushed: rushOf(stats).rushed };
      card.thinkMs = thinkMs;
      if (!correct && thinkMs < RUSH_MS) { rush.rushed += 1; card.rushed = (card.rushed || 0) + 1; }
      next.rush = rush;
    }
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
    pushLedger(next, { id: enc.id, title: enc.title, motif: enc.motif, san: attempt.san || "", bestSan: enc.bestSan, correct: correct, kind: "move", why: enc.why, t: attempt.t || 0, thinkMs: thinkMs });
    return { stats: next, card: card, correct: correct, rushed: !correct && thinkMs !== null && thinkMs < RUSH_MS };
  }
  /* Cracked cards. A card won on the confession path (Glitch showed the answer, the kid played it) is
     still earned and still counts everywhere, but it is cracked. A later win on that board without the
     confession repairs it. That is the ONLY transition: clean never goes back to cracked, and a card
     from before the field existed reads as clean, so nothing on screen ever goes down. */
  function earnCard(prev, opts) {
    const o = opts || {}, had = !!prev;
    const e = Object.assign({ critical: false, tries: 0 }, prev || {});
    e.critical = !!(e.critical || o.critical);
    if (o.tries != null) e.tries = o.tries;
    if (o.t != null) e.t = o.t;
    if (o.tier != null) e.tier = o.tier;
    const wasClean = had && prev.clean !== false;
    const repaired = had && prev.clean === false && !o.guided;
    e.clean = wasClean || !o.guided;
    return { earned: e, cracked: !e.clean && !had, repaired: repaired };
  }
  function cardCracked(stats, id) {
    const e = ((stats && stats.cardsEarned) || {})[id];
    return !!(e && e.clean === false);
  }
  function crackedIds(stats) {
    const earned = (stats && stats.cardsEarned) || {};
    return Object.keys(earned).filter(function (id) { return earned[id] && earned[id].clean === false; });
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
    mateThreat: "mate threats", trapped: "trapped pieces", stalemateTrap: "stalemate traps", kingMarch: "king marches",
    pinTake: "pins", attackers: "extra attackers", goodBishop: "good and bad bishops", tradeChoice: "choosing the trade",
    counter: "counter-attacks", defend: "defending" };
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
     has met, ties to more misses. Order: misses in the weakest motifs, other misses, unseen fights
     in the weakest motifs, then the opening traps (the tournament failure mode), then anything.
     Misses always count; otherwise fights on the day he is on (`avoid`) are a last resort, so Prep never mirrors it. */
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
  // `prefer` names packs to reach for straight after the misses, ahead of the weak motifs. Camp passes
  // ["defence"] so a defence pack, once it exists, leads the drill. Left out, the order is unchanged.
  // Cracked cards lead, ahead of misses: a board he only won because Glitch confessed is the one he
  // most needs to win clean, and winning it clean is the only way the crack goes.
  function prepFights(stats, encounters, n, avoid, prefer) {
    const want = n || 4, all = encounters || [], skip = {};
    (avoid || []).forEach(function (id) { skip[id] = true; });
    const list = all.filter(function (e) { return !skip[e.id]; });
    const earned = (stats && stats.cardsEarned) || {}, cards = (stats && stats.cards) || {};
    const weak = weakestMotifs(stats).filter(function (m) { return m.rate < 1; }).map(function (m) { return m.motif; });
    const picked = [], seen = {};
    const take = function (e) { if (!seen[e.id] && picked.length < want) { seen[e.id] = true; picked.push(e); } };
    const missed = function (e) { const c = cards[e.id]; return !!(c && c.lastCorrect !== true && c.attempts > 0); };
    // A board he lost in his own game leads everything. It is the one position he has already been
    // punished on, so it is the one he will remember. They arrive in `encounters`, newest first.
    all.forEach(function (e) { if (e.pack === "game") take(e); });
    all.forEach(function (e) { if (earned[e.id] && earned[e.id].clean === false) take(e); });
    weak.forEach(function (mo) { all.forEach(function (e) { if (e.motif === mo && missed(e)) take(e); }); });
    all.forEach(function (e) { if (missed(e)) take(e); });
    (prefer || []).forEach(function (pk) { list.forEach(function (e) { if (e.pack === pk && !cards[e.id]) take(e); }); });
    (prefer || []).forEach(function (pk) { list.forEach(function (e) { if (e.pack === pk) take(e); }); });
    weak.forEach(function (mo) { list.forEach(function (e) { if (e.motif === mo && !cards[e.id]) take(e); }); });
    list.forEach(function (e) { if (e.pack === "openings" && !cards[e.id]) take(e); });
    list.forEach(function (e) { if (e.pack === "openings") take(e); });
    list.forEach(function (e) { if (!cards[e.id]) take(e); });
    list.forEach(function (e) { take(e); });
    all.forEach(function (e) { take(e); });
    return picked;
  }
  /* ---------- play: five of Glitch's cronies, as five levels ----------
     A pure table. `skill` and `depth` are handed straight to Stockfish; `random` is how often the
     crony shrugs and plays a legal move at random; `blunder` is how often he picks a worse move out
     of MultiPV on purpose, so the mistake still looks like a move a person would make. Nothing here
     locks: the kid picks any row before every game, always. */
  const LEVELS = [
    { id: "sleepy", name: "Sleepy", rating: 300, skill: 0, depth: 1, multipv: 4, random: 0.5, blunder: 0,
      blurb: "Barely awake", say: "Sleepy? He plays with his eyes shut. Fine. Take the free one." },
    { id: "rookie", name: "Rookie", rating: 500, skill: 1, depth: 2, multipv: 4, random: 0, blunder: 0.25,
      blurb: "Sees one move", say: "Rookie. He hangs things. Do NOT tell him I said that." },
    { id: "cadet", name: "Cadet", rating: 750, skill: 3, depth: 4, multipv: 3, random: 0, blunder: 0.12,
      blurb: "Sees the capture", say: "Cadet actually looks at the board. Sometimes twice." },
    { id: "agent", name: "Agent", rating: 1000, skill: 6, depth: 6, multipv: 3, random: 0, blunder: 0.05,
      blurb: "Punishes a hang", say: "Agent. He counts. You do not. This will be short." },
    { id: "marshal", name: "Marshal", rating: 1300, skill: 10, depth: 8, multipv: 1, random: 0, blunder: 0,
      blurb: "Plays properly", say: "Marshal?! Nobody picks Marshal. Nobody sane." },
  ];
  function levelIndex(id) {
    for (let i = 0; i < LEVELS.length; i++) { if (LEVELS[i].id === id) return i; }
    return -1;
  }
  function levelById(id) { const i = levelIndex(id); return i < 0 ? null : LEVELS[i]; }
  function levelAt(i) { return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, i || 0))]; }
  function levelName(id) { const l = levelById(id); return l ? l.name : ""; }

  /* Everything a game leaves behind. Every counter only ever climbs, and `bestLevelWon` never slides
     back down a rung, so a bad evening cannot take last week's win off the screen. */
  function emptyGames() { return { played: 0, wins: 0, draws: 0, losses: 0, byLevel: {}, recent: [], bestLevelWon: null }; }
  function gamesOf(stats) {
    const g = Object.assign(emptyGames(), (stats && stats.games) || {});
    g.byLevel = Object.assign({}, g.byLevel);
    Object.keys(g.byLevel).forEach(function (k) { g.byLevel[k] = Object.assign({ played: 0, wins: 0 }, g.byLevel[k]); });
    g.recent = (g.recent || []).slice();
    return g;
  }
  const GAMES_RECENT = 10;
  function recordGame(stats, res) {
    const r = res || {}, next = Object.assign({}, stats || {});
    const g = gamesOf(stats);
    const id = levelById(r.level) ? r.level : LEVELS[0].id;
    const result = r.result === "win" || r.result === "draw" ? r.result : "loss";
    const row = { level: id, result: result, blunders: Math.max(0, Math.round(r.blunders || 0)),
      moves: Math.max(0, Math.round(r.moves || 0)), resigned: !!r.resigned, t: r.t || Date.now() };
    g.played += 1;
    if (result === "win") g.wins += 1; else if (result === "draw") g.draws += 1; else g.losses += 1;
    const by = g.byLevel[id] = Object.assign({ played: 0, wins: 0 }, g.byLevel[id]);
    by.played += 1; if (result === "win") by.wins += 1;
    if (result === "win" && levelIndex(id) > levelIndex(g.bestLevelWon)) g.bestLevelWon = id;
    g.recent = [row].concat(g.recent).slice(0, GAMES_RECENT);
    next.games = g;
    return { stats: next, games: g, row: row };
  }
  function gameBlunderRate(rows) {
    const moves = rows.reduce(function (a, r) { return a + (r.moves || 0); }, 0);
    const blunders = rows.reduce(function (a, r) { return a + (r.blunders || 0); }, 0);
    return moves ? blunders / moves : 0;
  }
  /* Which crony to offer next. Pure, and only ever a suggestion: the chip row stays open and the
     parent never pins a level. A win with at most one blunder moves him up; two losses in the last
     five at that level, or better than a third of his moves dropping material, moves him down. */
  const SUGGEST_UP_BLUNDERS = 1, SUGGEST_DOWN_LOSSES = 2, SUGGEST_DOWN_RATE = 0.35, SUGGEST_FRESH_FIRST = 0.7, SUGGEST_FRESH_CARDS = 10;
  /* What Glitch says about the suggestion. `first` and `fresh` always name the same crony, so they are
     said whole; `up`, `down` and `again` name two, so the bubble carries {level} (the one offered) and
     {prev} (the one just played) and the audio is the same line without either name. */
  const SUGGEST_SAY = {
    first: lineTable("smug", "g-suggest-first", [
      "Pick Rookie. You'll need the head start.",
      "Rookie first. Everyone starts with Rookie. Except me. I was born brilliant.",
      "Start with Rookie. He's clumsy. You'll like him.",
      "Rookie. He drops things. Mostly his own pieces.",
      "Rookie for your first game. I'm being generous. Don't get used to it.",
      "First game? Rookie. I told him to go easy. He won't listen.",
      "Try Rookie. He's new. You're new to full games. Perfect match.",
      "Rookie. Perfect for a warm-up. Mine, not yours.",
      "Rookie first. Then we'll talk about the scary ones.",
      "Pick Rookie. He trips over his own horse."]),
    fresh: lineTable("smug", "g-suggest-fresh", [
      "Cadet. You solve my traps first go, so let us see you actually play one.",
      "Cadet. You're good at my puzzles. Games are different. Heh.",
      "Try Cadet. Your fights say you're ready. I say you're not.",
      "Cadet. He looks at the board. Sometimes twice.",
      "Your cards are too good. Cadet will fix that.",
      "Cadet. He's read a whole chess book. Well, the cover.",
      "You're quick at my traps. Cadet has traps too. Worse ones.",
      "Skip Rookie. Cadet's waiting. He's polished his buttons.",
      "Cadet. First go on my fights? Show-off. Go on then.",
      "Cadet. I'd pick Rookie. Which is why you should pick Cadet."]),
    up: lineTable("smug", "g-suggest-up", [
      ["{level}. You beat {prev}, and I am not proud of him.", "Move up. You beat him, and I am not proud of him."],
      ["{level}. {prev} is crying in a cupboard. Move up.", "Move up. The last one is crying in a cupboard."],
      ["You beat {prev}? Fine. Try {level}. He's meaner.", "You beat him? Fine. Try the next one. He's meaner."],
      ["{level} next. {prev} has been demoted to snack duty.", "Next one up. The last one has been demoted to snack duty."],
      ["{level}. {prev} was a warm-up. I planned that.", "Move up. That was a warm-up. I planned that."],
      ["Up you go. {level}. Don't get comfy.", "Up you go. Don't get comfy."],
      ["{level}. In another timeline, {prev} won. Not this one.", "Move up. In another timeline, he won. Not this one."],
      ["{prev} lost. {level} is better. Probably. I hope.", "He lost. The next one is better. Probably. I hope."],
      ["{level}. I told {prev} to try harder. He didn't.", "Move up. I told him to try harder. He didn't."],
      ["{level} now. {prev}'s rating just fell off a cliff.", "Next one up. His rating just fell off a cliff."]]),
    down: lineTable("smug", "g-suggest-down", [
      ["{level}. Take the head start. I insist. I INSIST.", "One down. Take the head start. I insist. I INSIST."],
      ["{level}. One step down. Even I practise on easy mode.", "One step down. Even I practise on easy mode."],
      ["Try {level}. {prev} is being a bully today.", "Try the easier one. That last one is being a bully today."],
      ["{level}. Warm up there. Then come back and get {prev}.", "Warm up on the easier one. Then come back and get him."],
      ["{level}. Not a step back. A run-up.", "Not a step back. A run-up."],
      ["{prev} is on a lucky streak. Try {level} for a bit.", "He's on a lucky streak. Try the easier one for a bit."],
      ["{level}. Win a few. Then we'll talk.", "The easier one. Win a few. Then we'll talk."],
      ["{level}. Even heroes train on the small ones.", "Even heroes train on the small ones."],
      ["Go {level}. {prev} has had too many snacks. He's hyper.", "Go one down. He's had too many snacks. He's hyper."],
      ["{level}. Practise the looking. Then the winning.", "One down. Practise the looking. Then the winning."]]),
    again: lineTable("taunt", "g-suggest-again", [
      ["{level} again. You did not finish him off last time.", "Same one again. You did not finish him off last time."],
      ["{level} again. He's been bragging all week.", "Same again. He's been bragging all week."],
      ["{level}. Rematch! I brought popcorn.", "Rematch! I brought popcorn."],
      ["{level} again. Unfinished business. My favourite kind.", "Same again. Unfinished business. My favourite kind."],
      ["Round two with {level}. Or three. I lost count.", "Round two. Or three. I lost count."],
      ["{level} again. He says he's ready. He always says that.", "Same one. He says he's ready. He always says that."],
      ["{level}. Same crony, new timeline.", "Same crony, new timeline."],
      ["{level} again? Brave. Or stubborn. I like stubborn.", "Same again? Brave. Or stubborn. I like stubborn."],
      ["{level}. He's still here. Still grumpy.", "He's still here. Still grumpy."],
      ["Back to {level}. He's polished his king.", "Back to him. He's polished his king."]]),
  };
  // Each crony's own line (LEVELS[].say) speaks under this key.
  function levelSayKey(id) { return levelById(id) ? "g-level-" + id : null; }
  function suggestLevel(stats) {
    const g = gamesOf(stats), recent = g.recent || [];
    // `sayKind` and `vars` let the screen pick any line of that kind; `say` is always line one, so the
    // suggestion itself stays a pure, repeatable answer.
    const out = function (i, reason, kind, prev) {
      const l = levelAt(i), vars = { level: l.name, prev: prev || "" };
      return { level: l.id, index: levelIndex(l.id), name: l.name, reason: reason,
        say: fillLine(SUGGEST_SAY[kind].lines[0], vars), sayKind: kind, vars: vars, sayKey: lineKey(SUGGEST_SAY[kind], 0) };
    };
    if (!recent.length) {
      const ft = firstTryRate(stats);
      if (ft.cards >= SUGGEST_FRESH_CARDS && ft.rate >= SUGGEST_FRESH_FIRST) {
        return out(levelIndex("cadet"),
          "No games yet, but " + Math.round(ft.rate * 100) + "% of his cards were first try over " + ft.cards + " fights.", "fresh");
      }
      return out(levelIndex("rookie"), "No games yet. Rookie is where a first game starts.", "first");
    }
    const id = recent[0].level, i = levelIndex(id), here = levelAt(i);
    const at = recent.filter(function (r) { return r.level === id; }).slice(0, 5);
    const losses = at.filter(function (r) { return r.result === "loss"; }).length;
    const rate = gameBlunderRate(at);
    const last = at[0] || recent[0];
    const promote = last.result === "win" && (last.blunders || 0) <= SUGGEST_UP_BLUNDERS;
    const demote = losses >= SUGGEST_DOWN_LOSSES || rate > SUGGEST_DOWN_RATE;
    if (promote && !demote && i < LEVELS.length - 1) {
      return out(i + 1, "Beat " + here.name + " with " + (last.blunders ? "one blunder" : "no blunders") + ".", "up", here.name);
    }
    if (demote && i > 0) {
      const why = losses >= SUGGEST_DOWN_LOSSES
        ? losses + " losses in his last " + at.length + " against " + here.name + "."
        : Math.round(rate * 100) + "% of his moves against " + here.name + " dropped material.";
      return out(i - 1, why, "down", here.name);
    }
    return out(i, at.length + " game" + (at.length === 1 ? "" : "s") + " against " + here.name + ", nothing settled yet.", "again", here.name);
  }

  /* ---------- versus: the two kids, on one phone ----------
     Everything a versus game leaves behind belongs to ONE kid. There is deliberately no field here
     that pairs the two of them — no opponent name, no head-to-head, no "wins against". `results` is
     this kid's own scoresheet, the way a tournament crosstable row is his and not his opponent's,
     and every counter only ever climbs.

     None of it reaches suggestLevel. Which crony a kid is offered is about his chess; his sibling
     has nothing to do with it, and a Sunday of losing to a brother must not send him down a rung. */
  const VERSUS_RECENT = 10, BEST_MOVES_MAX = 20;
  function emptyVersus() { return { played: 0, asWhite: 0, asBlack: 0, results: { win: 0, draw: 0, loss: 0 }, recent: [] }; }
  function versusOf(stats) {
    const v = Object.assign(emptyVersus(), (stats && stats.versus) || {});
    v.results = Object.assign({ win: 0, draw: 0, loss: 0 }, v.results);
    v.recent = (v.recent || []).slice();
    return v;
  }
  function bestMovesOf(stats) { return ((stats && stats.bestMoves) || []).slice(); }
  // Newest first, one per move, capped like a binder room. Nothing is dropped for being old until
  // twenty newer ones have arrived.
  function storeBestMoves(list, fresh, cap) {
    const max = cap == null ? BEST_MOVES_MAX : cap, out = [], seen = {};
    [].concat(fresh || [], list || [])
      .filter(function (m) { return m && m.san; })
      .sort(function (a, b) { return (b.t || 0) - (a.t || 0); })
      .forEach(function (m) {
        const k = (m.t || 0) + "|" + m.san + "|" + (m.fen || "");
        if (seen[k] || out.length >= max) return;
        seen[k] = 1; out.push(m);
      });
    return out;
  }
  function recordVersus(stats, res) {
    const r = res || {}, next = Object.assign({}, stats || {});
    const v = versusOf(stats);
    const colour = r.colour === "b" ? "b" : "w";
    const result = r.result === "win" || r.result === "draw" ? r.result : "loss";
    const row = { colour: colour, result: result, blunders: Math.max(0, Math.round(r.blunders || 0)),
      matched: Math.max(0, Math.round(r.matched || 0)), moves: Math.max(0, Math.round(r.moves || 0)), t: r.t || Date.now() };
    v.played += 1;
    if (colour === "w") v.asWhite += 1; else v.asBlack += 1;
    v.results[result] += 1;
    v.recent = [row].concat(v.recent).slice(0, VERSUS_RECENT);
    next.versus = v;
    if (r.bestMoves && r.bestMoves.length) next.bestMoves = storeBestMoves(bestMovesOf(stats), r.bestMoves, BEST_MOVES_MAX);
    return { stats: next, versus: v, row: row };
  }

  // Why Prep holds what it holds, for the chip and the blurb: his misses, or traps while he has none.
  function prepSource(stats) {
    const cards = (stats && stats.cards) || {};
    return Object.keys(cards).some(function (id) { const c = cards[id]; return c && c.attempts > 0 && c.lastCorrect !== true; }) ? "misses" : "traps";
  }
  // The two questions that stop a rusher. The first stops hung pieces; the second is the trap defence.
  const PREP_QUESTIONS = ["What did that move just attack?", "Why is he letting you take that?"];
  // The second question only makes sense when something is on offer: Glitch's bait is a capture.
  // Asking it over a quiet endgame teaches the kid that the questions are noise.
  function offersBait(enc) {
    const m = enc && enc.moves && enc.moves[enc.tempting || enc.bait];
    return !!(m && m.san && m.san.indexOf("x") >= 0);
  }
  function prepQuestionsFor(enc) { return offersBait(enc) ? PREP_QUESTIONS.slice() : PREP_QUESTIONS.slice(0, 1); }

  /* Look first. In Tournament week and inside Camp, a fight whose arriving move attacks something opens
     with one tap on what it attacked, before the think window and before the think clock. Outside
     those it stays off: normal days are fast by design. The targets come from futures.js
     (threatTargets), passed in or carried on the fight, so this file never has to read a board. */
  function lookFirst(settings, inCamp, enc, targets) {
    const t = targets != null ? targets : enc && (enc.threatTargets || enc.targets);
    const n = Array.isArray(t) ? t.length : Math.max(0, Number(t) || 0);
    if (!enc || !n) return false;
    return !!(inCamp || (settings && settings.tournament));
  }
  // The look-first gate never holds him longer than this: one hint after two wrong taps, and on the
  // third wrong tap it shows him the answer and opens the think window anyway.
  const LOOK = { hintAfter: 2, giveAfter: 3 };

  /* ---------- what Glitch says: every table, one picker ----------
     Every line he says lives in a table with a mood and a voice prefix (`vk`); line i speaks as
     `vk-(i+1)` from web/voice/, so the bubble and the audio are the same words. An entry is either a
     string (shown and spoken) or [shown, spoken]: the shown half may carry {name}/{level}/{prev},
     the spoken half never does, because all audio is pre-generated. `silent` tables are shown only
     (the think window stays quiet). tools/voice/glitch_lines.js walks every table in the app. */
  function lineTable(mood, vk, entries, opts) {
    const t = { mood: mood, vk: vk, lines: [], speak: [] };
    (entries || []).forEach(function (e) {
      if (Array.isArray(e)) { t.lines.push(e[0]); t.speak.push(e[1]); } else { t.lines.push(e); t.speak.push(null); }
    });
    if (opts && opts.silent) t.silent = true;
    if (opts && opts.voice) t.voice = opts.voice;
    return t;
  }
  function lineKey(table, i) {
    if (!table || i == null || i < 0) return null;
    if (table.keys) return table.keys[i] || null;
    return table.vk ? table.vk + "-" + (i + 1) : null;
  }
  function spokenLine(table, i) { return (table.speak && table.speak[i]) || table.lines[i]; }
  function fillLine(text, vars) {
    const v = vars || {};
    return String(text || "").replace(/\{(name|level|prev)\}/g, function (m, k) { return v[k] != null ? String(v[k]) : "You"; });
  }
  /* Anti-repeat. `history` is the keys of the last lines said at this moment, newest last. The pick is
     random among every line NOT in the last LINE_WINDOW (or all but the last one, for a table too small
     to hold the window). Pure: the caller stores the history it gets back, rng is injectable. */
  const LINE_WINDOW = 5;
  function pickLine(table, history, rng) {
    const hist = Array.isArray(history) ? history.slice() : [];
    if (!table || !table.lines || !table.lines.length) return { text: "", speak: "", mood: "taunt", index: -1, key: null, history: hist };
    const n = table.lines.length, win = Math.min(LINE_WINDOW, n - 1);
    const recent = win > 0 ? hist.slice(-win) : [];
    const open = [];
    for (let i = 0; i < n; i++) if (recent.indexOf(lineKey(table, i) || String(i)) < 0) open.push(i);
    const r = typeof rng === "function" ? rng : Math.random;
    const i = open[Math.min(open.length - 1, Math.floor(r() * open.length))];
    const key = lineKey(table, i) || String(i);
    return { text: table.lines[i], speak: spokenLine(table, i), mood: table.mood, index: i,
      key: table.silent ? null : lineKey(table, i), history: hist.concat(key).slice(-LINE_WINDOW) };
  }

  /* Glitch reacts to every new moment the way he reacts in a fight: a line and a mood. Purple
     time-goblin, vain, a sore loser, fake-confident; never mean about the kid. Running gags: his
     nine-thousand rating, other timelines, his cronies, his snacks. */
  const GLITCH_LINES = {
    lookRight: lineTable("nervous", "g-look-right", [
      "You SAW that? Nobody sees that.",
      "Who told you to look? Stop looking.",
      "Ugh. Eyes open. That is cheating.",
      "Fine, you spotted it. Doesn't mean you'll stop it.",
      "How? I hid that one behind a whole other timeline.",
      "Lucky tap. I am rated nine thousand, and I say lucky.",
      "Don't look at my moves! They're private!",
      "You looked FIRST? Before moving? Who does that?",
      "Okay. Okay. You found it. I have other plans. Somewhere.",
      "Spotted. Great. Now I have to think of something new.",
      "That was supposed to be a surprise. Surprise ruined.",
      "Stop reading my mind. It's full of snacks and secrets.",
      "Marshal said you'd never see that. Marshal is fired.",
      "Hmph. Your eyes are faster than my tricks today.",
      "Right piece. I hate it when it's the right piece.",
      "Seen? Already? I had a whole speech ready."]),
    lookWrong: lineTable("smug", "g-look-wrong", [
      "Wrong one. Keep guessing.",
      "Nope. Not even close.",
      "Ha! Look again. Or don't.",
      "Warm. No, cold. Freezing.",
      "That one? I didn't even touch that one.",
      "Nope. My move was pointing somewhere else.",
      "Wrong square! I'm writing that in my rating book.",
      "Not that. Follow my piece. Where can it bite?",
      "Ooh, nope. Try the piece I just moved.",
      "Wrong! This timeline is going great for me.",
      "Nah. Look where my piece is aiming.",
      "Missed! I'm doing a little dance now.",
      "Not it. Think like a goblin. A hungry goblin.",
      "Nope! Try again. I'll wait. I love waiting.",
      "Cold. Colder. Ice cream cold.",
      "That piece is safe. For now. Look somewhere else."]),
    lookGive: lineTable("smug", "g-look-give", [
      "There. THAT is what I hit. Too slow.",
      "I'll show you, since you can't see it.",
      "My move, my target. Write that down.",
      "Right there. I was pointing at it the whole time.",
      "See it now? That's the one my piece was after.",
      "That one. Glowing. You can have the answer. Just this once.",
      "Look. THAT is my snack. Next time, spot it first.",
      "Here's the secret. It's that one. Don't tell anyone.",
      "That's what I attacked. Now you know. Ugh, now you know.",
      "There it is. In another timeline, you spotted it first."]),
    cracked: lineTable("smug", "g-crack", [
      "Ha! Cracked. That one's still half mine.",
      "Cracked! I had to SHOW you. Still counts as mine.",
      "A cracked card. I'm keeping the other half.",
      "Cracked! That card has my fingerprints all over it.",
      "A crack! I'm framing it. Next to my fake trophy.",
      "You won, but with my help. So I sort of won. Sort of.",
      "Cracked card! Win it clean and I'll cry. Probably.",
      "That crack is my autograph. You're welcome.",
      "Half a card for you, half a victory for me.",
      "Ha! Cracked like a biscuit. My favourite biscuit."]),
    repaired: lineTable("rage", "g-repair", [
      "You fixed it?! That crack was MINE!",
      "No no no. Clean? Without my help?!",
      "My crack! You patched my beautiful crack!",
      "Clean?! I was USING that crack!",
      "You glued it! Who gave you glue?!",
      "No crack? NO CRACK?! This timeline is broken.",
      "Perfect again. I hate perfect. Perfect is rude.",
      "I had half that card! Give me my half!",
      "Fixed?! I'm telling Marshal. He'll be furious. He won't care.",
      "It's all shiny now. Disgusting. Beautiful. Disgusting!"]),
    pacing: lineTable("taunt", "g-pacing", [
      "Two days already? Your hand is faster than your eyes. Camp instead?",
      "Keep rushing. I LOVE it when you rush. Or... Camp?",
      "Speed is my favourite thing about you. Camp first, if you dare.",
      "Faster! Faster! Oh wait, faster is how I win. Camp?",
      "Two days in one go. My cronies need a lie-down. Camp?",
      "You're rushing. I LOVE rushing. That's why you should try Camp.",
      "Another day? Sure. Or Camp, where you practise looking first.",
      "Slow down? Never. Please never. Unless... Camp.",
      "My cronies are exhausted. Come and bother me at Camp instead.",
      "Even I take snack breaks. Camp is basically a snack break. With chess."]),
    // Camp
    campStart: lineTable("smug", "g-camp-start", [
      "Camp? You? This should be quick.",
      "Camp! I brought a whistle and a clipboard. Both stolen.",
      "Training day. I'll be training too. At napping.",
      "Camp. Spot my attacks, win my fights. Easy for me to say.",
      "Welcome to Camp. I'm the counsellor. The evil one.",
      "Camp again? Fine. I've invented new traps. Four of them. Maybe two.",
      "Tournament prep? My rating is nine thousand. I never prep.",
      "Camp! Rule one: Glitch wins. Rule two: see rule one.",
      "Oh good, Camp. I love watching you practise. I mean, I hate it.",
      "Camp! My snacks are in the fridge. Don't touch them. Look at the board."]),
    campWatch: lineTable("smug", "g-camp-watch", [
      "Watch closely. Or don't.",
      "Here comes my move. Blink and you miss it.",
      "Watch my piece. It's up to something.",
      "Moving now. Try to keep up.",
      "My move. Very sneaky. Extremely sneaky.",
      "Eyes on the board. Not on my handsome face.",
      "Here I go. What am I aiming at? Guess.",
      "Watch this. I've practised it in nine timelines.",
      "One move from me. One question for you.",
      "Tiptoe, tiptoe. Did you see that?"]),
    campSpotted: lineTable("nervous", "g-camp-spotted", [
      "…lucky.",
      "Lucky. Again. Suspiciously lucky.",
      "Fine. You saw it. The next one's harder. Probably.",
      "Stop spotting things!",
      "How are you seeing all of these?",
      "Hmph. Beginner's luck. For the ninth time.",
      "Okay, that one was obvious. The next one isn't.",
      "You found them all. I'm hiding the next one better.",
      "Spotted. I'm writing a complaint.",
      "Ugh. My tricks need a nap. So do I."]),
    campNope: lineTable("smug", "g-camp-nope", [
      "Not that one.",
      "Nope. Look again.",
      "Not that. Where can my piece reach?",
      "Wrong one. Ha!",
      "Nope! Try the one I'm aiming at.",
      "That's not it. I'm aiming somewhere scarier.",
      "Nah. Follow my piece.",
      "Not that one. So close. Not really.",
      "Wrong! Keep looking.",
      "Nope. That piece is perfectly safe."]),
    // The fight itself, around the per-fight taunt / gloat / rage
    tease: lineTable("nervous", "g-fight-tease", [
      "Wait. Wait. Which future is this…",
      "Hold on. Which timeline did you pick?",
      "Uh oh. Or... yay? Let me check.",
      "Splitting time… please be my future. Please.",
      "Don't look at me. I'm calculating. Loudly.",
      "Wait. Is this the good one? For me, I mean."]),
    shield: lineTable("nervous", "g-fight-shield", [
      "Hey! Where did my gloat go?",
      "A shield?! I had a speech ready!",
      "No fair! My gloat bounced off!",
      "Shield?! Who sells shields? I want a refund.",
      "My gloat hit a wall. A time wall. Rude.",
      "I'm not even ALLOWED to gloat. Unbelievable."]),
    second: lineTable("nervous", "g-fight-second", [
      "Sweating? Me? Never.",
      "Second try. I'm not nervous. That's just goblin sweat.",
      "Go again. I'm totally calm. Totally.",
      "Another try? Fine. It's still my board.",
      "Try again. I've hidden my snacks, just in case.",
      "One more go. Don't find it. Please don't find it."]),
    confess: lineTable("nervous", "g-fight-confess", [
      "Fine. FINE. Here is what I was scared of.",
      "Okay, I'll show you. But I'm not happy about it.",
      "Here's the move that scares me. Don't tell anyone.",
      "This is the one I was hiding. Look. Ugh.",
      "Fine! Here's the good future. My least favourite future.",
      "I'll show you. Just this once. With my eyes shut."]),
    whyGate: lineTable("hide", "g-fight-why", [
      "Don't say it. Don't you DARE say why…",
      "No, no. You don't need to know WHY.",
      "Don't tap it. Don't prove it. Please.",
      "Why? Nobody needs a why. Why do you need a why?",
      "Shh. Keep the reason a secret. For me.",
      "If you tap the right pieces, I scream."]),
    whyNope: lineTable("smug", "g-fight-nope", [
      "Nope.",
      "Nope! Not that one.",
      "Ha! Wrong piece.",
      "Not that one. Keep guessing.",
      "Nah. Try again.",
      "Wrong! I love wrong."]),
    bigger: lineTable("nervous", "g-fight-bigger", [
      "There was a BIGGER one…",
      "That works. But there was a BIGGER one. Heh.",
      "Good. Not best. I'll take good.",
      "You won. Just. The best move was scarier.",
      "Fine, you hit me. A bigger move was sitting right there.",
      "Ow. But it could have been OW. There was a bigger one."]),
    ko: lineTable("hide", "g-fight-ko", [
      ["{name}? Never heard of him.", "Never heard of him."],
      ["{name} is done. He was never my favourite.", "He was never my favourite anyway."],
      ["{name}? Knocked out? I'll get a new crony. A better one.", "Knocked out? I'll get a new crony. A better one."],
      ["Down goes {name}. I was going to fire him anyway.", "Down he goes. I was going to fire him anyway."],
      ["{name}! Get up! No? Fine. Lie there.", "Get up! No? Fine. Lie there."],
      ["{name} is out. I'm pretending I don't know him.", "He's out. I'm pretending I don't know him."]]),
    hotSeat: lineTable("smug", "g-fight-hotseat", [
      "Your turn. Same board. No peeking at the answer.",
      "Next player! Same trap. Still delicious.",
      "Swap! Same board. I've forgotten everything. Honest.",
      "Your go. Same board. Pretend you didn't see anything.",
      "Seat two! Same trap, fresh snack. I mean player.",
      "New player, same board. Let's see if you fall for it."]),
    peek: lineTable("rage", "g-fight-peek", [
      "Ugh. THAT one.",
      "That one. The one I was hoping you'd miss.",
      "Fine. Here's the BIG one. Happy?",
      "This is the move I have nightmares about.",
      "Don't look at it! Too late. You looked.",
      "The biggest one. My least favourite move in history."]),
    // Setting up a phone for the family: one line per step, said once.
    famCode: lineTable("taunt", "g-family-code", ["A family code! Let's see who's in it."]),
    famNew: lineTable("smug", "g-family-new", ["New phone? I need to know who I'm tormenting."]),
    famMade: lineTable("smug", "g-family-made", ["A family. Two phones, twice the trouble. Share that code."]),
    famFound: lineTable("taunt", "g-family-found", ["Found them. Which one of you is holding this phone?"]),
    famNames: lineTable("taunt", "g-family-names", ["Names first. I'll be rude to both equally."]),
    famJoin: lineTable("taunt", "g-family-join", ["Got a code? Type it in."]),
    /* Flash. The reveal line is said as the board arrives and then he shuts up: the five seconds of
       looking are a think window like any other. The poof, the reaction and the debrief are loud. */
    flashReveal: lineTable("smug", "g-flash-reveal", [
      "Memorise THAT. Go on.",
      "Look fast. I'm taking it away.",
      "Study my beautiful board. Briefly.",
      "Photograph it with your eyes. Ha! You can't.",
      "Look now. Regret later.",
      "This board is only visiting.",
      "Stare hard. It won't help.",
      "Here it is. Enjoy. Briefly.",
      "Eyes open, brain on. Good luck.",
      "One board. One look. Off you go.",
      "Drink it in. I'm thirsty for your mistakes."]),
    flashHide: lineTable("smug", "g-flash-hide", [
      "Poof. Timeline wiped.",
      "Gone! Where did it go? I know. You don't.",
      "Whoops. I deleted the board.",
      "Vanished. Like my rating. No, wait, forget that.",
      "Empty. Just you and your memory.",
      "I put it in a drawer. In another timeline.",
      "Board's gone. Panic now.",
      "Erased! That is my favourite trick.",
      "Poof! And the snacks went with it.",
      "Nothing left. Except the question."]),
    flashRight: lineTable("nervous", "g-flash-right", [
      "You REMEMBERED that?",
      "How? It wasn't even there!",
      "Stop seeing things that aren't on the board!",
      "Ugh. Right again. My poof is broken.",
      "Nobody has a memory like that. Nobody.",
      "Five seconds. FIVE. And you saw it.",
      "Fine! Yes. That one. Hmph.",
      "My beautiful trick, ruined by a child.",
      "I'm going to need a bigger poof.",
      "Right. I'm confiscating your eyes."]),
    flashWrong: lineTable("smug", "g-flash-wrong", [
      "Wrong! The board would tell you. If it existed.",
      "Nope. Gone means gone.",
      "Ha! Your memory has holes in it.",
      "Not that one. Think harder. Or don't.",
      "Wrong square. I am delighted.",
      "Nope! My poof works perfectly.",
      "Missed it. Five seconds wasn't enough, was it.",
      "Wrong. I'm writing this in my rating book.",
      "Nope. Picture it again. Slowly.",
      "Ooh, no. Close. Not really."]),
    flashImagine: lineTable("taunt", "g-flash-imagine", [
      "Don't move it. IMAGINE it.",
      "In your head. Not with your hands.",
      "Play it in your brain. The board stays put.",
      "No touching. Only thinking. Horrible, isn't it.",
      "Move it in your mind. I'll wait. I hate waiting.",
      "See the move without making it. Go on.",
      "The board will not help you. Imagine.",
      "Hands off. Head on.",
      "Picture it, then tell me what it bites.",
      "Pretend you played it. Now what's in trouble?"]),
    flashDone: lineTable("nervous", "g-flash-done", [
      "That's Flash. I need a lie-down.",
      "Done. My poof machine is overheating.",
      "Finished. I'm inventing a slower trick.",
      "That is enough looking for one day.",
      "Flash over. My eyes hurt, and I wasn't even looking.",
      "Done! Come back tomorrow. Or don't. Please don't.",
      "That's it. I'm off to hide some boards.",
      "Flash finished. I'll be in the fridge.",
      "Over! I need new tricks. Better ones.",
      "Done. Two minutes, and I aged nine thousand years."]),
    // The blitz hint lands inside the think window, so it is shown and never spoken.
    blitz: lineTable("nervous", "g-fight-blitz", [
      "Too slow! Here, I'll narrow it down. Ugh.",
      "Tick tock! Here are some squares. Don't thank me.",
      "Hurry! I'm lighting it up. Against my will.",
      "Clock's running! Look at the glowing ones.",
      "Faster! Here's a hint. I'll regret this.",
      "So slow! Fine. Look where it glows."], { silent: true }),
  };
  function glitchLine(kind, prev) {
    const g = GLITCH_LINES[kind]; if (!g) return { text: "", mood: "taunt", index: -1, key: null };
    const i = typeof prev === "number" && prev >= 0 ? (prev + 1) % g.lines.length : 0;
    return { text: g.lines[i], mood: g.mood, index: i, key: g.silent ? null : lineKey(g, i) };
  }

  /* ---------- camp: one tournament-prep session a day, per kid ----------
     Fixed shape, about eight minutes: three "spot the attack" warm-ups (the defend habit), four prep
     fights with the tournament ritual on, two counter-attack fights, then a debrief. Nothing here is
     scored against the sibling and nothing locks: a camp day can be replayed as often as he likes. */

  // One rule per motif, in the voice of something you can carry to a real board. The words-style kid
  // gets these under the why; the debrief picks the one for his weakest motif.
  const PRINCIPLES = {
    counting: "Count attackers and defenders before you take. If they are equal, the taker loses.",
    hanging: "Before you move, look for a piece nobody is guarding. The free one is the move.",
    fork: "One piece, two targets. He only gets to save one of them.",
    pawnFork: "A pawn can attack two pieces at once, and nobody wants to trade a piece for a pawn.",
    royalFork: "Hit the king and something else in one move. He has to answer the check, so the other one is yours.",
    pin: "A piece in front of the king cannot move. Bring another attacker to it before you take.",
    pinTake: "A pinned piece cannot run away. Attack it again, then take it.",
    skewer: "Check the big piece first. What is standing behind it is yours when it steps aside.",
    backRank: "A king with three pawns in front of him has no air. The back rank is a door.",
    mateOverMaterial: "Mate ends the game and a free queen does not. Look for mate before you count material.",
    discovery: "Move the front piece and the one behind it attacks. Move it somewhere that attacks too.",
    mateThreat: "A threat to mate beats a threat to win a pawn. Answer mate first, every time.",
    trapped: "A piece with nowhere to go is already yours. Take its last square away.",
    stalemateTrap: "When you are winning, leave the enemy king a square. No moves and no check is a draw.",
    kingMarch: "In the endgame the king is a fighter. Walk him towards the pawns.",
    attackers: "Add one more attacker before you take.",
    goodBishop: "Trade the bishop stuck behind your own pawns. Keep the free one.",
    tradeChoice: "Knights love closed positions. Bishops love open ones. Trade toward the one that fits the pawns.",
    counter: "When attacked, look for a bigger attack before you retreat.",
    defend: "Defend with a move that also does something.",
  };
  function principleFor(motif) { return PRINCIPLES[motif] || ""; }

  /* The parent sets a register per kid, never the app. "numbers" is counts and short lines; "words"
     is reasons in full sentences. Default follows the short-lines flag, which the parent already set. */
  function defaultCoachStyle(settings, i) {
    const short = (settings && settings.short) || [];
    return short[i] ? "numbers" : "words";
  }
  function coachStyleOf(settings, i) {
    const c = (settings && settings.coach) || [];
    return c[i] === "numbers" || c[i] === "words" ? c[i] : defaultCoachStyle(settings, i);
  }
  /* ---------- the coach: one parent per account, behind a 4-digit gate ----------
     A speed bump, not security. The PIN sits in localStorage in clear and rides in the backup file,
     and that is on purpose: its whole job is that a kid who taps the cog lands back on the map
     instead of inside Progress. The kids' own screens never ask for anything. */
  function normalisePin(text) { return String(text || "").replace(/[^0-9]/g, "").slice(0, 4); }
  function validPin(pin) { return normalisePin(pin).length === 4; }
  function parentOf(settings) {
    const p = (settings && settings.parent) || {};
    const pin = normalisePin(p.pin);
    return { name: String(p.name || "").trim().slice(0, 16), pin: pin, set: pin.length === 4 };
  }
  function parentSet(settings) { return parentOf(settings).set; }
  // The whole gate as one decision, so the screen only has to draw the answer. `typed` is whatever
  // is on the keypad so far: fewer than four digits is neither right nor wrong, it is unfinished.
  function parentGate(settings, typed) {
    const p = parentOf(settings);
    if (!p.set) return { open: false, need: "setup", wrong: false, name: p.name };
    const t = normalisePin(typed);
    if (t.length < 4) return { open: false, need: "pin", wrong: false, name: p.name };
    if (t === p.pin) return { open: true, need: null, wrong: false, name: p.name };
    return { open: false, need: "pin", wrong: true, name: p.name };   // shake, and let him try again forever
  }

  function plural(n, one, many) { return n === 1 ? one : many; }
  // Every sentence Camp says goes through here, so the two registers live in one place and the tests
  // can hold the wording. Returns a string for every kind; an unknown kind returns "".
  function coachLine(style, ctx) {
    const s = style === "numbers" ? "numbers" : "words";
    const c = ctx || {}, kind = c.kind || "", n = Math.max(0, c.count || 0);
    if (kind === "threat") {
      if (s === "numbers") {
        if (n === 1) return "He attacks 1 piece. Tap it.";
        return "He attacks " + n + " pieces. " + (n === 2 ? "Tap both." : "Tap all " + n + ".");
      }
      return "What did that move just attack? Tap it.";
    }
    if (kind === "threatHint") {
      if (s === "numbers") return "One left. Count his squares again.";
      return "Follow the line his piece points down. Who is standing on it?";
    }
    if (kind === "threatDone") {
      if (s === "numbers") return c.wrong ? "Got all " + n + ". " + c.wrong + " wrong " + plural(c.wrong, "tap", "taps") + "." : "All " + n + ", first go.";
      return c.wrong ? "That is what he was attacking. Ask that question after every move he makes." : "Straight away. That is the question to ask after every move he makes.";
    }
    if (kind === "campStart") {
      if (s === "numbers") return "Camp: 2 flash, 2 spot checks, 4 fights, 2 counters.";
      return "Camp. Two boards that vanish, then spot what he is attacking, then four fights, then two where you are the one being attacked.";
    }
    if (kind === "phase") {
      if (c.phase === "warm") return s === "numbers" ? "Spot the attack. 2 boards." : "Two boards. After each move of his, say what it attacks.";
      if (c.phase === "fights") return s === "numbers" ? "4 fights. Two questions before every move." : "Four fights. Ask both questions out loud before you touch a piece.";
      if (c.phase === "counter") return s === "numbers" ? "2 counters. You are the one under attack." : "Two boards where he is attacking you. Look for a bigger attack before you retreat.";
      return "";
    }
    if (kind === "debrief") {
      const found = Math.max(0, c.threatsFound || 0), asked = Math.max(0, c.threatsAsked || 0);
      const first = Math.max(0, c.firstTry || 0), fights = Math.max(0, c.fights || 0);
      if (s === "numbers") return "Threats spotted " + found + "/" + asked + ". First try " + first + "/" + fights + ". Best streak " + Math.max(0, c.streak || 0) + ".";
      const label = c.motifLabel || "";
      const lead = label ? "The thing that cost you most today was " + label + "." : "You got through every board today without a miss to fix.";
      return lead + " " + (c.principle || PRINCIPLES.counting);
    }
    /* Flash. Same rule as everywhere else in Camp: the numbers kid is told what to count and how long
       he has, the words kid is told what to look for. Neither register ever mentions a score. */
    if (kind === "flashStart") {
      const secs = Math.max(1, Math.round((c.revealMs || 5000) / 1000));
      if (s === "numbers") return "Flash: " + Math.max(0, c.count || 6) + " boards, " + secs + " seconds each.";
      return "Flash. Look at the whole board, then it vanishes and I ask you one thing about it.";
    }
    if (kind === "flashLook") return s === "numbers" ? "Look. Then it goes." : "Look at the whole board, not just the piece he moved.";
    if (kind === "flashGone") return s === "numbers" ? "One piece will go. Tap its square." : "One of these pieces is about to disappear. Tap where it was.";
    if (kind === "flashImagine") return s === "numbers" ? "Move it in your head. Do not touch it." : "Play the move in your head. The board is not going to change for you.";
    if (kind === "flashRight") return s === "numbers" ? "Right." : "Yes. That is the one.";
    if (kind === "flashHint") {
      if (c.chip) return s === "numbers" ? "Not that number. Count them again." : "Count them again in your head.";
      return s === "numbers" ? "One square. Look again." : "Picture the board again. Where was it?";
    }
    if (kind === "flashGive") return s === "numbers" ? "That was it." : "That was the one. Look longer next time.";
    if (kind === "flashDone") {
      const got = Math.max(0, c.correct || 0), of = Math.max(0, c.count || 0);
      if (s === "numbers") return "Flash: " + got + "/" + of + " first look. Best run " + Math.max(0, c.run || 0) + ".";
      return got === of ? "Every board, first look. That is board vision."
        : "The boards you had to look at twice are the ones to look at longest tomorrow.";
    }
    if (kind === "lookFirst") return s === "numbers" ? "Look first. Tap what he attacked." : "Look first. What did that move just attack? Tap it.";
    if (kind === "lookSeen") return "Seen. Now your move.";
    if (kind === "lookGive") return s === "numbers" ? "That is what he attacked. Now your move." : "That is what his move attacked. Now your move.";
    if (kind === "cracked") return s === "numbers" ? "Cracked card. Clean win repairs it." : "Card earned, but cracked. Win it clean to repair it.";
    if (kind === "repaired") return s === "numbers" ? "Repaired. Clean win." : "Repaired. You won it clean this time.";
    if (kind === "say") {
      const q = c.question || PREP_QUESTIONS[0];
      if (s === "numbers") return "Tomorrow, say this every move: “" + q + "”";
      return "One thing to say at the board tomorrow, out loud and slowly: “" + q + "”";
    }
    return "";
  }

  // Threat counts are the kid's own, so all three only ever climb. `asked` counts targets put in front
  // of him, not boards, so "spotted 5/6" reads the way he would say it.
  function emptyThreats() { return { asked: 0, found: 0, wrongTaps: 0 }; }
  function threatsOf(stats) { return Object.assign(emptyThreats(), (stats && stats.threats) || {}); }
  function recordThreat(stats, result) {
    const r = result || {}, next = Object.assign({}, stats || {});
    const t = threatsOf(stats);
    const targets = Math.max(0, Math.round(r.targets || 0));
    const found = Math.max(0, Math.min(targets, Math.round(r.found || 0)));
    t.asked += targets; t.found += found; t.wrongTaps += Math.max(0, Math.round(r.wrongTaps || 0));
    next.threats = t;
    return { stats: next, threats: t, clean: !r.wrongTaps && targets > 0 && found === targets };
  }
  function threatRate(stats) { const t = threatsOf(stats); return t.asked ? t.found / t.asked : 0; }

  function campOf(stats) {
    const c = Object.assign({ days: {}, total: 0, best: 0, run: 0, last: "" }, (stats && stats.camp) || {});
    c.days = Object.assign({}, c.days);
    return c;
  }
  function campDoneToday(stats, ts) { return !!campOf(stats).days[dateKey(ts || Date.now())]; }
  function campDaysDone(stats) { return campOf(stats).total || 0; }
  function dayBefore(key) {
    const p = String(key).split("-").map(Number);
    return dateKey(new Date(p[0], (p[1] || 1) - 1, p[2] || 1).getTime() - 24 * 60 * 60 * 1000);
  }
  // A camp day counts once per calendar day; a replay adds nothing and takes nothing away. `best` is
  // the longest run of days, so the only camp number on screen still only climbs.
  function recordCampDay(camp, key) {
    const c = campOf({ camp: camp });
    if (c.days[key]) { c.days[key] += 1; return c; }
    c.run = c.last === dayBefore(key) ? (c.run || 0) + 1 : 1;
    c.days[key] = 1; c.total = (c.total || 0) + 1; c.last = key;
    c.best = Math.max(c.best || 0, c.run);
    return c;
  }

  /* The session plan. The warm-up is now two Flash items and two "spot the attack" boards — same
     minutes, twice the kind of looking — then four prep fights and two counter-attack fights. No
     board appears twice anywhere in the session. `hasThreat` and `supports` are injected, so this
     file never has to know what a board looks like. */
  function campPlan(stats, encounters, opts) {
    const o = opts || {}, all = (encounters || []).slice();
    const hasThreat = typeof o.hasThreat === "function" ? o.hasThreat : function () { return true; };
    const nWarm = o.warmups == null ? 2 : o.warmups;
    const nFlash = o.flash == null ? 2 : o.flash;
    const nFight = o.fights == null ? 4 : o.fights;
    const nCounter = o.counters == null ? 2 : o.counters;
    const earned = (stats && stats.cardsEarned) || {};
    const used = {}, warmups = [];
    // Flash is picked first, so it gets the boards he knows best. A board out of his own game is
    // held back from it for the same reason it is held back from a warm-up: that is the position he
    // most needs to sit down and play properly, and the fights are where he does that.
    const flash = flashPlan(stats, all.filter(function (e) { return e.pack !== "game"; }), nFlash,
      { supports: o.supports, imagine: o.imagine }).items;
    flash.forEach(function (it) { used[it.id] = true; });
    // A board out of his own game is never spent as a warm-up. It is the one he most needs to play
    // properly, so it is reserved for the fights, where prepFights puts it first.
    const pool = all.filter(function (e) { return e.pack !== "game" && !used[e.id] && hasThreat(e); });
    const takeWarm = function (e) { if (!used[e.id] && warmups.length < nWarm) { used[e.id] = true; warmups.push(e); } };
    pool.forEach(function (e) { if (earned[e.id]) takeWarm(e); });   // a board he has already won reads faster
    pool.forEach(takeWarm);
    const left = function () { return all.filter(function (e) { return !used[e.id]; }); };
    // The two counter boards are reserved out of the defence pack BEFORE the four fights are picked.
    // A small pack would otherwise be swallowed whole by the fights and leave the counters as filler.
    const counters = [];
    const takeCounter = function (e) { if (!used[e.id] && counters.length < nCounter) { used[e.id] = true; counters.push(e); } };
    // One counter-attack and one defence, a board he has not won yet before one he has, so the
    // pair changes as he earns cards instead of being the same two every morning.
    const earnedC = (stats && stats.cardsEarned) || {};
    ["counter", "defend"].forEach(function (m) {
      const pool = left().filter(function (e) { return e.pack === "defence" && e.motif === m; });
      const pick = pool.filter(function (e) { return !earnedC[e.id]; })[0] || pool[0];
      if (pick) takeCounter(pick);
    });
    left().forEach(function (e) { if (e.pack === "defence") takeCounter(e); });
    const fights = prepFights(stats, left(), nFight, o.avoid, ["defence"]);
    fights.forEach(function (e) { used[e.id] = true; });
    // No defence pack yet: the counter slots become two more prep fights, picked after the four.
    if (counters.length < nCounter) prepFights(stats, left(), nCounter - counters.length, o.avoid).forEach(takeCounter);
    return { flash: flash, warmups: warmups, fights: fights, counters: counters,
      boards: fights.concat(counters),
      all: flash.map(function (it) { return it.enc; }).concat(warmups, fights, counters),
      hasDefence: counters.some(function (e) { return e.pack === "defence"; }) };
  }

  // The debrief reads off the session and the profile. The weakest motif drives the words-style note;
  // whichever habit slipped most drives the one line to say at the board tomorrow.
  function campDebrief(stats, session, style) {
    const s = session || {}, weak = weakestMotifs(stats).filter(function (m) { return m.rate < 1; })[0] || null;
    const asked = Math.max(0, s.threatsAsked || 0), found = Math.max(0, s.threatsFound || 0);
    const rate = asked ? found / asked : 1;
    const question = rate < 0.8 ? PREP_QUESTIONS[0] : PREP_QUESTIONS[1];
    const ctx = { kind: "debrief", threatsAsked: asked, threatsFound: found, firstTry: s.firstTry || 0,
      fights: s.fights || 0, streak: (stats && stats.bestStreak) || 0,
      motifLabel: weak ? motifLabel(weak.motif) : "", principle: weak ? principleFor(weak.motif) : PRINCIPLES.counting };
    return { line: coachLine(style, ctx), say: coachLine(style, { kind: "say", question: question }),
      question: question, motif: weak ? weak.motif : null, principle: ctx.principle,
      threatsAsked: asked, threatsFound: found, firstTry: ctx.firstTry, fights: ctx.fights, streak: ctx.streak };
  }

  /* ---------- flash: two minutes of board vision ----------
     Six positions out of his own material. Each one is shown for a few seconds and then taken away,
     and he is asked ONE thing about what it meant — what was hanging, where Glitch's queen stood,
     what the last move hit, how many pieces were on his king. The point is not the memory: it is
     that answering a question about meaning forces him to look at the whole board instead of the
     piece that just moved, which is exactly what he does not do at a real board.

     Every counter here only ever climbs. The rolling window and the current run are working memory
     for the adaptive rule and are never drawn on a screen. */
  /* The reveal is a ladder, not a switch. The research's five seconds was for masters; a 400 with a
     twenty-piece board needs longer to have any chance, and a first week of blank boards would end
     the drill before it could help. Start at ten seconds; a full window (12 items) at 80% or better
     steps down one rung, a full window under 50% steps back up; either step empties the window, so
     the next decision is made on items at the new speed. Nothing on screen says which rung he is on. */
  const FLASH_N = 6, FLASH_RUNGS = [10000, 7000, 5000, 3000], FLASH_REVEAL_MS = FLASH_RUNGS[0], FLASH_FAST_MS = FLASH_RUNGS[FLASH_RUNGS.length - 1];
  const FLASH_WINDOW = 12, FLASH_FAST_AT = 0.8, FLASH_SLOW_AT = 0.5, FLASH_CLEAN_DAYS = 3, FLASH_CLEAN_MIN = 4;
  const FLASH_TYPES = ["recall", "imagine", "gone"];
  function emptyFlash() { return { items: 0, correct: 0, fast: 0, byType: {}, days: {}, run: 0, bestRun: 0, cleanDays: 0, imagineOpen: false, last12: [], rung: 0 }; }
  function flashOf(stats) {
    const f = Object.assign(emptyFlash(), (stats && stats.flash) || {});
    f.byType = Object.assign({}, f.byType);
    FLASH_TYPES.forEach(function (t) { f.byType[t] = Object.assign({ items: 0, correct: 0 }, f.byType[t]); });
    f.days = Object.assign({}, f.days);
    Object.keys(f.days).forEach(function (k) { f.days[k] = Object.assign({ items: 0, correct: 0 }, f.days[k]); });
    f.last12 = (f.last12 || []).slice(-FLASH_WINDOW).map(function (x) { return x ? 1 : 0; });
    f.rung = Math.max(0, Math.min(FLASH_RUNGS.length - 1, Math.round(Number(f.rung) || 0)));
    return f;
  }
  function flashRate(stats) { const f = flashOf(stats); return f.items ? f.correct / f.items : 0; }
  // The last twelve items, whatever day they were answered on. The adaptive rule reads this and
  // nothing else, so a good morning does not shorten the reveal on the strength of a good March.
  function flashRolling(stats) {
    const l = flashOf(stats).last12, got = l.filter(function (x) { return x; }).length;
    return { n: l.length, correct: got, rate: l.length ? got / l.length : 0, full: l.length >= FLASH_WINDOW };
  }
  function flashRung(stats) { return flashOf(stats).rung; }
  function flashRevealMs(stats) { return FLASH_RUNGS[flashRung(stats)]; }
  // Where the ladder goes after the item just recorded: down on a strong full window, up on a weak one.
  function flashNextRung(rung, rolling) {
    if (!rolling.full) return rung;
    if (rolling.rate >= FLASH_FAST_AT) return Math.min(FLASH_RUNGS.length - 1, rung + 1);
    if (rolling.rate < FLASH_SLOW_AT) return Math.max(0, rung - 1);
    return rung;
  }
  function flashDayClean(day) { const d = day || {}; return (d.items || 0) >= FLASH_CLEAN_MIN && (d.correct || 0) >= (d.items || 0); }
  function flashCleanDays(stats) { return flashOf(stats).cleanDays || 0; }
  /* The imagine rung. Holding a move in your head while the board refuses to move is the hard one; it
     opens after three clean days. `cleanDays` is counted live off the days map, so a fifth item that
     spoils a clean morning stops that morning counting — but the rung itself is a latch and never
     shuts again, because taking a rung away is taking something off the screen. */
  function flashUnlocked(stats) { const f = flashOf(stats); return !!f.imagineOpen || (f.cleanDays || 0) >= FLASH_CLEAN_DAYS; }
  function flashDoneToday(stats, ts) { return !!flashOf(stats).days[dateKey(ts || Date.now())]; }
  function flashDaysDone(stats) { return Object.keys(flashOf(stats).days).length; }
  function recordFlash(stats, res) {
    const r = res || {}, next = Object.assign({}, stats || {});
    const f = flashOf(stats);
    const type = FLASH_TYPES.indexOf(r.type) >= 0 ? r.type : "recall";
    const correct = !!r.correct, key = dateKey(r.t || Date.now());
    const day = Object.assign({ items: 0, correct: 0 }, f.days[key]);
    f.items += 1; f.byType[type].items += 1; day.items += 1;
    if (correct) { f.correct += 1; f.byType[type].correct += 1; day.correct += 1; }
    if (r.revealMs > 0 && r.revealMs <= FLASH_FAST_MS) f.fast += 1;
    f.days[key] = day;
    f.run = correct ? (f.run || 0) + 1 : 0;
    f.bestRun = Math.max(f.bestRun || 0, f.run);
    f.last12 = f.last12.concat(correct ? 1 : 0).slice(-FLASH_WINDOW);
    const rolling = { full: f.last12.length >= FLASH_WINDOW, rate: f.last12.filter(function (x) { return x; }).length / Math.max(1, f.last12.length) };
    const rung = flashNextRung(f.rung, rolling);
    if (rung !== f.rung) { f.rung = rung; f.last12 = []; }     // a step empties the window
    f.cleanDays = Object.keys(f.days).filter(function (k) { return flashDayClean(f.days[k]); }).length;
    if (f.cleanDays >= FLASH_CLEAN_DAYS) f.imagineOpen = true;     // a latch, never a toggle
    next.flash = f;
    return { stats: next, flash: f, correct: correct, day: day, clean: flashDayClean(day) };
  }

  /* What the drill draws on, and what it asks of each board. His own games first, then boards he has
     already won, then the hand-authored set, then the ladder: a position he has met carries meaning,
     and meaning is the whole question. `supports` is injected the way campPlan takes `hasThreat`, so
     this file still never has to know what a board looks like. */
  const FLASH_MIX = ["gone", "recall", "recall", "recall", "gone", "recall"];
  const FLASH_MIX_OPEN = ["gone", "recall", "recall", "imagine", "gone", "recall"];
  function flashOrder(stats, encounters) {
    const all = (encounters || []).slice(), earned = (stats && stats.cardsEarned) || {};
    const seen = {}, out = [];
    const take = function (e) { if (e && e.id && !seen[e.id]) { seen[e.id] = true; out.push(e); } };
    all.forEach(function (e) { if (e.pack === "game") take(e); });
    all.forEach(function (e) { if (earned[e.id]) take(e); });
    all.forEach(function (e) { if (!e.generated) take(e); });
    all.forEach(take);
    return out;
  }
  function flashPlan(stats, encounters, n, opts) {
    const o = opts || {}, want = n == null ? FLASH_N : Math.max(0, n);
    const supports = typeof o.supports === "function" ? o.supports : function () { return true; };
    const open = o.imagine == null ? flashUnlocked(stats) : !!o.imagine;
    const mix = open ? FLASH_MIX_OPEN : FLASH_MIX;
    const skip = {}; (o.avoid || []).forEach(function (id) { skip[id] = true; });
    const pool = flashOrder(stats, encounters).filter(function (e) { return !skip[e.id]; });
    const used = {}, items = [];
    // A board carries one question and is then spent, so a drill never asks about the same position
    // twice. A slot whose question no board can carry drops to an easier rung rather than vanishing.
    const fallback = { imagine: ["recall", "gone"], recall: ["gone", "imagine"], gone: ["recall", "imagine"] };
    for (let i = 0; i < want; i++) {
      const wanted = mix[i % mix.length];
      let type = wanted, pick = null;
      [wanted].concat(fallback[wanted] || []).some(function (t) {
        for (let j = 0; j < pool.length; j++) {
          const e = pool[j];
          if (!used[e.id] && supports(e, t)) { pick = e; type = t; return true; }
        }
        return false;
      });
      if (!pick) break;
      used[pick.id] = true;
      items.push({ type: type, id: pick.id, enc: pick, wanted: wanted });
    }
    return { items: items, n: items.length, imagine: open, revealMs: flashRevealMs(stats),
      types: items.map(function (it) { return it.type; }) };
  }

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
  // Monday-to-Sunday, in the parent's own timezone, because "this week" is the week the tournament
  // is in, not a rolling seven days.
  function weekStart(ts) {
    const d = new Date(ts || Date.now());
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.getTime();
  }
  function keyTime(key) {
    const p = String(key).split("-").map(Number);
    return new Date(p[0], (p[1] || 1) - 1, p[2] || 1, 12).getTime();
  }
  // `tries` on an earned card counts attempts, so 1 is "found it first go". A card from before the
  // field existed has no tries and is read as a first try, which is how it was actually earned.
  function firstTryRate(stats) {
    const earned = (stats && stats.cardsEarned) || {}, ids = Object.keys(earned);
    const first = ids.filter(function (id) { return (earned[id] && earned[id].tries || 1) <= 1; }).length;
    return { cards: ids.length, first: first, rate: ids.length ? first / ids.length : 0 };
  }
  function thisWeek(stats, ts) {
    const from = weekStart(ts), to = from + 7 * DAY;
    const earned = (stats && stats.cardsEarned) || {}, days = campOf(stats).days;
    const inWeek = function (t) { return t >= from && t < to; };
    return { from: from, to: to,
      cards: Object.keys(earned).filter(function (id) { return inWeek((earned[id] || {}).t || 0); }).length,
      campDays: Object.keys(days).filter(function (k) { return inWeek(keyTime(k)); }).length };
  }

  /* Two to four sentences a parent can act on tonight, in priority order. Nothing here is advice in
     general; every line is a reading of this kid's own numbers. The principle line deliberately uses
     the same words the app says on the card, so the parent and the app coach with one voice. */
  const RUSH_NOTE = "He is moving before he looks. Slow the hand: write the move on the scoresheet first.";

  /* Is the drill worth the two minutes? The only honest answer is whether the thing it trains and the
     thing it is supposed to help move together over weeks, so this reads last week against the week
     before on BOTH numbers — Flash accuracy and first-try rate — and says so either way. It stays
     quiet until there are two real weeks of each, because a week of five items says nothing. */
  const FLASH_TREND_ITEMS = 6, FLASH_TREND_CARDS = 3;
  const FLASH_TOGETHER = "Flash and first-try are climbing together. The looking is reaching the board.";
  function flashTrend(stats, ts) {
    const at = ts || Date.now(), f = flashOf(stats), week = 7 * DAY, keys = Object.keys(f.days);
    if (!keys.length) return null;
    const drill = function (from, to) {
      let items = 0, correct = 0;
      keys.forEach(function (k) {
        const t = keyTime(k); if (t < from || t >= to) return;
        items += f.days[k].items; correct += f.days[k].correct;
      });
      return { items: items, rate: items ? correct / items : 0 };
    };
    const earned = (stats && stats.cardsEarned) || {};
    const first = function (from, to) {
      const ids = Object.keys(earned).filter(function (id) { const t = (earned[id] || {}).t || 0; return t >= from && t < to; });
      const got = ids.filter(function (id) { return (earned[id].tries || 1) <= 1; }).length;
      return { cards: ids.length, rate: ids.length ? got / ids.length : 0 };
    };
    const end = at + DAY, mid = at - week, start = at - 2 * week;
    const dNow = drill(mid, end), dWas = drill(start, mid);
    if (dNow.items < FLASH_TREND_ITEMS || dWas.items < FLASH_TREND_ITEMS) return null;
    const fNow = first(mid, end), fWas = first(start, mid);
    if (fNow.cards < FLASH_TREND_CARDS || fWas.cards < FLASH_TREND_CARDS) return null;
    return { flash: dNow.rate, flashWas: dWas.rate, firstTry: fNow.rate, firstTryWas: fWas.rate,
      flashUp: dNow.rate > dWas.rate, firstTryUp: fNow.rate > fWas.rate };
  }
  function flashNote(t) {
    if (!t) return "";
    if (t.flashUp && t.firstTryUp) return FLASH_TOGETHER;
    if (t.flashUp) return "Flash is climbing but first-try is not, two weeks running. What he sees in the drill has not reached his moves yet.";
    if (t.firstTryUp) return "First-try is climbing while Flash is flat. The chess is moving without the drill; keep Flash short or drop it.";
    return "Flash and first-try are both flat over two weeks. Sit through one drill and watch where his eyes go.";
  }
  function coachNotes(parts) {
    const t = parts.threats, c = parts.camp, ft = parts.firstTry, notes = [];
    const rush = parts.rush || { moves: 0, rushed: 0, rate: 0 };
    if (!parts.cards && !t.asked && !parts.attempts) {
      return ["Nothing played yet. Sit through one Camp with him: two flash boards, two spot checks, four fights, two counters.",
        "This page fills itself in from that."];
    }
    // Rushing is what loses him tournament games, so when the clock says so it leads.
    if (rush.moves > 0 && rush.rate > 0.3) notes.push(RUSH_NOTE);
    if (t.asked >= 4 && t.rate < 0.7) {
      notes.push("He is not looking at what the last move attacked — " + t.found + " of " + t.asked +
        " spotted. Make him answer that out loud before he touches a piece.");
    }
    if (t.asked > 0 && t.wrongTaps / t.asked > 0.5) {
      notes.push("He is tapping before he looks: " + t.wrongTaps + " wrong taps against " + t.asked +
        " asked. Slow him down — one question, then one tap.");
    }
    if (parts.flashNote) notes.push(parts.flashNote);
    if (parts.focusMotif) notes.push("At the board, say: " + (principleFor(parts.focusMotif) || PRINCIPLES.counting));
    if (c.run >= 3) notes.push("Camp " + c.run + " days running. Keep the run going; the habit is the point, not the chess.");
    if (notes.length < 2 && !c.days) notes.push("No camp days yet. One camp a morning is the whole tournament habit.");
    if (notes.length < 2 && ft.cards >= 3 && ft.rate >= 0.7) {
      notes.push("First try on " + Math.round(ft.rate * 100) + "% of his cards. That is the habit holding.");
    }
    if (notes.length < 2) notes.push("Two questions before every move: " + PREP_QUESTIONS[0] + " " + PREP_QUESTIONS[1]);
    return notes.slice(0, 4);
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
    const at = ts || Date.now();
    const th = threatsOf(stats), cp = campOf(stats), ft = firstTryRate(stats);
    const threats = { asked: th.asked, found: th.found, wrongTaps: th.wrongTaps, rate: threatRate(stats) };
    const camp = { days: cp.total || 0, best: cp.best || 0, run: cp.run || 0, doneToday: campDoneToday(stats, at) };
    const week = thisWeek(stats, at);
    const focus = motifs.filter(function (m) { return m.verdict === "focus"; });
    const cards = Object.keys((stats && stats.cardsEarned) || {}).length;
    const attempts = motifs.reduce(function (a, m) { return a + (m.attempts || 0); }, 0);
    const rush = rushOf(stats);
    const games = gamesOf(stats);
    // Blunders per game, newest last, for the trend strip. A game with no moves recorded is skipped
    // rather than drawn as a zero, so an abandoned game cannot flatter the line.
    const blunderTrend = games.recent.filter(function (r) { return (r.moves || 0) > 0; })
      .slice(0, 10).reverse().map(function (r) { return { level: r.level, blunders: r.blunders || 0, moves: r.moves || 0 }; });
    /* Versus and best moments are this kid's own row and nothing else. progressSummary is called once
       per profile and never sees the other one, which is what keeps a scoreboard from existing. */
    const versus = versusOf(stats), bestMoves = bestMovesOf(stats);
    /* Flash sits next to first-try rate and blunders per game on purpose: those two are what it is
       supposed to move, and the parent can only judge the drill by reading the three together. */
    const fl = flashOf(stats), trend = flashTrend(stats, at);
    const flash = { items: fl.items, correct: fl.correct, rate: flashRate(stats), byType: fl.byType,
      days: flashDaysDone(stats), best: fl.bestRun || 0, cleanDays: fl.cleanDays || 0,
      unlocked: flashUnlocked(stats), doneToday: flashDoneToday(stats, at),
      revealMs: flashRevealMs(stats), rolling: flashRolling(stats), trend: trend };
    return {
      rank: agentRank(stats), cards: cards, total: list.length,
      games: games, suggest: suggestLevel(stats), blunderTrend: blunderTrend,
      versus: versus, bestMoves: bestMoves, bestMove: bestMoves[0] || null,
      gameFights: ((stats && stats.gameFights) || []).length,
      kos: b.kos, power: b.power, knockedOff: knockedOff(stats), motifs: motifs, byDay: cardsByDay(stats, 14, ts),
      goodAt: motifs.filter(function (m) { return m.verdict === "good"; }).map(function (m) { return m.label; }),
      focusOn: focus.map(function (m) { return m.label; }),
      threats: threats, camp: camp, flash: flash, firstTry: ft, firstTryRate: ft.rate, thisWeek: week, rush: rush,
      cracked: crackedIds(stats).length,
      coachNotes: coachNotes({ threats: threats, camp: camp, firstTry: ft, cards: cards, attempts: attempts, rush: rush,
        flashNote: flashNote(trend), focusMotif: focus.length ? focus[0].motif : null }),
    };
  }

  /* Pacing. Two finished days in one sitting and the home button offers Camp instead, for the rest of
     that sitting. Soft: the day is still one tap away. Off once Camp is already done today. */
  function pacingNudge(daysThisSitting, campDone) { return (daysThisSitting || 0) >= 2 && !campDone; }

  const api = { glitchRating, ratingTaunt, agentRank, rankedUp, dailyChallenger, knockedOff, ABILITIES, POWER_CAP, emptyBattle, battleOf, bossHp, earnPower, abilityById, canAfford, armAbility, disarm, addBonus, recordKo, resolveHitDamage, resolveCritical, resolveMiss, GEAR, SLOTS, slotsUnlocked, gearUnlocked, gearById, hasGear, equipGear, unequipGear, motifLabel, resolveWeakness, motifStats, weakestMotifs, strongestMotifs, prepFights, prepSource, PREP_QUESTIONS, offersBait, prepQuestionsFor, motifVerdict, cardsByDay, progressSummary,
    weekStart, firstTryRate, thisWeek, coachNotes,
    LEVELS, levelIndex, levelById, levelAt, levelName, emptyGames, gamesOf, recordGame, gameBlunderRate, suggestLevel, GAMES_RECENT,
    VERSUS_RECENT, BEST_MOVES_MAX, emptyVersus, versusOf, bestMovesOf, storeBestMoves, recordVersus,
    RUSH_MS, RUSH_NOTE, rushOf, earnCard, cardCracked, crackedIds, lookFirst, LOOK, GLITCH_LINES, glitchLine, pacingNudge,
    lineTable, lineKey, spokenLine, fillLine, pickLine, LINE_WINDOW, SUGGEST_SAY, levelSayKey,
    normalisePin, validPin, parentOf, parentSet, parentGate,
    PRINCIPLES, principleFor, MOTIF_LABEL, defaultCoachStyle, coachStyleOf, coachLine,
    emptyThreats, threatsOf, recordThreat, threatRate, campOf, campDoneToday, campDaysDone, recordCampDay, campPlan, campDebrief,
    FLASH_N, FLASH_RUNGS, FLASH_REVEAL_MS, FLASH_FAST_MS, FLASH_WINDOW, FLASH_FAST_AT, FLASH_SLOW_AT, FLASH_CLEAN_DAYS, FLASH_CLEAN_MIN, FLASH_TYPES, flashRung, flashNextRung,
    FLASH_MIX, FLASH_MIX_OPEN, FLASH_TOGETHER, emptyFlash, flashOf, flashRate, flashRolling, flashRevealMs,
    flashDayClean, flashCleanDays, flashUnlocked, flashDoneToday, flashDaysDone, recordFlash, flashOrder, flashPlan,
    flashTrend, flashNote,
    tellFree, useTell, bootsFree, useBoots, cardsOnDay, dateKey, RANKS, CRONIES, emptyStats, cardOf, recordMove, recordAttempt, recordWhy, reasonsKept, needsRetry, canAdvance, pickNextIndex, historyRows, scheduleAfterKeep, scheduleAfterFail, dueReviews, pickWalkTarget, intervalList, INTERVALS, LEDGER_MAX, emptyDuel, recordDuelSeat, duelVerdict };
  root.ShockmateScore = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
