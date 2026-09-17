# Progress, backup and sync — report

## What it was

`localStorage` on one device, three keys (`shockmate-v2:settings`, `:p0`, `:p1`). No backup, no sync, no offline shell. The real hazard was iOS: Safari evicts a site's storage after roughly seven days without a visit, so a collection built over one weekend could vanish before the next — and the collection is the entire reward loop.

## What it is now

**Installable.** `manifest.webmanifest`, generated 192/512 icons, `apple-touch-icon`, theme colour, and a `sw.js` service worker that caches the whole shell plus the Google fonts it pulls. Added to the home screen, the app opens standalone, loads with no signal, and is no longer subject to the seven-day eviction. Bump `CACHE` in `sw.js` on any shell change or phones keep the old copy.

**Backup file.** Parent settings gained *Save backup file* and *Restore from file*. The file holds both kids' profiles and their names. Restoring **merges** rather than replaces, so restoring last month's file can never delete a card won since.

**Family login — the same one the other apps use.** Identity lives where it already lives: `hop_families.family_code` plus a `hop_players` row per child (lowercase username, 4-digit PIN), exactly as `garden_players`, `bloom_players`, `star_players` and `field_players` use it. Shockmate adds `chess_players` with that same column shape and stores no second copy of the PIN. Parent settings take the family code, then *Load family* lists the children on that code and their display names carry over, so the cards say what the kids already see in the spelling and maths apps. Each of the two slots binds to a username and PIN; an unbound slot stays device-local. Sync runs on load, a few seconds after each card is earned, and on leaving settings, and every failure is silent and non-destructive.

### Merge rules, because last-write-wins would lose cards

Counters take the **larger** side, never the sum — summing would double-count fights both devices saw. Cards union; a critical stays a critical; `mastered` is never un-mastered; the side with more finds carries the review schedule; ledger rows dedupe, sort oldest-first and trim to 40; the tier window keeps the most recent 8. The merge is order-independent and idempotent, which `tests/test_sync.js` asserts directly.

### Access, and a finding about the sibling tables

Shockmate's table is closed to anon: RLS on, no policies, privileges revoked. The only way in is three `security definer` functions — `chess_roster` (code only, and it never returns a PIN), `chess_pull` and `chess_push` (both verify the PIN against `hop_players` before touching anything, with a payload size cap).

The older sibling tables are not closed. `hop_families`, `hop_players`, `garden_players` and `bloom_players` all carry blanket `SELECT true` / `UPDATE true` policies, so anyone holding the anon key can read and rewrite every family's rows — display names and 4-digit PINs in plaintext. That is why the anon key is **not** committed here: it goes into parent settings once per device and is kept in `localStorage`. Tightening those policies to the same function-only pattern would make the key safe to bake into the page; that is a change to the other apps, so it is your call rather than something done in passing.

## Set-up, in order

1. Already done: `supabase/migrations/0001_chess_players.sql` is applied to the project holding the other kid apps (`digcgqltrlmhgmzgmvwc`). Verified server-side — push/pull round trip against a real identity, wrong PIN rejected, short code rejected, test row removed, table left empty.
2. On each device: Settings → paste the Supabase URL and anon key → *Save API details*. Blank means no sync and the backup file still works, which the e2e suite checks.
3. Settings → type the family code → *Load family* → pick each child's username and enter their PIN → *Sync now*.
4. On each device, add the page to the home screen.

## Verification

`tests/test_sync.js` covers codes, merge (order-free, idempotent, capped), the backup round trip, the exact RPC request shape, and the failure paths — an unconfigured build refuses to call out, and a 401 surfaces with its status. `tests/e2e/phase3_sync.py` serves the app over http so the service worker is real: it wins a card, saves the file, wipes `localStorage` the way eviction would, restores it, proves a second restore does not clobber newer progress, then goes offline and reloads to confirm all 23 fights still load. Six suites green.

## Not done

The browser half of the sync has not run against the live project: the client is tested against a stubbed transport and the SQL half was exercised directly in the database. The first real *Sync now* on a phone is still an untested step, so do it while you can watch it, with a backup file saved first. PINs are held in `localStorage` on the device, which matches how the sibling apps treat them.
