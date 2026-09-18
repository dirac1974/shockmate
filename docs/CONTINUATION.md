# Shockmate — session memory

Read this first in a new session, then `docs/PLAN.md`. `docs/AGENTS.md` defines roles.

**Date:** 2026-09-18
**Repo:** https://github.com/dirac1974/shockmate
**Live:** https://dirac1974.github.io/shockmate/ — marker `v0.19 · 152 fights · 32 days`.
**Source of truth:** GitHub `main`. There is no other copy. Anything not on `main` does not exist.

## What the game is

ADHD chess trainer for two kids (8 and 10) at about 400 Chess.com. Theme: Timeline Split. The kid is a time agent; every move splits time in two; Glitch, a purple time-goblin, dangles bait toward the bad timeline. Engine-scored fights, board-tap why-gate, per-kid profiles, co-op by default.

Core loop: think (quiet) → move → tease (0.7 s) → verdict by tier → the future plays out on the board → why-gate (tap the pieces) → card earned → next fight or cliffhanger.

## Actual state — v0.19 is live

Phases 0, 1 and 2 are built, merged and deployed. Openings, endgames, persistence and family sync landed on top of them, ahead of the plan.

- Pages serves `main` / root and rebuilds in about 35 seconds. Verify a deploy by the home-screen build marker, never by eye.
- All suites green on the live commit: `tests/test_*.js` (10, incl. `test_camp.js`, `test_parent.js`) and `tests/test_*.py` (2).
- `tests/e2e/*.py` did NOT run. Application Control on David's PC blocks the greenlet DLL that Playwright loads. The e2e suite currently has no machine to run on.
- Data is generated: edit `data/encounters.src.json`, `openings.src.json` or `endgames.src.json`, run `python tools/build_encounters.py`. Stockfish 19 lives at `~/tools/stockfish/stockfish/stockfish-windows-x86-64-universal.exe` on David's PC and the script finds it (or `--sf`, or `STOCKFISH`). `--arrive-only` refreshes only the arriving moves, no engine. v0.16 is the first full re-score with Stockfish 19 on this PC. Never hand-edit `v2.json` or `web/encounters.js`.
- Every fight opens on Glitch's arriving move (`arrive` in the source; opening fights use their last move), shaded like any chess site; every move after it is shaded too. The build proves each one legal and landing on the exact fight. Tournament week asks question 2 only when the bait is a capture (`S.prepQuestionsFor`).
- Days 1–8 cover the 32 hand-authored fights (packs: tactics, openings, endgames, defence); days 9–32 are the Ladder, 120 generated fights in 24 days of 5, rating 559→1444 (pack ladder, `generated: true`) and deliberately mix packs, so a session cannot dead-end inside one pack. Days are picked on the home screen; `pack` survives only as a data label.
- A session is now a day. It ends when the day's fights are done, and finishing one offers the next straight away. Nothing is locked; a second day in one sitting gets a soft line about coming back tomorrow.
- The kid has a rank that only ever climbs, Rookie through Time Marshal, shown in the top bar and on every card.
- Glitch's own rating still falls permanently and never recovers. A different crony fronts for him each calendar day, so there is always a fresh brag to knock down without yesterday's win being taken back.
- Glitch physically wilts as his rating sinks, via `data-wilt` on his sprite.
- A Home button in the top bar returns to the title screen from any screen at any moment. Leaving mid-fight keeps every card already earned and drops only the unfinished fight. A navigation counter stops an animation that is still running from dragging the kid back, and `goHome` releases a why-gate that is waiting on taps. The same counter stops a gate opening behind him when the animation reaches the why-gate after he has already left.
- The solo entry is named for what it is: the section reads Battle and the button reads Battle plus the name of today opponent. It was headed Practise with a Play button, and the kid asked where the battle button was.
- Battle layer, at the parent's direction from gate-0 feedback ("it doesn't count as a win", "there is no game", "how do I battle Glitch"). Today's crony is a boss with a health bar; correct moves land as HITs; the floor is a KNOCKOUT. Wins earn Power (cap 5) for four abilities: Double Strike, Glitch's Tell, Time Shield, Overcharge. Gear slots and gear open with rank; each crony has a motif weakness that hits half again as hard. Abilities never touch the board. Every rule resolves through a pure function in `web/score.js` and is held by `tests/test_battle.js`. See `docs/reports/battle.md`.
- v0.19 ladder + rush, after both kids cleared all 8 days in 30 minutes. `tools/build_ladder.py` streams the Lichess puzzle DB (CC0, at `~/tools/lichess/`, never in the repo), keeps popular one-movers in our motifs, has Stockfish pick the bait, derives the why-gate squares, and fills text from per-motif templates (Glitch: 10 taunts / 8 gloats / 6 rages per motif, no two fights in a day share one). Output `data/ladder.src.json` is committed and deterministic; voice is per template key (`enc.voice`), 337 lines. Rush: `thinkMs` per attempt, rushed = wrong under 4 s, a Rushed tile on Progress; look-first tap on every fight whose arriving move attacks something, in Tournament week or Camp (`S.lookFirst`); confession wins are cracked cards (`clean: false`) that only a clean win repairs, Prep drills them first; after two days in one sitting FIGHT offers Camp instead (`S.pacingNudge`). Glitch reacts to all of it (`S.GLITCH_LINES`). Sync merges cracks (repair wins), threats, rush and camp counts. Reports: `docs/reports/ladder.md`, `rush.md`.
- v0.18 parent side: `settings.parent = {name, pin}`. First tap on the Settings token asks "Who is the coach?" (name + 4-digit PIN on a keypad); after that Settings and Progress open only behind the keypad, kids' screens never ask. A speed bump, not security: PIN is in localStorage in clear and rides in the backup file. Settings is cardstock in the game layer (chip toggles, stepper, family login in a drawer; every id kept). Progress adds camp days/best run, threats spotted, first-try rate, this week, and "coach says" notes in the app's own principle words, plus a tournament checklist. Report: `docs/reports/parent.md`. `tests/e2e/phase0.py` and `phase3_sync.py` click `#btn-settings` and now need to pass the keypad (seed `settings.parent` in localStorage first); they still have no machine to run on.
- v0.17 Camp: a daily tournament-prep session per kid from the Camp chip on the map. 3 "spot the attack" warm-ups (Glitch's arriving move plays, the kid taps what it attacks; `F.threatTargets`), 4 prep fights with the ritual forced on, 2 boards from the defence pack (one counter, one defend), then a debrief. Counts once per calendar day, replayable. Per-kid coach style `settings.coach[i]`: "numbers" (counts, one line to say tomorrow) or "words" (weakest motif + its principle from `S.PRINCIPLES`; the principle also shows under the why on normal cards). Settings has the control; default follows the Short-lines flag. Reports: `docs/reports/camp.md`, `camp-data.md`.
- v0.17 data: 11 new fights, all Stockfish-verified at the 150cp bar: attackers t1–t3 (Day 5), goodBishop b1–b2 and tradeChoice k1–k2 (Day 7 "Trade Smart"), counter d1–d2 and defend d3–d4 (Day 8 "Hold the Line", pack defence). Retired 09 (duplicate of 08) and g5 (duplicate of g1); their cards vanish from the binder, nothing else breaks.
- v0.17 fix: `save()` never re-pointed `state.profiles[active]` at the new stats object the pure recorders return, so per-card motif data was discarded on every save. Prep and Progress were always seeing a blank profile before this.
- v0.15 game layer (after the parent said it still looked like a standard AI-built UI): home is a VS arena (kid token vs today's crony with a health bar), days are a map path, one arcade FIGHT button docked at the thumb; gear and Glitch's all-time record live in a drawer. Three control kinds only: arcade button, chip, round token. Play has a caption strip under the board and round ability tokens; the card screen deals a trading card; the binder is face-down cards. All game-logic IDs kept.
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

The two players are a strong quantitative reasoner with grade-level reading (8) and a strong verbal, systems-level thinker (10). Both are easily bored and easily distracted. The chess can be pitched above their ages; the text cannot. Put difficulty in the position, never in the sentence.

1. **Tournament week, to about 2026-09-25.** Not their first: both have played rated scholastic events before, rated about 200 US Chess, one winning about a third of games, one rarely winning. This one is 5th grade and under, rated, open by rating, so round one will likely pair them up against a much stronger kid; that is the Swiss system, not them, and round two is where their tournament starts. They lose to rushing and to opponents who know a trap they do not. Neither is a reasoning gap. Prep is two questions before every move, said slowly: what did that move just attack, and why is he letting me take that. Writing the move on the scoresheet before playing it is legal under US Chess rules and buys the pause. Shockmate is the trap library; a real board with a clock is the rehearsal. This is gate 0 in all but name.
2. **Parent progress view.** Shipped v0.10. Behind Settings. Per kid: cards over time, first-try rate per motif, retries per motif. Good at means high first-try motifs; focus on means motifs with misses. The data already exists in `stats.cards` joined to encounter motif, and in `cardsEarned`. Moved from Phase 3 to first, because it is what makes the kid data useful to the parent.
3. **Play mode (in progress on `feat/play`):** a full game vs Glitch on a browser Stockfish, five levels the kid picks freely with a suggested level from recent play, Glitch in character throughout, and post-game blunders turned into fights. See the branch report when it lands.
4. **Camp, morning of 2026-09-19: the parent tries it.** What to watch: does the 8-year-old read "He attacks 2 pieces. Tap both." without help; does the 10-year-old say the question out loud before moving. Warm-ups only draw on boards whose arriving move attacks something (about half); more defence-pack fights widen that. Deferred: first-try counts all six boards, the principle-shown-today map lives in memory only.
5. **Tournament prep mode.** Shipped v0.9 as a Prep chip and a Tournament week toggle. A day built from that kid's misses, weakest motifs first; with no misses it drills the opening traps, and outside misses it never repeats the day he is on, plus a think-phase prompt for the defensive habit. Small, data-driven, and the first feature that treats the two profiles differently.
6. **Per-profile text register.** Shipped v0.13 for the why line, the one that teaches. Settings has "Short lines" per player; the parent sets it, never inferred. `web/short-lines.js` holds a hand-authored line of 9 words or fewer per fight, with no square names; the card and the collection show it, and the narrator reads `<id>-short`. Not yet covered: hooks, prompts, Glitch lines. Extend the same way if the younger kid still stalls on reading.
7. **Voice lines.** Shipped with audio: 146 lines in `web/voice/`. Voice ids (not secret): narrator `9VWbKGIW0H6lX5FqaWla`, Glitch `rObcuQVunpZPAIagRqls`, model `eleven_turbo_v2_5`; pass them as `--voice-narrator` / `--voice-glitch`. The key cannot list voices (TTS scope only). Pipeline: `tools/voice/extract_lines.py` writes 200 lines; `tools/voice/generate.py` calls ElevenLabs with the key from ELEVENLABS_API_KEY and writes `web/voice/*.mp3` plus a manifest; the game reads the hook, why, rage, gloat, knockout and second-try lines aloud once the manifest exists and is silent until then. The key is never in the repo. After generating, commit `web/voice/` so Pages can serve it. For a kid whose listening is far ahead of his reading, audio is the channel.
8. **Prove the family sync once, backup first.** Parent, needs credentials. Unchanged.
9. **Give the e2e suite a home in CI.** Unchanged. A live run found a defect that six green suites missed.
10. **Second tactics pack, then tablet layout.** After the above.

## Release ritual

Bump `BUILD` in `web/game.js` and `CACHE` in `web/sw.js` together, or phones keep the cached shell. Push `main`, wait for Pages, then confirm the marker on the live page. Work built in a cloud sandbox arrives as a git bundle, because that sandbox has no GitHub credentials and cannot push; a source zip is not enough, since it carries no history.

**Getting the new build to actually load is harder than it looks, and one reload does not prove anything.** Two caches serve the old script: the service worker re-registers on every load and serves its cached copy, and the origin sends cache-control max-age=600, so the browser holds `game.js` for ten minutes on its own. A ?v= query only freshens `index.html`, because the script tags ask for `game.js` with no query. From the page console: unregister every shockmate service worker, delete every shockmate cache, re-fetch each file with cache set to reload under its canonical URL, then load the page twice. On a phone, remove the home-screen icon and re-add it. Always gate a runtime check on the marker reading the expected version, or the check silently exercises the old build and reports a false result. That happened three times on 2026-09-18 and produced two false failures.

## Links

- Play: https://dirac1974.github.io/shockmate/
- Plan (living copy): https://claude.ai/code/artifact/73839b7f-e1e8-4f13-a65e-ce725a30b4e1
- Concept screens: https://claude.ai/artifact/UvtVosoKFKnmUFLhbpnLQ7

## Next session start

1. Read this file, then `docs/PLAN.md` §5–§9.
2. Run the six suites and record what is red.
3. Ask whether gate 0 has been reported. If not, do not start a phase; take item 3 above.
4. Before ending: update this file (what shipped, what is red, next three steps). Keep it under 80 lines.
