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

Reveal is a ladder: 10 s, 7 s, 5 s, 3 s, drawn as a ring that empties (no digit, because nothing on
screen counts down). A full window of 12 items at ≥ 80% steps down a rung; a full window under 50%
steps back up; a step empties the window so the next decision is made at the new speed. The
research's 5 s was for masters; a 400 on a twenty-piece board starts at 10 and earns the way down. Glitch speaks before the board
arrives and again at the poof; the reveal is a think window.

`stats.flash`: items, correct (first look), per rung, per day, best run, clean days. Counters climb;
sync takes the larger side. Progress gets a Flash tile (accuracy · days) beside first-try rate and
the blunder trend, and after two weeks a coach note says whether the two are climbing together.

**Verified.** Chrome 375×812, caches cleared, marker `v0.24`: both registers, the imagine rung,
the hint, Camp's warm-up, the Progress tile, no console errors. Every suite green.

## Control boards (v0.27)

Chase & Simon: masters recall real positions far better than beginners, but random ones no better.
So each Flash drill (never Camp) swaps one of its six slots, at a seeded slot 2–5, for a GONE item on
a random board: the exact pieces of a real GONE board in the same drill, scattered with light
legality (kings apart, neither in check, no pawns on the back ranks, ≥ 70% moved). Same question,
reveal and ring. After he answers, Glitch owns up (`flash-joke`, or grudging credit if he got it).

It touches no real counter, rung or window and is never a miss. `stats.flash.control` and
`stats.flash.paired` hold the like-for-like pair; after ten random boards the parent's Flash line
reads "Real boards 80% · random boards 45%" with a note on the gap.

**Deferred.** No binder entry. One imagine item per drill. Counts stop at four.
