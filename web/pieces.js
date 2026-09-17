/* Staunton-style pieces. Same .piece / .glyph wrappers so kick/spin/squash stay intact. */
(function (root) {
  function palette(color) {
    if (color === "w") return { fill: "#f3ead8", shade: "#c9b48e", shine: "#fffaf2", ink: "#2c1b10" };
    return { fill: "#24140e", shade: "#140a08", shine: "#3d2a1c", ink: "#efd7a2" };
  }
  const BODY = {
    k: '<path d="M22.5 3.2 v9.2 M18.2 7.6 h8.6"/><path d="M15.2 14.4 l2.8-3.2 h9 l2.8 3.2 v4.2 H15.2z"/><path d="M16.4 18.6 h12.2 v10.6 c0 2.8-2.2 5.8-6.1 7.2-3.9-1.4-6.1-4.4-6.1-7.2z"/><path d="M13.4 36.2 h18.2 v2.6 H13.4z"/><path d="M11.2 38.8 h22.6 v2.6 H11.2z"/>',
    q: '<circle cx="12.4" cy="9.2" r="2.05"/><circle cx="18.2" cy="6.4" r="2.05"/><circle cx="22.5" cy="4.7" r="2.2"/><circle cx="26.8" cy="6.4" r="2.05"/><circle cx="32.6" cy="9.2" r="2.05"/><path d="M12.6 11.2 L16 18.8 h13 l3.4-7.6"/><path d="M16.2 18.8 h12.6 v10.4 c0 2.8-2.2 5.8-6.3 7.2-4.1-1.4-6.3-4.4-6.3-7.2z"/><path d="M13.4 36.2 h18.2 v2.6 H13.4z"/><path d="M11.2 38.8 h22.6 v2.6 H11.2z"/>',
    r: '<path d="M12.2 6.2 h4.4 v4.2 h3.6 V6.2 h4.6 v4.2 h3.6 V6.2 h4.4 v8.4 H12.2z"/><path d="M14.6 14.6 h15.8 v16.4 H14.6z"/><path d="M13.2 31 h18.6 v3.2 H13.2z"/><path d="M11.2 38.6 h22.6 v2.8 H11.2z"/><path d="M13.4 34.2 h18.2 v4.4 H13.4z"/>',
    b: '<circle cx="22.5" cy="8.2" r="2.15"/><path d="M22.5 10.4 c6.4 4.2 8.6 11.2 6.4 18.4 H16.1 c-2.2-7.2 0-14.2 6.4-18.4z"/><path d="M20.2 16.2 h4.6 M22.5 14.1 v6.4" stroke-width="1.5"/><path d="M14.8 29.2 h15.4 l1.6 4.6 H13.2z"/><path d="M13.4 36.2 h18.2 v2.6 H13.4z"/><path d="M11.2 38.8 h22.6 v2.6 H11.2z"/>',
    n: '<path d="M12.2 41 h21.2 v-3.2 H16.6 l.6-4.8 9.2-1.6 c3.2-.4 6.6-3.2 6.4-8.2-.2-4.2-2.8-7-6.2-8.2 0-2.4-1.6-4.8-4.4-5.4-2.2-2.4-5.8-2-7.4.8 l-3.4 3.4 3.2 1.2 c-2.4 2.6-4.8 5.2-4.8 8.8 0 3.6 2.6 5.6 6.2 6.2 l-2.2 4.6-2.8 6.4z"/><circle cx="24.6" cy="16.4" r="1.05" fill="#efd7a2"/>',
    p: '<circle cx="22.5" cy="12.4" r="6.1"/><path d="M16.6 18.6 h11.8 l2.8 9.6 H13.8z"/><path d="M13.6 28.4 h17.8 v5.2 H13.6z"/><path d="M11.4 38.6 h22.2 v2.8 H11.4z"/><path d="M13.6 33.6 h17.8 v5 H13.6z"/>'
  };
  function svg(color, role) {
    const p = palette(color);
    const body = BODY[role] || BODY.p;
    return '<svg class="glyph" viewBox="0 0 45 45" aria-hidden="true"><defs><linearGradient id="g' + color + role + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + p.shine + '"/><stop offset="1" stop-color="' + p.fill + '"/></linearGradient></defs><g fill="url(#g' + color + role + ')" stroke="' + p.ink + '" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">' + body + '</g></svg>';
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
    s.textContent = ".board{display:grid;grid-template-columns:repeat(8,1fr);grid-template-rows:repeat(8,1fr);width:100%;aspect-ratio:1/1;height:auto}.sq{min-width:0;min-height:0;overflow:hidden}.piece{width:84%;height:84%;display:flex;align-items:center;justify-content:center;font-size:0;line-height:0;transform-origin:center bottom}.piece .glyph{width:100%;height:100%;display:block;overflow:visible}";
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
