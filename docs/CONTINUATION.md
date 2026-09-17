# Shockmate — session memory

Read this first in a new chat. Then open `docs/AGENTS.md`.

**Date frozen:** 2026-09-16  
**Repo:** https://github.com/dirac1974/shockmate  
**Local source of truth:** `/home/workdir/artifacts/shockmate/`  
**GitHub account:** `dirac1974`

## What the game is

ADHD chess trainer. Twelve engine-validated fights. Kid picks a move, watches **two futures** (snack vs best), must keep the **why sentence** before the score counts a hit. Memory palace + spaced review + sibling hot-seat duel. No pay-to-win. No eval numbers. Sessions are short.

Core loop: move → two futures on the board → why-gate (one tap, two sentences) → retry if wrong → palace figurine if they kept the reason.

## Links

- Repo: https://github.com/dirac1974/shockmate
- Play (jsDelivr, no warning): https://cdn.jsdelivr.net/gh/dirac1974/shockmate@main/web/index.html
- Dev proxy (warning page): https://raw.githack.com/dirac1974/shockmate/main/web/index.html
- Local: `artifacts/shockmate/web/index.html`
- Pages after owner flip: https://dirac1974.github.io/shockmate/

## Shipped locally

- 12 encounters, Stockfish best vs tempting
- Two futures engine in `web/futures.js`
- Full arena in local `web/game.js` (~901 lines)
- Why-gate: hit = move + why; Next locked until the sentence is right
- Score/retry/spaced review/duel in `web/score.js`
- SVG Staunton pieces in `web/pieces.js` (do not go back to emoji)
- 8x8 equal-square board

Tests: `node tests/test_futures.js`, `node tests/test_score.js`, `python3 tests/test_encounters.py`

## GitHub vs local

Local `web/game.js` is the full arena. GitHub `game.js` can lag. Next session should push it.

## Do not break

Engine is judge. Animation is teacher. Palace is memory. No eval on screen. No loot. Short sessions. Hits need move + why. Quiet while they think. Loud after the move. No freeze-punishing timer.

## Next implementation order

A. Sync local `web/game.js` to GitHub
B. Owner enables GitHub Pages (main / root)
C. Motif finishers v2 (fork two-head, pin thumbtack, skewer through, door slam, laser, poison)
D. Wire due palace walks to `pickWalkTarget`
E. Only then: second pack of 12, parent weekly report. No openings/accounts/chat first.

## Next agent start

1. Read this file and `docs/AGENTS.md`
2. Diff local vs GitHub `web/game.js`
3. Run the three test files
4. Take A then B then C then D
5. Push after each stage
