# Phase 1 report — feel (Timeline Split skin)

Built in the planning chat's sandbox on top of Phase 0. Tests: `test_futures.js`, `test_score.js`, `test_encounters.py`, `tests/e2e/phase0.py` all PASS at 390×844 with no console errors.

## Shipped

- `web/styles.css` rewritten as the Timeline Split skin: navy ground, `#e3e9ff`/`#4d63bf` board, cyan for the kid's timeline, magenta for Glitch, gold reserved for criticals and bosses. Bangers for impact words, Nunito for everything read. 48 px minimum tap targets; `prefers-reduced-motion` honoured.
- `web/glitch.js`: the villain as one inline SVG with five moods — taunt, nervous, smug, rage, hide — in a speech bubble, swapped at each beat of the fight. No image assets, no network.
- Tease is now visible: the board dims, both timeline bars charge (cyan vs magenta), Glitch goes nervous, then the verdict lands.
- Criticals get a hit-stop and a 1.06 zoom before the gold burst.
- Path of 12 pips in the top bar; bosses are gold diamonds; earned fights fill cyan.
- The cliffhanger now renders a mini board of the next fight beside Glitch's threat.
- Tapping the board during any animation skips ahead (for the impatient player); think-only buttons hide once the move is committed.
- `web/pieces.js` repalettes to cream-on-indigo and indigo-on-ice so both colours read on both squares.

## Decisions

- Glitch is drawn, not animated frame by frame: mood swaps plus a pop/shake keyframe. Cheap, and it survives Phase 3 voice lines.
- Skip is a tap anywhere on the board rather than a button, so it never competes with the move itself.
- Sound is still the oscillator set. Recorded SFX need real files; deferred with voice lines.

## Red or deferred

- Recorded SFX and Glitch voice clips (Phase 3).
- Co-op and duel modes (Phase 2), collection card art, parent weekly summary.
- Google Fonts load over the network; offline play falls back to Impact/Trebuchet. Self-host in Phase 2 if the kids ever play on a plane.

## Next gate

Both kids, six fights each, on a phone. Watch for: does he ask for one more, does she say a second-try win counted, does a Critical get a reaction.
