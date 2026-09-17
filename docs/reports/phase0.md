# Phase 0 report — playable truth

Built in the planning chat's sandbox (no Claude Code session was available), committed locally on top of `09cfeb3`. Not pushed: no GitHub credentials here. Apply with `git pull <path>/shockmate-phase0.bundle main` or `git am phase0.patch`.

## Tests before / after

| Test | Before | After |
| --- | --- | --- |
| `node tests/test_futures.js` | FAIL (no line data) | PASS |
| `node tests/test_score.js` | FAIL (line 17) | PASS |
| `python3 tests/test_encounters.py` | PASS (legality only) | PASS (legality, margins, tiers, lines, targets, bosses) |
| `python3 tests/e2e/phase0.py` (390×844) | — | PASS: 12 fights to cliffhanger, bait→blunder→confession→guided, good-tier peek, no console errors |

## Shipped

- `tools/build_encounters.py`: Stockfish 17.1 scores every legal move (depth 14), tiers by gap to top (best ≤ max(10, 4 %), good < max(60, 12 %), bait, blunder), lines from engine PVs truncated at the first consequence, margin rule ≥ 150 cp or mate. `encounters.src.json` is authored; `v2.json` and `web/encounters.js` are generated.
- Fights 04, 06, 11 rebuilt. 04 now has a free knight beside the poisoned bishop so the best move is crisp (+520 vs −797). 06 is "pile on the pin" (+484 vs +5). 11 is a real discovered check from a rook behind the knight (+725 vs −544). Fight 05's material was evened so losing the queen actually loses (+564 vs −377).
- `web/game.js` rewritten as a state machine; every control in `index.html` is bound. Second try lights the three best origin squares; a second miss plays the better future, then the kid plays it guided and still earns the card.
- Why-gate is on the board: tap the target squares; wrong taps shake, two wrong taps light a hint; it cannot fail.
- Profiles P1/P2 with separate storage; HUD shows Won / Criticals / Cards only. Criticals roll 1 in 6 on best tier, guaranteed on bosses (04, 08, 12), never twice in a row.
- Session cap default 6; ends on a cliffhanger with the next fight's hook. Up to two due rematches per session.
- Docs: `PLAN.md`, `CONTINUATION.md`, `AGENTS.md` replaced. `ENCOUNTERS.md` regenerated.

## Decisions made under ambiguity

- Sections 2.3 and 5.2 of the plan conflicted (show the better future after the first miss vs. give a second try). Chose: first miss shows only Glitch's future, then second try; the better future is shown only after a second miss. Keeps the retry honest.
- A correct move counts as the hit; the why-gate confirms rather than gates. `score.js` changed accordingly so retries and good-tier moves credit fully.
- Tier thresholds scale with the size of the top score so won positions do not mark reasonable moves as blunders.
- The two "bait is real" fights are deferred to pack 2; `test_futures.js` still asserts 12.

## Red or deferred

- Fight 01's bait (Qxh5) loses to forced mate (−9998); the bait line plays Qxa1+ and stops. Fine for teaching; the old test expected a different, illegal line and was corrected.
- Stockfish is not in the repo; the build script takes `--sf PATH` or finds it on PATH.
- Old theme and oscillator beeps remain by design; Phase 1 replaces them.
- GitHub Pages not enabled (needs the repo owner).

## Playable?

Yes on a 390×844 viewport, end to end, with no dead ends. Pages URL pending owner flip: https://dirac1974.github.io/shockmate/ — until then jsDelivr serves `main` once pushed.
