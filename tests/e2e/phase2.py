#!/usr/bin/env python3
"""Phase 2: the two-kid modes on one phone, and the binder.

  - Settings behind the coach's keypad: a wrong PIN shakes, the right one opens, Blitz is turned on
    for the first kid only and survives Done.
  - Co-op: the kids alternate, the rage meter fills, each collection grows, blitz is per kid.
  - Duel: same board hot-seat, the verdict names both kids, then the next board.
  - A lesson day mixes packs and its path has one pip per fight; every fight has card art.
Run: python tests/e2e/phase2.py
"""
from playwright.async_api import async_playwright

import harness as h
from harness import move, phase


async def main():
    httpd, base = h.serve()
    fake = h.FakeSupabase()
    try:
        async with async_playwright() as p:
            b = await h.launch(p)
            ph = await h.phone(b, base, fake, settings={"names": ["Sam", "Rio"]})
            pg = ph.page
            await h.boot(ph)

            # The coach gate: a wrong PIN shakes and stays, the right one opens Settings.
            await pg.click("#btn-settings")
            await h.screen(pg, "screen-gate")
            assert "Test" in (await pg.text_content("#gate-title")), "the keypad names the coach"
            for d in "9999":
                await pg.click('#keypad .key[data-key="%s"]' % d)
            await pg.wait_for_function("() => document.getElementById('gate-card').classList.contains('wrong')")
            assert await pg.is_visible("#screen-gate.active"), "a wrong PIN does not open Settings"
            for d in h.COACH_PIN:
                await pg.click('#keypad .key[data-key="%s"]' % d)
            await h.screen(pg, "screen-settings")
            await pg.click("#opt-blitz-0")
            await pg.click("#btn-close-settings")
            await h.screen(pg, "screen-title")
            assert await pg.evaluate("window.__shockmate.state.settings.blitz") == [True, False]

            # Co-op: players alternate, the rage meter fills, both collections grow.
            await pg.click("#seat-2")
            await pg.click("#btn-coop")
            await phase(pg, "think")
            assert not await pg.eval_on_selector("#team", "e => e.hidden"), "team strip shows in co-op"
            assert "SAM" in (await pg.text_content("#turn-chip"))
            assert not await pg.eval_on_selector("#blitz", "e => e.hidden"), "blitz bar shows for the kid who has it on"
            await h.win_fight(pg)
            await phase(pg, "card")
            await pg.click("#btn-next")
            await phase(pg, "think")
            assert "RIO" in (await pg.text_content("#turn-chip")), "co-op alternates players"
            assert await pg.eval_on_selector("#blitz", "e => e.hidden"), "blitz is per player"
            rage = await pg.evaluate("window.__shockmate.state.session.rage")
            assert rage >= 1, rage
            await h.win_fight(pg)
            await phase(pg, "card")
            await pg.click("#btn-next")
            await phase(pg, "think")
            cards = await pg.evaluate("window.__shockmate.state.profiles.map(p => Object.keys(p.cardsEarned).length)")
            assert cards == [1, 1], cards

            # Duel: same board hot-seat, the verdict names both, then a new board.
            await pg.click("#btn-home")
            await h.screen(pg, "screen-title")
            await pg.click("#seat-2")
            await pg.click("#btn-duel")
            await phase(pg, "think")
            enc = await pg.evaluate("window.__shockmate.current()")
            seat0 = await pg.evaluate("window.__shockmate.state.active")
            await h.win_fight(pg)
            await phase(pg, "think")
            assert await pg.evaluate("window.__shockmate.state.active") != seat0, "duel passes the phone"
            assert await pg.evaluate("window.__shockmate.current().id") == enc["id"], "same board for both"
            await move(pg, enc["bait"])
            await phase(pg, "duel")
            line = await pg.text_content("#duel-line")
            assert "Sam" in line and "Rio" in line, line
            await pg.click("#btn-duel-next")
            await phase(pg, "think")
            assert await pg.evaluate("window.__shockmate.current().id") != enc["id"], "next board"

            # A lesson day is its own short run, and it mixes packs on purpose.
            await pg.click("#btn-home")
            await pg.click("#prof-0")
            await pg.click('.day-chip[data-day="1"]')
            await pg.click("#btn-start")
            await phase(pg, "think")
            day_ids = await pg.evaluate("window.__shockmate.state.encounters.map(e => e.id)")
            pips = await pg.eval_on_selector_all("#path .pip", "els => els.length")
            assert pips == len(day_ids), (pips, day_ids)
            packs = await pg.evaluate("[...new Set(window.__shockmate.state.encounters.map(e => e.pack))]")
            assert len(packs) > 1, packs
            enc = await h.win_fight(pg)
            assert enc["id"] in day_ids, (enc["id"], day_ids)
            await phase(pg, "card")

            # The binder: every fight in every pack has card art, and the won ones show.
            await pg.click("#btn-collection")
            await h.screen(pg, "screen-collection")
            arts = await pg.eval_on_selector_all(".fig .art svg", "els => els.length")
            total = await pg.evaluate("window.SHOCKMATE_ENCOUNTERS.length")
            assert arts == total, (arts, total)
            won = await pg.eval_on_selector_all(".fig:not(.locked)", "els => els.length")
            assert won == len(await pg.evaluate("Object.keys(window.__shockmate.state.stats.cardsEarned)")), won
            await pg.click("#btn-back-play")
            await h.screen(pg, "screen-card")
            await b.close()
            ph.check("phase2")
    finally:
        httpd.shutdown()
    print("OK e2e phase2: coach keypad wrong-then-right, blitz per kid from Settings, co-op alternation + rage + "
          "separate collections, duel hot-seat + verdict, mixed-pack lesson day, card art for every fight")


h.run(main)
