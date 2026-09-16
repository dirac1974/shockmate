# Shockmate

An ADHD-friendly chess teaching game. Kids around **400 Chess.com** pick a move, watch **two futures**, and keep the reason that one future is significantly better.

This is **v0.1 of the arena** — 12 engine-validated encounters, cartoon explosions, a memory palace, streaks, and parent controls. It is not a 3D Battle-Chess MMO yet. It is playable today.

## Play

Open `web/index.html` in a browser (double-click works; no server required).

## Why this exists

Lessons feel like school. Puzzles without a story go stale. Shockmate forces a **juicy wrong move** onto every board so the kid can feel the gap.

Every best move and tempting move was checked with **Stockfish 17** and `python-chess`. Legal move lists are baked into the encounter data so the browser cannot offer an illegal move.

## Product rules we will not break

1. Engine is judge. Animation is teacher. Palace is memory.
2. No eval numbers on screen.
3. No paid loot boxes. No energy timers.
4. Sessions are short. Leaving is a win.
5. If the animation does not show the reason, the asset is wrong.

Repo: https://github.com/dirac1974/shockmate
