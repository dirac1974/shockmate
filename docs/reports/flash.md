# Flash — two minutes of board vision (v0.24)

A Flash chip sits on the map beside Camp: six positions, two minutes, once a day, replayable.
Camp's warm-up is now two Flash boards plus two spot-the-attack taps, same length.

## Why

Expert recall is chunking — a symptom of pattern knowledge, not its cause — so recall drills alone
probably do not transfer. Two things plausibly do: a question about MEANING forces attention onto
the whole board rather than the piece that just moved, which is what loses these two their games;
and holding a move in your head is calculation, practised directly. So the positions are his own
(game fights, earned fights, hand-authored, ladder) and every question asks what they meant.

## The items

- **GONE** (easy): show, one piece vanishes, tap its square. Never a king.
- **RECALL**: show, everything vanishes, one question — the fight's own why-gate, "Where was
  Glitch's queen?", "Tap a piece his last move attacked". The numbers-register kid counts instead,
  on a 1–4 chip row: tapping *n* squares is dexterity, not chess.
- **IMAGINE** (after three clean days): the board stays. "Imagine you play the knight to f6", a
  ghost arrow for 2 s, then "Tap what it now attacks" — `applyUci` on the board he never sees.

One tap or one chip; a hint after two wrong, the answer on the third.

## Adaptive, quiet, tracked

Reveal is 5 s, drawn as a ring that empties: no digit, because nothing on screen counts down. It
shrinks to 3 s, never below, once the last 12 items are ≥ 80% right. Glitch speaks before the board
arrives and again at the poof; the reveal is a think window.

`stats.flash`: items, correct (first look), per rung, per day, best run, clean days. Counters climb;
sync takes the larger side. Progress gets a Flash tile (accuracy · days) beside first-try rate and
the blunder trend, and after two weeks a coach note says whether the two are climbing together.

**Verified.** Chrome 375×812, caches cleared, marker `v0.24`: both registers, the imagine rung,
the hint, Camp's warm-up, the Progress tile, no console errors. Every suite green.

**Deferred.** No binder entry. One imagine item per drill. Counts stop at four.
