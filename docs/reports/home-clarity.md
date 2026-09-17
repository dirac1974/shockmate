# Home screen — fixing "am I Black if I pick Player 2?"

## The bug

The home screen showed `Tactics / Openings / Endgames`, then `Player 1 / Player 2`, then three ways to start (`Play`, `Team up vs Glitch`, `Duel`). The two chips were profile pickers — whose cards and whose adaptive difficulty — but in a chess app "Player 2" reads as "you are Black, you move second". Nothing on the screen said how many people the phone expected, and nothing said what colour the kid plays. A parent could not tell either.

## What it says now

1. **You are always White. Glitch is always Black. You always move first.** — stated on the home screen in cyan, right under the tagline.
2. **WHO IS HERE? → Just me / Two of us.** The seat count is now the first decision, and it decides what the rest of the screen offers:
   - *Just me* shows the name chips and the Play button; the two-player block is hidden.
   - *Two of us* hides both and shows `Team up vs Glitch` and `Duel`, with a line naming the two kids: "Mia and Leo take turns on this phone. You both play White."
3. **PLAYING AS** replaces the bare chips, with the line "Your cards are saved under this name — it is not your colour", and a *Change names* link straight into Settings. Once the names are set, the chips read "Mia" and "Leo", which is the real fix: a name cannot be mistaken for a colour.
4. In the arena, a small line under the board reads "Mia is White." In co-op the existing turn banner above the board says whose go it is, so the note stays about colour only.
5. Parent settings gained "Names label whose cards are whose. Both kids always play White", and the fields are now "First name (starts co-op)" and "Second name".

The seat choice persists per device, so whichever way they use it, the phone opens the way they left it.

## Verification

`e2e/phase0.py` now asserts that choosing *Two of us* hides the solo controls and that going back restores them; `e2e/phase2.py` drives the two-player modes through the seat step. All five suites green, no console errors.
