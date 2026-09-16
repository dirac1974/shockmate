# Shockmate

An ADHD-friendly chess teaching game. Kids around **400 Chess.com** pick a move, watch **two futures**, and keep the reason that one future is significantly better.

This is **v0.2 of the arena** — 12 engine-validated encounters, **two futures animated on the board**, motif finishers, a memory-palace walk, streaks, and parent controls. It is not a 3D Battle-Chess MMO yet. It is playable today.

## Play

Open `web/index.html` in a browser (double-click works; no server required).

```
web/index.html
```

## Why this exists

Lessons feel like school. Puzzles without a story go stale. Shockmate forces a **juicy wrong move** onto every board so the kid can feel the gap:

- hanging queen vs rim pawn
- knight fork vs pawn snack
- pawn fork check
- poison capture (counting)
- pin, then take the pinned piece
- skewer
- back-rank mate vs pawn hunt
- mate-in-one vs taking a queen
- discovered check that eats a queen
- royal fork vs a cookie pawn

Every best move and tempting move was checked with **Stockfish 17** and `python-chess`. Legal move lists are baked into the encounter data so the browser cannot offer an illegal move.

## Repo layout

| Path | Owner agent | What |
| --- | --- | --- |
| `data/encounters.json` | Engine Referee + Encounter Author | Source of truth for the 12 fights |
| `web/` | Arena Engineer | Playable game |
| `docs/ENCOUNTERS.md` | Learning Scientist | Kid-facing why for each fight |
| `docs/AGENTS.md` | Lead | Who does what next |
| `tests/test_encounters.py` | QA | Regenerates / asserts legality |

## Run the truth tests

Needs `python-chess` (and Stockfish only if you re-score).

```bash
python3 tests/test_encounters.py
node tests/test_futures.js
```

`test_futures.js` applies every best line and every snack line, then simulates the full hit plan and miss plan for all 12 fights (reset to start, both timelines, motif targets).

## Product rules we will not break

1. Engine is judge. Animation is teacher. Palace is memory.
2. No eval numbers on screen.
3. No paid loot boxes. No energy timers.
4. Sessions are short. Leaving is a win.
5. If the animation does not show the reason, the asset is wrong.

Repo: https://github.com/dirac1974/shockmate
