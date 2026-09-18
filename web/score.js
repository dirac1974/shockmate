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

  /* Glitch reacts to every new moment the way he reacts in a fight: a line and a mood. Three or more
     variants each, and glitchLine walks them in turn so the same line never plays twice in a row. */
  const GLITCH_LINES = {
    lookRight: { mood: "nervous", lines: ["You SAW that? Nobody sees that.", "Who told you to look? Stop looking.", "Ugh. Eyes open. That is cheating.", "Fine, you spotted it. Doesn't mean you'll stop it."] },
    lookWrong: { mood: "smug", lines: ["Wrong one. Keep guessing.", "Nope. Not even close.", "Ha! Look again. Or don't.", "Warm. No, cold. Freezing."] },
    lookGive: { mood: "smug", lines: ["There. THAT is what I hit. Too slow.", "I'll show you, since you can't see it.", "My move, my target. Write that down."] },
    cracked: { mood: "smug", lines: ["Ha! Cracked. That one's still half mine.", "Cracked! I had to SHOW you. Still counts as mine.", "A cracked card. I'm keeping the other half."] },
    repaired: { mood: "rage", lines: ["You fixed it?! That crack was MINE!", "No no no. Clean? Without my help?!", "My crack! You patched my beautiful crack!"] },
    pacing: { mood: "taunt", lines: ["Two days already? Your hand is faster than your eyes. Camp instead?", "Keep rushing. I LOVE it when you rush. Or... Camp?", "Speed is my favourite thing about you. Camp first, if you dare."] },
  };
  function glitchLine(kind, prev) {
    const g = GLITCH_LINES[kind]; if (!g) return { text: "", mood: "taunt", index: -1 };
    const i = typeof prev === "number" && prev >= 0 ? (prev + 1) % g.lines.length : 0;
    return { text: g.lines[i], mood: g.mood, index: i };
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
      if (s === "numbers") return "Camp: 3 spot checks, 4 fights, 2 counters.";
      return "Camp. First spot what he is attacking, then four fights, then two where you are the one being attacked.";
    }
    if (kind === "phase") {
      if (c.phase === "warm") return s === "numbers" ? "Spot the attack. 3 boards." : "Three boards. After each move of his, say what it attacks.";
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

  /* The session plan. Three warm-ups (boards he has already won first, and only boards where Glitch's
     arriving move actually attacks something), four prep fights, two counter-attack fights. No fight
     appears twice. `hasThreat` is injected, so this file never has to know about the board. */
  function campPlan(stats, encounters, opts) {
    const o = opts || {}, all = (encounters || []).slice();
    const hasThreat = typeof o.hasThreat === "function" ? o.hasThreat : function () { return true; };
    const nWarm = o.warmups == null ? 3 : o.warmups;
    const nFight = o.fights == null ? 4 : o.fights;
    const nCounter = o.counters == null ? 2 : o.counters;
    const earned = (stats && stats.cardsEarned) || {};
    const used = {}, warmups = [];
    const pool = all.filter(function (e) { return hasThreat(e); });
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
    return { warmups: warmups, fights: fights, counters: counters,
      boards: fights.concat(counters), all: warmups.concat(fights).concat(counters),
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
  function coachNotes(parts) {
    const t = parts.threats, c = parts.camp, ft = parts.firstTry, notes = [];
    const rush = parts.rush || { moves: 0, rushed: 0, rate: 0 };
    if (!parts.cards && !t.asked && !parts.attempts) {
      return ["Nothing played yet. Sit through one Camp with him: three spot checks, four fights, two counters.",
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
    return {
      rank: agentRank(stats), cards: cards, total: list.length,
      kos: b.kos, power: b.power, knockedOff: knockedOff(stats), motifs: motifs, byDay: cardsByDay(stats, 14, ts),
      goodAt: motifs.filter(function (m) { return m.verdict === "good"; }).map(function (m) { return m.label; }),
      focusOn: focus.map(function (m) { return m.label; }),
      threats: threats, camp: camp, firstTry: ft, firstTryRate: ft.rate, thisWeek: week, rush: rush,
      cracked: crackedIds(stats).length,
      coachNotes: coachNotes({ threats: threats, camp: camp, firstTry: ft, cards: cards, attempts: attempts, rush: rush,
        focusMotif: focus.length ? focus[0].motif : null }),
    };
  }

  /* Pacing. Two finished days in one sitting and the home button offers Camp instead, for the rest of
     that sitting. Soft: the day is still one tap away. Off once Camp is already done today. */
  function pacingNudge(daysThisSitting, campDone) { return (daysThisSitting || 0) >= 2 && !campDone; }

  const api = { glitchRating, ratingTaunt, agentRank, rankedUp, dailyChallenger, knockedOff, ABILITIES, POWER_CAP, emptyBattle, battleOf, bossHp, earnPower, abilityById, canAfford, armAbility, disarm, addBonus, recordKo, resolveHitDamage, resolveCritical, resolveMiss, GEAR, SLOTS, slotsUnlocked, gearUnlocked, gearById, hasGear, equipGear, unequipGear, motifLabel, resolveWeakness, motifStats, weakestMotifs, strongestMotifs, prepFights, prepSource, PREP_QUESTIONS, offersBait, prepQuestionsFor, motifVerdict, cardsByDay, progressSummary,
    weekStart, firstTryRate, thisWeek, coachNotes,
    RUSH_MS, RUSH_NOTE, rushOf, earnCard, cardCracked, crackedIds, lookFirst, LOOK, GLITCH_LINES, glitchLine, pacingNudge,
    normalisePin, validPin, parentOf, parentSet, parentGate,
    PRINCIPLES, principleFor, MOTIF_LABEL, defaultCoachStyle, coachStyleOf, coachLine,
    emptyThreats, threatsOf, recordThreat, threatRate, campOf, campDoneToday, campDaysDone, recordCampDay, campPlan, campDebrief,
    tellFree, useTell, bootsFree, useBoots, cardsOnDay, dateKey, RANKS, CRONIES, emptyStats, cardOf, recordMove, recordAttempt, recordWhy, reasonsKept, needsRetry, canAdvance, pickNextIndex, historyRows, scheduleAfterKeep, scheduleAfterFail, dueReviews, pickWalkTarget, intervalList, INTERVALS, LEDGER_MAX, emptyDuel, recordDuelSeat, duelVerdict };
  root.ShockmateScore = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
