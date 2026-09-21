# Shockmate

A chess trainer for two kids on one phone, built around a villain. Glitch dangles a tempting move on
every board; the kid picks a move, watches both futures play out, taps the pieces that explain why one
was better, and keeps the card. The engine is the only judge. Nothing on screen ever goes down.

Live: https://dirac1974.github.io/shockmate/ (installable, works offline). The build marker on the home
screen says what a phone actually loaded.

## What is in it

- **Fights**: 152 engine-scored positions across tactics, openings, endgames and defence, in 32 days.
  Every legal move carries a Stockfish score; a miss gets a second try, then a guided replay, and the
  card is still earned. The why-gate is on the board: tap the pieces that make the reason true.
- **Battle layer**: a daily crony with a health bar, Power for four abilities, gear that opens with rank,
  motif weaknesses. Abilities never touch the board; every rule is a pure function in `web/score.js`.
- **Camp** (a daily tournament-prep session), **Prep** (a day built from that kid's misses), **Flash**
  (a two-minute board-vision drill with a reveal ladder and scrambled control boards).
- **Play**: a whole game against Glitch on the in-browser Stockfish; the worst moments become fights.
- **Versus**: the two kids play each other on one phone, or on two phones through the family backend.
  They are never scored against each other.
- **Family**: one household code shared with the other Yomple apps, a PIN per kid, cards synced between
  phones through a Supabase project that exposes only SECURITY DEFINER RPCs.
- **Coach side**: Settings and Progress behind a PIN; per-kid text register, coach style and lines;
  good-at and focus-on motifs, first-try rate, rushed moves, Flash against first-try.
- **Voice**: about 1,350 recorded lines for Glitch and the narrator, fetched on demand.

## Run it locally

```
npm start
```

That serves `web/` at http://localhost:8765/ (plain `python -m http.server`, no build step). Opening
`web/index.html` from disk also works, but the service worker and the voice manifest need http.

## The test gate

```
npm test          # 15 Node suites, 2 Python suites, syntax check of every shipped script
npm run e2e       # 5 Playwright suites at phone size, faked backend, fails on any console error
```

Python needs `pip install chess playwright`; the browser suites use installed Chrome on Windows and
bundled Chromium elsewhere (`python -m playwright install --with-deps chromium`). CI runs both jobs on
every PR and push to `main`, and both block a merge.

## Data

Fights are generated, never hand-edited in their shipped form:

```
python tools/build_encounters.py     # data/*.src.json -> data/encounters.v2.json + web/encounters.js
python tools/build_ladder.py         # Lichess puzzle DB -> data/ladder.src.json (needs the DB locally)
```

Both need Stockfish on the path or `--sf`. `tests/test_encounters.py` re-proves legality, margins and
gate squares on every run.

## Voice

```
python tools/voice/extract_lines.py
python tools/voice/generate.py --dry-run
python tools/voice/generate.py --voice-glitch <id> --voice-narrator <id>
```

Reads `ELEVENLABS_API_KEY` from the environment, skips unchanged lines by text hash, writes
`web/voice/*.mp3` and a manifest. Commit `web/voice/` so Pages can serve it.

## Release

Bump `BUILD` in `web/game.js` and `CACHE` in `web/sw.js` together. Merge to `main`; Pages rebuilds in
about a minute. A phone that already has the app shows "Shockmate updated" with a Reload button the next
time it opens, and one tap loads the new build.

## Layout

| Path | What |
| --- | --- |
| `web/game.js` | Every screen and the state machine |
| `web/score.js`, `futures.js`, `days.js`, `flash.js`, `play.js`, `versus.js`, `live.js`, `sync.js` | Pure logic, each with a suite in `tests/` |
| `web/encounters.js`, `short-lines.js`, `motifs.js`, `glitch.js`, `pieces.js` | Generated or static content |
| `web/sw.js`, `manifest.webmanifest` | Offline shell and install |
| `supabase/` | Migrations for the family backend |
| `tools/` | Build, voice and test-runner scripts |
| `docs/` | `PLAN.md` (the design), `CONTINUATION.md` (session state), `reports/` (one per release) |

Dependencies and their licences are listed in `THIRD_PARTY.md`.

## Product rules

Engine is judge. Animation is teacher. No eval numbers on screen. No loot, no purchases, no energy
timers. Nothing on screen ever goes down. Every fight is winnable this session. Quiet during the think
window, loud after the move. Cartoon slapstick only. Kids are never scored against each other.
