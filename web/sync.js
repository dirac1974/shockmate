(function (root) {
  "use strict";
  // Progress sync. Two independent jobs:
  //   1. mergeStats — combine two copies of one kid's progress without ever losing a card.
  //   2. transport  — a file the parent can keep, and an optional Supabase row keyed by a family code.
  // Every counter here only ever grows, so merging takes the larger side rather than summing:
  // summing would double-count the fights both devices already saw.

  const LEDGER_MAX = 40, TIERS_MAX = 8, CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const COUNTERS = ["hits", "misses", "streak", "bestStreak", "won", "criticals"];
  const CARD_COUNTERS = ["attempts", "founds", "misses", "whys", "hits"];

  function bigger(a, b) { return (Number(a) || 0) >= (Number(b) || 0) ? (Number(a) || 0) : (Number(b) || 0); }
  function later(a, b) { return (Number(a) || 0) >= (Number(b) || 0) ? a : b; }

  function mergeCard(a, b) {
    if (!a) return Object.assign({}, b);
    if (!b) return Object.assign({}, a);
    // The side with more finds carries the review schedule; counters then take the larger value.
    const lead = (Number(a.founds) || 0) >= (Number(b.founds) || 0) ? a : b;
    const out = Object.assign({}, (lead === a ? b : a), lead);
    CARD_COUNTERS.forEach((k) => { out[k] = bigger(a[k], b[k]); });
    out.mastered = !!(a.mastered || b.mastered);
    out.lastFound = later(a.lastFound, b.lastFound);
    out.lastCorrect = later(a.lastCorrect, b.lastCorrect);
    return out;
  }

  function mergeStats(a, b) {
    a = a || {}; b = b || {};
    const out = Object.assign({}, a, b);
    COUNTERS.forEach((k) => { out[k] = bigger(a[k], b[k]); });
    out.session = 0;  // a session is a sitting on one device; it never travels

    out.figurines = Array.from(new Set([].concat(a.figurines || [], b.figurines || [])));

    out.cards = {};
    Object.keys(Object.assign({}, a.cards, b.cards)).forEach((id) => {
      out.cards[id] = mergeCard((a.cards || {})[id], (b.cards || {})[id]);
    });

    out.cardsEarned = {};
    Object.keys(Object.assign({}, a.cardsEarned, b.cardsEarned)).forEach((id) => {
      const x = (a.cardsEarned || {})[id], y = (b.cardsEarned || {})[id];
      if (!x || !y) { out.cardsEarned[id] = Object.assign({}, x || y); return; }
      out.cardsEarned[id] = { critical: !!(x.critical || y.critical), tries: bigger(x.tries, y.tries), t: later(x.t, y.t),
        tier: ((x.t || 0) >= (y.t || 0) ? (x.tier || y.tier) : (y.tier || x.tier)) || undefined };
    });

    const seen = {};
    out.ledger = [].concat(a.ledger || [], b.ledger || [])
      .filter((row) => { const k = (row && (row.t || 0)) + "|" + (row && (row.id || "")) + "|" + (row && (row.san || "")); if (seen[k]) return false; seen[k] = 1; return true; })
      .sort((x, y) => (x.t || 0) - (y.t || 0))
      .slice(-LEDGER_MAX);

    // Tier history drives silent difficulty. Keep the most recent window from both devices.
    out.tiers = [].concat(a.tiers || [], b.tiers || []).slice(-TIERS_MAX);
    // Battle: power and knockouts are the kid's numbers, so two devices take the larger. Bonus damage per day likewise.
    const ba = a.battle || {}, bb = b.battle || {};
    out.battle = Object.assign({}, ba, bb, {
      power: bigger(ba.power, bb.power), kos: bigger(ba.kos, bb.kos),
      next: Object.assign({}, ba.next, bb.next), gear: Object.assign({}, ba.gear, bb.gear), bonus: {},
      tellUsed: Object.assign({}, ba.tellUsed, bb.tellUsed), bootsUsed: Object.assign({}, ba.bootsUsed, bb.bootsUsed),
    });
    Object.keys(Object.assign({}, ba.bonus, bb.bonus)).forEach((k) => {
      out.battle.bonus[k] = bigger((ba.bonus || {})[k], (bb.bonus || {})[k]);
    });
    return out;
  }

  // Identity is the family login the other kid apps already use: an uppercase family code,
  // a lowercase username and a 4-digit pin. Shockmate never invents its own account.
  function normaliseCode(text) { return String(text || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
  function normaliseUser(text) { return String(text || "").toLowerCase().replace(/[^a-z0-9._-]/g, ""); }
  function normalisePin(text) { return String(text || "").replace(/[^0-9]/g, "").slice(0, 4); }
  function validCode(code) { return normaliseCode(code).length >= 6; }
  function validPin(pin) { return normalisePin(pin).length === 4; }
  function validUser(name) { return normaliseUser(name).length >= 3; }
  function boundSlot(slot) { return !!(slot && validUser(slot.username) && validPin(slot.pin)); }

  function exportBlob(settings, profiles) {
    return { app: "shockmate", version: 2, savedAt: Date.now(), names: (settings || {}).names || [], profiles: profiles || [] };
  }
  function importBlob(text, profiles) {
    let blob;
    try { blob = typeof text === "string" ? JSON.parse(text) : text; } catch (e) { throw new Error("That file is not a Shockmate backup."); }
    if (!blob || blob.app !== "shockmate" || !Array.isArray(blob.profiles)) throw new Error("That file is not a Shockmate backup.");
    // Import merges: restoring an old backup can never delete a card won since.
    return { names: blob.names || [], profiles: [0, 1].map((i) => mergeStats((profiles || [])[i], blob.profiles[i])) };
  }

  function configured(cfg) { return !!(cfg && cfg.url && cfg.anonKey); }
  function prettyCode(code) { return normaliseCode(code); }  // the family code is read out as-is

  function rpc(cfg, name, body, fetchImpl) {
    const f = fetchImpl || (typeof fetch === "function" ? fetch : null);
    if (!configured(cfg)) return Promise.reject(new Error("Sync is not set up on this build."));
    if (!f) return Promise.reject(new Error("No network in this environment."));
    return f(cfg.url.replace(/\/+$/, "") + "/rest/v1/rpc/" + name, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.anonKey, Authorization: "Bearer " + cfg.anonKey },
      body: JSON.stringify(body)
    }).then((res) => {
      if (!res.ok) return res.text().then((t) => { throw new Error("Sync failed (" + res.status + ") " + t.slice(0, 120)); });
      return res.json();
    });
  }

  function roster(cfg, code, fetchImpl) {
    return rpc(cfg, "chess_roster", { p_code: normaliseCode(code) }, fetchImpl);
  }
  function pull(cfg, code, slot, fetchImpl) {
    return rpc(cfg, "chess_pull", { p_code: normaliseCode(code), p_username: normaliseUser(slot.username), p_pin: normalisePin(slot.pin) }, fetchImpl);
  }
  function push(cfg, code, slot, stats, fetchImpl) {
    return rpc(cfg, "chess_push", { p_code: normaliseCode(code), p_username: normaliseUser(slot.username), p_pin: normalisePin(slot.pin), p_progress: stats }, fetchImpl);
  }

  const api = { mergeStats, mergeCard, normaliseCode, normaliseUser, normalisePin, validCode, validPin, validUser,
    boundSlot, exportBlob, importBlob, configured, roster, pull, push, LEDGER_MAX, TIERS_MAX };
  root.ShockmateSync = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
