/* Motif icons for collection cards. Inline SVG, stroke-only so they inherit colour. */
(function (root) {
  const P = {
    fork: '<path d="M12 40 L12 18 M12 18 L4 6 M12 18 L20 6"/><circle cx="4" cy="5" r="3"/><circle cx="20" cy="5" r="3"/>',
    pawnFork: '<path d="M12 40 L12 22 M12 22 L5 10 M12 22 L19 10"/><circle cx="5" cy="8" r="2.6"/><circle cx="19" cy="8" r="2.6"/>',
    royalFork: '<path d="M12 40 L12 20 M12 20 L4 8 M12 20 L20 8"/><path d="M1 8 l3 -5 l3 5z"/><path d="M17 8 l3 -5 l3 5z"/>',
    pin: '<path d="M12 40 L12 22"/><path d="M5 22 h14 l-3 -8 h-8z"/><path d="M8 14 h8 V6 h-8z"/>',
    skewer: '<path d="M2 36 L30 8"/><circle cx="10" cy="28" r="4"/><circle cx="22" cy="16" r="4"/>',
    backRank: '<rect x="4" y="6" width="24" height="32" rx="2"/><circle cx="22" cy="22" r="2"/><path d="M4 6 h24"/>',
    mateOverMaterial: '<rect x="4" y="6" width="24" height="32" rx="2"/><path d="M10 22 l4 5 l9 -11"/>',
    discovery: '<path d="M4 34 L28 10"/><path d="M28 10 l-2 7 l7 -2z"/><circle cx="9" cy="29" r="4"/>',
    counting: '<path d="M16 6 V34 M6 14 h20"/><path d="M6 14 l-4 9 h8z"/><path d="M26 14 l-4 9 h8z"/>',
    hanging: '<path d="M16 4 V16"/><circle cx="16" cy="24" r="8"/><path d="M11 29 l10 -10"/>',
  };
  function icon(motif, size) {
    const d = P[motif] || P.hanging, s = size || 30;
    return '<svg viewBox="0 0 34 44" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
  }
  root.ShockmateMotifs = { icon: icon, keys: Object.keys(P) };
  if (typeof module !== "undefined") module.exports = root.ShockmateMotifs;
})(typeof window !== "undefined" ? window : globalThis);
