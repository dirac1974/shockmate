# One family code (v0.26)

## The change

Shockmate's family key is now the Yomple household code (`WORD-XXXX`) that every other Yomple app
shares. The 8-character codes are gone. `sm_families` was empty, so there was nothing to migrate. The
code box takes 16 characters and accepts `maple k7q2`, `MAPLEK7Q2` or `maple-k7q2`.

- **Join:** type the code. Shockmate reads the household's kids from Yomple (`yomple_family_players`,
  five tables, read-only) and adds its own players. The list is deduplicated, drops placeholder names,
  and shows up to six names plus "Someone else". A kid who already plays Shockmate types his PIN. A new
  kid makes one, twice (`sm_family_adopt`, two slots). An unknown code gets "not found" and an example
  code.
- **Start a family:** Shockmate mints a Yomple-alphabet code, checks that Yomple has no such
  household, creates it (`sm_family_create` now takes the code), and registers it with
  `yomple_family_upsert`.
- **From yomple.com:** Shockmate reads `?family=` or `f=`, and marks the kid named by `u=`. The hub
  adds `family=` in https://github.com/dirac1974/yomple/pull/5 (unmerged).

## Trust model

The household code is the secret, as in every Yomple app. Each kid's Shockmate PIN (bcrypt, never
returned) protects his slot. Migration 0005 keeps SECURITY DEFINER, anon-only grants, and RLS with no
policies. The advisors show only the two intended findings.

## The parent, on the iPad

Open Shockmate, or go to Settings → Family → Set up this phone. Type the family code and tap **Find my
family**. Tap the kid's name, and he picks a PIN twice. Do the same on the second kid's device.

## Verified

- All suites, including e2e phase3 and phase4.
- Real Yomple, read-only: the household roster.
- Real Shockmate: two throwaway codes (adopt, taken, sync, live, create). The rows were deleted.
- Browser at v0.26: the real roster appears.
