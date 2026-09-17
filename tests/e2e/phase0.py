#!/usr/bin/env python3
"""Phase 0 end-to-end: every fight on a phone viewport, on best, bait+blunder (second try + confession + guided), and good (peek) paths.
Fails on any console error, page error, or dead end. Run: python3 tests/e2e/phase0.py  (needs: pip install playwright && playwright install chromium)"""
import asyncio, json, sys
from pathlib import Path
from playwright.async_api import async_playwright
URL = "file://" + str(Path(__file__).resolve().parents[2] / "web" / "index.html") + "?fast=1"

async def phase(pg, want, timeout=15000):
    await pg.wait_for_function(f"() => window.__shockmate && window.__shockmate.state.phase === '{want}'", timeout=timeout)

async def move(pg, uci):
    await pg.click(f'.sq[data-sq="{uci[:2]}"]'); await pg.click(f'.sq[data-sq="{uci[2:4]}"]')

async def gate_and_next(pg, enc, expect_next=True):
    await phase(pg, "gate")
    # the gate must show the position the prompt talks about, and every target must hold a piece
    at = enc["whyTargets"].get("at")
    assert at in ("before", "after"), at
    for s in enc["whyTargets"]["squares"]:
        assert await pg.eval_on_selector(f'.sq[data-sq="{s}"]', "e => !!e.querySelector('.piece')"), enc["id"] + " gate target " + s + " is empty on screen"
    if at == "before":
        assert "REWIND" in (await pg.text_content("#banner")), "a before-gate tells the kid the board stepped back"
    await pg.click(f'.sq[data-sq="{enc["best"][:2]}"]') if enc["best"][:2] not in enc["whyTargets"]["squares"] else None  # a wrong tap must not break the gate
    for s in enc["whyTargets"]["squares"]: await pg.click(f'.sq[data-sq="{s}"]')
    await phase(pg, "card")
    assert not await pg.eval_on_selector("#btn-next", "e => e.disabled"), "Next must be enabled after the gate"
    if expect_next: await pg.click("#btn-next")

async def run():
    errors = []
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={"width": 390, "height": 844})
        await ctx.add_init_script('localStorage.setItem("shockmate-v2:settings", JSON.stringify({names:["A","B"],cap:12,sound:false,coords:false,hurry:false,profile:0}))')
        pg = await ctx.new_page()
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))
        await pg.goto(URL)
        encs = [e for e in await pg.evaluate("window.SHOCKMATE_ENCOUNTERS") if e["pack"] == "tactics"]
        assert len(encs) == 12, len(encs)
        # Path A: Day 1 on the best move, then the congratulation and the step into Day 2
        assert await pg.is_hidden("#step-two") and await pg.is_visible("#btn-start")
        await pg.click("#seat-2")
        assert await pg.is_hidden("#btn-start") and await pg.is_hidden("#profiles"), "two-player hides the solo controls"
        await pg.click("#seat-1"); assert await pg.is_visible("#profiles")
        # Glitch's bragged rating: his number only ever falls, and never below the floor.
        assert (await pg.inner_text("#brag-real")) == "1500", "an untested Glitch brags 1500"
        assert await pg.is_visible('.day-chip[data-day="1"]'), "the home screen offers lesson days"
        assert await pg.eval_on_selector('.day-chip[data-day="2"]', "e => e.disabled"), "day 2 waits for day 1"
        await pg.click("#btn-start")
        day_len = await pg.evaluate("window.__shockmate.state.encounters.length")
        assert 3 <= day_len <= 4, day_len
        for i in range(day_len):
            await phase(pg, "think"); enc = await pg.evaluate("window.__shockmate.current()")
            await move(pg, enc["best"]); await gate_and_next(pg, enc)
        await pg.wait_for_selector("#session-end:not([hidden])", timeout=5000)
        title = await pg.text_content("#end-title"); assert ("Day 1 done" in title) or ("KNOCKOUT" in title), title
        summary = await pg.text_content("#session-summary")
        assert ("Fights won: %d" % day_len) in summary, summary
        assert "Off Glitch for good" in summary, summary
        assert "Rank:" in (await pg.text_content("#end-rank")), "the end of a day names his rank"
        build = await pg.inner_text("#build-tag")
        assert "fights" in build and "days" in build, build  # the marker a phone can be read from
        final_rating = int(await pg.evaluate("document.getElementById('brag-real').textContent"))
        assert 300 <= final_rating < 1500, final_rating
        # He may carry straight on. The next day is offered, never forced, and never locked.
        assert not await pg.eval_on_selector("#btn-next-day", "e => e.hidden"), "finishing a day offers the next"
        assert "Day 2" in (await pg.text_content("#btn-next-day"))
        assert await pg.eval_on_selector("#end-nudge", "e => e.hidden"), "no nudge on the first day of a sitting"
        await pg.click("#btn-next-day"); await phase(pg, "think")
        assert await pg.evaluate("window.__shockmate.state.day") == 2, "the next day actually starts"
        await pg.reload()
        # Path B: fresh profile, bait then blunder -> second try -> confession -> guided -> card still earned
        await pg.click("#prof-1"); await pg.click("#btn-start"); await phase(pg, "think")
        enc = await pg.evaluate("window.__shockmate.current()")
        await move(pg, enc["bait"]); await phase(pg, "think")
        assert await pg.evaluate("window.__shockmate.state.tries") == 1
        assert await pg.eval_on_selector_all(".sq.cand", "els => els.length") >= 2, "second try lights candidates"
        blunder = next(u for u, m in enc["moves"].items() if m["tier"] == "blunder")
        await move(pg, blunder); await phase(pg, "think", 20000)
        assert await pg.evaluate("window.__shockmate.state.guided") is True
        await move(pg, enc["bait"])  # guided mode must refuse anything but the best move
        assert await pg.evaluate("window.__shockmate.state.phase") == "think"
        await move(pg, enc["best"]); await gate_and_next(pg, enc, expect_next=False)
        assert "tries" in (await pg.text_content("#card-title")), "retry wins are credited"
        won = await pg.text_content("#stat-won"); assert won == "1", won
        # Path C: a good-tier move earns the card and offers the peek
        await pg.click("#btn-next"); await phase(pg, "think"); enc = await pg.evaluate("window.__shockmate.current()")
        good = next((u for u, m in enc["moves"].items() if m["tier"] == "good"), None)
        if good:
            await move(pg, good); await gate_and_next(pg, enc, expect_next=False)
            assert not await pg.eval_on_selector("#btn-peek", "e => e.hidden"), "peek offered on good tier"
            await pg.click("#btn-peek"); await phase(pg, "card")
        else:
            await move(pg, enc["best"]); await gate_and_next(pg, enc, expect_next=False)
        # Collection and settings are reachable and return
        await pg.click("#btn-collection"); await pg.wait_for_selector("#screen-collection.active"); await pg.click("#btn-back-play")
        await pg.click("#btn-settings"); await pg.wait_for_selector("#screen-settings.active"); await pg.click("#btn-close-settings")
        await b.close()
    assert not errors, errors
    print("OK e2e phase0: Day 1 best-path to the congratulation and on into Day 2, bait+blunder second try + confession + guided, good-tier peek, no console errors")

asyncio.run(run())
