#!/usr/bin/env python3
"""Extract every spoken line into tools/voice/lines.json.

Deterministic and committed, so generate.py only has to talk to ElevenLabs about lines whose
text has changed. Two voices: the narrator reads the hook, the why and the system lines; Glitch
speaks his own taunt, gloat and rage. The hook and the why are the high-value lines: they are
what a kid whose listening is far ahead of his reading would otherwise have to read.

Run:  python3 tools/voice/extract_lines.py
"""
import json
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[2]

# Must match PREP_QUESTIONS in web/score.js. If those change, change these.
PREP_QUESTIONS = ["What did that move just attack?", "Why is he letting you take that?"]

SYSTEM = {
    "hit": "Hit!",
    "crit": "Critical hit!",
    "ko": "Knockout!",
    "beat": "You beat Glitch.",
    "second": "Second try. Glitch is sweating.",
    "prepdone": "Prep done. Slow down. Ask the two questions.",
}


def main() -> None:
    data = json.loads((ROOT / "data" / "encounters.v2.json").read_text(encoding="utf-8"))
    encounters = data if isinstance(data, list) else data.get("encounters", [])

    # Short-register lines are hand-authored in web/short-lines.js; node reads the one copy.
    short = json.loads(subprocess.run(
        ["node", "-e", "console.log(JSON.stringify(require('./web/short-lines.js').SHORT))"],
        cwd=ROOT, capture_output=True, text=True, check=True,
    ).stdout)

    lines: list[dict] = []
    seen: dict[str, str] = {}

    def add(key: str, voice: str, text) -> None:
        text = (text or "").strip()
        if not text:
            return
        if key in seen:  # a template shared by several ladder fights: record it once
            assert seen[key] == text, f"voice key {key} carries two different texts"
            return
        seen[key] = text
        lines.append({"key": key, "voice": voice, "text": text})

    for e in encounters:
        g = e.get("glitch") or {}
        # Hand fights speak under their id. Generated ladder fights speak under their template keys
        # (voiceKeys, from tools/build_ladder.py), so one recording serves every fight on a template.
        vk = e.get("voiceKeys") or {}
        key = lambda kind: vk.get(kind) or f"{e['id']}-{kind}"
        add(key("hook"), "narrator", e.get("hook"))
        add(key("why"), "narrator", e.get("why"))
        add(key("short"), "narrator", e.get("short") if e.get("generated") else short.get(e["id"]))
        add(key("taunt"), "glitch", g.get("taunt"))
        add(key("gloat"), "glitch", g.get("gloat"))
        add(key("rage"), "glitch", g.get("rage"))
    # Everything Glitch says outside the fight data: moments, Play, cronies, the referee, the game
    # fights. The tables live in web/*.js; node reads the one copy and hands back the spoken text.
    glitch = json.loads(subprocess.run(
        ["node", "tools/voice/glitch_lines.js"], cwd=ROOT, capture_output=True, text=True, check=True,
        encoding="utf-8",
    ).stdout)
    for l in glitch:
        assert "{" not in l["text"] and "}" not in l["text"], f"{l['key']} would speak a placeholder: {l['text']}"
        add(l["key"], l["voice"], l["text"])

    for i, q in enumerate(PREP_QUESTIONS, 1):
        add(f"prep-q{i}", "narrator", q)
    for k, v in SYSTEM.items():
        add(f"sys-{k}", "narrator", v)

    lines.sort(key=lambda l: l["key"])
    out = ROOT / "tools" / "voice" / "lines.json"
    out.write_text(json.dumps(lines, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    chars = sum(len(l["text"]) for l in lines)
    by_voice: dict[str, int] = {}
    for l in lines:
        by_voice[l["voice"]] = by_voice.get(l["voice"], 0) + 1
    print(f"{len(lines)} lines, {chars} characters, by voice {by_voice} -> {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
