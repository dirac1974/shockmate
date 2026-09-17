/* Cartoon Staunton pieces. No emoji. */
(function (root) {
  function svg(color, role) {
    const fill = color === "w" ? "#f6efe2" : "#1c0e0a";
    const ink = color === "w" ? "#2a1c12" : "#e6d09a";
    const body = {
      k: '<path d="M20 6 v6 M17 9 h6"/><path d="M12 16 l3-4 h10 l3 4 v4 H12z"/><path d="M11 20 h18 v10 l-3 6 H14 l-3-6z"/>',
      q: '<circle cx="12" cy="10" r="2"/><circle cx="20" cy="7" r="2"/><circle cx="28" cy="10" r="2"/><path d="M12 12 l3 6 h10 l3-6"/><path d="M11 18 h18 v12 l-3 6 H14 l-3-6z"/>',
      r: '<path d="M11 8 h4 v3 h3 V8 h4 v3 h3 V8 h4 v8 H11z"/><path d="M13 16 h14 v12 H13z"/><path d="M11 28 h18 v5 H11z"/>',
      b: '<circle cx="20" cy="11" r="3"/><path d="M20 14 c6 4 8 10 6 16 H14 c-2-6 0-12 6-16z"/><path d="M13 30 h14 v4 H13z"/>',
      n: '<path d="M12 30 h16 v-3 H14 l1-5 8-2 3-6-4-6-6 3-4 1 2 5-5 2 1 6z"/>',
      p: '<circle cx="20" cy="13" r="5"/><path d="M15 18 h10 l3 8 H12z"/><path d="M12 26 h16 v5 H12z"/>'
    }[role] || "";
    return '<svg class="glyph" viewBox="0 0 40 40" aria-hidden="true"><g fill="'+fill+'" stroke="'+ink+'" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">'+body+'</g></svg>';
  }
  const FROM_GLYPH = {"♔":"k","♕":"q","♖":"r","♗":"b","♘":"n","♙":"p","♚":"k","♛":"q","♜":"r","♝":"b","♞":"n","♟":"p"};
  function upgradeBoard() {
    const board = root.document && root.document.getElementById("board");
    if (!board) return;
    board.querySelectorAll(".piece").forEach(function (el) {
      if (el.querySelector("svg.glyph")) return;
      const color = el.classList.contains("b") ? "b" : "w";
      const role = FROM_GLYPH[(el.textContent || "").trim()] || "p";
      el.textContent = "";
      el.innerHTML = svg(color, role);
    });
  }
  function injectCss() {
    const doc = root.document;
    if (!doc || doc.getElementById("shockmate-board-fix")) return;
    const s = doc.createElement("style");
    s.id = "shockmate-board-fix";
    s.textContent = ".board{display:grid;grid-template-columns:repeat(8,1fr);grid-template-rows:repeat(8,1fr);width:100%;aspect-ratio:1/1;height:auto}.sq{min-width:0;min-height:0;overflow:hidden}.piece{width:82%;height:82%;display:flex;align-items:center;justify-content:center;font-size:0;line-height:0}.piece .glyph{width:100%;height:100%;display:block}";
    doc.head.appendChild(s);
  }
  function watch() {
    const doc = root.document; if (!doc) return;
    const boot = function () {
      injectCss(); upgradeBoard();
      const board = doc.getElementById("board");
      if (board) new MutationObserver(upgradeBoard).observe(board, { childList: true, subtree: true });
    };
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", boot);
    else boot();
  }
  root.ShockmatePieces = { svg: svg, upgradeBoard: upgradeBoard };
  if (typeof module !== "undefined") module.exports = root.ShockmatePieces;
  watch();
})(typeof window !== "undefined" ? window : globalThis);
