# Browser tests (v0.22)

## Harness

`tests/e2e/harness.py` serves `web/` over http on a free port and opens a 390×844 phone with `?fast=1`.
Before the app runs it seeds localStorage once per wipe: family skipped, sound and read-aloud off,
and a coach `{name: "Test", pin: "1234"}`. `unlock_settings()` types the PIN on the keypad. Any
console error or page error fails the suite. Google Fonts get an empty stylesheet.

**Network stub.** Every `*.supabase.co` request goes to `FakeSupabase`, an in-memory copy of the
eleven `sm_*` RPCs in migrations 0002–0003: codes, PIN checks, roster, pull/push, and the live-game
turn/ply rules. Phones that share one instance share a backend. No suite touches the real project.

## Suites

- **phase0** plays Day 1 from the map into Day 2. Every hand-authored fight (32) goes down three
  paths: best; bait → second try → blunder → confession → guided, which must give a cracked card;
  and good-tier with the peek (5 fights have one). It also runs 10 sampled ladder fights. Counts
  come from the data.
- **phase2** covers the coach keypad (wrong, then right), Blitz for one kid, co-op, duel, a
  mixed-pack day, and the binder.
- **phase3_family** covers the backup round trip and merge, new family → code, a second phone
  joining by `?family=`, a wrong-then-right PIN, a card synced B → A, and an offline reload through
  the service worker.
- **phase4_modes** covers Camp (3 warm-ups, 4 fights, 2 defence counters, debrief), look-first in
  Tournament week, one-phone versus (fool's mate → two cards), and a live game on two phones
  (invite, accept, moves both ways, resign, one card each). Play vs Sleepy uses the real WASM
  engine: python-chess hangs a piece, then wins, and that move becomes a game fight played to a card.

## Runtime and flakiness

CI (bundled Chromium): phase0 117 s, phase2 10 s, phase3 12 s, phase4 31 s. The job takes about
4 minutes. Sleepy's moves are random. An early two-ply kid lost 2 of 5 local runs to mate; the
current three-ply search won 6 of 6. The engine gets 90 s to wake.

## Running locally

`pip install playwright chess`, then `python tests/e2e/phase0.py` (or any suite) from the repo
root. On Windows the harness uses installed Chrome (`channel="chrome"`), so no `playwright
install` is needed. Set `E2E_CHANNEL=chrome` to force Chrome elsewhere.

## App bugs found

None. Every flow ran as the reports describe.
