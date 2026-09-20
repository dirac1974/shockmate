# Security review — Shockmate + Yomple shared, Sept 2026

Every function body and all eight edge functions read; every finding proved over HTTPS
with the public key, then re-proved fixed. The anon key is public by design — the real
secrets are the **household code**, shared across all the apps, and a kid's **4-digit PIN**.

## Found

**1. Critical — one request dumped every child (FIXED).** `yomple_player_search` passed
raw caller text to `ILIKE`, so `%` matched everyone: **37 players across 3 households**,
with usernames, real names and each one's **family code** — which also opens their
Shockmate rosters. `has_pin` named the children with no PIN at all. Wildcards are now
escaped; `%`, `_`, `%%`, `a%`, `%_%` all return `[]`, real names still search.

**2. Critical — `bloom-sync` was wide open (FIXED BY LEAD, v8 verified).** No key needed:
email→code lookup, household dump, unauthenticated overwrite. v8 removes the email
oracle, claims recovery email once, restricts CORS. Its new `pin` write is safe — the
`yomple_hash_pin` trigger hashes it.

**3. High — nothing counted attempts (FIXED).** ~9.2M codes and 10,000 PINs both grind fine.

**4. Medium — three edge functions still need a decision.** See below.

**Sound**: no SQL injection (`pg_shadow`, `auth.users`, `hop_players; drop table…`
rejected); `search_path` pinned; PINs bcrypt and never leave the DB; direct table reads
denied on all 38 tables; `sm_live_move` ply/turn checks correct; size caps hold.

## The throttling, re-keyed after measurement

**My first attempt keyed budgets on the caller, and the Lead was right to challenge it.**
70 identical requests from one machine, counting distinct keys per bucket:

| Path | Distinct fingerprint keys | Engaged? |
|---|---|---|
| `/rest/v1/rpc/*` | **1** (`n=60`) | yes, at 60 |
| `/functions/v1/*` | **11** (`13.248.99.*`, `99.82.172.*`) | **no** |

The Functions edge fronts requests from an AWS pool, so that key rotates by itself there.
(Forged headers are still ignored — three spoofed values all counted against the true
address.) Budgets now ride on **the target, which cannot be rotated**: the code for
rosters, `(code, slot)` for PINs and pushes, the username for lookups. Above that sits a
**global bucket per operation counting misses only**.

| Door | Target | Caller | Global (misses) |
|---|---|---|---|
| rosters, both projects | code, 200/hr | 120/hr | 300 / 10 min |
| find / search | name, 200/hr | 120/hr | 300 / 10 min |
| PIN checks | player row, 10 wrong / 15 min | 30–40/hr | 200 / 10 min |
| pushes / writes | `(code, slot)`, 200–300/hr | — | 2000–3000 / 10 min |
| join requests | username, 3/day | 5/hr | 50 / 10 min |

**Proof the global bucket carries the load**: with it spent and *both* rotatable
dimensions empty (`roster_t` 0 keys, `roster_ip` 0 keys), a real existing code returned
`[]`; ageing the window out restored it. A 400-code scrape stopped after 120.

**Proof a household never pays for it**: 100 successful lookups of a real code left the
miss bucket non-existent. Counting *all* traffic would have handed an attacker a
service-wide off switch; counting misses cannot, because families hit and scrapers miss.
Sizing: 5 devices × 6 opens × 2 calls ≈ 60 lookups per 10 min, all hits. 300 misses per
10 min means the 9.2M code space takes over 50 years.

No lockout is permanent; over-budget stays indistinguishable from "not found"; return
shapes unchanged. One self-inflicted regression caught and fixed: `yomple_player_find_any`
was `STABLE` while the function beneath it began writing, breaking four call sites.
Throwaway data only, all deleted.

## Other `verify_jwt=false` edge functions

`bloom-upload` and `wg-probe` are retired (410); `bloom` serves assets by exact name, no
traversal. Three need your call:

- **`word-garden-voice` fails open.** Its Alexa signature check ends in
  `catch { return { ok: true } }`, so any verification error — including a cert URL that
  merely 404s — passes. The only remaining gate is the skill app ID (trust-on-first-use;
  claimed on all 3 rows today, so shut). It also writes a `wg_events` row on **every**
  request before any auth, so anyone can grow that table without limit.
- **`bloom-publish` has no auth at all** — any request re-copies every asset into public
  storage with the service-role key. A one-shot tool; delete it.
- **`word-garden-upload`** is gated by a static key hardcoded in its source and overwrites
  the app's own served HTML/JS — whoever holds it serves code to the kids. The key is
  **not** in any of the six repos or their history; still, move it to a secret.

## Client side (reported, not edited)

**Every PIN is stored in clear**: `web/game.js:177` writes `state.settings` to
`localStorage`, holding `family.pins` and `parent.pin` beside the code. **The code travels
in URLs** (`sync.js:228`) into history and referrer logs. No PIN in a URL.

## Advisors, after

Shockmate 4 INFO + 12 WARN, Yomple 33 + 19 — unchanged and all expected. "RLS enabled,
no policy" *plus no grant* is deny-all; the linter cannot see the missing grant. The
flagged functions are the intended public API. My helpers are absent from both lists.

## For the parent to decide

1. Delete `bloom-publish`; make `word-garden-voice` fail **closed**; move the upload key
   to a secret.
2. **A username returns the household code** — the rejoin flow as designed. Safer behind
   the child's PIN. Client change.
3. **A PIN-less player can be taken by anyone**, who may then set a PIN and lock the child
   out. Decide whether PINs become mandatory.
4. Enable leaked-password protection in Supabase Auth.
5. Rotate the household codes. Both repos are **public**; I found no real code committed
   in any of the six or their history — but they were readable through the search hole
   until today.
