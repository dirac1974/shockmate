# Rush: slowing the hand (v0.19)

Both kids cleared 32 fights in 30 minutes. Confession still handed them every card, so rushing was
free. Rushing is what loses them tournament games.

## What changed

- **Think time.** Each attempt carries `thinkMs` (think window open to committing tap).
  `S.recordMove` stores `card.thinkMs`, `card.rushed`, `stats.rush`. Rushed = wrong in under 4 s;
  a fast right move never counts. Progress: a Rushed tile, and the scoresheet note above 30%.
- **Look first.** Tournament week or Camp, arriving move attacks something: one tap on the target
  before the clock starts. Hint after two misses, answer shown on the third. `S.lookFirst`, `S.LOOK`,
  counted by `S.recordThreat`.
- **Cracked cards.** A confession win stores `clean: false`: hairline crack plus "cracked", said
  once. A clean win repairs it; nothing else moves. `S.earnCard`; `S.prepFights` puts cracks first.
- **Glitch reacts** to look-first taps, cracks, repairs and pacing from `S.GLITCH_LINES`, 3+ variants
  each; `S.glitchLine` never repeats back to back.
- **Pacing.** Two finished days in one sitting: FIGHT reads "Camp instead?" with a Glitch line and a
  "Day N anyway" link. Off once Camp is done today. `S.pacingNudge`.
- **Voice** via `voiceKeyFor(enc, kind)`. **Ladder** days: rung stop, rating band, current stop centred.

## Tests

`test_score`, `test_progress`, `test_prep`, `test_camp`. All 10 JS suites green, `test_days` included.

## Verified

Chrome 375×812, SW and caches cleared, marker v0.19: look-first right, wrong, hint, give-up, skip,
Home mid-gate; confession win cracked a card, clean replay repaired it; Rushed tile and note; pacing
nudge; synthetic ladder stops. No new console errors.

## Deferred

`sync.mergeStats` drops `clean` and `rush` when both devices hold a card (sync.js is not Arena's).
Real ladder data not yet seen.
