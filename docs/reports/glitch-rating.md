# Glitch's rating

## The question

"What's Glitch's rating?" — asked by an eight-year-old, and the honest answer is that he does not have one. Glitch never chooses a move. Every board is pre-computed and every bait line was scored by Stockfish before the kid saw it; Glitch is a heckler with a script. Telling him that is fine, but the question deserved a better answer than a technical one.

## What shipped

Glitch **brags** a rating of 1500 and it deflates as cards come off him. The joke, and the point, is that his claim never changes while the real number slides: the home screen reads `GLITCH'S RATING 1230` above a draining bar, with the line "Glitch says 1500 a bit more quietly now."

Crucially it is **his** number that falls. Nothing belonging to the kid ever goes down, which is the rule the whole app is built on — no streak resets, no miss counters. A villain deflating is the one place a falling number is safe, and it gives the collection a second reading: 23 cards is abstract, "I knocked 1700 points off his bragging" is not.

## How it moves

Each card knocks a slice off whatever brag is left (`real = 300 + 1200 × 0.93^(cards + 0.5 × criticals)`), rather than a flat amount:

| Cards | Rating | Bar | Glitch's line |
| --- | --- | --- | --- |
| 0 | 1500 | 100% | says he is 1500 |
| 1 | 1415 | 93% | says he is 1500 |
| 3 | 1230 | 78% | says 1500 a bit more quietly |
| 10 | 820 | 43% | the scoreboard disagrees |
| 23 (all current fights) | 480 | 15% | nobody believes him now |
| 35 (with a fourth pack) | 370 | 6% | a 300 in a trench coat |

**Why 1500 and not 2400.** A 2400 villain is a number from a different planet to a 450 player — beating it means nothing because it was never believable. 1500 is a number they see on a chess app: a strong club player, plausibly out of reach. Clearing every current fight drags him to roughly 480, which is the kids' own neighbourhood, and later packs push him below them. That is a story they can read: *he claimed to be way better than me, and now he is worse.* His claim never budges from 1500, which is the joke and also the lesson about people who talk about their rating.

A flat −60 per card was built first and thrown away: 23 cards moved the bar by a quarter, so the first wins looked inert. Proportional decay keeps the movement visible at every stage and makes the floor an asymptote — a fourth pack needs no rebalancing, and he can never reach zero.

The rating is derived from cards earned, so it is monotonic by construction: replaying a fight, a bad session, or a sync from another device can never push it back up. Criticals count for half a card extra, so the 1-in-6 critical roll now has a visible consequence beyond the flash.

The card screen shows the tick as it happens — `GLITCH'S RATING 1500 → 1375 (▼125)` — which is the moment the number is worth seeing.

## Version marker

The home screen now carries a small `v0.5 · 23 fights · 3 packs` line, because "I don't see the new screen" is nearly always a stale copy rather than a bug: GitHub Pages caches, iOS caches, and the service worker caches deliberately. Reading that line off a phone says exactly what it loaded. Bump `BUILD` in `web/game.js` and `CACHE` in `web/sw.js` together on each deploy.

## Verification

`tests/test_score.js` asserts the first-card drop, the extra cost of a critical, monotonicity across all 23 cards, that three cards do not finish him, that clearing everything lands him between 300 and 600, and that 400 flooded cards still respect the floor. `tests/e2e/phase0.py` checks he brags 1500 before the first fight, that the marker line renders, and that the on-screen number has fallen within the floor and the brag after a full session. Six suites green.

## Worth considering later

His per-mood lines do not know about the rating yet. Once he is under 700, the taunts could get openly desperate — he is still claiming 2400 while begging for a draw, which is funnier the further it goes.
