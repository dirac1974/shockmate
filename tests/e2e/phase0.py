#!/usr/bin/env python3
"""Phase 0: every hand-authored fight, on a phone viewport, down every path a kid can take.

  - Day 1 from the home screen, on the best move, to the congratulation and on into Day 2.
  - Every fight that is not `generated`: best; bait -> second try -> blunder -> confession -> guided
    (a cracked card); and the good-tier move with the peek, where the fight has one.
  - Ten ladder fights, sampled across the rungs, on the best move.
Counts come from window.SHOCKMATE_ENCOUNTERS and ShockmateDays, never from a number in this file.
Run: python tests/e2e/phase0.py
"""
from playwright.async_api import async_playwright

import harness as h
from harness import move, phase, tap

LADDER_SAMPLE = 10


async def start_fight(pg, fid):
    await pg.evaluate("""id => {
        const m = window.__shockmate, s = m.state, e = m.all.find(x => x.id === id);
        s.mode = 'solo'; s.camp = null; s.prep = false; s.fromGame = false; s.duel = null;
        s.encounters = [e]; s.index = 0;
        m.startEncounter();
    }""", fid)
    await phase(pg, "think")
    return await pg.evaluate("window.__shockmate.current()")


async def check_gate(pg, enc):
    await phase(pg, "gate")
    at = enc["whyTargets"].get("at")
    assert at in ("before", "after"), (enc["id"], at)
    for s in enc["whyTargets"]["squares"]:
        assert await pg.eval_on_selector('.sq[data-sq="%s"]' % s, "e => !!e.querySelector('.piece')"), \
            enc["id"] + " gate target " + s + " is empty on screen"
    if at == "before":
        assert "REWIND" in (await pg.text_content("#banner")), enc["id"] + ": a before-gate says the board stepped back"
    wrong = next((q for q in (enc["best"][:2], enc["bait"][:2], "a1", "h8") if q not in enc["whyTargets"]["squares"]), None)
    if wrong:
        await tap(pg, wrong)                     # a wrong tap must not break the gate
        assert await pg.evaluate("window.__shockmate.state.phase") == "gate", enc["id"]
    for s in enc["whyTargets"]["squares"]:
        await tap(pg, s)
    await phase(pg, "card")
    assert await pg.is_visible("#screen-card.active"), enc["id"]
    assert not await pg.eval_on_selector("#btn-next", "e => e.disabled"), "Next must be enabled after the gate"


async def best_path(pg, fid):
    enc = await start_fight(pg, fid)
    await move(pg, enc["best"])
    await check_gate(pg, enc)
    title = await pg.text_content("#card-title")
    assert "BEAT GLITCH" in title or "KNOCKDOWN" in title, (fid, title)
    assert await pg.evaluate("id => !!window.__shockmate.state.stats.cardsEarned[id]", fid), fid + " card not earned"
    return enc


async def bait_path(pg, fid):
    await pg.evaluate("id => { delete window.__shockmate.state.stats.cardsEarned[id]; }", fid)
    enc = await start_fight(pg, fid)
    await move(pg, enc["bait"])
    await pg.wait_for_function("() => { const s = window.__shockmate.state; return s.tries === 1 && s.phase === 'think'; }", timeout=20000)
    assert "SECOND TRY" in (await pg.text_content("#banner")), fid
    lit = await pg.eval_on_selector_all(".sq.cand", "els => els.map(e => e.dataset.sq)")
    assert set(enc["candidates"]) <= set(lit), (fid, "second try lights the candidates", enc["candidates"], lit)
    misses = [u for u, m in enc["moves"].items() if m["tier"] == "blunder"] or \
             [u for u, m in enc["moves"].items() if m["tier"] not in ("best", "good")]
    await move(pg, misses[0])
    await pg.wait_for_function("() => { const s = window.__shockmate.state; return s.guided === true && s.phase === 'think'; }", timeout=20000)
    assert enc["bestSan"] in (await pg.text_content("#prompt")), fid + ": the confession names the move"
    await move(pg, enc["bait"])                  # guided mode refuses anything but the best move
    assert await pg.evaluate("window.__shockmate.state.phase") == "think", fid
    await move(pg, enc["best"])
    await check_gate(pg, enc)
    assert "tries" in (await pg.text_content("#card-title")), fid + ": retry wins are credited"
    card = await pg.evaluate("id => window.__shockmate.state.stats.cardsEarned[id]", fid)
    assert card and card.get("clean") is False, (fid, "a confession win is a cracked card", card)
    assert await pg.is_visible("#card-crack"), fid + ": the crack is said once"
    assert await pg.eval_on_selector("#why-card", "e => e.classList.contains('cracked')"), fid


async def good_path(pg, fid):
    enc = await pg.evaluate("id => window.__shockmate.all.find(x => x.id === id)", fid)
    good = next((u for u, m in enc["moves"].items() if m["tier"] == "good"), None)
    if not good:
        return False
    enc = await start_fight(pg, fid)
    await move(pg, good)
    await check_gate(pg, enc)
    assert await pg.is_visible("#btn-peek"), fid + ": peek offered on good tier"
    card = await pg.evaluate("id => window.__shockmate.state.stats.cardsEarned[id]", fid)
    assert card and card.get("clean") is not False, (fid, "a clean win repairs the crack", card)
    await pg.click("#btn-peek")
    await phase(pg, "card", 20000)
    return True


async def day_one(pg):
    assert await pg.is_hidden("#btn-home"), "no way back is offered from the home screen itself"
    assert await pg.is_hidden("#screen-family.active"), "a seeded phone skips 'Set up this phone'"
    assert await pg.is_visible("#btn-start") and await pg.is_hidden("#step-two")
    await pg.click("#seat-2")
    assert await pg.is_hidden("#btn-start") and await pg.is_visible("#step-two"), "two-player swaps the dock"
    await pg.click("#prof-0")                    # picking a kid is how the phone goes back to one seat
    assert await pg.is_visible("#btn-start") and await pg.is_hidden("#step-two")
    assert await pg.is_visible('.day-chip[data-day="1"]'), "the home screen offers lesson days"
    assert await pg.eval_on_selector('.day-chip[data-day="2"]', "e => e.disabled"), "day 2 waits for day 1"
    brag0 = int(await pg.text_content("#brag-real"))
    day_ids = await pg.evaluate("window.ShockmateDays.fightsForDay(window.SHOCKMATE_ENCOUNTERS, 1).map(e => e.id)")
    await pg.click("#btn-start")
    await phase(pg, "think")
    assert sorted(await pg.evaluate("window.__shockmate.state.encounters.map(e => e.id)")) == sorted(day_ids)
    for _ in day_ids:
        await phase(pg, "think")
        enc = await pg.evaluate("window.__shockmate.current()")
        await move(pg, enc["best"])
        await check_gate(pg, enc)
        await pg.click("#btn-next")
    await pg.wait_for_selector("#session-end:not([hidden])", timeout=10000)
    assert not await pg.is_hidden("#btn-home"), "the way back is offered once a fight has started"
    title = await pg.text_content("#end-title")
    assert "Day 1 done" in title or "KNOCKOUT" in title, title
    summary = await pg.text_content("#session-summary")
    assert ("Fights won: %d" % len(day_ids)) in summary, summary
    assert "Rank:" in (await pg.text_content("#end-rank"))
    build = await pg.evaluate("document.getElementById('build-tag').textContent")
    total = await pg.evaluate("window.SHOCKMATE_ENCOUNTERS.length")
    ndays = await pg.evaluate("window.ShockmateDays.DAYS.length")
    assert ("%d fights" % total) in build and ("%d days" % ndays) in build, build
    brag1 = int(await pg.evaluate("document.getElementById('brag-real').textContent"))
    assert brag1 < brag0, ("Glitch's number only ever falls", brag0, brag1)
    assert not await pg.eval_on_selector("#btn-next-day", "e => e.hidden"), "finishing a day offers the next"
    assert "Day 2" in (await pg.text_content("#btn-next-day"))
    await pg.click("#btn-next-day")
    await phase(pg, "think")
    assert await pg.evaluate("window.__shockmate.state.day") == 2, "the next day actually starts"
    await pg.click("#btn-home")
    await h.screen(pg, "screen-title")
    return len(day_ids)


async def main():
    httpd, base = h.serve()
    fake = h.FakeSupabase()
    try:
        async with async_playwright() as p:
            b = await h.launch(p)
            ph = await h.phone(b, base, fake)
            pg = ph.page
            await h.boot(ph)
            await day_one(pg)

            hand = await pg.evaluate("window.SHOCKMATE_ENCOUNTERS.filter(e => !e.generated).map(e => e.id)")
            ladder = await pg.evaluate("window.SHOCKMATE_ENCOUNTERS.filter(e => e.generated).map(e => e.id)")
            assert hand and ladder, (len(hand), len(ladder))
            goods = 0
            for fid in hand:
                await best_path(pg, fid)
                await bait_path(pg, fid)
                goods += await good_path(pg, fid)
            step = max(1, len(ladder) // LADDER_SAMPLE)
            sample = ladder[::step][:LADDER_SAMPLE]
            for fid in sample:
                await best_path(pg, fid)

            # Collection and settings are reachable, behind the coach's keypad, and come back.
            await pg.click("#btn-home")
            await pg.click("#btn-collection")
            await h.screen(pg, "screen-collection")
            await pg.click("#btn-back-play")
            await h.unlock_settings(pg)
            await pg.click("#btn-close-settings")
            await h.screen(pg, "screen-title")
            await b.close()
            ph.check("phase0")
    finally:
        httpd.shutdown()
    print("OK e2e phase0: Day 1 to Day 2 from the map; %d hand-authored fights on best, bait+second try+confession+guided "
          "(cracked), and %d good-tier peeks; %d ladder fights on best; no console errors" % (len(hand), goods, len(sample)))


h.run(main)
