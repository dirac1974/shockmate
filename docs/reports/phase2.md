# Phase 2 report — return (co-op, duel, blitz, collection)

Built on top of Phase 1. Tests: `test_futures.js`, `test_score.js`, `test_encounters.py`, `tests/e2e/phase0.py`, new `tests/e2e/phase2.py` — all PASS at 390×844, no console errors.

## Shipped

- **Co-op is the sibling default.** "Team up vs Glitch" alternates players between fights on one device. A shared GLITCH RAGE meter fills with each win; when it fills, Glitch throws a boss board (guaranteed Critical on a best-tier move). Each kid's card goes to their own collection and neither sees the other's totals.
- **Duel is opt-in and handicapped.** Same board, hot seat, the why-gate decides. The player with the lower rolling tier average gets the three candidate squares lit; the other does not. Verdict uses `score.js`'s `duelVerdict`, so "both kept the reason" is a real outcome.
- **Blitz mode, per player.** A 10-second gold bar that runs animations at 0.6× speed. When it empties the fight continues with candidates lit — never a lockout, never a loss.
- **Adaptive difficulty, silent.** Two baits or blunders in a row opens the next fight with candidates lit; three bests in a row unlocks a boss early and stops the help. Nothing is announced downward.
- **Collection has art.** `web/motifs.js` draws a stroke icon per motif (fork, pin, skewer, back rank, discovery, counting, hanging); critical cards get a gold frame; locked cards read "Beat Glitch on this board to unlock" instead of a question mark.
- Both profiles now live in memory, so switching players mid-session cannot lose progress.

## Decisions

- Boss diversions are capped at two per session and only target an unearned boss, so a hot streak cannot loop the same board.
- Blitz is disabled in duel: two clocks on one phone is chaos.
- The rage meter is shared but the cards are not; that is the whole point of co-op for these two.

## Red or deferred

- Recorded SFX and Glitch voice clips (Phase 3) — still the oscillator set.
- Google Fonts still load over the network; offline falls back to Impact/Trebuchet. Self-host if they ever play without signal.
- Parent weekly summary, pack 2 (including the two "bait is real" fights), tablet layout — Phase 3.

## Follow-ups after David's review

- Pieces redrawn as conventional Staunton silhouettes (king with crown band, mitred bishop with a slanted slit, crenellated rook, horse-head knight, five-point queen, round-head pawn) on a shared flared base. Cream-on-indigo and indigo-on-ice so both sides read on both square colours.
- The why-gate no longer asks about a position that has scrolled past. `tools/build_encounters.py` now decides per fight whether the reason is visible before or after the move (`whyTargets.at`), and the arena rewinds the board to that moment — with a REWIND banner when it steps back — so "tap the 2 pieces your knight bites" is shown with the knight actually biting. 10 of 12 gates are "after"; the two hanging-piece fights rewind.
- `tests/test_encounters.py` asserts every gate target is occupied in its declared gate position, and `tests/e2e/phase0.py` checks on screen that no gate target square is empty and that a rewind gate says so.

## Next gate

Unchanged and now more interesting: both kids, six fights each. Try one solo session each, then one co-op session together. Watch whether co-op keeps her in and whether blitz keeps him in.
