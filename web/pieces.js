/* Staunton-style pieces. Same .piece / .glyph wrappers so kick/spin/squash stay intact. */
(function (root) {
  function palette(color) {
    if (color === "w") return { fill: "#fff4d2", shade: "#d8c49a", shine: "#fffdf6", ink: "#2b2358" };
    return { fill: "#2a2452", shade: "#171238", shine: "#40376f", ink: "#dde5ff" };
  }
  /* Conventional Staunton silhouettes, hand-authored on a 45x45 grid.
     Shared foot: a flared base plus a collar, so every piece sits on the square the same way. */
  const FOOT = '<path d="M9.8 40.6 h25.4 a1.6 1.6 0 0 0 0-3.2 H9.8 a1.6 1.6 0 0 0 0 3.2z"/><path d="M12.6 37.4 c0-2.6 1.9-3.4 4-4.2 h11.8 c2.1.8 4 1.6 4 4.2z"/>';
  const BODY = {
    p: FOOT + '<circle cx="22.5" cy="11.6" r="4.9"/><path d="M19.3 15.9 c-1.3 1.1-2.1 2.4-2.1 3.6 0 1.5.8 2.3 1.6 3.1-2.5 1.6-4.6 4.6-5.2 10.6 h20.4 c-.6-6-2.7-9-5.2-10.6.8-.8 1.6-1.6 1.6-3.1 0-1.2-.8-2.5-2.1-3.6z"/>',
    r: FOOT + '<path d="M11.6 7.4 h4.6 v3.4 h3.6 V7.4 h5.4 v3.4 h3.6 V7.4 h4.6 v7.2 l-2.6 2.2 h-16.2 l-2.6-2.2z"/><path d="M15.6 17.2 h13.8 l-.9 12.4 h-12z"/><path d="M13.4 33.2 c.8-2.4 2.2-3.6 2.2-3.6 h13.8 s1.4 1.2 2.2 3.6z"/>',
    b: FOOT + '<circle cx="22.5" cy="6.6" r="2.2"/><path d="M22.5 9 c5.4 3.4 8.2 8.6 7.2 13.4 -1.4 1.4-3.6 2.2-7.2 2.2 s-5.8-.8-7.2-2.2 C14.3 17.6 17.1 12.4 22.5 9z"/><path d="M19.9 17.2 l5.4-5.8" stroke-width="1.6"/><path d="M16.9 24.6 c1.4 1 3.4 1.4 5.6 1.4 s4.2-.4 5.6-1.4 c1.6 2.2 2.2 4.6 2.2 8.6 H14.7 c0-4 .6-6.4 2.2-8.6z"/>',
    n: FOOT + '<path d="M16.2 33.2 c-1-5.2 1.2-9.4 5-12.2 -3.4-.2-6.6.8-9.4 2.8 l-2.6-1.6 c1-2 2.6-3.6 4.6-4.8 -2 .2-3.8.8-5.2 1.8 -.2-3.2 1.4-6.2 4.4-8.6 l3.8-3 c1.6-1.2 3.6-1.6 5.2-.8 l1-3.4 2 3 c5 1 9 4.6 10.4 9.6 1.4 5.2.4 11-2.4 16z"/><circle cx="17.6" cy="13.6" r="1.2"/><path d="M26.6 11.4 c2.4 1.2 4 3.4 4.6 6" stroke-width="1.3" fill="none"/>',
    q: FOOT + '<circle cx="9.6" cy="12.4" r="2.1"/><circle cx="16" cy="8.6" r="2.1"/><circle cx="22.5" cy="7.2" r="2.3"/><circle cx="29" cy="8.6" r="2.1"/><circle cx="35.4" cy="12.4" r="2.1"/><path d="M10.4 14.4 l3 8.2 h18.2 l3-8.2 -5.8 2.6 -2.8-7 -3.5 7.6 -3.5-7.6 -2.8 7z"/><path d="M13.4 22.6 h18.2 c.8 2.6 1 5.8.4 10.6 H13 c-.6-4.8-.4-8 .4-10.6z"/>',
    k: FOOT + '<path d="M22.5 3.4 v7.4 M19.1 6.8 h6.8" stroke-width="1.9"/><path d="M22.5 12.2 c2.6-2.4 6.4-2.6 8.6-.4 2.2 2.2 1.8 5.6-.6 7.4 l-8 6 -8-6 c-2.4-1.8-2.8-5.2-.6-7.4 2.2-2.2 6-2 8.6.4z"/><path d="M15.4 19.8 c2.3-.9 4.7-1.4 7.1-1.4 s4.8.5 7.1 1.4" stroke-width="1.4" fill="none"/><path d="M14.2 21.4 c2.6-1.4 5.4-2 8.3-2 s5.7.6 8.3 2 c1 3.6 1.2 7.6.6 11.8 H13.6 c-.6-4.2-.4-8.2.6-11.8z"/>'
  };
  function svg(color, role) {
    const p = palette(color);
    const body = BODY[role] || BODY.p;
    return '<svg class="glyph" viewBox="0 0 45 45" aria-hidden="true"><defs><linearGradient id="g' + color + role + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + p.shine + '"/><stop offset="1" stop-color="' + p.fill + '"/></linearGradient></defs><g fill="url(#g' + color + role + ')" stroke="' + p.ink + '" stroke-width="1.55" stroke-linejoin="round" stroke-linecap="round">' + body + '</g></svg>';
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
