# Endgame pack — report

Five endgame fights behind a third pack switch (Tactics / Openings / Endgames). All five suites green; 23 fights across three packs.

| id | Title | The lesson | best vs bait |
| --- | --- | --- | --- |
| g1 | Never Stalemate | Mate on the back row; the "squeeze" move leaves him no legal move — a draw | mate vs 0 |
| g2 | Ladder Mate | The back rook guards the escape row while the other climbs | mate vs +521 |
| g3 | Don't Check, Take | Take the pawn with the king; the check lets it eat the rook and promote | +518 vs 0 |
| g4 | King First, Pawn Second | Take the square in front of the pawn; pushing early is a dead draw | +512 vs 0 |
| g5 | Box Him In | Mate on the edge; hugging the cornered king with the queen is stalemate |mate vs 0 |

Three of the five punish a draw rather than a lost piece, which is deliberate: at this level the game is far more often thrown away by stalemating or pushing the pawn too soon than by losing material in an endgame. Glitch actively argues for the draw ("Squeeze him. Squeeze!", "PUSH IT! Pawns want to run!"), so the kid has to refuse the plausible move.

## A real bug this pack exposed

`g4` has only two pieces, so every legal move but one starts from the king's square. The old second-try hint excluded the bait's origin, which in that position narrowed the board to a single square and effectively handed over the answer. The rule now keeps the bait's origin eligible, so narrowing never solves the fight by elimination. All 23 candidate lists were recomputed from the stored engine scores — no re-scoring needed — and both test suites now assert the best move's origin is present and the list is 1 to 3 squares.

## Notes

- `tools/build_encounters.py` reads three source files now; `--only g4` rebuilds one fight and merges it.
- New motif icons: `stalemateTrap` (a crossed-out circle) and `kingMarch`.
- One candidate was rejected and rewritten during authoring: the first `g4` position was a mutual-zugzwang draw where the engine preferred a different king move, so it became the key-square position where exactly one move wins.

## Still deferred

Underpromotion — and the endgame pack is where it belongs: "promote to a rook to avoid stalemate" is the natural first fight once `applyUci`, the legal-move packing and the build script handle promotions.
