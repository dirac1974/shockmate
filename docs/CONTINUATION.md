# Shockmate — session memory

Read this first in a new session, then `docs/PLAN.md`. `docs/AGENTS.md` defines roles.

**Date:** 2026-09-17
**Repo:** https://github.com/dirac1974/shockmate
**Live:** https://dirac1974.github.io/shockmate/ — marker `v0.8.1 · 23 fights · 6 days`.
**Source of truth:** GitHub `main`. There is no other copy. Anything not on `main` does not exist.

## What the game is

ADHD chess trainer for two kids (8 and 10) at about 400 Chess.com. Theme: Timeline Split. The kid is a time agent; every move splits time in two; Glitch, a purple time-goblin, dangles bait toward the bad timeline. Engine-scored fights, board-tap why-gate, per-kid profiles, co-op by default.

Core loop: think (quiet) → move → tease (0.7 s) → verdict by tier → the future plays out on the board → why-gate (tap the pieces) → card earned → next fight or cliffhanger.

## Actual state — v0.7 is live

Phases 0, 1 and 2 are built, merged and deployed. Openings, endgames, persistence and family sync landed on top of them, ahead of the plan.

- Live at `1189ad0`. Pages serves `main` / root and rebuilds in about 40 seconds. Verify a deploy by the home-screen build marker, never by eye.
- Six suites green on the live commit: `test_futures.js`, `test_score.js`, `test_sync.js`, `test_days.js`, `test_battle.js`, `test_encounters.py`.
- `tests/e2e/*.py` did NOT run. Application Control on David's PC blocks the greenlet DLL that Playwright loads. The e2e suite currently has no machine to run on.
- Data is generated: edit `data/encounters.src.json`, `openings.src.json` or `endgames.src.json`, run `python3 tools/build_encounters.py --sf <stockfish>`. Never hand-edit `v2.json` or `web/encounters.js`.
- Six lesson days cover all 23 fights and deliberately mix packs, so a session cannot dead-end inside one pack. Days are picked on the home screen; `pack` survives only as a data label.
- A session is now a day. It ends when the day's fights are done, and finishing one offers the next straight away. Nothing is locked; a second day in one sitting gets a soft line about coming back tomorrow.
- The kid has a rank that only ever climbs, Rookie through Time Marshal, shown in the top bar and on every card.
- Glitch's own rating still falls permanently and never recovers. A different crony fronts for him each calendar day, so there is always a fresh brag to knock down without yesterday's win being taken back.
- Glitch physically wilts as his rating sinks, via `data-wilt` on his sprite.
- A Home button in the top bar returns to the title screen from any screen at any moment. Leaving mid-fight keeps every card already earned and drops only the unfinished fight. A navigation counter stops an animation that is still running from dragging the kid back, and `goHome` releases a why-gate that is waiting on taps. The same counter stops a gate opening behind him when the animation reaches the why-gate after he has already left.
- The solo entry is named for what it is: the section reads Battle and the button reads Battle plus the name of today opponent. It was headed Practise with a Play button, and the kid asked where the battle button was.
- Battle layer, at the parent's direction from gate-0 feedback ("it doesn't count as a win", "there is no game", "how do I battle Glitch"). Today's crony is a boss with a health bar; correct moves land as HITs; the floor is a KNOCKOUT. Wins earn Power (cap 5) for four abilities: Double Strike, Glitch's Tell, Time Shield, Overcharge. Gear slots and gear open with rank; each crony has a motif weakness that hits half again as hard. Abilities never touch the board. Every rule resolves through a pure function in `web/score.js` and is held by `tests/test_battle.js`. See `docs/reports/battle.md`.
- Phase 1 skin: Timeline Split colours, Glitch with five moods, charging bars, critical zoom, path pips, tap-to-skip.
- Phase 2: co-op, handicapped duel, per-player Blitz, silent adaptive difficulty, collection art.
- Glitch brags a rating that deflates as cards are earned. It is the only falling number in the app and it belongs to the villain.
- Progress: localStorage, backup file, optional Supabase family-code sync. Installable and offline via `web/sw.js`.
- Tags: `v0.5-return` points at the Phase 2 build `2400b75`. `v0.7` tags the lesson-days and battle release at `358c1b9`. v0.8 is untagged.

## Built is not passed

Every phase gate in PLAN §7 is a real session with the kids, not a test run. The site only went live on 2026-09-17, so the gates for Phases 0, 1 and 2 have never been run. Nothing downstream is signed off. Treat the roadmap below as blocked on gate 0.

## Do not break

Engine is judge. Animation is teacher. No eval numbers on screen. No loot, no purchases, no energy timers. Nothing on screen ever goes down. Every fight is winnable this session (second try, then confession, card still earned). Quiet during the think window, loud after the move. Cartoon slapstick only. Kids are never scored against each other. Commits credit "Claude", never a model name.

## Next places

1. **Gate 0 — both kids, six fights each, on a phone.** David. Blocking everything. Add the site to the home screen first, so iOS stops clearing cards after a week and the app works with no signal. Note every place anyone got stuck or bored. That note is the input to Phase 3, not a formality.
2. **Prove the family sync once, with a backup first.** David, because it needs credentials. `web/sync.js` and `supabase/migrations/0001_shockmate_sync.sql` have never run against the live project. Save a backup file, then family code, then Sync now, on two devices, and confirm a card earned on one appears on the other.
3. **Give the e2e suite a home.** QA. Put the four unit suites plus Playwright in GitHub Actions on push to `main`. Today a red e2e test is invisible, because the only machine that runs it is blocked by policy. This is the one engineering task that does not wait on gate 0.
4. **Phase 3 "Grow", rescoped.** Openings and endgames already shipped, so what remains of PLAN §7 Phase 3 is: parent weekly summary, tablet layout, recorded Glitch voice lines, and a second tactics pack including two "bait is real" fights. Do not open a branch until gate 0 is reported.

## Release ritual

Bump `BUILD` in `web/game.js` and `CACHE` in `web/sw.js` together, or phones keep the cached shell. Push `main`, wait for Pages, then confirm the marker on the live page. Work built in a cloud sandbox arrives as a git bundle, because that sandbox has no GitHub credentials and cannot push; a source zip is not enough, since it carries no history.

## Links

- Play: https://dirac1974.github.io/shockmate/
- Plan (living copy): https://claude.ai/code/artifact/73839b7f-e1e8-4f13-a65e-ce725a30b4e1
- Concept screens: https://claude.ai/artifact/UvtVosoKFKnmUFLhbpnLQ7

## Next session start

1. Read this file, then `docs/PLAN.md` §5–§9.
2. Run the six suites and record what is red.
3. Ask whether gate 0 has been reported. If not, do not start a phase; take item 3 above.
4. Before ending: update this file (what shipped, what is red, next three steps). Keep it under 80 lines.
