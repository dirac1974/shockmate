  /* ---------- board ---------- */
  function current() { return state.encounters[state.index % state.encounters.length]; }
  function sq(name) { return document.querySelector('.sq[data-sq="' + name + '"]'); }
  /* A fight never flips: every fight in the app is white-to-move with the kid's pieces at the bottom,
     and the art, the prompts and the why-gate all assume it. Versus is the one place two people are
     sharing one screen, so the board turns round to whoever is to move — the way it would if they
     were sitting opposite each other at a table. `state.flip` is only ever true inside a versus game;
     the square names never change, so every other piece of code is untouched by it. */
  function renderBoard() {
    const board = $("board"); board.innerHTML = "";
    const ranks = state.flip ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
    const files = state.flip ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
    ranks.forEach((r, ri) => files.forEach((f, fi) => {
      const name = FILES[f] + r, cell = document.createElement("div");
      cell.className = "sq " + (((f + r) % 2 === 0) ? "dark" : "light"); cell.dataset.sq = name;
      // The labels ride the drawn edges, not the absolute ones, so a flipped board is still readable.
      if (state.settings.coords && fi === 0) { const c = document.createElement("span"); c.className = "coord rank"; c.textContent = String(r); cell.appendChild(c); }
      if (state.settings.coords && ri === 7) { const c = document.createElement("span"); c.className = "coord file"; c.textContent = FILES[f]; cell.appendChild(c); }
      const p = state.pieces[name];
      if (p) { const el = document.createElement("div"); el.className = "piece " + p.color; el.textContent = GLYPH[p.color + p.role]; cell.appendChild(el); }
      if (state.last && (state.last.from === name || state.last.to === name)) cell.classList.add("last");
      cell.addEventListener("click", () => onSquare(name));
      board.appendChild(cell);
    }));
    paintSelection();
  }
  function clearMarks() { document.querySelectorAll(".sq").forEach((el) => { el.className = el.className.replace(/\b(sel|legal|cap|cand|guide|best-glow|tempt-glow|gate-target|gate-ok|gate-hint|flash-from|fork-glow|pin-freeze|skewer-stab|door-slam|laser|poison)\b/g, "").trim(); }); }
  function paintSelection() {
    if (playing()) return paintPlay();
    const enc = current();
    document.querySelectorAll(".sq").forEach((el) => el.classList.remove("sel", "legal", "cap"));
    const helping = state.tries === 1 || state.helpThisFight;
    if (state.phase === "think" && helping && !state.guided) enc.candidates.forEach((s) => sq(s) && sq(s).classList.add("cand"));
    if (state.guided) { sq(enc.best.slice(0, 2)).classList.add("guide"); sq(enc.best.slice(2, 4)).classList.add("guide"); }
    if (!state.selected) return;
    sq(state.selected).classList.add("sel");
    (enc.legal[state.selected] || []).forEach((m) => {
      if (state.guided && m.uci !== enc.best) return;
      const el = sq(m.to); if (!el) return; el.classList.add("legal"); if (m.capture) el.classList.add("cap");
    });
  }
  // `last` is the move that just happened, shaded on the board the way every chess site does it.
  function setPieces(map, last) { state.pieces = F.clonePieces(map); state.last = last || null; renderBoard(); }
  function onSquare(name) {
    if (state.phase === "gate") return gateTap(name);
    if (state.phase === "threat") return threatTap(name);
    if (state.phase === "flash") return flashTap(name);
    if (state.phase !== "think") return;
    if (playing()) return playSquare(name);
    const enc = current();
    if (state.selected) {
      const option = (enc.legal[state.selected] || []).find((m) => m.to === name);
      if (option && (!state.guided || option.uci === enc.best)) return commitMove(option);
    }
    const p = state.pieces[name];
    if (p && p.color === enc.turn) { state.selected = name; sfx("select"); } else state.selected = null;
    paintSelection();
  }

  /* ---------- fx ---------- */
  function explode(square, big) {
    const board = $("board"), fx = $("fx"), cell = sq(square); if (!cell) return;
    board.classList.remove("shake"); void board.offsetWidth; board.classList.add("shake"); sfx("boom");
    const rect = cell.getBoundingClientRect(), parent = fx.getBoundingClientRect();
    const x = rect.left - parent.left + rect.width / 2, y = rect.top - parent.top + rect.height / 2, size = big ? 90 : 52;
    const splat = document.createElement("div"); splat.className = "splat";
    splat.style.width = splat.style.height = size + "px"; splat.style.left = (x - size / 2) + "px"; splat.style.top = (y - size / 2) + "px";
    splat.style.background = "radial-gradient(circle,#fff,#ffd36a 40%,#ff8ad4 70%)"; fx.appendChild(splat);
    const ring = document.createElement("div"); ring.className = "boom-ring"; ring.style.width = ring.style.height = "20px"; ring.style.left = (x - 10) + "px"; ring.style.top = (y - 10) + "px"; fx.appendChild(ring);
    for (let i = 0; i < (big ? 18 : 10); i++) {
      const sp = document.createElement("div"); sp.className = "spark"; const ang = (Math.PI * 2 * i) / (big ? 18 : 10);
      sp.style.left = x + "px"; sp.style.top = y + "px"; sp.style.setProperty("--dx", Math.cos(ang) * (big ? 90 : 48) + "px"); sp.style.setProperty("--dy", Math.sin(ang) * (big ? 90 : 48) + "px"); fx.appendChild(sp);
    }
    setTimeout(() => { fx.innerHTML = ""; }, 700);
  }
  async function playLine(ucis, startMap) {
    let map = F.clonePieces(startMap);
    for (const uci of ucis) {
      const step = F.applyUci(map, uci); map = step.pieces; setPieces(map, step);
      const dest = sq(step.to) && sq(step.to).querySelector(".piece"); if (dest) dest.classList.add("pop"); sfx("move");
      if (step.captured) explode(step.to, false);
      await sleep(450);
    }
    return map;
  }
  function finisher(enc) {
    const fin = F.finisherFor(enc); fin.targets.forEach((s) => sq(s) && sq(s).classList.add(fin.css)); sfx(fin.sfx); return fin;
  }

