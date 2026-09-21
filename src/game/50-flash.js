  /* ---------- flash: two minutes of board vision ----------
     A position goes up for a few seconds and is taken away, and he is asked one thing about what it
     MEANT — what was hanging, where Glitch's queen stood, what the last move hit, how many pieces
     were on his king. The harder rung leaves the board alone and makes him hold a move in his head.

     Rules kept: the reveal window is quiet (Glitch says his line before the board arrives and then
     shuts up), one tap or one chip per item, a hint after two wrong and the answer on the third, and
     nothing on the screen counts down — the ring empties instead. Every question a board can carry
     is computed in web/flash.js, which never touches the DOM. */
  function flashOn() { return !!state.flash; }
  function flashSupports(style) { return function (e, t) { return X.supports(e, t, { style: style }); }; }
  function flashItems(planItems, style) {
    const out = [];
    (planItems || []).forEach(function (it) {
      const item = X.itemOf(it, { style: style });
      if (item) { item.enc = it.enc; out.push(item); }
    });
    return out;
  }
  function openFlash(items, style, inCamp) {
    state.flash = { items: items, i: 0, correct: 0, wrong: 0, style: style, inCamp: !!inCamp,
      revealMs: S.flashRevealMs(state.stats), control: null, paired: null };
    state.encounters = items.map(function (i) { return i.enc; });
    state.index = 0; state.phase = "busy";
  }
  function startFlash() {
    useProfile(state.settings.profile);
    const style = coachStyle(state.active);
    /* One control board a drill (never in Camp): a real GONE board's pieces, scattered. The seed is
       this kid, today, and how many items he has already answered today, so a replay gets a new one. */
    const today = S.dateKey(now()), done = (S.flashOf(state.stats).days[today] || { items: 0 }).items;
    const plan = S.flashPlan(state.stats, playPool(), S.FLASH_N, { supports: flashSupports(style),
      control: true, seed: activeName() + "|" + today + "|" + done });
    const items = flashItems(plan.items, style);
    if (!items.length) return toast("Flash needs a board or two first. Win a fight.", 2600);
    state.camp = null; state.prep = false; state.day = 0; state.mode = "solo"; state.duel = null;
    state.sitting = (state.sitting || 0) + 1; state.settings.lastPlayed = now();
    state.session = { count: 0, reviews: 0, won: 0, crits: 0, rage: 0 };
    openFlash(items, style, false);
    show("screen-play"); banner("FLASH", "tease"); glitchMoment("flashReveal");
    prompt(S.coachLine(style, { kind: "flashStart", count: items.length, revealMs: state.flash.revealMs }));
    hud(); renderPowers();
    setTimeout(flashNext, T(1200));
  }
  // The ring is a meter: it empties over the reveal and is never a digit on screen.
  const RING = 106.8;                     // 2 pi r for the r=17 circle in index.html
  function flashRing(ms, ghost) {
    const box = $("flash-ring"), run = $("flash-ring-run"); if (!box || !run) return;
    box.hidden = false; box.classList.toggle("ghost", !!ghost);
    // The window is a fact of the drill, kept where a test can read it: under ?fast=1 the ring is gone in 20 ms.
    if (state.flash) state.flash.ring = { ms: ms, ghost: !!ghost, at: now() };
    run.style.transition = "none"; run.style.strokeDashoffset = "0";
    void run.getBoundingClientRect();
    run.style.transition = "stroke-dashoffset " + Math.max(60, T(ms)) + "ms linear";
    run.style.strokeDashoffset = String(RING);
  }
  function flashRingOff() { const box = $("flash-ring"); if (box) box.hidden = true; }
  // The imagine move, said once on the board and then withdrawn. After this he is on his own.
  function ghostArrow(from, to) {
    const fx = $("fx"), a = sq(from), b = sq(to); if (!fx || !a || !b) return;
    const p = fx.getBoundingClientRect(), r1 = a.getBoundingClientRect(), r2 = b.getBoundingClientRect();
    const x1 = r1.left - p.left + r1.width / 2, y1 = r1.top - p.top + r1.height / 2;
    const x2 = r2.left - p.left + r2.width / 2, y2 = r2.top - p.top + r2.height / 2;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "ghost-arrow");
    svg.setAttribute("width", String(Math.round(p.width))); svg.setAttribute("height", String(Math.round(p.height)));
    svg.innerHTML = '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"/>' +
      '<circle cx="' + x2 + '" cy="' + y2 + '" r="11"/>';
    fx.appendChild(svg);
  }
  function clearGhost() { const fx = $("fx"); if (fx) fx.innerHTML = ""; }
  function flashChips(list, answered) {
    const host = $("flash-chips"); if (!host) return;
    if (!list) { host.hidden = true; host.innerHTML = ""; return; }
    host.hidden = false;
    host.innerHTML = list.map(function (n) { return '<button class="chip" data-flash="' + n + '">' + n + "</button>"; }).join("");
    Array.prototype.forEach.call(host.querySelectorAll("button[data-flash]"), function (b) {
      b.onclick = function () { flashAnswer(Number(b.dataset.flash), b); };
    });
    if (answered) answered.forEach(function (n) { const b = host.querySelector('[data-flash="' + n + '"]'); if (b) b.disabled = true; });
  }
  async function flashNext() {
    const f = state.flash; if (!f) return;
    if (f.i >= f.items.length) return flashEnd();
    const nav = state.nav, item = f.items[f.i];
    state.index = f.i; state.phase = "busy"; state.selected = null; state.gate = null;
    clearMarks(); clearGhost(); flashChips(null); flashRingOff();
    $("board").classList.remove("dim"); $("gate-dots").innerHTML = ""; $("prompt").classList.remove("gate-prompt");
    $("btn-hint").hidden = true; $("btn-skip").hidden = true;
    if ($("ritual")) $("ritual").hidden = true;
    banner("FLASH  " + (f.i + 1) + "/" + f.items.length, "tease");
    prompt(item.style);
    show("screen-play"); renderPath(); hud(); renderPowers();
    setPieces({});
    // He says his line to an empty board, and then the looking happens in silence.
    glitchMoment(item.type === "imagine" ? "flashImagine" : "flashReveal");
    await sleep(900); if (stale(nav) || !state.flash) return;
    setPieces(item.position);
    if (item.type === "imagine") {
      prompt(item.prompt);
      if (sq(item.move.from)) sq(item.move.from).classList.add("flash-from");
      ghostArrow(item.move.from, item.move.to);
      flashRing(item.arrow.ms, true);
      await sleep(item.arrow.ms); if (stale(nav) || !state.flash) return;
      clearGhost(); clearMarks();
    } else {
      flashRing(f.revealMs, false);
      await sleep(f.revealMs); if (stale(nav) || !state.flash) return;
      setPieces(item.hidden);
      glitchMoment("flashHide");
    }
    flashRingOff();
    flashAsk(item);
  }
  function flashAsk(item) {
    state.phase = "flash";
    state.gate = { flash: true, item: item, wrong: 0, tried: [], targets: item.squares.slice(), found: [] };
    prompt(item.type === "imagine" ? item.prompt + " " + item.question : item.question);
    $("prompt").classList.add("gate-prompt");
    $("gate-dots").innerHTML = "<span></span>";
    flashChips(item.kind === "chip" ? X.CHIPS : null);
    $("btn-skip").hidden = false;
  }
  function flashTap(name) {
    const g = state.gate; if (!g || !g.flash || g.item.kind === "chip") return;
    flashAnswer(name, sq(name));
  }
  function flashAnswer(answer, el) {
    const g = state.gate, f = state.flash;
    if (!g || !g.flash || !f) return;
    const item = g.item;
    if (X.check(item, answer)) {
      if (el) el.classList.add(item.kind === "chip" ? "active" : "gate-ok");
      sfx("win");
      return flashSettle(true);
    }
    g.wrong += 1; g.tried.push(answer);
    if (el) { el.classList.remove("nope"); void el.offsetWidth; el.classList.add("nope"); if (item.kind === "chip") el.disabled = true; }
    sfx("nope");
    if (!item.control) glitchMoment("flashWrong");        // the made-up board is his joke, not the kid's miss
    if (g.wrong >= 3) return flashSettle(false);          // the answer on the third; it never holds him longer
    if (g.wrong >= 2) {
      // The hint narrows it: one more square lit, or one more number taken off the chip row.
      if (item.kind === "chip") {
        const host = $("flash-chips");
        const dead = X.CHIPS.filter(function (n) { return n !== item.count && g.tried.indexOf(n) < 0; })[0];
        const btn = dead != null && host ? host.querySelector('[data-flash="' + dead + '"]') : null;
        if (btn) btn.disabled = true;
      } else { const hint = X.hintFor(item); if (hint && sq(hint)) sq(hint).classList.add("gate-hint"); }
      prompt(S.coachLine(f.style, { kind: "flashHint", chip: item.kind === "chip" }));
    }
  }
  function flashSettle(correct) {
    const g = state.gate, f = state.flash, c = state.camp; if (!g || !f) return;
    const nav = state.nav, item = g.item;
    state.gate = null; state.phase = "busy";
    $("prompt").classList.remove("gate-prompt"); flashChips(null);
    /* What is recorded is the FIRST look: he still gets two more tries and still hears "seen", but a
       board he only found on the third tap is not a board he saw. That is the same rule as a card's
       `tries`, which is why Progress can put Flash accuracy and first-try rate side by side at all. */
    const first = correct && !g.wrong;
    if (item.control) {
      /* The control board touches nothing real: not the counts, not the day, not the run, not the
         ladder, not Camp. It waits for its paired real board, and the two are written together. */
      f.control = { correct: first, found: correct };
    } else {
      state.stats = S.recordFlash(state.stats, { type: item.type, correct: first,
        revealMs: item.reveal ? f.revealMs : 0, t: now() }).stats;
      if (item.paired) f.paired = first;
      if (first) f.correct += 1; else f.wrong += 1;
      if (c) { c.flashAsked += 1; c.flashRight += first ? 1 : 0; }
    }
    if (f.control && f.paired != null && !f.controlSaved) {
      f.controlSaved = true;
      state.stats = S.recordFlashControl(state.stats, { correct: f.control.correct, found: f.control.found,
        revealMs: f.revealMs, pairedCorrect: f.paired }).stats;
    }
    save();
    $("gate-dots").innerHTML = correct ? '<span class="on"></span>' : "";
    if (item.control) {
      // Right or wrong, Glitch owns up. The answer still shows, so the board ends like any other.
      banner(correct ? "SEEN" : "THERE", "tease");
      if (!correct) {
        setPieces(item.position);
        item.squares.forEach(function (s) { if (sq(s)) sq(s).classList.add("gate-ok"); });
      }
      // Kept on the item: the next board's line replaces the bubble after the pause, and under ?fast=1 that is 20 ms.
      item.joke = glitchMoment(correct ? "flashJokeRight" : "flashJoke").text;
      prompt(correct ? S.coachLine(f.style, { kind: "flashRight" }) : X.answerText(item));
    } else if (correct) {
      banner("SEEN", "win"); prompt(S.coachLine(f.style, { kind: "flashRight" })); glitchMoment("flashRight");
    } else {
      banner("THERE", "tease");
      setPieces(item.position);                       // the board comes back so the answer has somewhere to stand
      item.squares.forEach(function (s) { if (sq(s)) sq(s).classList.add("gate-ok"); });
      prompt(S.coachLine(f.style, { kind: "flashGive" }) + " " + X.answerText(item));
    }
    f.i += 1;
    const wait = item.control ? 3000 : correct ? 900 : 1700;   // the joke needs a moment to land
    setTimeout(function () { if (!stale(nav) && state.flash) flashNext(); }, T(wait));
  }
  function flashEnd() {
    const f = state.flash; if (!f) return;
    const style = f.style, n = f.items.filter(function (i) { return !i.control; }).length, got = f.correct;
    flashRingOff(); flashChips(null); clearGhost();
    glitchMoment("flashDone");
    if (f.inCamp) { state.flash = null; return campWarmups(); }
    if (state.phase === "end") return;                 // a double tap must not write the debrief twice
    state.flash = null;
    const fl = S.flashOf(state.stats);
    $("end-title").textContent = "Flash done, " + activeName() + "!";
    $("session-summary").textContent = S.coachLine(style, { kind: "flashDone", correct: got, count: n, run: fl.bestRun });
    $("end-rank").textContent = "Flash days: " + S.flashDaysDone(state.stats) + ". Best run: " + (fl.bestRun || 0) + ".";
    if ($("end-say")) { $("end-say").hidden = false; $("end-say").textContent = S.coachLine(style, { kind: "say", question: S.PREP_QUESTIONS[0] }); }
    if ($("end-nudge")) $("end-nudge").hidden = true;
    if ($("btn-next-day")) $("btn-next-day").hidden = true;
    $("session-next").textContent = style === "numbers"
      ? "Flash is " + S.FLASH_N + " boards, a few seconds each. Same tomorrow."
      : "Two minutes tomorrow. Looking at the whole board is the point, not the score.";
    const mini = $("next-mini"); if (mini) { mini.innerHTML = ""; mini.hidden = true; }
    $("session-end").hidden = false; state.phase = "end";
  }

