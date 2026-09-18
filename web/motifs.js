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
    stalemateTrap: '<circle cx="17" cy="20" r="11"/><path d="M9 28 L25 12"/><path d="M17 33 V38 M10 38 h14"/>',
    kingMarch: '<path d="M17 4 V12 M13 8 h8"/><path d="M8 32 c0-7 4-12 9-15 5 3 9 8 9 15z"/><path d="M6 36 h22"/><path d="M28 20 h5 M30 17 l3 3 -3 3"/>',
    trapped: '<rect x="5" y="9" width="24" height="26" rx="2"/><path d="M11 35 V9 M17 35 V9 M23 35 V9"/><circle cx="17" cy="22" r="4.6"/>',
    mateThreat: '<path d="M17 5 V15 M12 9 h10"/><path d="M8 35 c0-8 4-14 9-17 5 3 9 9 9 17z"/><path d="M8 35 h18" stroke-width="3"/>',
    hanging: '<path d="M16 4 V16"/><circle cx="16" cy="24" r="8"/><path d="M11 29 l10 -10"/>',
    // three arrows converging: one more attacker than he has defenders
    attackers: '<circle cx="17" cy="23" r="6"/><path d="M3 6 L11 15 M11 15 l-4.6 .3 M11 15 l.3 -4.6"/><path d="M31 6 L23 15 M23 15 l4.6 .3 M23 15 l-.3 -4.6"/><path d="M17 40 V31 M17 31 l-3.4 3.4 M17 31 l3.4 3.4"/>',
    // a bishop with its diagonal clear on both sides: the one worth keeping
    goodBishop: '<path d="M17 5 c4 6 6 8.5 6 11.5 a6 6 0 0 1 -12 0 C11 13.5 13 11 17 5z"/><path d="M13.5 13 h7"/><path d="M10 29 h14 l2.5 7 h-19z"/><path d="M3 27 l6 -6 M25 21 l6 -6"/>',
    // two arrows passing each other: which piece goes and which stays
    tradeChoice: '<path d="M4 14 h22 M26 14 l-5.5 -5 M26 14 l-5.5 5"/><path d="M30 30 h-22 M8 30 l5.5 -5 M8 30 l5.5 5"/>',
    // his small attack in, your bigger one back
    counter: '<path d="M31 11 H16 M16 11 l4.5 -3.6 M16 11 l4.5 3.6"/><path d="M3 30 H27 M27 30 l-6.5 -5 M27 30 l-6.5 5"/>',
    // a shield with a pawn behind it: defend, but with a move that also does something
    defend: '<path d="M17 4 L5 9 v11 c0 8 5 13.6 12 15.6 7 -2 12 -7.6 12 -15.6 V9z"/><circle cx="17" cy="17" r="2.8"/><path d="M13 28 h8 l-1.6 -6 h-4.8z"/>',
  };
  function icon(motif, size) {
    const d = P[motif] || P.hanging, s = size || 30;
    return '<svg viewBox="0 0 34 44" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
  }
  root.ShockmateMotifs = { icon: icon, keys: Object.keys(P) };
  if (typeof module !== "undefined") module.exports = root.ShockmateMotifs;
})(typeof window !== "undefined" ? window : globalThis);
