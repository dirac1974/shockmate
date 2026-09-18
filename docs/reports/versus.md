# Versus — the two of them on one phone (v0.21)

## The flow

Under **Both**, beside Team up and Duel, a red arcade button: **Play each other**. The pre-game card
names who is White — it alternates off `settings.versus.lastWhite`, a chip swaps it for this game —
and Glitch says he will referee, rooting against both. It reuses the Play board; Glitch commentates
and never moves. Mate, all four draw rules and a resign link end it. Leaving saves it and a chip
resumes it. A per-move think meter fills and stops: no clock.

## Why the board flips

Fights never flip: a fight is white-to-move with the kid's pieces at the bottom, and the art and the
why-gate assume it. Versus is the one screen two people share, so it turns to whoever is to move,
as a real board would. A chip says so in words (`BEN · Black to move`): the turning board is where
somebody loses track.

## Tracked, per kid

Every move is scored silently at the Play depth — `before` with the mover to move, `after` with his
sibling — so `P.dropOf` works for Black unchanged. Per kid: blunders (≥150cp), worst moment,
best moment (the engine's own move gaining ≥150cp, or mate), engine-matched moves, pieces given. His
worst two drops become fights in **his** `gameFights` through Play's extractor; the Black kid's rows are
mirrored first, `prepare()`'s flip, so his board is white-to-move with his own pieces at the bottom. Best moments go to `stats.bestMoves`, cap 20.
`S.recordVersus` writes `stats.versus`: everything climbs, and none of it reaches `suggestLevel`.

## Never scored against each other

No tally anywhere. The result is two stacked cards from two separate walks of the record, each with
that kid's best moment, his moment it turned (Fight it now / Later) and his own Glitch line. A stored
moment records `vs: "sibling"`, never a name. `tests/test_versus.js` walks the result object and each
`progressSummary`, rejecting tally-shaped keys, `n – n` strings, and any mention of the sibling.

## Verified and deferred

375×812, marker v0.21: entry, alternation, swap, the flip each turn, two mates to two cards, the
Black kid's fight played through to a card, resign, resume, Progress per kid. No console errors, all
suites green. Deferred: referee voice, PGN, a cosmetic think meter.
