#!/usr/bin/env python3
"""Turn tools/voice/lines.json into web/voice/*.mp3 with ElevenLabs, plus a manifest the game reads.

The parent runs this locally. The API key is read from the ELEVENLABS_API_KEY environment
variable and is never written, printed or committed. Voice IDs come from flags or from
ELEVENLABS_VOICE_GLITCH and ELEVENLABS_VOICE_NARRATOR. Lines whose text, voice and model have
not changed are skipped, so re-running after a wording tweak only pays for the changed lines.

  set ELEVENLABS_API_KEY=...            (PowerShell: $env:ELEVENLABS_API_KEY="...")
  python tools/voice/extract_lines.py
  python tools/voice/generate.py --dry-run
  python tools/voice/generate.py --voice-glitch <id> --voice-narrator <id>

ElevenLabs bills per character. --dry-run prints the total before anything is sent.
Standard library only.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
LINES = ROOT / "tools" / "voice" / "lines.json"
API = "https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_64"


def stamp(voice_id: str, model: str, text: str) -> str:
    return hashlib.sha1(f"{voice_id}|{model}|{text}".encode("utf-8")).hexdigest()


def synth(key: str, voice_id: str, model: str, text: str) -> bytes:
    body = json.dumps({
        "text": text,
        "model_id": model,
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.75, "style": 0.0, "use_speaker_boost": True},
    }).encode("utf-8")
    req = urllib.request.Request(
        API.format(voice=voice_id), data=body, method="POST",
        headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"},
    )
    for attempt in (1, 2):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            detail = e.read()[:200].decode("utf-8", "replace")
            if e.code == 429 and attempt == 1:
                print("  rate limited, waiting 5s", file=sys.stderr)
                time.sleep(5)
                continue
            raise RuntimeError(f"HTTP {e.code}: {detail}") from None
    raise RuntimeError("unreachable")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="list what would be generated and the character total; send nothing")
    ap.add_argument("--only", default="", help="only keys containing this substring, e.g. 01- or -why")
    ap.add_argument("--force", action="store_true", help="regenerate even if unchanged")
    ap.add_argument("--voice-glitch", default=os.environ.get("ELEVENLABS_VOICE_GLITCH", ""))
    ap.add_argument("--voice-narrator", default=os.environ.get("ELEVENLABS_VOICE_NARRATOR", ""))
    ap.add_argument("--model", default="eleven_turbo_v2_5", help="eleven_turbo_v2_5 is cheap and quick; eleven_multilingual_v2 is richer")
    ap.add_argument("--out", default=str(ROOT / "web" / "voice"))
    ap.add_argument("--sleep", type=float, default=0.4, help="seconds between requests")
    args = ap.parse_args()

    if not LINES.exists():
        print("tools/voice/lines.json is missing. Run: python tools/voice/extract_lines.py", file=sys.stderr)
        return 2
    lines = json.loads(LINES.read_text(encoding="utf-8"))
    if args.only:
        lines = [l for l in lines if args.only in l["key"]]
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    voices = {"glitch": args.voice_glitch, "narrator": args.voice_narrator}
    total_chars = sum(len(l["text"]) for l in lines)

    if args.dry_run:
        for l in lines:
            print(f"  {l['key']:<14} {l['voice']:<9} {len(l['text']):>4}  {l['text']}")
        print(f"\n{len(lines)} lines, {total_chars} characters would be sent. Nothing was sent.")
        return 0

    key = os.environ.get("ELEVENLABS_API_KEY", "")
    if not key:
        print("Set ELEVENLABS_API_KEY in this shell first. It is never stored or printed by this script.", file=sys.stderr)
        return 2
    missing = [v for v, vid in voices.items() if not vid]
    if missing:
        print(f"No voice id for: {', '.join(missing)}. Pass --voice-glitch / --voice-narrator or set ELEVENLABS_VOICE_GLITCH / ELEVENLABS_VOICE_NARRATOR.", file=sys.stderr)
        return 2

    generated = skipped = failed = sent_chars = 0
    for l in lines:
        voice_id = voices[l["voice"]]
        mp3 = out / f"{l['key']}.mp3"
        side = out / f"{l['key']}.sha1"
        want = stamp(voice_id, args.model, l["text"])
        if not args.force and mp3.exists() and side.exists() and side.read_text().strip() == want:
            skipped += 1
            continue
        try:
            audio = synth(key, voice_id, args.model, l["text"])
            mp3.write_bytes(audio)
            side.write_text(want)
            generated += 1
            sent_chars += len(l["text"])
            print(f"  ok   {l['key']}  ({len(audio)} bytes)")
        except Exception as e:  # keep going; the manifest lists whatever exists
            failed += 1
            print(f"  FAIL {l['key']}: {e}", file=sys.stderr)
        time.sleep(args.sleep)

    files = {l["key"]: f"{l['key']}.mp3" for l in json.loads(LINES.read_text(encoding="utf-8")) if (out / f"{l['key']}.mp3").exists()}
    manifest = {
        "files": files,
        "voices": voices,
        "model": args.model,
        "generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
    }
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    print(f"\ngenerated {generated}, skipped {skipped} unchanged, failed {failed}; {sent_chars} characters sent; manifest lists {len(files)} files.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
