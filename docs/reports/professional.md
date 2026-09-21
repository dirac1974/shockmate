# Professional pass — review and plan, 2026-09-20

Reviewed at `37af535` (v0.29 live). All 17 unit and data suites green, CI green on every recent PR, the
live build serves `v0.29`. The product is far ahead of PLAN §7; what is missing is the layer around the
product that a stranger, a second family, or a future maintainer would expect.

## What was found

| Area | State at v0.29 | Why it matters |
| --- | --- | --- |
| Update path | The service worker precaches with `cache.addAll`, which honours the origin's ten-minute `max-age`; the "quiet refresh" fetch does too. A new build can install a stale `game.js` into a fresh cache, and the page never says a new version exists. | This is the documented recurring pain: three false verifications on one day. Families would just see old bugs. |
| Failure handling | 67 `catch` blocks, no global net. A thrown error mid-fight leaves the screen frozen with no way out except a reload. | A kid with a frozen board has no Home button and no words. |
| Diagnostics | Only the build marker on the home screen. | The parent cannot say what went wrong on a phone. |
| README | Describes v0.2: 12 fights, Stockfish 17, "double-click index.html". | The first thing anyone reads is false. |
| Licences | Vendored stockfish.js is GPL-3, chess.js BSD-2, fonts OFL, puzzle database CC0; no notice in the repo root, no licence for Shockmate's own code. | Distribution of GPL code needs the notice; the repo's own licence is the owner's call. |
| Developer entry point | No `package.json`; CI runs a shell loop that a contributor has to copy by hand. | One `npm test` is what people expect. |
| Accessibility | 25 aria attributes, no `:focus-visible` style, live regions absent, no page description. | Tablet keyboards and screen readers get nothing; the tests are cheap. |
| Layout | One media query (`max-width: 400px`). The app is a 420px column at any width. | Fine on phones, wasteful on an iPad. Phase 3 item, not urgent. |
| Code shape | `web/game.js` is 3,421 lines and every screen; the logic modules beside it are pure and tested. | Safe today because e2e covers the screens; a split is maintenance, not product. |
| Client secrets | PINs in clear in localStorage; the family code in the URL by design. | Named in the security review; the parent's decision, not the app's. |

## v0.30 — shipped by this pass

1. **The update actually lands.** `sw.js` installs the shell with `cache: "reload"` so a new worker never inherits a stale file, and refreshes in the background with `cache: "no-cache"` so the origin is revalidated rather than the browser cache. When a new worker takes over a page that already had one, the page shows "Shockmate updated. Reload" and one tap reloads. First visits never see it. (v0.32: detection is a handshake, the page asking the worker its shell name and comparing with the remembered one, after the takeover event alone lost a race once on CI.)
2. **A safety net.** `window.error` and `unhandledrejection` are caught once: the Home button is shown, a toast says what to do, and the last fault (build, time, message) is kept under `shockmate-v2:fault` and shown to the coach at the foot of Settings. Nothing is sent anywhere.
3. **README rewritten** for what the app is now, with the local run recipe, the test gate, the data and voice pipelines, and the product rules.
4. **`THIRD_PARTY.md`** lists every vendored and generated dependency with its licence. Shockmate's own licence is left for the owner (see below).
5. **`package.json`** with `npm test` (every unit and data suite plus the syntax check) and `npm start` (the same local server as `.claude/launch.json`); CI calls `npm test` so there is one definition.
6. **Accessibility floor**: `:focus-visible` ring in ink with a hard offset (rule 1 kept), `aria-live` on the toast and banner, a page description.
7. **`tests/e2e/phase5_update.py`** proves 1 and 2 in a real browser: service workers allowed, a local server sending Pages' `max-age=600`, build A loaded twice, build B shipped, the note appears, one tap runs B; a thrown error and a rejected promise reach the coach. It runs in CI with the other browser suites.
8. **phase4 no longer races on a slow machine.** It failed on untouched `main` here twice, on two different Flash assertions, because `?fast=1` clamps the Flash pauses to 20 ms and the harness read the joke line and the reveal ring off the DOM after they had already been replaced. The app records `item.joke` and `state.flash.ring`; the suite reads those. CI had always been fast enough to hide it.
9. Docs brought current: `AGENTS.md` assignment, `CONTINUATION.md`, PLAN §7 status.

## v0.31 — tablet layout

Two media queries, no new controls, no DOM change. A tablet on its side (700px and wider with the height to match, landscape) lays the fight out as a grid: board left in a 380 to 520px column, everything said about it on the right in the phone's own top-to-bottom order. Held upright it keeps the phone's column at 640px with the board up to 560px, because half a screen of empty paper under a side-by-side fight is worse than a bigger board. A phone on its side keeps the phone layout. Every other screen stays a centred 460px column. `tests/e2e/phase6_tablet.py` proves it at 1024×768, 820×1180, 390×844 and 844×390: board bigger, nothing scrolls sideways, powers and prompt on screen, a square still answers, the binder still a column; `SHOTS=1` writes screenshots to `tests/e2e/shots/` (ignored). The boss row also gained a gap so a long crony name never touches his rating.

## v0.32 — the coach's week as a message

On Progress, under each kid's Coach says, one chip: "Share Ada's week". It builds a plain-text message from that kid's row alone (`S.weeklySummary` in `score.js`: rank and cards, this week's cards and camp days, first-try rate, threats, Flash, rushed moves, games, good at, focus on, the first coach note) and hands it to the system share sheet, or the clipboard, or shows it in the toast. One kid per message, built from one profile, so a scoreboard cannot exist here either. Numbers appear only where Progress already shows them. Held by `tests/test_progress.js` and a Progress step in `tests/e2e/phase2.py`.

## Split — `game.js` in thirteen parts

`web/game.js` is one closure of 3,400 lines, and a true module split would have meant rewriting every cross-reference between 275 functions with no product gain and real regression risk. So the split is at the source: `src/game/00-core.js` to `99-boot.js` are slices of that one file, cut at the section banners (ui, board, fight, camp, flash, play, versus, family, live, home, coach, boot), and `tools/build_game.js` concatenates them into `web/game.js` with a generated notice on top. `npm test` refuses a stale or hand-edited `web/game.js`, the same discipline `encounters.js` already has. The shipped file is byte-identical apart from that notice, so no BUILD bump. A part can grow into a real module later, one at a time, behind the browser suites.

## Next, in order

1. **Gate 0 with the kids** is still unreported and still blocks any new phase. Unchanged.
2. **Owner decisions** from the security review: a licence for the repo; whether PINs become mandatory; whether rejoin sits behind the PIN.
