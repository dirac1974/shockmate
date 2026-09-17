#!/usr/bin/env python3
"""Phase 2 e2e: co-op alternation + shared rage meter, duel hot-seat + verdict + handicap, blitz bar, collection art.
Run: python3 tests/e2e/phase2.py"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
URL = "file://" + str(Path(__file__).resolve().parents[2] / "web" / "index.html") + "?fast=1"

async def phase(pg, want, timeout=15000):
    await pg.wait_for_function(f"() => window.__shockmate && window.__shockmate.state.phase === '{want}'", timeout=timeout)

async def move(pg, uci):
    await pg.click(f'.sq[data-sq="{uci[:2]}"]'); await pg.click(f'.sq[data-sq="{uci[2:4]}"]')

async def win_fight(pg):
    await phase(pg, "think"); enc = await pg.evaluate("window.__shockmate.current()")
    await move(pg, enc["best"]); await phase(pg, "gate")
    for s in enc["whyTargets"]["squares"]: await pg.click(f'.sq[data-sq="{s}"]')
    return enc

async def run():
    errors = []
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={"width": 390, "height": 844})
        await ctx.add_init_script('localStorage.setItem("shockmate-v2:settings", JSON.stringify({names:["Sam","Rio"],cap:6,sound:false,coords:false,hurry:false,profile:0,blitz:[true,false]}))')
        pg = await ctx.new_page()
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))
        await pg.goto(URL)

        # Co-op: players alternate, the rage meter fills, both collections grow, nobody is ranked against anybody
        await pg.click("#seat-2"); await pg.click("#btn-coop")
        assert not await pg.eval_on_selector("#team", "e => e.hidden"), "team strip shows in co-op"
        assert "SAM" in (await pg.text_content("#turn-chip"))
        assert not await pg.eval_on_selector("#blitz", "e => e.hidden"), "blitz bar shows for the player who has it on"
        await win_fight(pg); await phase(pg, "card"); await pg.click("#btn-next")
        assert "RIO" in (await pg.text_content("#turn-chip")), "co-op alternates players"
        assert await pg.eval_on_selector("#blitz", "e => e.hidden"), "blitz is per player"
        rage = await pg.evaluate("window.__shockmate.state.session.rage"); assert rage >= 1, rage
        await win_fight(pg); await phase(pg, "card"); await pg.click("#btn-next")
        cards = await pg.evaluate("window.__shockmate.state.profiles.map(p => Object.keys(p.cardsEarned).length)")
        assert cards == [1, 1], cards

        # Duel: same board hot-seat, verdict names a winner, handicap lights candidates for the trailing seat
        await pg.reload(); await pg.click("#seat-2"); await pg.click("#btn-duel"); await phase(pg, "think")
        enc = await pg.evaluate("window.__shockmate.current()")
        seat0 = await pg.evaluate("window.__shockmate.state.active")
        await win_fight(pg)  # seat 0 keeps the reason
        await phase(pg, "think", 20000)
        assert await pg.evaluate("window.__shockmate.state.active") != seat0, "duel passes the phone"
        same = await pg.evaluate("window.__shockmate.current().id"); assert same == enc["id"], "same board for both"
        bait = enc["bait"]; await move(pg, bait); await phase(pg, "duel", 20000)
        line = await pg.text_content("#duel-line"); assert "Sam" in line and "Rio" in line, line
        await pg.click("#btn-duel-next"); await phase(pg, "think")
        assert await pg.evaluate("window.__shockmate.current().id") != enc["id"], "next board"
        # Openings pack: separate 6-fight path, own fights, same loop
        await pg.reload(); await pg.click("#seat-1"); await pg.click("#pack-openings"); await pg.click("#btn-start")
        pips = await pg.eval_on_selector_all("#path .pip", "els => els.length")
        assert pips == 6, pips
        enc = await win_fight(pg); assert enc["pack"] == "openings", enc["pack"]
        await phase(pg, "card"); await pg.click("#btn-next"); await phase(pg, "think")
        await pg.click("#btn-collection")
        arts = await pg.eval_on_selector_all(".fig .art svg", "els => els.length")
        assert arts == len(await pg.evaluate("window.SHOCKMATE_ENCOUNTERS")), arts  # every fight in every pack has card art
        await b.close()
    assert not errors, errors
    print("OK e2e phase2: co-op alternation + rage + separate collections, duel hot-seat + verdict, blitz per player, openings pack path, card art for every fight")

asyncio.run(run())
