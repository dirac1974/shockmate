# The parent side (v0.18)

Settings and Progress were the last form-style screens in the app and the only ones that did not
know Camp existed. Both are now in the game layer, and the account knows who the coach is.

## Who the coach is

`settings.parent = { name, pin }`. The first tap on the Settings token with no PIN set opens a setup
card — "Who is the coach?", a name, then a 4-digit PIN on a keypad of round tokens, typed twice. From
then on that token and Progress open only after the keypad. The kids' screens — home, fights, cards,
Camp — never ask for anything.

The hint says what it is: a speed bump, not security. The PIN sits in localStorage in clear and rides
in the backup file, which is what makes "Forgot?" answerable at all — restore a backup, or clear site
data and set a new one; the fights and cards are safe in the file. A wrong PIN shakes and can be
retried forever: there is no lockout, because a lockout would lock out the parent. `S.parentGate`
holds the whole decision, so the screen only draws the answer.

## What Settings is now

Stacked cardstock, one subject per card, headed `Coach: <name>`. Players: name, a Numbers-first /
Reasons-first chip pair, Short lines and Blitz as chips that fill when on. Session: a −/+ stepper of
round tokens for fights per session, then Tournament week, Read aloud, Sound, Coordinates and Hurry
clock as chips. Coach: name, Change PIN, Progress, Reset this player. Backup: save and restore. The
family login moved into a collapsed drawer with its ids and behaviour untouched. Done is the arcade
button. Every id `game.js` binds survived; only the tag changed, and the `state.settings` shapes are
identical, so nothing downstream noticed.

## What Progress tracks

`S.progressSummary` keeps every old field and adds `threats` (asked / found / rate / wrongTaps),
`camp` (days, best, run, doneToday), `firstTryRate`, `thisWeek` (Monday–Sunday camp days and cards),
and `coachNotes`: two to four sentences read off that kid's own numbers, in priority order — threats
missed, tapping before looking, the focus motif's principle in the app's own words, a camp run worth
keeping. Per kid: avatar, rank ribbon, cards, four stat tiles, Good at / Focus on, the notes in a
purple "coach says" panel, the 14-day bars and the motif table. A Tournament checklist card closes the
screen with the two questions, the scoresheet pause, and one line per kid.

## Verified

Chrome at 375×812, service worker unregistered and caches cleared, marker read as `v0.18`: first-tap
setup including a deliberate mismatch, the gate wrong-then-right, every toggle surviving Done, one
real fight played and Progress read off it, and a backup round trip through a wiped localStorage that
brought the coach and the PIN back. No console errors.

Fixed in passing: Home during a Camp warm-up threw, because that gate carries no promise to resolve.

## Deferred

Progress is reached from inside Settings, so it is gated once rather than twice. `tests/e2e/phase0.py`
and `phase3_sync.py` click `#btn-settings` and expect `#screen-settings` straight away; they now need
to pass the keypad first. Neither suite runs on this machine. Coach notes are English only and never
compare the two kids.
