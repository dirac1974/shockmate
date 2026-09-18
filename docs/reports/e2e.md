# Browser tests (v0.22)

## Harness

`tests/e2e/harness.py` serves `web/` over http and opens a 390×844 phone at `?fast=1`. Before the
app runs, it seeds localStorage with the family skipped, sound off and coach PIN 1234. Any console
error or page error fails the suite.

**Network stub.** Requests to `*.supabase.co` go to `FakeSupabase`, an in-memory copy of the eleven
`sm_*` RPCs: PINs, roster, pull/push and the live turn/ply rules. Two phones can share one fake.
Nothing touches the real project.

## Suites

- **phase0**
  - Day 1 into Day 2 from the map.
  - All 32 hand-authored fights on three paths: best; bait → second try → confession → guided,
    which gives a cracked card; and good + peek, which 5 fights have.
  - 10 ladder fights. Counts come from the data.
- **phase2**
  - The coach keypad, wrong PIN then right.
  - Blitz, co-op, duel, a mixed-pack day, the binder.
- **phase3_family**
  - Backup round trip and merge.
  - New family → code.
  - Join by `?family=`, wrong PIN then right.
  - A card synced from phone B to phone A.
  - Offline reload through the service worker.
- **phase4_modes**
  - Camp: 3 warm-ups, 4 fights, 2 defence counters, debrief.
  - Look-first in Tournament week.
  - One-phone versus: fool's mate → two cards.
  - Two-phone live: invite, accept, moves both ways, resign, one card each.
  - Play vs Sleepy on the real WASM engine: python-chess hangs a piece and wins; that move
    becomes a game fight, played to a card.

## Runtime and flakiness

CI: phase0 118 s, phase2 10 s, phase3 12 s, phase4 36 s. Sleepy plays randomly: a two-ply test player lost 2 of 5
local games; three plies won 6 of 6. The engine gets 90 s to boot.

## Running locally

`pip install playwright chess`, then `python tests/e2e/<suite>.py`. Windows uses installed Chrome
(`channel="chrome"`, no `playwright install`); `E2E_CHANNEL=chrome` forces it elsewhere.

## App bugs found

None.
