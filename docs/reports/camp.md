# Camp — the daily tournament-prep session (v0.17)

A Camp chip sits on the map beside Prep. Tapping it runs one fixed session, about eight to ten
minutes, one per kid per day. Nothing locks, no number on screen falls, and nothing is scored against
the sibling.

## The session

1. **Spot the attack ×3.** Glitch's arriving move plays with the usual shading; instead of a move the
   kid taps what that move just hit. Targets come from `F.threatTargets`: direct hits off the landing
   square, plus any of his other pieces that now attack something they did not attack before — two
   board scans, no search. A board whose arriving move attacks nothing is skipped. The mechanics are
   the why-gate's: dots, `gate-ok`, the shake on a wrong tap, a hint after two.
2. **Fights ×4.** `S.prepFights`, misses first, with the tournament ritual forced on whatever the
   settings toggle says.
3. **Counters ×2.** Reserved out of pack `defence` (motifs `counter`/`defend` first) *before* the four
   fights are picked, so a small pack is not swallowed by them. With no pack, two more prep fights.
4. **Debrief.** Replaces the session-end card. Camp is marked done for the calendar day.

## Per coach style

`settings.coach[i]` is "numbers" or "words"; the default follows that player's Short-lines flag, and
Settings has a control per player. Every sentence Camp says goes through `S.coachLine(style, ctx)`.
Numbers gets counts ("He attacks 2 pieces. Tap both.") and a debrief of counts plus one line to say at
the board tomorrow. Words gets the question ("What did that move just attack? Tap it.") and a
two-sentence note built from his weakest motif and its principle. On every normal fight card the words
style also shows that motif's principle under the why, once per motif per day. Both hear `prep-q1`
and `prep-q2` at the start and the end.

## What holds it

`web/score.js`: `PRINCIPLES` (every motif in the data plus the five new ones), `coachLine`,
`coachStyleOf`, `recordThreat` (`stats.threats`), `campPlan`, `campDebrief`, `recordCampDay`,
`campDoneToday`. `web/futures.js`: `threatTargets`. `tests/test_camp.js` covers all of it and stays
green with or without the defence pack, which it synthesises.

## Verified

Chrome at 375×812, service worker unregistered and caches cleared, marker read as `v0.17`: a full camp
in both registers, wrong taps and the hint, the debrief, a same-day replay, the chip reading "done
today ✓", FIGHT and Prep still working, no console errors.

## Deferred

Warm-ups draw on 8 of the 23 boards; the rest of the arriving moves attack nothing, and the defence
pack should widen that. First-try counts all six boards, not four. The principle-shown-today map is in
memory, so a reload can repeat one.
