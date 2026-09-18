# Glitch speaks everywhere (v0.23)

Every Glitch line in the app is now a table entry with a voice key, pre-generated in his voice and played when Read aloud is on. No runtime TTS.

**Tables.** `S.GLITCH_LINES` (look-first, crack/repair, pacing, Camp, fight moments), `S.SUGGEST_SAY` + `LEVELS[].say`, `P.SAY` + `P.CRONY` (Sleepy, Rookie, Cadet, Agent, Marshal: 5 taunt / 5 gloat / 5 rage each, mixed into that crony's games via `P.poolFor`), `P.TEXT` (game fights speak as `game-<motif>-<kind>`), `V.SAY` (referee, invites). Key = `vk-(i+1)`, e.g. `g-play-capture-3`, `g-ref-blunder-1`, `g-look-right-2`.

**Names.** An entry is a string or `[shown, spoken]`: the bubble shows "OOH. Ben. That was bad.", the audio says "OOH. That was bad." Same for crony names on KO and level names in suggestions.

**Variety.** 10+ lines per moment, 16 for look-first right/wrong, Play capture/check/quiet and the referee's move reactions. `S.pickLine(table, history)` picks at random outside the last 5 said at that moment; history lives on `state.lineHistory` for the whole sitting. Tested in `test_score.js`.

**Timing.** A new line cuts the old one; follow-ups (hook, prep questions, sys-ko, why, card lines) queue with `voiceNext` so a reaction is never cut off. Think window stays quiet: in Play his move line is voiced only if he didn't just react; the versus turn prompt and the blitz hint are shown, never spoken. Home stops the voice.

**Guards.** `test_voice_lines.py`: every table key is in `lines.json` and the manifest with matching words and voice, no spoken placeholder, minimum counts, no literal `glitchSay("…")` in game.js.
