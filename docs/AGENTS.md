# Shockmate agent team

These are the roles. One human can wear several hats. When Grok works in this repo, pick a role and stay in its lane.

## Session memory

Full handoff lives in `docs/CONTINUATION.md`. Read that before picking work.

## Current assignment (v0.5 shipped)

- Encounter Author: 12 seed fights written
- Engine Referee: Stockfish 17 validated best vs tempting
- Arena Engineer: Two-futures playPlan + replay-safe hit apply
- QA: test_futures.js simulates all 12 hit + miss plans
- VFX: motif finishers v1 (glow / freeze / skewer / door / laser)
- Palace: rooms + figurines + retrieval walk
- Parent Steward: intensity + cap + sound + reset
- Score / History: reasons kept + retry queue + ledger

## Next sprint (do not skip)

1. Two-timeline animation. Done.
2. Sync local web/game.js onto GitHub so the phone build matches.
3. GitHub Pages (owner flip) so play has no proxy warning.
4. Motif finishers v2 (two-head knight, thumbtack pin, basement door).
5. Palace due-walk wired to pickWalkTarget (1d / 3d / 7d already in score.js).
6. Sibling duel. Done.
7. Why-gate + retry ledger. Done.
8. SVG Staunton pieces. Done.

## Product rules

Keep scope at 12 polished fights before openings, accounts, or chat. Short, loud after the move, quiet during the think window. Variable spectacle, fixed truth. Never print raw eval to the kid. If the finisher does not encode the reason, rewrite it.
