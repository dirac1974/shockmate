(function (root) {
  "use strict";
  // Progress sync. Two independent jobs:
  //   1. mergeStats — combine two copies of one kid's progress without ever losing a card.
  //   2. transport  — a file the parent can keep, and Shockmate's own Supabase family (sm_* RPCs).
  // Every counter here only ever grows, so merging takes the larger side rather than summing:
  // summing would double-count the fights both devices already saw.

  const LEDGER_MAX = 40, TIERS_MAX = 8;
  const GAMES_RECENT = 10, GAME_FIGHTS_MAX = 20, BEST_MOVES_MAX = 20, FLASH_WINDOW = 12;
  // The rungs, weakest first. Mirrors S.LEVELS in score.js; kept here so merging never has to load
  // the game's own rules. If a rung is ever added there, add it here too.
  const LEVEL_ORDER = ["sleepy", "rookie", "cadet", "agent", "marshal"];
  const COUNTERS = ["hits", "misses", "streak", "bestStreak", "won", "criticals"];
  const CARD_COUNTERS = ["attempts", "founds", "misses", "whys", "hits", "rushed"];

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
        tier: ((x.t || 0) >= (y.t || 0) ? (x.tier || y.tier) : (y.tier || x.tier)) || undefined,
        // A crack only ever repairs: a clean win on either device wins the merge.
        clean: x.clean !== false || y.clean !== false };
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
    // Camp, threat spotting and rush are running counts: two devices take the larger of each, so a
    // sync never loses a morning's practice to whichever device happened to push last.
    const larger = (x, y, keys) => { const o = Object.assign({}, x, y); keys.forEach((k) => { o[k] = bigger((x || {})[k], (y || {})[k]); }); return o; };
    if (a.threats || b.threats) out.threats = larger(a.threats, b.threats, ["asked", "found", "wrongTaps"]);
    if (a.rush || b.rush) out.rush = larger(a.rush, b.rush, ["moves", "rushed"]);
    if (a.camp || b.camp) {
      const ca = a.camp || {}, cb = b.camp || {}, days = {};
      Object.keys(Object.assign({}, ca.days, cb.days)).forEach((k) => { days[k] = bigger((ca.days || {})[k], (cb.days || {})[k]); });
      const lastA = String(ca.last || ""), lastB = String(cb.last || "");
      out.camp = Object.assign({}, ca, cb, { days: days, total: Object.keys(days).length,
        best: bigger(ca.best, cb.best), last: lastA >= lastB ? lastA : lastB,
        run: lastA === lastB ? bigger(ca.run, cb.run) : (lastA > lastB ? (ca.run || 0) : (cb.run || 0)) });
    }
    /* Flash. Items, correct, the best run and the clean days are the kid's numbers, so two devices
       take the larger of each rather than summing a drill both of them saw. Days union the same way
       camp days do. `last12` is the adaptive rule's working memory, not a counter: the side that has
       answered more items owns it, because a half-window would shorten the reveal on thin evidence. */
    if (a.flash || b.flash) {
      const fa = a.flash || {}, fb = b.flash || {}, days = {}, byType = {};
      const pair = (x, y) => ({ items: bigger((x || {}).items, (y || {}).items), correct: bigger((x || {}).correct, (y || {}).correct) });
      Object.keys(Object.assign({}, fa.days, fb.days)).forEach((k) => { days[k] = pair((fa.days || {})[k], (fb.days || {})[k]); });
      Object.keys(Object.assign({}, fa.byType, fb.byType)).forEach((k) => { byType[k] = pair((fa.byType || {})[k], (fb.byType || {})[k]); });
      const lead = (Number(fa.items) || 0) >= (Number(fb.items) || 0) ? fa : fb;
      out.flash = Object.assign({}, fa, fb, {
        items: bigger(fa.items, fb.items), correct: bigger(fa.correct, fb.correct), fast: bigger(fa.fast, fb.fast),
        run: bigger(fa.run, fb.run), bestRun: bigger(fa.bestRun, fb.bestRun), cleanDays: bigger(fa.cleanDays, fb.cleanDays),
        imagineOpen: !!(fa.imagineOpen || fb.imagineOpen), rung: bigger(fa.rung, fb.rung),   // the ladder is skill: the higher rung wins
        days: days, byType: byType, last12: (lead.last12 || []).slice(-FLASH_WINDOW),
      });
    }
    /* Play. Games played and won are the kid's numbers, so two devices take the larger of each and
       `bestLevelWon` takes the higher rung — a phone that never saw Tuesday's win cannot undo it.
       `recent` is the one list that unions rather than picking a side, keyed by when the game ended,
       because the level suggestion reads it and a half-history would suggest the wrong crony. */
    if (a.games || b.games) {
      const ga = a.games || {}, gb = b.games || {}, by = {};
      Object.keys(Object.assign({}, ga.byLevel, gb.byLevel)).forEach((k) => {
        const x = (ga.byLevel || {})[k] || {}, y = (gb.byLevel || {})[k] || {};
        by[k] = { played: bigger(x.played, y.played), wins: bigger(x.wins, y.wins) };
      });
      const rows = {};
      [].concat(ga.recent || [], gb.recent || []).forEach((r) => {
        if (r) rows[(r.t || 0) + "|" + (r.level || "") + "|" + (r.result || "")] = r;
      });
      const recent = Object.keys(rows).map((k) => rows[k])
        .sort((x, y) => (y.t || 0) - (x.t || 0)).slice(0, GAMES_RECENT);
      const rung = (id) => LEVEL_ORDER.indexOf(String(id || ""));
      out.games = Object.assign({}, ga, gb, {
        played: bigger(ga.played, gb.played), wins: bigger(ga.wins, gb.wins),
        draws: bigger(ga.draws, gb.draws), losses: bigger(ga.losses, gb.losses),
        byLevel: by, recent: recent,
        bestLevelWon: rung(ga.bestLevelWon) >= rung(gb.bestLevelWon) ? (ga.bestLevelWon || null) : (gb.bestLevelWon || null),
      });
    }
    /* Versus. Same rule as Play and for the same reason: every counter only ever climbs, so two
       devices take the larger of each rather than summing a game both of them saw. `results` is this
       kid's own win/draw/loss row — there is no head-to-head anywhere to merge — and `recent` unions
       by when the game ended. */
    if (a.versus || b.versus) {
      const va = a.versus || {}, vb = b.versus || {};
      const ra = va.results || {}, rb = vb.results || {};
      const rows = {};
      [].concat(va.recent || [], vb.recent || []).forEach((r) => {
        if (r) rows[(r.t || 0) + "|" + (r.colour || "") + "|" + (r.result || "")] = r;
      });
      out.versus = Object.assign({}, va, vb, {
        played: bigger(va.played, vb.played), asWhite: bigger(va.asWhite, vb.asWhite), asBlack: bigger(va.asBlack, vb.asBlack),
        results: { win: bigger(ra.win, rb.win), draw: bigger(ra.draw, rb.draw), loss: bigger(ra.loss, rb.loss) },
        recent: Object.keys(rows).map((k) => rows[k]).sort((x, y) => (y.t || 0) - (x.t || 0)).slice(0, GAMES_RECENT),
      });
    }
    // His best moments. Union, newest first, one per move, capped — the same shape as the binder.
    if (a.bestMoves || b.bestMoves) {
      const seenBest = {};
      out.bestMoves = [].concat(a.bestMoves || [], b.bestMoves || [])
        .filter((m) => m && m.san)
        .sort((x, y) => (y.t || 0) - (x.t || 0))
        .filter((m) => { const k = (m.t || 0) + "|" + m.san + "|" + (m.fen || ""); if (seenBest[k]) return false; seenBest[k] = 1; return true; })
        .slice(0, BEST_MOVES_MAX);
    }
    // Fights made out of his own games. Union, newest first, one per position, capped like a binder.
    if (a.gameFights || b.gameFights) {
      const seen = {};
      out.gameFights = [].concat(a.gameFights || [], b.gameFights || [])
        .filter((f) => f && f.fen)
        .sort((x, y) => (y.t || 0) - (x.t || 0))
        .filter((f) => { if (seen[f.fen]) return false; seen[f.fen] = 1; return true; })
        .slice(0, GAME_FIGHTS_MAX);
    }
    return out;
  }

  /* ---------- identity: the Yomple household code ----------
     A family is the household code every Yomple app already shares: a tree word and four characters
     from an alphabet with no 0/O/1/I/L, like MAPLE-K7Q2. It is typed forgivingly ("maple k7q2",
     "MAPLEK7Q2") and always stored in one form. Each kid is a slot (0 or 1) with his own 4-digit
     Shockmate PIN, which the server keeps hashed and checks; the coach PIN never leaves the device. */
  const WORDS = ["OAK", "MAPLE", "PINE", "CEDAR", "ELM", "BIRCH", "WILLOW", "ASPEN", "LAUREL", "HOLLY"];
  const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const CODE_RE = /^(OAK|MAPLE|PINE|CEDAR|ELM|BIRCH|WILLOW|ASPEN|LAUREL|HOLLY)-[2-9A-HJKMNP-Z]{4}$/;
  const FLEX_RE = /^(OAK|MAPLE|PINE|CEDAR|ELM|BIRCH|WILLOW|ASPEN|LAUREL|HOLLY)([2-9A-HJKMNP-Z]{4})$/;
  const CODE_MAX = 14;   // the code box: "LAUREL - K7Q2" and a stray space still fit
  const SITE = "https://dirac1974.github.io/shockmate/";
  // The canonical WORD-XXXX when the text is a household code typed any way; otherwise the text
  // cleaned (caps, letters and digits), so the box can show what was read.
  function normaliseCode(text) {
    const flat = String(text || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const m = flat.match(FLEX_RE);
    return m ? m[1] + "-" + m[2] : flat;
  }
  function mintCode(rand) {
    const r = rand || Math.random;
    let tail = "";
    for (let i = 0; i < 4; i++) tail += CODE_ALPHABET.charAt(Math.floor(r() * CODE_ALPHABET.length));
    return WORDS[Math.floor(r() * WORDS.length)] + "-" + tail;
  }
  function normalisePin(text) { return String(text == null ? "" : text).replace(/[^0-9]/g, "").slice(0, 4); }
  function validCode(code) { return CODE_RE.test(normaliseCode(code)); }
  function validPin(pin) { return normalisePin(pin).length === 4; }
  function validSlot(slot) { return slot === 0 || slot === 1; }
  function cleanName(text) {
    return String(text || "").split("").filter((c) => c.charCodeAt(0) >= 32 && c !== "<" && c !== ">").join("").trim().slice(0, 16);
  }
  function param(search, name) {
    const m = String(search || "").match(new RegExp("[?&]" + name + "=([^&#]*)", "i"));
    if (!m) return null;
    let raw = m[1]; try { raw = decodeURIComponent(raw.replace(/\+/g, " ")); } catch (e) {}
    return raw;
  }
  // ?family=CODE on the page URL, as a share link opens it; the Yomple hub sends ?f=CODE. Null when
  // absent or malformed.
  function codeFromSearch(search) {
    const raw = param(search, "family") || param(search, "f");
    if (raw == null) return null;
    const code = normaliseCode(raw);
    return CODE_RE.test(code) ? code : null;
  }
  // Coming from yomple.com: ?u=<username>&from=yomple names the kid who tapped Shockmate there.
  function yompleUser(search) {
    if (!/^yomple$/i.test(param(search, "from") || "")) return null;
    const u = String(param(search, "u") || "").trim().toLowerCase();
    return /^[a-z0-9][a-z0-9-]{0,39}$/.test(u) ? u : null;
  }
  function shareUrl(code) { return SITE + "?family=" + normaliseCode(code); }
  function shareText(code) { return "Join our Shockmate family: " + normaliseCode(code) + " " + shareUrl(code); }

  /* ---------- the household's kids, from Yomple ----------
     yomple_family_players answers per app table; the same kid shows up in several apps, sometimes as
     "Sam", sometimes as a test name like "Foxy (Sarah)" or "Player 1". The list the kid picks from is
     his Shockmate siblings first, then real-looking names, the ones in the most apps first. */
  const YOMPLE_TABLES = ["hop_players", "bloom_players", "garden_players", "star_players", "field_players"];
  const ROSTER_MAX = 6;
  const GENERIC = /^(player|kid|test|user|guest)( ?[0-9]+)?$/i;
  function buildRoster(yompleRows, smRows, preferUser) {
    const byName = {};
    const order = [];
    const add = function (name, extra) {
      const n = cleanName(name); if (!n) return null;
      const k = n.toLowerCase();
      if (!byName[k]) { byName[k] = { name: n, slot: null, usernames: [], tables: {}, clean: true }; order.push(k); }
      return Object.assign(byName[k], extra || {});
    };
    (smRows || []).forEach(function (r) { if (r && validSlot(r.slot)) add(r.name, { slot: r.slot }); });
    (yompleRows || []).forEach(function (r) {
      if (!r) return;
      const shown = String(r.display_name || r.username || "");
      if (GENERIC.test(cleanName(shown))) return;
      const e = add(shown); if (!e) return;
      const u = String(r.username || "").toLowerCase();
      if (u && e.usernames.indexOf(u) < 0) e.usernames.push(u);
      if (r.table) e.tables[r.table] = 1;
      // A name with a bracket or a numbered username looks made up for a test.
      if (/[()]/.test(shown) || /-[0-9]+$/.test(u)) e.clean = e.clean && e.slot != null;
    });
    const list = order.map(function (k) { return byName[k]; });
    const rank = function (e) {
      return [e.slot != null ? e.slot : 9, preferUser && e.usernames.indexOf(preferUser) >= 0 ? 0 : 1,
        e.clean ? 0 : 1, -Object.keys(e.tables).length];
    };
    list.sort(function (a, b) {
      const x = rank(a), y = rank(b);
      for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
      return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
    });
    return list.slice(0, Math.max(ROSTER_MAX, list.filter(function (e) { return e.slot != null; }).length))
      .map(function (e) { return { name: e.name, slot: e.slot, usernames: e.usernames,
        me: !!(preferUser && e.usernames.indexOf(preferUser) >= 0) }; });
  }
  // The slot a new kid would take: the first one nobody has.
  function freeSlot(smRows) {
    const used = (smRows || []).map(function (r) { return r && r.slot; });
    return [0, 1].filter(function (s) { return used.indexOf(s) < 0; })[0];
  }

  // Which slots this phone can sync: the ones whose PIN it knows.
  function syncSlots(family) {
    const f = family || {};
    if (!validCode(f.code)) return [];
    return [0, 1].filter((i) => validPin((f.pins || [])[i]));
  }
  function joined(family) {
    const f = family || {};
    return validCode(f.code) && validSlot(f.me) && validPin((f.pins || [])[f.me]);
  }

  // The coach's name and PIN ride in the backup file, because "restore a backup" is the only answer
  // the Forgot? line can give. The PIN is a gate, not a secret, so it travels in clear like everything else.
  function parentOf(o) {
    const p = (o && o.parent) || {};
    return { name: String(p.name || "").trim().slice(0, 16), pin: normalisePin(p.pin) };
  }
  function exportBlob(settings, profiles) {
    return { app: "shockmate", version: 3, savedAt: Date.now(), names: (settings || {}).names || [],
      parent: parentOf(settings), profiles: profiles || [] };
  }
  function importBlob(text, profiles, settings) {
    let blob;
    try { blob = typeof text === "string" ? JSON.parse(text) : text; } catch (e) { throw new Error("That file is not a Shockmate backup."); }
    if (!blob || blob.app !== "shockmate" || !Array.isArray(blob.profiles)) throw new Error("That file is not a Shockmate backup.");
    // A PIN set on THIS device is never blanked by a restore: an old file must not lock the parent
    // out of the device he is holding. With nothing set locally, the file's coach is adopted whole.
    const local = parentOf(settings), incoming = parentOf(blob);
    const parent = validPin(local.pin) ? { name: local.name || incoming.name, pin: local.pin } : incoming;
    // Import merges: restoring an old backup can never delete a card won since.
    return { names: blob.names || [], parent: parent,
      profiles: [0, 1].map((i) => mergeStats((profiles || [])[i], blob.profiles[i])) };
  }

  /* ---------- transport ----------
     The URL and the publishable key are baked into sync-config.js: the database is closed to that
     key except through the sm_* functions, which check the code and the kid's PIN themselves. */
  function keyOf(cfg) { return (cfg && (cfg.key || cfg.anonKey)) || ""; }
  function configured(cfg) { return !!(cfg && cfg.url && keyOf(cfg)); }

  // Errors carry `.code`: "pin" and "locked" from the server's PIN check, "ply"/"turn"/"over"/"same"
  // from a live game, "http" for anything the server refused outright, "offline" for no network.
  function fail(code, message, extra) { const e = new Error(message); e.code = code; if (extra) Object.assign(e, extra); return e; }
  const MESSAGES = { taken: "That spot is already taken.", name: "That name is already in the family.",
    pin: "That PIN is not right.", locked: "Too many wrong PINs. Try again in 15 minutes.",
    ply: "The game moved on.", turn: "Not your turn.", over: "That game is over.", same: "Both phones are the same player." };

  function rpc(cfg, name, body, fetchImpl) {
    const f = fetchImpl || (typeof fetch === "function" ? fetch : null);
    if (!configured(cfg)) return Promise.reject(fail("config", "Sync is not set up on this build."));
    if (!f) return Promise.reject(fail("offline", "No network in this environment."));
    const key = keyOf(cfg);
    const headers = { "Content-Type": "application/json", apikey: key };
    // A legacy anon JWT also goes in Authorization; a publishable key does not need to.
    if (/^eyJ/.test(key)) headers.Authorization = "Bearer " + key;
    return Promise.resolve().then(() => f(String(cfg.url).replace(/\/+$/, "") + "/rest/v1/rpc/" + name, {
      method: "POST", headers: headers, body: JSON.stringify(body),
    })).catch((err) => { throw fail("offline", "No connection. " + String((err && err.message) || err).slice(0, 80)); })
      .then((res) => {
        if (!res.ok) return res.text().then((t) => { throw fail("http", "Sync failed (" + res.status + ") " + String(t).slice(0, 120), { status: res.status }); });
        return res.json();
      }).then((data) => {
        if (data && !Array.isArray(data) && typeof data === "object" && typeof data.error === "string") {
          throw fail(data.error, MESSAGES[data.error] || data.error, { game: data.game || null });
        }
        return data;
      });
  }

  function familyCreate(cfg, code, name, kids, fetchImpl) {
    const list = (kids || []).map((k) => ({ name: cleanName(k && k.name), pin: normalisePin(k && k.pin) }));
    if (!validCode(code)) return Promise.reject(fail("input", "That is not a family code."));
    if (!list.length || list.length > 2 || list.some((k) => !k.name || !validPin(k.pin))) {
      return Promise.reject(fail("input", "Each kid needs a name and a 4-digit PIN."));
    }
    return rpc(cfg, "sm_family_create", { p_code: normaliseCode(code), p_name: String(name || "").trim().slice(0, 32), p_kids: list }, fetchImpl)
      .then((r) => normaliseCode(r && r.code));
  }
  // A kid of a household that already exists claims a Shockmate slot with a new PIN.
  function familyAdopt(cfg, code, slot, name, pin, fetchImpl) {
    const n = cleanName(name), p = normalisePin(pin);
    if (!validCode(code) || !validSlot(slot) || !n || !validPin(p)) {
      return Promise.reject(fail("input", "A name and a 4-digit PIN, please."));
    }
    return rpc(cfg, "sm_family_adopt", { p_code: normaliseCode(code), p_slot: slot, p_name: n, p_pin: p }, fetchImpl)
      .then((r) => ({ code: normaliseCode(r && r.code), slot: r && r.slot, name: String((r && r.name) || n) }));
  }
  function familyRoster(cfg, code, fetchImpl) {
    if (!validCode(code)) return Promise.reject(fail("input", "Codes look like MAPLE-K7Q2."));
    return rpc(cfg, "sm_family_roster", { p_code: normaliseCode(code) }, fetchImpl)
      .then((rows) => (rows || []).filter((r) => r && validSlot(r.slot)).map((r) => ({ slot: r.slot, name: String(r.name || "") })));
  }

  /* ---------- Yomple, read-mostly ----------
     The household's kids come from Yomple's own project (its anon key is public by design; every
     table there is closed and each function checks its input). Shockmate only ever reads players by
     code, and registers a code it minted itself so the other apps accept it later. */
  function yompleKids(ycfg, code, fetchImpl) {
    if (!validCode(code)) return Promise.reject(fail("input", "Codes look like MAPLE-K7Q2."));
    const c = normaliseCode(code);
    return Promise.all(YOMPLE_TABLES.map((t) => rpc(ycfg, "yomple_family_players", { p_code: c, p_table: t }, fetchImpl)
      .then((rows) => (Array.isArray(rows) ? rows : []).map((r) => Object.assign({ table: t }, r)))))
      .then((lists) => [].concat.apply([], lists));
  }
  function yompleRegister(ycfg, code, fetchImpl) {
    if (!validCode(code)) return Promise.reject(fail("input", "That is not a family code."));
    return rpc(ycfg, "yomple_family_upsert", { p_code: normaliseCode(code), p_email: null }, fetchImpl);
  }
  /* What a typed code opens: Yomple's kids and Shockmate's players, together. `found` is false only
     when neither knows the code. A Yomple outage still lets a Shockmate family in. */
  function lookupFamily(cfg, ycfg, code, preferUser, fetchImpl) {
    if (!validCode(code)) return Promise.reject(fail("input", "Codes look like MAPLE-K7Q2."));
    const y = configured(ycfg) ? yompleKids(ycfg, code, fetchImpl).then((r) => ({ rows: r }), (e) => ({ rows: [], err: e }))
      : Promise.resolve({ rows: [] });
    return Promise.all([y, familyRoster(cfg, code, fetchImpl)]).then((both) => {
      const yr = both[0], sm = both[1];
      if (!yr.rows.length && !sm.length && yr.err) throw yr.err;
      return { code: normaliseCode(code), found: yr.rows.length > 0 || sm.length > 0, players: sm,
        yomple: yr.rows.length > 0, roster: buildRoster(yr.rows, sm, preferUser), free: freeSlot(sm) };
    });
  }
  function auth(code, slot, pin) { return { p_code: normaliseCode(code), p_slot: slot, p_pin: normalisePin(pin) }; }
  function pull(cfg, code, slot, pin, fetchImpl) { return rpc(cfg, "sm_pull", auth(code, slot, pin), fetchImpl); }
  function push(cfg, code, slot, pin, stats, fetchImpl) {
    return rpc(cfg, "sm_push", Object.assign(auth(code, slot, pin), { p_progress: stats || {} }), fetchImpl);
  }
  function rename(cfg, code, slot, pin, name, fetchImpl) {
    return rpc(cfg, "sm_rename", Object.assign(auth(code, slot, pin), { p_name: cleanName(name) }), fetchImpl);
  }

  const api = { mergeStats, mergeCard, normaliseCode, normalisePin, validCode, validPin, validSlot, cleanName,
    codeFromSearch, yompleUser, shareUrl, shareText, syncSlots, joined, mintCode, buildRoster, freeSlot,
    CODE_ALPHABET, CODE_MAX, WORDS, YOMPLE_TABLES, ROSTER_MAX, SITE,
    exportBlob, importBlob, parentOf, configured, rpc, auth, familyCreate, familyAdopt, familyRoster,
    yompleKids, yompleRegister, lookupFamily, pull, push, rename,
    LEDGER_MAX, TIERS_MAX, GAMES_RECENT, GAME_FIGHTS_MAX, BEST_MOVES_MAX, FLASH_WINDOW, LEVEL_ORDER };
  root.ShockmateSync = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
