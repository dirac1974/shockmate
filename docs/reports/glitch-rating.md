# Glitch's rating

## The question

"What's Glitch's rating?" — asked by an eight-year-old, and the honest answer is that he does not have one. Glitch never chooses a move. Every board is pre-computed and every bait line was scored by Stockfish before the kid saw it; Glitch is a heckler with a script. Telling him that is fine, but the question deserved a better answer than a technical one.

## What shipped

Glitch **brags** a rating of 2400 and it deflates as cards come off him. The joke, and the point, is that his claim never changes while the real number slides: the home screen reads `GLITCH'S RATING 2135` above a draining bar, with the line "Glitch still says 2400. The scoreboard disagrees."

Crucially it is **his** number that falls. Nothing belonging to the kid ever goes down, which is the rule the whole app is built on — no streak resets, no miss counters. A villain deflating is the one place a falling number is safe, and it gives the collection a second reading: 23 cards is abstract, "I knocked 1700 points off his bragging" is not.

## How it moves

Each card knocks a slice off whatever brag is left (`real = 400 + 2000 × 0.93^(cards + 0.5 × criticals)`), rather than a flat amount:

| Cards | Rating | Bar |
| --- | --- | --- |
| 0 | 2400 | 100% |
| 1 | 2260 | 93% |
| 3 | 1950 | 78% |
| 10 | 1270 | 44% |
| 23 (all current fights) | ~705 | 15% |

I built it with a flat −60 per card first and threw that away: 23 cards moved the bar by a quarter, so the first few wins looked like they did nothing. Proportional decay keeps the movement visible at every stage, and the floor is an asymptote — a fourth pack later needs no rebalancing, and he can never reach zero.

The rating is derived from cards earned, so it is monotonic by construction: replaying a fight, a bad session, or a sync from another device can never push it back up. Criticals count for half a card extra, so the 1-in-6 critical roll now has a visible consequence beyond the flash.

The card screen shows the tick as it happens — `GLITCH'S RATING 2400 → 2260 (▼140)` — which is the moment the number is worth seeing.

## Verification

`tests/test_score.js` asserts the first-card drop, the extra cost of a critical, monotonicity across all 23 cards, that three cards do not finish him, that clearing everything leaves him under 900, and that 400 flooded cards still respect the floor. `tests/e2e/phase0.py` checks he brags 2400 before the first fight and that the on-screen number has fallen within the floor and the brag after a full session. Six suites green.

## Worth considering later

His per-mood lines do not know about the rating yet. Once he is under 1000, the taunts could get openly desperate — he is still claiming 2400 while begging for a draw, which is funnier the further it goes.
