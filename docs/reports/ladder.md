# Ladder — 120 generated fights, 24 days

Both kids cleared all 8 days in half an hour. The ladder is volume with a rising floor, built by
`tools/build_ladder.py`, shaped exactly like a hand-authored fight.

## Source and filters

Lichess puzzle database (CC0), `~/tools/lichess/lichess_db_puzzle.csv.zst`, 6.1 M puzzles, streamed
with `zstandard`, never copied into the repo. `FEN` is the position before Glitch's move, so
`Moves[0]` is `arrive` and `Moves[1]` is `best`. Kept: Popularity ≥ 80, NbPlays ≥ 500, RatingDeviation
≤ 90, solution ≤ 5 plies, `oneMove` preferred, ≤ 24 pieces in the two lowest rungs. Dropped: castling,
en-passant and promotion arriving moves (a FEN cannot be un-played through them), positions a
hand-authored fight already uses, and puzzles whose lesson is not on the board after `best`.

## Motif map

`backRankMate→backRank`, `mateIn1/mateIn2→mateThreat`, `fork→fork` (or `royalFork` when the king is
one of the two targets), `pin`, `skewer`, `discoveredAttack→discovery`, `trappedPiece→trapped`,
`capturingDefender→attackers`, `hangingPiece→hanging`, `defensiveMove→defend`,
`deflection`/`attraction→counter` (only when `best` is a check or capture),
`promotion`/`advancedPawn→kingMarch` (only when `best` pushes a pawn). First match wins.

## Counts

20 per rung, 12 motifs per rung (10 in rung 1), capped at 2–3 per motif so no rung is one trick:
559–695, 701–849, 866–998, 1008–1146, 1151–1290, 1305–1444. Split into 24 days of 5 (`Ladder 3 · 2/4`),
`ladder: true`. Bait is Stockfish-picked: biggest capture first (80), then a check (12), then the best
quiet move (28); median best−bait 1412 cp, minimum 351.

## Text

Per motif: 4 hook/why/whyLong/short variants, ≥ 6 titles, ≥ 10 taunts, ≥ 6 gloats, ≥ 6 rages, picked
by puzzle-id hash so a rebuild is stable, then stepped on so no two fights in one day share a taunt,
gloat, rage or title. Glitch names the piece the bait grabs or moves; `whyLong` and the gate prompt
name the pieces the generator knows. Hook, why and short stay slot-free: audio is per template
(`voice: "<motif>-v<k>"`, 44 templates, 337 keys), and `generate.py` aliases `<id>-<kind>` onto them.

## Regenerate

`build_ladder.py` → `build_encounters.py --only <ladder ids>` → `voice/extract_lines.py` →
`voice/generate.py`. Nothing is rejected at build time: every puzzle that would fail the build or
`tests/test_encounters.py` is dropped by the generator first.
