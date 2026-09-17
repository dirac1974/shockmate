# Progress, backup and sync — report

## What it was

`localStorage` on one device, three keys (`shockmate-v2:settings`, `:p0`, `:p1`). No backup, no sync, no offline shell. The real hazard was iOS: Safari evicts a site's storage after roughly seven days without a visit, so a collection built over one weekend could vanish before the next — and the collection is the entire reward loop.

## What it is now

**Installable.** `manifest.webmanifest`, generated 192/512 icons, `apple-touch-icon`, theme colour, and a `sw.js` service worker that caches the whole shell plus the Google fonts it pulls. Added to the home screen, the app opens standalone, loads with no signal, and is no longer subject to the seven-day eviction. Bump `CACHE` in `sw.js` on any shell change or phones keep the old copy.

**Backup file.** Parent settings gained *Save backup file* and *Restore from file*. The file holds both kids' profiles and their names. Restoring **merges** rather than replaces, so restoring last month's file can never delete a card won since.

**Family-code sync.** One code, twelve characters from a 32-symbol alphabet with no `0/O/1/I` to misread, shown grouped (`ABCD-EFGH-JKMN`). Make it on one device, type it on the other, and both pick up the same cards. Sync runs on load, a few seconds after each card is earned, and on leaving settings; every failure is silent and non-destructive.

### Merge rules, because last-write-wins would lose cards

Counters take the **larger** side, never the sum — summing would double-count fights both devices saw. Cards union; a critical stays a critical; `mastered` is never un-mastered; the side with more finds carries the review schedule; ledger rows dedupe, sort oldest-first and trim to 40; the tier window keeps the most recent 8. The merge is order-independent and idempotent, which `tests/test_sync.js` asserts directly.

### Security model

The anon key ships in a public page, so the table is closed to it: RLS on, no policies, privileges revoked. All access goes through two `security definer` functions that require the family code, with a payload size cap. The code is the only secret — about 60 bits, generated on the device. Anyone holding it can see that progress, which is why the field warns to keep it in the family and use first names only. No date of birth, no email, no account: the payload is counters, card ids and a display name.

## Set-up, in order

1. Apply `supabase/migrations/0001_shockmate_sync.sql` to a Supabase project.
2. Put that project's URL and anon key into `web/sync-config.js` and redeploy. With those blank, the sync controls explain they are off and the backup file still works — verified in the e2e suite.
3. On the first device: Settings → *Make a code* → *Sync now*. On the second: type the code → *Sync now*.
4. On each device, add the page to the home screen.

## Verification

`tests/test_sync.js` covers codes, merge (order-free, idempotent, capped), the backup round trip, the exact RPC request shape, and the failure paths — an unconfigured build refuses to call out, and a 401 surfaces with its status. `tests/e2e/phase3_sync.py` serves the app over http so the service worker is real: it wins a card, saves the file, wipes `localStorage` the way eviction would, restores it, proves a second restore does not clobber newer progress, then goes offline and reloads to confirm all 23 fights still load. Six suites green.

## Not done

Live end-to-end against a real project — the migration has not been applied anywhere yet, so the Supabase path is tested against a stubbed transport only. That needs your say-so on which project.
