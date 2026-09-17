/* Glitch — the time-goblin villain. Five moods, one inline SVG, no assets. */
(function (root) {
  const BODY = '<path d="M22 52 L22 34 L32 34 L32 24 L46 24 L46 14 L62 14 L62 22 L76 22 L76 30 L90 30 L90 44 L100 44 L100 88 C100 104 88 112 72 112 L44 112 C28 112 20 102 20 88 Z" fill="#a855f7" stroke="#3b0a6b" stroke-width="4" stroke-linejoin="round"/><path d="M64 4 L54 22 L64 22 L56 40" fill="none" stroke="#3b0a6b" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>';
  const FACE = {
    taunt: '<ellipse cx="44" cy="62" rx="12" ry="14" fill="#fff"/><circle cx="47" cy="65" r="6" fill="#1a0533"/><path d="M66 58 q10 -6 20 0" fill="none" stroke="#1a0533" stroke-width="4" stroke-linecap="round"/><path d="M36 84 q26 22 52 -2" fill="#3b0a6b" stroke="#1a0533" stroke-width="3"/><rect x="46" y="84" width="9" height="8" fill="#fff"/><rect x="60" y="83" width="9" height="8" fill="#fff"/>',
    nervous: '<ellipse cx="44" cy="62" rx="12" ry="14" fill="#fff"/><ellipse cx="74" cy="60" rx="12" ry="14" fill="#fff"/><circle cx="42" cy="66" r="4" fill="#1a0533"/><circle cx="72" cy="64" r="4" fill="#1a0533"/><ellipse cx="58" cy="92" rx="7" ry="9" fill="#1a0533"/><path d="M96 56 q8 10 0 16 q-8 -6 0 -16z" fill="#33e0ff" stroke="#1a0533" stroke-width="2"/>',
    smug: '<path d="M32 60 q12 -8 24 0" fill="none" stroke="#1a0533" stroke-width="4" stroke-linecap="round"/><ellipse cx="74" cy="60" rx="12" ry="14" fill="#fff"/><circle cx="77" cy="63" r="6" fill="#1a0533"/><path d="M38 88 q22 14 44 -4" fill="none" stroke="#1a0533" stroke-width="5" stroke-linecap="round"/><path d="M96 76 q10 6 14 16" fill="none" stroke="#ffcc33" stroke-width="4" stroke-linecap="round"/>',
    rage: '<path d="M34 54 l16 16 M50 54 l-16 16 M66 52 l16 16 M82 52 l-16 16" stroke="#1a0533" stroke-width="5" stroke-linecap="round"/><ellipse cx="58" cy="90" rx="18" ry="14" fill="#1a0533"/><ellipse cx="58" cy="96" rx="9" ry="6" fill="#ff4fa3"/><path d="M6 40 l-10 -8 M6 70 l-12 0 M6 100 l-10 8 M114 40 l10 -8 M114 70 l12 0 M114 100 l10 8" stroke="#ffcc33" stroke-width="4" stroke-linecap="round"/>',
    hide: '<path d="M40 92 q9 -6 18 0 q9 6 18 0" fill="none" stroke="#1a0533" stroke-width="4" stroke-linecap="round"/><ellipse cx="42" cy="62" rx="16" ry="13" fill="#9333ea" stroke="#3b0a6b" stroke-width="4"/><ellipse cx="76" cy="60" rx="16" ry="13" fill="#9333ea" stroke="#3b0a6b" stroke-width="4"/><path d="M30 60 l6 -8 M40 56 l2 -9 M50 58 l-2 -9 M64 58 l6 -8 M74 54 l2 -9 M84 56 l-2 -9" stroke="#3b0a6b" stroke-width="3" stroke-linecap="round"/>',
  };
  function svg(mood) {
    return '<svg viewBox="-10 0 140 120" class="glitch-svg" aria-hidden="true">' + BODY + (FACE[mood] || FACE.taunt) + "</svg>";
  }
  // How far he has been deflated, 0 (full brag) to 3 (floored). The theme layer draws the droop.
  function wiltTier(fraction) {
    const f = typeof fraction === "number" ? fraction : 1;
    if (f > 0.66) return 0;
    if (f > 0.40) return 1;
    if (f > 0.15) return 2;
    return 3;
  }
  function set(mood, line, wilt) {
    const host = root.document && root.document.getElementById("glitch");
    if (host) { host.innerHTML = svg(mood); host.dataset.mood = mood; host.dataset.wilt = String(typeof wilt === "number" ? wilt : 0); host.classList.remove("pop"); void host.offsetWidth; host.classList.add("pop"); }
    const bubble = root.document && root.document.getElementById("glitch-line");
    if (bubble) { bubble.textContent = line || ""; bubble.hidden = !line; }
  }
  root.ShockmateGlitch = { svg: svg, set: set, wiltTier: wiltTier, moods: Object.keys(FACE) };
  if (typeof module !== "undefined") module.exports = root.ShockmateGlitch;
})(typeof window !== "undefined" ? window : globalThis);
