# Staying signed in

The parent's join was never lost. `sm_players` had it: slot 0, "Dad", synced. His *phone* lost it.
iOS clears script-written storage after about a week unused, starts empty in Private Browsing, and
gives a link opened inside Messages a jar thrown away with the sheet. Desktop does none of that.

So the URL carries the sign-in too. It costs nothing, and an **Add to Home Screen** icon freezes it.

## On arrival

Shockmate accepts `family`/`f`, `me`, `u`+`from`, and stamps `?family=CODE&me=SLOT` after every join.
The others accept `u`|`who` and `f`|`family`, and stamp `?u=<username>&from=yomple&f=CODE`. Quiet
Field read **no URL at all** before this. The hub takes `u`/`f` and keeps the code. Storage keys are
unchanged everywhere.

## Survives a wipe

A reload, and a wipe followed by reopening the same URL. Shockmate then asks one PIN — not the code
box, not the roster. The other apps go straight in, with one PIN prompt if that kid's row has one.
Verified in `tests/e2e/login_matrix.py` (local servers, faked Supabase; the live Shockmate backend
was never written to, so `OAK-9QA1` was never needed).

## Cannot

- **Wipe plus the bare URL** — nothing left to read. The friendly code screen is the floor, never a crash.
- **In-app browsers** — storage dies with the sheet regardless, so the app says so once: *"This
  browser forgets logins. Open in Safari to stay signed in."* Play is never blocked.
- **The hub will not sign a face in from a URL**, only one it already knows; adding a face stays
  behind the server's PIN check. Deliberate, see the yomple PR.

## The iOS hint

After a join, on iOS Safari only (`navigator.standalone === false`, iOS UA, not in-app): *"Add this to
your Home Screen to stay signed in: tap Share, then Add to Home Screen."* Dismissible, remembered
best-effort — a phone whose storage is dead cannot remember the dismissal either.

**`start_url` removed from the manifest.** It cannot carry a per-family code, and it would override
the address being shown when the page is pinned, defeating the fix. Without one the spec keeps the
document URL. BUILD `v0.28`, CACHE `shockmate-v29`.

## PRs (unmerged)

hall-of-presidents [#4](https://github.com/dirac1974/hall-of-presidents/pull/4) (also fixes a **blank
page** on `?from=yomple&f=CODE` with no `u`) · star-map
[#4](https://github.com/dirac1974/star-map/pull/4) · quiet-field
[#4](https://github.com/dirac1974/quiet-field/pull/4) (`app.js` **did not parse** on `main` — the app
was a blank screen for everyone) · yomple [#7](https://github.com/dirac1974/yomple/pull/7)

## Needs someone else

**bloom** (read-only here): takes `u`/`f` but not `who`/`family`, never stamps the URL, and
`ensureYompleFamily()` **hard-codes a real household code** as the fallback — every stranger joins
that household. Flagged to the security agent. **Hall of Presidents**: `walk.js` reads
`.introduced` with no active profile; a `pageerror` on every load, on `main` too. Not a login bug.

## Not tested

Any real iPhone or iPad. All of the above is Chrome here: eviction simulated with
`localStorage.clear()`, dead storage by making `setItem` throw. iOS behaviour is read off the specs —
**the manifest change in particular wants one pass on the actual phone.**
