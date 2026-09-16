# Shockmate agent team

These are the roles. One human can wear several hats. When Grok (or another agent) works in this repo, pick a role and stay in its lane.

## 1. Lead Producer

Owns the bet: *kids itch to play the next encounter because they cannot wait to see what happens — and they can retell the why.*

- Keeps scope at 12 polished fights before adding openings, accounts, or chat.
- Accepts or kills features against ADHD constraints (short, loud after the move, quiet during the think window).

## 2. Learning Scientist

Owns memory and transfer.

- One idea per encounter.
- Interleave motifs after the first pass.
- Palace figurines + spaced return (1d / 3d / 7d) before new content.
- Retell test: can the kid say the why in the car?

## 3. Kids Game Designer

Owns the itch.

- Variable *spectacle*, fixed *truth*.
- Cliffhanger copy (“the basement is still chewing”).
- Intensity slider. Session cap. No casino extraction.
- Near-miss: if they pick the snack, show how close the crown was.

## 4. Engine Referee

Owns chess truth.

- Stockfish MultiPV on every published position.
- Best vs tempting must both be legal.
- Throw out positions where the two moves are close in eval *unless* one is mate and the other is material (mate always wins the argument).
- Never print raw eval to the kid.

## 5. Encounter Author

Owns hooks, tempting moves, and one-sentence whys.

- Every fight needs a snack the 400-rated kid wants to grab.
- Copy test: would they repeat the sentence without the board?
- Writes `data/encounters.json` and `docs/ENCOUNTERS.md`.

## 6. Arena Engineer

Owns `web/`.

- Tap piece → tap square. No menus in combat.
- Baked legal moves. Self-test on boot.
- LocalStorage progress. Works offline from `index.html`.

## 7. VFX / Finisher Director

Owns explosions.

- Motif-specific payoff: forks hit two victims, pins freeze, back-rank slams a door.
- Parent intensity: silly / messy / intense.
- If the finisher does not encode the reason, rewrite it.

## 8. Palace Archivist

Owns rooms and retrieval walks.

- Rooms: Fork Hall, Pin Parlor, Skewer Kitchen, Hanging Buffet, Back-Rank Basement, Discovery Observatory.
- Figurines store the grotesque image + the why.

## 9. Parent Steward

Owns safety and limits.

- Session cap, quiet hours later, intensity, reset.
- Weekly English report: “they learned why a fork beats a snack.”
- No stranger chat.

## 10. QA

Owns “bug-free” for this slice.

- `tests/test_encounters.py` must pass before a content change ships.
- Manual: play all 12, miss on purpose, hit on purpose, reset palace, cap the session.

## Current assignment (v0.2 shipped)

| Role | Status |
| --- | --- |
| Encounter Author | 12 seed fights written |
| Engine Referee | Stockfish 17 validated best vs tempting |
| Arena Engineer | Two-futures `playPlan` + replay-safe hit apply |
| QA | `tests/test_futures.js` simulates all 12 hit + miss plans |
| VFX | Motif finishers: fork glow, pin freeze, skewer, door slam, laser |
| Palace | Rooms + figurines + retrieval walk (why vs decoy) |
| Parent Steward | Intensity + cap + sound + reset |

## Next sprint (do not skip)

1. ~~Two-timeline piece animation of the tempting line vs the best line.~~ Done.
2. Motif finishers v2 (two-head knight sprite, thumbtack, basement door 3D).
3. Spaced palace walk (1d / 3d / 7d schedule, not only on demand).
4. Sibling duel on the same FEN.
