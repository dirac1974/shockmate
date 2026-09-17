# Shockmate — session memory

Read this first in a new session, then `docs/PLAN.md`. `docs/AGENTS.md` defines roles.

**Date:** 2026-09-17 (Phases 0–2 built locally)
**Repo:** https://github.com/dirac1974/shockmate
**Source of truth:** GitHub `main`. There is no other copy. Anything not on `main` does not exist.

## What the game is

ADHD chess trainer for two kids (8 and 10) at about 400 Chess.com. Theme: Timeline Split. The kid is a time agent; every move splits time in two; Glitch, a purple time-goblin, dangles bait toward the bad timeline. Twelve engine-scored fights, board-tap why-gate, per-kid profiles, co-op by default.

Core loop: think (quiet) → move → tease (0.7 s) → verdict by tier → the future plays out on the board → why-gate (tap the pieces) → card earned → next fight or cliffhanger.

## Actual state (Phase 0 done locally on top of 09cfeb3)

- All four test suites pass: `test_futures.js`, `test_score.js`, `test_encounters.py`, `tests/e2e/phase0.py` (Playwright, 390×844).
- `web/game.js` is the Phase 0 state machine; every control is bound; every fight is winnable (second try → confession → guided).
- Data is generated: edit `data/encounters.src.json`, run `python3 tools/build_encounters.py --sf <stockfish>`, never hand-edit `v2.json` or `web/encounters.js`.
- Fights 04, 05, 06, 11 were rebuilt so the chess is true. See `docs/reports/phase0.md`.
- Phase 1 skin is in: Timeline Split colours, Glitch (`web/glitch.js`, five moods), charging timeline bars, critical zoom, path pips, next-board peek, tap-to-skip. See `docs/reports/phase1.md`.
- Phase 2 is in: co-op (alternating turns, shared rage meter, separate collections), handicapped duel, per-player Blitz, silent adaptive difficulty, collection art (`web/motifs.js`). See `docs/reports/phase2.md`.

## Do not break

Engine is judge. Animation is teacher. No eval numbers on screen. No loot, no purchases, no energy timers. Nothing on screen ever goes down (no streak reset, no miss count). Every fight is winnable this session (second try, then confession, card still earned). Quiet during the think window, loud after the move. Cartoon slapstick only. Kids are never scored against each other. Commits credit "Claude".

## Phase 0 — Playable truth (current)

Order: Data and Arena in parallel → QA → Lead merges, tags `v0.3-playable`, enables GitHub Pages.

- [x] Data: schema v2, build script, tiers, lines, fights 04/06/11 fixed, tests.
- [x] Arena: state machine, every control bound, second try, confession, guided replay, profiles, criticals.
- [x] QA: `tests/e2e/phase0.py` green.
- [x] Report: `docs/reports/phase0.md`.
- [ ] David: push `main` (bundle or patch), tag `v0.3-playable`, enable GitHub Pages (main / root), confirm https://dirac1974.github.io/shockmate/ plays.
- [ ] David: both kids play 6 fights each on a phone. Note where anyone got stuck or bored. That is the Phase 1 gate.

## Phase 1 — Feel (next, after the gate)

Branch `theme/timeline-split`. Theme agent owns `styles.css`, `pieces.js`, new `glitch.js`, `sfx/`, `index.html` markup. Build to the concept screens: navy ground, blue board, cyan/magenta/gold, Bangers + Nunito, Glitch with four faces, recorded SFX, tease with charging timeline bars, Critical with hit-stop and zoom. Arena agent adds the tap-to-skip on animations and the "there was a bigger one" peek as a Glitch line. Do not change data or tiers.

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
