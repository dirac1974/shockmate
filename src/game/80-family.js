  /* ================= FAMILY: one-tap setup =================
     First launch, a ?family=CODE link (or ?f=CODE from yomple.com), or Settings -> Family. The family
     is the Yomple household code every other app already uses (MAPLE-K7Q2). Join: type it, the
     household's kids come from Yomple, the kid taps himself, then his Shockmate PIN (or, new here, he
     makes one, twice). No code yet: the kids' names and PINs, and the phone mints a household code and
     registers it with Yomple so the other apps take it too. Skip keeps the phone local. The coach PIN
     is a different thing and never leaves the phone. */
  const FAM = { step: "choose", mode: "new", from: "first", names: ["", ""], pins: ["", ""], kid: 0,
    typed: "", first: "", code: "", roster: [], players: [], free: 0, pick: null, pickName: "", user: null, busy: false, me: 0,
    // The join waiting on "which of these is yours": {slot, pin, remote}, or null when nothing is asked.
    ask: null };
  const FAM_STEPS = ["choose", "names", "pin", "code-card", "pick", "mine"];
  function yompleCfg() { return window.SHOCKMATE_YOMPLE && window.SHOCKMATE_YOMPLE.url ? window.SHOCKMATE_YOMPLE : null; }
  const FAM_NOT_FOUND = "No family has that code. Check it with whoever set it up. Codes look like MAPLE-K7Q2; it is the same code your other apps use.";
  function famOffline(err) { return err && err.code === "offline" ? "No connection. Try again with signal." : String((err && err.message) || err); }
  // The family card has its own Glitch; his lines there come off the same tables as everywhere else.
  function famLine(kind) {
    const l = pickFrom(S.GLITCH_LINES[kind], "moment." + kind);
    const g = window.ShockmateGlitch;
    if (g && $("fam-glitch")) $("fam-glitch").innerHTML = g.svg(l.mood || "taunt");
    if ($("fam-line")) { $("fam-line").textContent = l.text || ""; $("fam-line").hidden = !l.text; }
    speak(l.key);
  }
  function famState(text) { if ($("fam-state")) $("fam-state").textContent = text || ""; }
  function famShow(step) {
    FAM.step = step;
    FAM_STEPS.forEach(function (id) { const el = $("fam-" + id); if (el) el.hidden = id !== step; });
    // "Skip" already says it on the first card, and "Done" says it once there is a code.
    if ($("btn-fam-back")) $("btn-fam-back").hidden = (step === "choose" && FAM.from === "first") || step === "code-card";
    famState("");
    show("screen-family");
  }
  // `slot` is the ?me= from the URL: this phone has been here before and the link remembers which kid
  // it is, so the roster step is skipped and he is asked for his PIN and nothing else.
  function openFamily(from, code, slot) {
    Object.assign(FAM, { step: "choose", mode: "new", from: from || "first", names: ["", ""], pins: ["", ""], kid: 0,
      typed: "", first: "", code: "", roster: [], players: [], free: 0, pick: null, pickName: "", busy: false, me: 0, ask: null,
      want: Y.validSlot(slot) ? slot : null, user: Y.yompleUser(location.search) });
    if (!Y.configured(syncCfg())) { toast("Family sync is not set up on this build.", 2600); return goHome(); }
    famShow("choose");
    $("fam-code-input").value = code || "";
    if (code) { famLine("famCode"); return famFind(); }
    famLine("famNew");
  }
  function famLeave() {
    const from = FAM.from;
    if (!Y.validCode(fam().code) && from === "first") fam().skipped = true;
    save(); restartLivePoller();
    if (from === "settings") { renderSettings(); return show("screen-settings"); }
    goHome();
  }
  function renderFamKeypad() {
    const host = $("fam-keypad"); if (!host || host.childElementCount) return;
    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "back", "0"];
    host.innerHTML = keys.map(function (k) {
      return k === "back" ? '<button type="button" class="token key del" data-fkey="back" aria-label="Delete">&#9003;</button>'
        : '<button type="button" class="token key" data-fkey="' + k + '">' + k + "</button>";
    }).join("") + "<span></span>";
    Array.prototype.forEach.call(host.querySelectorAll("button[data-fkey]"), function (b) {
      b.onclick = function () { famKey(b.dataset.fkey); };
    });
  }
  function famDots() {
    const host = $("fam-pin-dots"); if (!host) return;
    let h = ""; for (let i = 0; i < 4; i++) h += '<span class="' + (i < FAM.typed.length ? "on" : "") + '"></span>';
    host.innerHTML = h;
  }
  function famShake(msg) {
    const c = $("fam-pin"); if (c) { c.classList.remove("wrong"); void c.offsetWidth; c.classList.add("wrong"); }
    sfx("nope"); FAM.typed = ""; famDots(); if (msg) famState(msg);
  }
  function famPin() {
    renderFamKeypad(); FAM.typed = "";
    const who = FAM.mode === "new" ? FAM.names[FAM.kid] : FAM.pickName;
    $("fam-pin-title").textContent = FAM.mode === "join" ? who + ", type your PIN"
      : (FAM.first ? who + ", type it again" : who + ", pick a secret PIN");
    $("fam-pin-hint").textContent = FAM.mode === "join"
      ? "Your Shockmate PIN: the four digits you picked the first time you played here."
      : "Four digits only you know. It joins your games and keeps your cards safe. The coach's PIN is a different one.";
    famDots(); famShow("pin");
  }
  function famKey(k) {
    if (FAM.busy) return;
    if (k === "back") { FAM.typed = FAM.typed.slice(0, -1); return famDots(); }
    if (FAM.typed.length >= 4) return;
    FAM.typed += k; sfx("select"); famDots();
    if (FAM.typed.length === 4) setTimeout(famPinDone, T(160));
  }
  function famPinDone() {
    const typed = FAM.typed;
    if (FAM.mode === "join") return famJoinPin(typed);
    if (!FAM.first) { FAM.first = typed; return famPin(); }
    if (typed !== FAM.first) { FAM.first = ""; famPin(); return famShake("Those two did not match. Pick again."); }
    FAM.first = "";
    if (FAM.mode === "claim") return famClaim(typed);
    FAM.pins[FAM.kid] = typed;
    if (FAM.kid === 0 && FAM.names[1]) { FAM.kid = 1; return famPin(); }
    famCreate();
  }
  /* No code yet: mint a household code the Yomple way, make sure no household already has it, make
     the Shockmate family under it, then register it with Yomple so every other app takes it. */
  function famMintFree(tries) {
    const code = Y.mintCode(), ycfg = yompleCfg();
    if (!Y.configured(ycfg)) return Promise.resolve(code);
    return Y.yompleKids(ycfg, code).then(function (rows) {
      if (rows.length && tries < 6) return famMintFree(tries + 1);
      return code;
    }, function () { return code; });
  }
  function famCreate() {
    const kids = FAM.names.map(function (n, i) { return { name: n, pin: FAM.pins[i] }; }).filter(function (k) { return k.name; });
    FAM.busy = true; famState("Making your family…");
    const attempt = function (tries) {
      return famMintFree(0).then(function (code) {
        return Y.familyCreate(syncCfg(), code, "", kids).catch(function (err) {
          if (err && err.code === "taken" && tries < 6) return attempt(tries + 1);
          throw err;
        });
      });
    };
    attempt(0).then(function (code) {
      // Best effort: the family works in Shockmate either way, and any Yomple app registers a code it is given.
      if (Y.configured(yompleCfg())) Y.yompleRegister(yompleCfg(), code).catch(function () {});
      FAM.busy = false; FAM.code = code;
      state.settings.family = { code: code, me: 0, pins: [FAM.pins[0] || "", FAM.pins[1] || ""],
        roster: kids.map(function (k, i) { return { slot: i, name: k.name }; }), skipped: false };
      kids.forEach(function (k, i) { state.settings.names[i] = k.name; });
      state.settings.profile = 0; useProfile(0); save(); hud();
      afterJoin();
      syncNow(true);
      famLine("famMade");
      renderFamCode(); famShow("code-card");
    }).catch(function (err) {
      FAM.busy = false; FAM.kid = 0; FAM.first = "";
      famShow("names"); famState(famOffline(err));
    });
  }
  function renderFamCode() {
    const f = fam();
    $("fam-code-big").textContent = f.code;
    const host = $("fam-me"); if (!host) return;
    const both = (f.roster || []).length > 1;
    $("fam-me-row").hidden = !both;
    host.innerHTML = (f.roster || []).map(function (r) {
      return '<button type="button" class="chip' + (r.slot === f.me ? " active" : "") + '" data-me="' + r.slot + '">' + esc(r.name) + "</button>";
    }).join("");
    Array.prototype.forEach.call(host.querySelectorAll("button[data-me]"), function (b) {
      b.onclick = function () {
        const slot = Number(b.dataset.me); fam().me = slot; state.settings.profile = slot; useProfile(slot); save(); hud(); stampIdentity(); renderFamCode();
      };
    });
  }
  function shareFamily(code) { return shareText(Y.shareText(code), "Copied. Paste it to the other phone."); }
  // The system share sheet where there is one, the clipboard where there is not, the text itself as
  // the last resort. Used for the family link and for the coach's week.
  function shareText(text, copiedLine) {
    const copy = function () {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        // A clipboard write can hang waiting on a permission; after a second and a half, show the text.
        const slow = new Promise(function (r) { setTimeout(function () { r("slow"); }, 1500); });
        return Promise.race([navigator.clipboard.writeText(text).then(function () { return "ok"; }), slow])
          .then(function (how) { toast(how === "ok" ? copiedLine : text, how === "ok" ? 2400 : 6000); },
            function () { toast(text, 6000); });
      }
      toast(text, 6000); return Promise.resolve();
    };
    if (navigator.share) return navigator.share({ title: "Shockmate", text: text }).catch(function (err) {
      if (err && err.name === "AbortError") return; return copy();
    });
    return copy();
  }
  // The household code, typed any way: the kids from Yomple and Shockmate together, then "which one are you?"
  function famFind() {
    if (FAM.busy) return;
    const code = Y.normaliseCode($("fam-code-input").value);
    if (!Y.validCode(code)) return famState("Codes look like MAPLE-K7Q2; it is the same code your other apps use.");
    $("fam-code-input").value = code;
    FAM.busy = true; famState("Looking for your family…");
    Y.lookupFamily(syncCfg(), yompleCfg(), code, FAM.user).then(function (r) {
      FAM.busy = false;
      if (!r.found) { famLine("famMissing"); return famState(FAM_NOT_FOUND); }
      FAM.code = r.code; FAM.players = r.players; FAM.free = r.free; FAM.roster = r.roster;
      famLine("famFound");
      renderFamRoster();
      // The URL named the slot, so the roster has already been answered once on this phone: go
      // straight to his PIN. The list is built anyway, so "not now" still steps back to it.
      const want = FAM.want; FAM.want = null;
      const mine = want == null ? null : FAM.roster.filter(function (e) { return e.slot === want; })[0];
      if (mine) return famChoose(mine);
      famShow("pick");
    }).catch(function (err) {
      FAM.busy = false;
      famState(famOffline(err));
    });
  }
  function renderFamRoster() {
    const host = $("fam-roster");
    host.innerHTML = FAM.roster.map(function (r, i) {
      return '<button type="button" class="cta play' + (r.me ? " me" : "") + '" data-pick="' + i + '"' +
        (r.slot != null ? ' data-slot="' + r.slot + '"' : "") + ">" + esc(r.name) + "</button>";
    }).join("") + '<button type="button" class="chip" data-other="1">Someone else</button>';
    Array.prototype.forEach.call(host.querySelectorAll("button[data-pick]"), function (b) {
      b.onclick = function () { famChoose(FAM.roster[Number(b.dataset.pick)]); };
    });
    host.querySelector("button[data-other]").onclick = function () {
      $("fam-other").hidden = false; $("fam-other-name").value = ""; famLine("famOther"); famState("");
      try { $("fam-other-name").focus(); } catch (e) {}
    };
    $("fam-other").hidden = true;
  }
  function famChoose(entry) {
    if (!entry || FAM.busy) return;
    FAM.first = "";
    if (entry.slot != null) { FAM.mode = "join"; FAM.pick = entry.slot; FAM.pickName = entry.name; return famPin(); }
    if (FAM.free == null) {
      const who = FAM.players.map(function (p) { return p.name; }).join(" and ");
      return famState("Shockmate has room for two players in a family, and " + who + " have them. Tap one of them.");
    }
    FAM.mode = "claim"; FAM.pick = FAM.free; FAM.pickName = entry.name;
    famLine("famClaim");
    famPin();
  }
  function famOtherGo() {
    const name = Y.cleanName($("fam-other-name").value);
    if (!name) return famState("Type your name first.");
    const same = FAM.roster.filter(function (r) { return r.name.toLowerCase() === name.toLowerCase(); })[0];
    famChoose(same || { name: name, slot: null });
  }
  // A kid new to Shockmate: his PIN claims the free slot, then the phone is his.
  function famClaim(pin) {
    const slot = FAM.pick, code = FAM.code;
    FAM.busy = true; famState("Saving your PIN…");
    Y.familyAdopt(syncCfg(), code, slot, FAM.pickName, pin).then(function (r) {
      FAM.busy = false;
      FAM.players = FAM.players.filter(function (p) { return p.slot !== slot; }).concat([{ slot: slot, name: r.name }])
        .sort(function (a, b) { return a.slot - b.slot; });
      famEnter(slot, pin, {});
    }).catch(function (err) {
      FAM.busy = false;
      // Someone got there first (the other phone, a moment ago): look again, with the new list.
      if (err && (err.code === "taken" || err.code === "name")) { famShow("choose"); return famFind(); }
      famShake(famOffline(err));
    });
  }
  // The PIN is checked by pulling his own progress, which is also the first half of his first sync.
  function famJoinPin(pin) {
    const slot = FAM.pick;
    FAM.busy = true; famState("Checking…");
    Y.pull(syncCfg(), FAM.code, slot, pin).then(function (remote) {
      FAM.busy = false;
      famEnter(slot, pin, remote);
    }).catch(function (err) {
      FAM.busy = false;
      if (err && err.code === "pin") return famShake("Not that one. Try again.");
      if (err && err.code === "locked") return famShake("Too many wrong tries. Wait 15 minutes.");
      famShake(famOffline(err));
    });
  }
  /* ---------- the join keeps his cards ----------
     A kid's progress lives in whichever local profile he has been playing as, and that need not be
     the slot the family gives him: "Player 2" on this phone can be slot 0 in the family. Matching by
     index would leave his cards in his brother's slot, where the brother inherits them on the next
     join. So his local profile is found by name and moved to his slot before the merge — by swapping,
     so the other kid's cards travel with the other index. When a name cannot answer it, he is asked. */
  function famEnter(slot, pin, remote) {
    const who = FAM.pickName || ((FAM.players.filter(function (p) { return p.slot === slot; })[0] || {}).name) || "";
    const idx = S.pickLocalProfile(state.settings.names, state.profiles, slot, who);
    if (idx === null) return famAsk(slot, pin, remote, who);
    famLand(slot, pin, remote, idx);
  }
  function summaryLine(s) {
    const one = function (n, w) { return n + " " + w + (n === 1 ? "" : "s"); };
    return one(s.cards, "card") + " · " + one(s.games, "game");
  }
  // One screen, one question. Both chips stay tappable whatever he picks; nothing is deleted here.
  function famAsk(slot, pin, remote, who) {
    FAM.ask = { slot: slot, pin: pin, remote: remote || {} };
    $("fam-mine-title").textContent = "Which of these is yours, " + who + "?";
    const host = $("fam-mine-list");
    host.innerHTML = [0, 1].map(function (i) {
      return '<button type="button" class="cta play" data-mine="' + i + '">' + esc(state.settings.names[i]) +
        "<small>" + summaryLine(S.profileSummary(state.profiles[i])) + "</small></button>";
    }).join("");
    Array.prototype.forEach.call(host.querySelectorAll("button[data-mine]"), function (b) {
      b.onclick = function () { famMine(Number(b.dataset.mine)); };
    });
    $("btn-fam-mine-fresh").onclick = function () { famMine(null); };
    famLine("famMine");
    famShow("mine");
  }
  function famMine(idx) {
    const a = FAM.ask; if (!a) return;
    FAM.ask = null;
    famLand(a.slot, a.pin, a.remote, idx);
  }
  // `idx` is the local profile that is his, or null for "neither of these": the slot then starts from
  // the family's copy alone, and anything that was sitting in that slot is parked, never dropped.
  function famLand(slot, pin, remote, idx) {
    const code = FAM.code, was = fam(), same = was.code === code;
    const pins = same ? was.pins.slice() : ["", ""]; pins[slot] = pin;
    const placed = S.placeLocal(state.profiles, state.settings.names, idx, slot);
    state.profiles = placed.profiles; state.settings.names = placed.names;
    if (idx === null) keepAside(slot);
    const local = idx === null ? freshStats() : state.profiles[slot];
    state.settings.family = { code: code, me: slot, pins: pins, roster: FAM.players.slice(), skipped: false };
    applyRoster(FAM.players);
    state.profiles[slot] = Object.assign(freshStats(), Y.mergeStats(local, remote || {}));
    state.settings.profile = slot; setSeats(1); useProfile(slot); save(); hud();
    afterJoin();
    syncNow(true);
    toast("This phone is " + state.settings.names[slot] + "'s now.", 2400);
    FAM.from === "settings" ? (renderSettings(), show("screen-settings")) : goHome();
    restartLivePoller();
  }
  // "Neither of these is mine" must still not lose what was in that slot: it is copied aside under
  // its own key with the name it had, so a parent who picked wrong has somewhere to get it back from.
  function keepAside(slot) {
    const p = state.profiles[slot], s = S.profileSummary(p);
    if (!s.cards && !s.games) return;
    try {
      localStorage.setItem(KEY + ":p" + slot + ":kept",
        JSON.stringify({ name: state.settings.names[slot], t: Date.now(), stats: p }));
    } catch (e) {}
  }
  function bindFamily() {
    if (!$("screen-family")) return;
    $("btn-fam-new").onclick = function () {
      FAM.mode = "new";
      [0, 1].forEach(function (i) {
        const n = state.settings.names[i];
        $("fam-name-" + i).value = /^Player [12]$/.test(n) ? "" : n;
      });
      famLine("famNames");
      famShow("names");
    };
    $("btn-fam-skip").onclick = function () { fam().skipped = true; save(); famLeave(); };
    $("btn-fam-names-go").onclick = function () {
      FAM.names = [Y.cleanName($("fam-name-0").value), Y.cleanName($("fam-name-1").value)];
      if (!FAM.names[0]) return famState("The first kid needs a name.");
      if (FAM.names[1] && FAM.names[1].toLowerCase() === FAM.names[0].toLowerCase()) return famState("Two kids need two names.");
      FAM.kid = 0; FAM.first = ""; FAM.pins = ["", ""]; famPin();
    };
    $("btn-fam-find").onclick = famFind;
    $("fam-code-input").onkeydown = function (ev) { if (ev.key === "Enter") famFind(); };
    $("btn-fam-other-go").onclick = famOtherGo;
    $("fam-other-name").onkeydown = function (ev) { if (ev.key === "Enter") famOtherGo(); };
    $("btn-fam-share").onclick = function () { shareFamily(fam().code); };
    $("btn-fam-done").onclick = function () { famLeave(); };
    $("btn-fam-back").onclick = function () {
      if (FAM.busy) return;
      // Backing out of the chooser drops the join, not the cards: nothing has been moved yet.
      if (FAM.step === "mine") { FAM.ask = null; famShow("pick"); return; }
      if (FAM.step === "pin" && FAM.mode !== "new") { FAM.first = ""; famShow("pick"); return; }
      if (FAM.step === "choose" || FAM.from === "settings" || FAM.step === "code-card") return famLeave();
      FAM.first = ""; famShow("choose");
    };
  }

