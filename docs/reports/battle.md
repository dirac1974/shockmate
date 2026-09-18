# The battle layer

## The question

Four things the kid said, in one sitting: "Every time I beat him it doesn't count as a win." "There is no game." "How do I battle Glitch?" "You should do a battle mode where you have special abilities." And one thing the parent said: do not change the chess.

Wins were being counted the whole time. The app just never said so. It said "Card earned", and to an eight-year-old a card is a sticker, not a victory. He was right that there was no game, because the villain never lost anything on screen at the moment he was beaten.

## What shipped

Three layers, built in order, each on the last.

**A. The win is a win.** Every correct move lands as a `HIT` with a number. Today's crony reads as a boss health bar on the fight screen and visibly drops. Reaching the floor is a `KNOCKOUT`. The card screen leads with `YOU BEAT GLITCH` and lists the card as spoils.

**B. Powers.** Wins earn Power, capped at five. Power buys four abilities: Double Strike, Glitch's Tell, Time Shield, Overcharge. The Tell is the old hint with a price; it shows the bait, never the answer.

**C. Gear and weakness.** The kid's agent has three gear slots that open with rank, and four pieces that open with rank. Two share slot 1, so there is a real choice. Each crony has a motif weakness, shown on his health bar. Beating him with that motif hits half again as hard.

## How it moves

One rule holds all of it together: **abilities never touch the board.** They change damage, information the app already shows, or how Glitch reacts. They never change which move is correct. The engine stays the judge.

Every ability resolves through a pure function in `web/score.js`, so the rules live in one place and the tests hold them to it. The rules worth knowing:

- Time Shield removes Glitch's gloat and nothing else. Second try, confession and guided replay run regardless. The miss still teaches.
- A guided win was shown the answer and cannot Critical, even Overcharged. The charge is kept.
- Power only falls when he spends it. It never resets.
- Glitch's own rating still falls permanently. The boss is the daily crony, so there is a fresh number to knock down every day without yesterday's win being taken back. A daily reset of Glitch's rating was considered and rejected: it would put his number back up overnight and erase the trophy.
- The weakness bonus is the chess lesson paying out. Beating "SPLINTER, weak to forks" with a fork is motif recognition with a fanfare on it.

## Verification

`tests/test_battle.js` holds the rules: boss floors and KO, power climbing and capping, each ability's resolution, gear gating by rank and slot, weakness damage and bonus, daily-use marks, and that a two-device merge keeps power, KOs, bonus, card tiers and daily marks in either order. Six suites green.

The Playwright suites are rewritten to the day model and parse, but could not run on the build machine, where Application Control blocks the greenlet DLL. They need CI or the sandbox before this is trusted end to end on a phone.

## Worth considering later

Glitch's in-fight mood lines still do not know his rating or the boss's state. Once a crony is under half health, his taunts could get openly desperate. The pieces exist: wilt tiers on the sprite, five moods, a health fraction. Nobody has wired the words yet.
