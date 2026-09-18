# Play — a whole game against Glitch (v0.20)

The fights teach one move. A game is where the kid finds out whether the move comes to him when
nobody has told him there is one to find.

## Engine

`stockfish.js` 10.0.2 (`web/vendor/`), GPL-3, single-threaded WASM: **655 KB** for
`stockfish.wasm.js` + `stockfish.wasm`. Chosen because it touches no `SharedArrayBuffer` — GitHub
Pages sends no COOP/COEP headers and a threaded build refuses to start there. The published file is
itself the Web Worker, so the board never freezes. The 1.6 MB asm.js fallback in the same package is
deliberately not vendored; a browser without WASM gets "Glitch is asleep". `chess.js` 1.0.0-beta.8
(BSD-2) handles rules, SAN, repetition and mate; its CommonJS build is wrapped so a `<script>` tag
gets `window.Chess` and Node still `require`s it. `web/engine.js` wraps UCI: promise per command,
one command at a time, timeouts, a 240-entry cache, `asleep()` after a failed boot. Both vendor
files load lazily on the first tap of PLAY and sit in the SW shell (`shockmate-v21`), so a second
game works offline.

## Levels

`S.LEVELS`: Sleepy, Rookie, Cadet, Agent, Marshal — pure table of `skill`/`depth`/`multipv` plus
`random` (Sleepy shrugs half the time) and `blunder` (Rookie 25% down to Marshal 0). A blunder is
chosen out of MultiPV, weighted toward the worse lines, so it is always a move a person could play;
he never shrugs past a mate in one or past an obvious recapture. Move delay 600–1400 ms.

## Suggestion

`S.suggestLevel(stats)` is pure: no games → Rookie, or Cadet at ≥70% first-try over ≥10 fights; a
win with ≤1 blunder → one rung up; two losses in the last five at that rung, or >35% of moves
dropping material → one rung down. Returns `{level, reason, say}`; the reason is the parent's line
in Progress, `say` is Glitch's. The chip row never locks and the parent never pins a level.

## Game fights

Every kid move is scored silently at depth 10 before and after. A drop ≥150 cp is a blunder; the
worst three become fights in the same shape the build writes, stored in `stats.gameFights` (cap 20,
deduped by FEN), shown in a new binder room "Your games", and drilled first by Prep and Camp.
Castles, en passant and promotions are trimmed from animation lines rather than drawn as lies.

## Verified

375×812, marker v0.20: engine up in the worker; a full game vs Sleepy ended in a theatrical
resignation; the fight it produced ran arrive → look-first → think → futures → why-gate → card;
binder shows Your games; Progress shows Games · won, best level beaten, blunder trend and the
suggestion; Home mid-game resumes on the same FEN; all vendor files present in `shockmate-v21`.
No console errors. All 11 JS suites and both Python suites green.

## Deferred

No clock. No move list or PGN export. Glitch's lines are text only — no voice for them. `evaluate`
depth is fixed at 10 rather than scaled to the device.
