#!/usr/bin/env python3
"""The extracted voice lines must stay in step with the encounters and with the two questions in
web/score.js, and generate.py must dry-run without a key. Run: python tests/test_voice_lines.py"""
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
LINES = ROOT / "tools" / "voice" / "lines.json"
DATA = ROOT / "data" / "encounters.v2.json"


def main() -> None:
    assert LINES.exists(), "tools/voice/lines.json missing; run tools/voice/extract_lines.py"
    lines = json.loads(LINES.read_text(encoding="utf-8"))
    data = json.loads(DATA.read_text(encoding="utf-8"))
    encs = data if isinstance(data, list) else data.get("encounters", [])

    keys = [l["key"] for l in lines]
    assert len(keys) == len(set(keys)), "voice keys must be unique"
    assert all(l["text"].strip() for l in lines), "no empty voice line"
    assert all(l["voice"] in ("glitch", "narrator") for l in lines), "only two voices"

    by_key = {l["key"]: l for l in lines}
    # The short lines in the game and in the audio must be the same words.
    short = json.loads(subprocess.run(
        ["node", "-e", "console.log(JSON.stringify(require('./web/short-lines.js').SHORT))"],
        cwd=ROOT, capture_output=True, text=True, check=True,
    ).stdout)
    # Hand fights speak under their id; generated ladder fights under their template keys
    # (enc.voiceKeys, rooted at enc.voice), shared by every fight on that template.
    manifest_path = ROOT / "web" / "voice" / "manifest.json"
    files = json.loads(manifest_path.read_text(encoding="utf-8")).get("files", {}) if manifest_path.exists() else None
    templates = set()
    for e in encs:
        vk = e.get("voiceKeys") or {}
        if e.get("generated"):
            assert e.get("voice") and vk, f"{e['id']} is generated but has no voice / voiceKeys"
            for kind in ("hook", "why", "short"):
                assert vk[kind] == f"{e['voice']}-{kind}", f"{e['id']} {kind} key must hang off voice {e['voice']}"
            templates.add(e["voice"])
        key = lambda kind: vk.get(kind) or f"{e.get('voice') or e['id']}-{kind}"
        for kind, voice in (("hook", "narrator"), ("why", "narrator"), ("short", "narrator"), ("taunt", "glitch"), ("gloat", "glitch"), ("rage", "glitch")):
            k = key(kind)
            assert k in by_key, f"{k} missing; re-run extract_lines.py"
            assert by_key[k]["voice"] == voice, f"{k} should be spoken by {voice}"
        assert by_key[key("hook")]["text"] == e["hook"].strip(), f"{e['id']} hook drifted from the data"
        assert by_key[key("why")]["text"] == e["why"].strip(), f"{e['id']} why drifted from the data"
        want_short = e["short"] if e.get("generated") else short[e["id"]]
        assert by_key[key("short")]["text"] == want_short, f"{e['id']} short line drifted from its source"
        g = e["glitch"]
        for kind in ("taunt", "gloat", "rage"):
            assert by_key[key(kind)]["text"] == g[kind].strip(), f"{e['id']} {kind} drifted from the data"
        # The game asks the manifest for "<id>-<kind>"; generate.py aliases ladder fights onto their template.
        if files is not None and e.get("generated"):
            for kind in ("hook", "why", "short", "taunt", "gloat", "rage"):
                if vk[kind] in files:
                    assert files.get(f"{e['id']}-{kind}") == files[vk[kind]], f"manifest lacks the alias {e['id']}-{kind}; re-run generate.py"

    # The two questions in the game and in the audio must be the same words.
    out = subprocess.run(
        ["node", "-e", "console.log(JSON.stringify(require('./web/score.js').PREP_QUESTIONS))"],
        cwd=ROOT, capture_output=True, text=True, check=True,
    )
    prep = json.loads(out.stdout.strip())
    assert len(prep) == 2
    assert by_key["prep-q1"]["text"] == prep[0], "prep-q1 drifted from PREP_QUESTIONS in score.js"
    assert by_key["prep-q2"]["text"] == prep[1], "prep-q2 drifted from PREP_QUESTIONS in score.js"

    for k in ("sys-ko", "sys-second"):
        assert k in by_key, f"{k} is played by game.js and must exist"

    # Dry run needs no key and must succeed.
    dry = subprocess.run([sys.executable, "tools/voice/generate.py", "--dry-run"], cwd=ROOT, capture_output=True, text=True)
    assert dry.returncode == 0, dry.stderr
    assert "Nothing was sent" in dry.stdout

    chars = sum(len(l["text"]) for l in lines)
    print(f"OK voice lines: {len(lines)} lines in step with {len(encs)} encounters ({len(templates)} ladder templates) and PREP_QUESTIONS, {chars} characters, dry run clean")


if __name__ == "__main__":
    main()
