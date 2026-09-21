# Shockmate agent team

One Lead session in Claude Code (Opus) runs each phase and spawns subagents with hard file ownership. The Lead is the only agent that merges, pushes, tags, or edits `docs/`. Full spec: `docs/PLAN.md`. Session state: `docs/CONTINUATION.md`.

## Current assignment (2026-09-20)

v0.30 is the professional pass: an update path that lands on phones, a safety net for thrown errors, a current README, third-party notices, `npm test` as the one gate, and an accessibility floor. See `docs/reports/professional.md` for the review and the ordered list of what comes next. Gate 0 (a real session with both kids) is still unreported and still blocks any new phase. CI runs every suite, unit and browser, on every PR; both jobs block a merge.

## Roles and ownership

| Agent | Branch | Owns | Never touches |
| --- | --- | --- | --- |
| Lead | `main` | `docs/`, `README.md`, merges, tags, GitHub Pages | Feature code directly |
| Data | `data/v2-schema` | `data/`, `tools/build_encounters.py`, `tests/test_encounters.py`, generated `web/encounters.js` | `web/game.js`, `web/styles.css` |
| Arena | `arena/state-machine` | `web/game.js`, `web/futures.js`, `web/score.js`, `tests/test_futures.js`, `tests/test_score.js` | Data files, theme CSS |
| Theme (Phase 1+) | `theme/timeline-split` | `web/styles.css`, `web/pieces.js`, `web/glitch.js`, `web/sfx/`, markup in `web/index.html` | Game logic, data |
| QA | `qa/e2e` | `tests/e2e/`, Playwright config, GitHub issues | Fixes in files it does not own (file an issue to the owner) |

A subagent that needs a change in a file it does not own writes the request in its report; the Lead routes it.

## Working rules

1. Read `docs/CONTINUATION.md` and `docs/PLAN.md` before touching code.
2. Run `npm test` before every commit, and `npm run e2e` before a merge. Red blocks the commit.
3. Small commits, imperative subject, body says what was ambiguous and what you chose. Credit "Claude", never a model name.
4. Verify every screen at 390×844 with Playwright before calling it done.
5. When the spec is ambiguous, choose the option that removes a way for a kid to get stuck. Do not ask David unless the question is in PLAN §9.
6. Product rules (PLAN §8) are not negotiable: engine is judge; animation is teacher; no eval numbers; no loot; nothing on screen goes down; every fight winnable this session; quiet in the think window, loud after the move; cartoon slapstick only; kids never scored against each other.
7. Lead ends every session by rewriting `docs/CONTINUATION.md`: what shipped, what is red, next three steps, under 80 lines.

## Phase 0 kickoff (spent, kept for reference)

```text
You are the Lead for Shockmate. Read docs/PLAN.md and docs/CONTINUATION.md, then run Phase 0 to completion without asking me questions unless they are listed in PLAN.md section 9.

1. Confirm the state: run node tests/test_futures.js, node tests/test_score.js, python3 tests/test_encounters.py and record the failures.
2. Spawn subagents in parallel with the ownership table in docs/AGENTS.md:
   - Data: schema v2, tools/build_encounters.py with Stockfish scoring of every legal move, tiers per PLAN section 5.1, continuation lines for all 12 fights, fix fights 06 and 11, regenerate web/encounters.js, make test_encounters.py assert margins and line legality.
   - Arena: rewrite web/game.js as an explicit state machine (home > think > tease > consequence > whygate > next | cliffhanger) that uses futures.js and score.js, binds every control in index.html, implements second-try, tiers, and per-profile storage; make test_futures.js and test_score.js pass.
   - QA (after Data and Arena report done): Playwright at 390x844 through all 12 fights on best, good, bait, blunder and second-try paths; fail on any disabled dead end or console error.
3. Merge in the order Data, Arena, QA. Tag v0.3-playable. Enable GitHub Pages from main root and confirm https://dirac1974.github.io/shockmate/ loads and plays.
4. Rewrite docs/CONTINUATION.md for the next session.
5. Write docs/reports/phase0.md (under 400 words) and print it as your final message:
   - tests before / after (pass or fail, one line each)
   - commits merged, one line each
   - decisions you made where the spec was ambiguous
   - anything red or deferred, with the file and the reason
   - the Pages URL and whether it plays end to end at 390x844
   David pastes that report into the planning chat for review before Phase 1 starts.

Token rules: subagents report back in 150 words or less, no file dumps, no diffs; you summarize, you do not re-read their files unless a test is red. Use Opus for yourself and for subagents.
Commits credit "Claude". Keep the old theme in Phase 0; Phase 1 replaces it.
```

## Phase gates

Each phase ends with a real session with the kids, not a test run. See PLAN §7 for the gate per phase. The Lead does not start Phase N+1 until David reports the gate for Phase N.
