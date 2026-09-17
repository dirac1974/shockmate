# Shockmate — session memory

Read this first in a new session, then `docs/PLAN.md`. `docs/AGENTS.md` defines roles.

**Date:** 2026-09-16
**Repo:** https://github.com/dirac1974/shockmate
**Source of truth:** GitHub `main`. There is no other copy. Anything not on `main` does not exist.

## What the game is

ADHD chess trainer for two kids (8 and 10) at about 400 Chess.com. Theme: Timeline Split. The kid is a time agent; every move splits time in two; Glitch, a purple time-goblin, dangles bait toward the bad timeline. Twelve engine-scored fights, board-tap why-gate, per-kid profiles, co-op by default.

Core loop: think (quiet) → move → tease (0.7 s) → verdict by tier → the future plays out on the board → why-gate (tap the pieces) → card earned → next fight or cliffhanger.

## Actual state of `main` (commit 09cfeb3)

- `web/game.js` is v0.1 (269 lines). After the first move the player is stuck: why buttons empty, Next never enables, Retry/History/Duel/Walk unbound.
- `node tests/test_futures.js` FAILS: `web/encounters.js` has no `bestLineUci` / `temptingLineUci`.
- `node tests/test_score.js` FAILS at line 17.
- `python3 tests/test_encounters.py` passes (legality only).
- Fight 06 is an even trade (Bxc6+ bxc6), not a won piece. Fight 11 is a direct knight check, not a discovered attack. Hits require the one exact engine move; equally good moves are scored as misses.
- The "901-line full arena" referenced by the previous doc lived only in a Grok sandbox. Treat it as lost.

## Do not break

Engine is judge. Animation is teacher. No eval numbers on screen. No loot, no purchases, no energy timers. Nothing on screen ever goes down (no streak reset, no miss count). Every fight is winnable this session (second try, then confession, card still earned). Quiet during the think window, loud after the move. Cartoon slapstick only. Kids are never scored against each other. Commits credit "Claude".

## Phase 0 — Playable truth (current)

Order: Data and Arena in parallel → QA → Lead merges, tags `v0.3-playable`, enables GitHub Pages.

- [ ] Data: `data/encounters.src.json` → `tools/build_encounters.py` (Stockfish 17, every legal move scored, tiers per PLAN §5.1, margin rule ≥150 cp or mate) → `data/encounters.v2.json` + generated `web/encounters.js`. Continuation lines for all 12. Fix 06 and 11. `test_encounters.py` asserts margins, line legality, whyTargets.
- [ ] Arena: rewrite `web/game.js` as a state machine (home → think → tease → consequence → whygate → next | cliffhanger) on top of `futures.js` + `score.js`. Bind every control. Second-try flow. Tiers. Per-profile storage `shockmate-v2:<profileId>`. `test_futures.js` and `test_score.js` green.
- [ ] QA: Playwright 390×844 through all 12 fights on best / good / bait / blunder / second-try. Fail on any disabled dead end or console error.
- [ ] Lead: merge Data → Arena → QA, tag, Pages on `main` root, confirm https://dirac1974.github.io/shockmate/ plays.
- [ ] Lead: write `docs/reports/phase0.md` (under 400 words) for review in the planning chat. Phase 1 does not start until that review comes back.

Phase 0 keeps the old theme. Phase 1 (PLAN §7) replaces it with the Timeline Split skin and Glitch.

## Links

- Plan (living copy): https://claude.ai/code/artifact/73839b7f-e1e8-4f13-a65e-ce725a30b4e1
- Concept screens: https://claude.ai/artifact/UvtVosoKFKnmUFLhbpnLQ7
- Play (after Pages flip): https://dirac1974.github.io/shockmate/

## Next session start

1. Read this file, then `docs/PLAN.md` §5–§8.
2. Run the three tests and record what is red.
3. Take the first unchecked box above in your role.
4. Before ending: update this file (what shipped, what is red, next three steps). Keep it under 80 lines.
