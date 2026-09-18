#!/usr/bin/env python3
"""The extracted voice lines must stay in step with the encounters and with the two questions in
web/score.js, and generate.py must dry-run without a key. Run: python tests/test_voice_lines.py"""
import json
import re
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

    glitch_n = glitch_tables(by_key, files)

    # Dry run needs no key and must succeed.
    dry = subprocess.run([sys.executable, "tools/voice/generate.py", "--dry-run"], cwd=ROOT, capture_output=True,
                         text=True, encoding="utf-8", errors="replace")
    assert dry.returncode == 0, dry.stderr
    assert "Nothing was sent" in dry.stdout

    chars = sum(len(l["text"]) for l in lines)
    print(f"OK voice lines: {len(lines)} lines in step with {len(encs)} encounters ({len(templates)} ladder templates), "
          f"PREP_QUESTIONS and {glitch_n} Glitch table lines, {chars} characters, no placeholders, dry run clean")


# Parent request (v0.23): enough lines per moment that a sitting does not repeat itself.
MIN_LINES = {
    "score.GLITCH_LINES": {"lookRight": 16, "lookWrong": 16, "lookGive": 10, "cracked": 10, "repaired": 10, "pacing": 10,
                           "campStart": 10, "campWatch": 10, "campSpotted": 10, "campNope": 10,
                           "flashReveal": 10, "flashHide": 10, "flashRight": 10, "flashWrong": 10,
                           "flashImagine": 10, "flashDone": 10},
    "score.SUGGEST_SAY": {"first": 10, "fresh": 10, "up": 10, "down": 10, "again": 10},
    "play.SAY": {"start": 10, "capture": 16, "check": 16, "quiet": 16, "gloat": 10, "rage": 10, "nervous": 10,
                 "resign": 10, "glitchMated": 10, "kidMated": 10, "stalemate": 10, "repetition": 10, "fifty": 10,
                 "material": 10, "quit": 10},
    "versus.SAY": {"start": 10, "turn": 16, "blunder": 16, "great": 16, "check": 16, "capture": 16, "quiet": 16,
                   "won": 10, "lost": 10, "drew": 10, "mate": 10, "stalemate": 10, "repetition": 10, "fifty": 10,
                   "material": 10, "invite": 10, "waiting": 10, "unfinished": 10, "same": 10, "resign": 10},
}
PLACEHOLDER = re.compile(r"\{[a-z]+\}")


def node_json(src: str):
    out = subprocess.run(["node", "-e", src], cwd=ROOT, capture_output=True, text=True, encoding="utf-8", check=True)
    return json.loads(out.stdout)


def glitch_tables(by_key: dict, files) -> int:
    """Every line in every Glitch table speaks under a key that lines.json and the manifest both hold,
    with the same (name-free) words; game.js only ever says Glitch lines out of those tables."""
    spoken = node_json("console.log(JSON.stringify(require('./tools/voice/glitch_lines.js').all()))")
    assert len({l["key"] for l in spoken}) == len(spoken), "Glitch table keys must be unique"
    for l in spoken:
        k = l["key"]
        assert not PLACEHOLDER.search(l["text"]) and "{" not in l["text"], f"{k} speaks a runtime placeholder: {l['text']}"
        assert k in by_key, f"{k} ({l['table']}) missing from lines.json; re-run extract_lines.py"
        assert by_key[k]["text"] == l["text"], f"{k} drifted from {l['table']}"
        assert by_key[k]["voice"] == l["voice"], f"{k} should be spoken by {l['voice']}"
        if k.startswith("g-"):
            assert l["voice"] == "glitch", f"{k} is a Glitch line"
        if files is not None:
            assert files.get(k) == f"{k}.mp3", f"{k} has no audio in web/voice/manifest.json; re-run generate.py"
    for l in by_key.values():
        assert not PLACEHOLDER.search(l["text"]), f"{l['key']} speaks a runtime placeholder"

    # Shown lines may carry {name}/{level}/{prev}; only then do they need a separate spoken half.
    tables = node_json("""
      const S = require('./web/score.js'), P = require('./web/play.js'), V = require('./web/versus.js');
      const pick = (o) => Object.fromEntries(Object.entries(o).map(([k, t]) => [k, { lines: t.lines, speak: t.speak, silent: !!t.silent }]));
      console.log(JSON.stringify({ 'score.GLITCH_LINES': pick(S.GLITCH_LINES), 'score.SUGGEST_SAY': pick(S.SUGGEST_SAY),
        'play.SAY': pick(P.SAY), 'versus.SAY': pick(V.SAY) }));
    """)
    for group, mins in MIN_LINES.items():
        for kind, n in mins.items():
            got = len(tables[group][kind]["lines"])
            assert got >= n, f"{group}.{kind} has {got} lines; the parent asked for at least {n}"
    for group, kinds in tables.items():
        for kind, t in kinds.items():
            assert len(t["speak"]) == len(t["lines"]), f"{group}.{kind} speak/lines out of step"
            for shown, say in zip(t["lines"], t["speak"]):
                for ph in PLACEHOLDER.findall(shown):
                    assert ph in ("{name}", "{level}", "{prev}"), f"{group}.{kind}: unknown placeholder {ph}"
                if PLACEHOLDER.search(shown) and not t["silent"]:
                    assert say, f"{group}.{kind}: '{shown}' needs a name-free spoken half"

    # game.js says Glitch lines only out of the tables, so every one of them has a key.
    game = (ROOT / "web" / "game.js").read_text(encoding="utf-8")
    assert not re.search(r"glitchSay\(\s*\"", game), "game.js has a literal Glitch line; put it in a table"
    assert not re.search(r"famLine\(\s*\"[^\"]*\s", game), "game.js has a literal family-card line; put it in a table"
    assert not re.search(r"toast\(\s*\"Glitch: [^\"]+\"", game), "game.js has a literal Glitch toast; put it in a table"
    for kind in set(re.findall(r"glitchMoment\(\s*\"(\w+)\"", game)):
        assert kind in tables["score.GLITCH_LINES"], f"glitchMoment('{kind}') has no table"
    for kind in set(re.findall(r"playSay\(\s*\"(\w+)\"", game)):
        assert kind in tables["play.SAY"], f"playSay('{kind}') has no table"
    for kind in set(re.findall(r"versusSay\(\s*\"(\w+)\"", game)):
        assert kind in tables["versus.SAY"], f"versusSay('{kind}') has no table"
    return len(spoken)


if __name__ == "__main__":
    main()
