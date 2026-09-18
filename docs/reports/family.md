# Family — one-tap setup and two-phone versus (v0.22)

## Backend, and why the key is public

Shockmate has its own Supabase project (`dmcslbqmlogmtsibiyzq`), and `sync-config.js` bakes in the
URL and publishable key. `sm_families`, `sm_players` and `sm_live_games` have RLS on, no policies and
no grants. The only way in is eleven `security definer` RPCs with `search_path = public`
(migrations 0002, 0003). Each RPC validates code, slot, PIN and name shape, and progress is
capped at 256 KB. Each one checks a bcrypt PIN hash,
and no PIN is ever returned. Ten wrong PINs lock that kid for 15 minutes. A family has 1–2 kids,
with at most 30 new families every 10 minutes. Helpers are not callable by anon.

## What a new family sees

"Set up this phone" appears on first launch, or from a `?family=CODE` link.

- **New family:** the kids' names, then each kid picks a PIN on the keypad, twice. The phone shows a
  big code with Share (share sheet or clipboard) and "This phone plays as".
- **Join:** the code, then the roster, "Which one is this phone's player?", and his PIN. His
  progress merges with the phone's copy using `mergeStats`.
- **Skip:** the phone stays local, and the choice is remembered.

Settings → Family has the code, Share, Sync now, Change player and Leave (local only). The URL and
key fields are gone.

## Live protocol

Invite → accept → `sm_live_move(ply, uci)`. The server checks turn parity and colour, and that the
ply equals the move count (a stale phone gets `ply` and resyncs). chess.js checks legality on both
phones, and an illegal server move is ignored and the phone replays. A game with no move for
60 minutes is over. Each family has one open game. The home screen polls every 5 s and a game every
1.5 s. Each phone keeps its kid's colour at the bottom and scores only his moves, producing one card
(`V.liveResult`) with no tally.

## Verified

- **Node, real backend:** every RPC, plus wrong PIN, size cap, wrong turn, stale ply, and a direct
  table read (401).
- **Browser at 375×812, v0.22, two origins:** new family, join by link (wrong PIN first), invite
  arriving, moves both ways, resume after reload, resign, one card per tab.
- Test rows deleted. All suites green, plus `test_live.js`.

**Advisors.** "RLS enabled, no policy" is intended, because access is only through the RPCs. "Anon
can execute security definer" appears for exactly the 11 RPCs, which is also intended: they are the
API and each checks the PIN.

## Deferred

- Adding a second kid later.
- A draw offer.
- A clock.
- Kids' PINs are in localStorage in clear, like the coach PIN.
- e2e `phase3_sync.py` still drives the removed fields, and `phase0.py` must seed `family.skipped`.
