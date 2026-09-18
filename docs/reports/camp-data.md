# Camp data — 11 new fights, 2 retired

Every fight below was re-scored by the build (Stockfish 19). The engine's top move is `best`, and
`best` beats `bait` by at least 150 cp. Numbers are the built margins.

## Retired

- **09 Leftover Loose** — its Ra8# was the same lesson and the same mate as 08.
- **g5 Box Him In** — queen back-row mate versus stalemate, already taught by g1.

Both are gone from the source, from `web/short-lines.js`, and their mp3/sha1 files are deleted.

## attackers (pack tactics, Day 5)

| id | title | best vs bait | lesson |
| --- | --- | --- | --- |
| t1 | Two Beats One | Bf4 (+3) vs Rxd6 (−675) | One attacker on a guarded pawn trades nothing. Add a second. |
| t2 | Three Beats Two | Nfxd5 (+633) vs Nfe2 (−114) | Three attackers against two guards wins a piece. Do not retreat. |
| t3 | Both Rooks In | Rfd1 (+61) vs Rxd6 (−735) | Line both rooks up on the file before you cash in. |

## goodBishop / tradeChoice (pack endgames, Day 7)

| id | title | best vs bait | lesson |
| --- | --- | --- | --- |
| b1 | Swap the Duds | Bxe4 (+648) vs Bd1 (+157) | His bishop is the only thing stopping the runner. Trade yours for it. |
| b2 | Keep the Good One | Bxh5 (+553) vs g4 (0) | His pawns sit on his bishop's colour. Keep yours and eat what his cannot reach. |
| k1 | Horse Beats Bishop | Bxc6 (+17) vs Nxe5 (−494) | Blocked board: give the bishop, keep the horse. |
| k2 | Trade Horses Only | Nxc6 (+245) vs Nf3 (−1) | Open board: swap horses, keep the bishop, win a pawn. |

## counter / defend (new pack defence, Day 8)

| id | title | best vs bait | lesson |
| --- | --- | --- | --- |
| d1 | Check Him First | Qa4+ (+689) vs Rf1 (−12) | Answer an attack on your rook with a check that wins the attacker. |
| d2 | He Let Go | Rxc6 (+641) vs Rc1 (+14) | The pawn that shoved your rook stopped guarding his horse. |
| d3 | Block With the Horse | Nf3 (−54) vs Qf3 (−682) | Block a queen-and-bishop line with the cheapest piece. |
| d4 | One Move, Two Jobs | Nf3 (+573) vs Bf4 (−661) | One move that guards the square and chases the queen beats a block that hangs. |

Every fight opens on Glitch's arriving move, and for all four defence fights that move is the
attacking move, so the tournament-week drill can ask what it just attacked.

## Notes

- t1 and t3 clear the bar on the bait's collapse, not on a big plus for `best`: the engine rates
  both best moves near level, because Glitch can block the file with a piece. The lesson (count
  first, pile on, never cash in a one-for-one) still holds and the bait loses a rook.
- Nothing had to be dropped. All 11 authored fights cleared the 150 cp bar.
- b2's `bestTol` is 60 and t1/t2/t3/k1/k2/d1–d4's is 45; every other fight uses the default.
