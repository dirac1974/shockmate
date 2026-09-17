# Openings pack — report

Six opening fights, engine-verified, live behind a Tactics / Openings switch on the home screen. Underpromotion deferred as asked. All five suites green: `test_futures.js`, `test_score.js`, `test_encounters.py`, `e2e/phase0.py`, `e2e/phase2.py`.

## What shipped

| id | Title | The lesson | best vs bait (cp) |
| --- | --- | --- | --- |
| o1 | Slam the Door | Block the early queen before it mates on f7 | block vs mate |
| o2 | Queen Out Too Early | The pawn that chased the queen unguarded a rook | +401 vs −58 |
| o3 | He Took It Back | Moving the f-pawn opened a diagonal at the king | +303 vs −279 |
| o4 | Fried Liver | Two attackers on f7 beat one defender | +133 vs −175 |
| o5 | No Cheap Heroics | A sacrifice without a follow-up just loses a bishop | +99 vs −429 |
| o6 | Trap the Corner Rook | A piece with no squares is already lost — attack it, don't trade it | +307 vs +52 |
| o7 | He Grabbed Your Pawn | Count the guards and take the free piece before getting fancy | +321 vs +14 |

o1 and o7 are authored from Black's side and mirrored to white-to-move, so the arena keeps one orientation. The build script flips the squares *and* the prose, so "saves f7" became "saves f2" on the mirrored board.

## Two of your slides did not survive verification

- The Lasker underpromotion line is real (`...fxg1=N+` checks out), but the slide's move list as printed is illegal — it omits `dxe3`. Deferred anyway per your call on endgames.
- Trap #1's rook trap is real; the slide's board doesn't match its own caption. Rebuilt from the true move order as o6, which is the one fight directly descended from your screenshots.
- Trap #5's "Bxf7 then fork" idea failed the margin rule twice. The engine prefers `Nxe5` at move 4, and `Nxe5` itself only wins if Black grabs the queen — so the trap isn't sound. It became o5, which teaches the opposite: don't sac without a forced follow-up. That is a better lesson for a 400 player than the trap was.

## Authoring notes for the next pack

- Source entries now accept SAN move lists (`"moves": ["e4","e5",…]`) plus SAN for best and bait, so opening fights read the way people talk about them.
- `bestTol` per fight loosens the best-move tolerance where several opening moves are equal.
- `--only o5` rebuilds one fight and merges it, instead of re-scoring all eighteen.
- An illegal or unsound authored move is now a REJECTED line in the build log, not a crash. Three fights were rejected and rewritten during this pass — the gate works.

## Still deferred

Underpromotion (needs promotion support in `applyUci`, the legal-move packing and the build script — about an hour, worth doing when they start reaching endgames), recorded SFX and voice lines, parent weekly summary, tablet layout.
