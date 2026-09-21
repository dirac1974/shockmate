"""phase6: the tablet layout. At 1024x768 (a tablet on its side) a fight puts the board on the left and
the rest on the right; at 820x1180 (upright) it keeps the column with a board up to 560px; either way
the board is bigger than a phone's, nothing scrolls sideways, the powers and the prompt are on screen
without scrolling, and a square still answers a tap. At 390x844 nothing moved. Every
other screen stays a centred column at every size. Screenshots go to tests/e2e/shots/ when SHOTS=1.
Run: python tests/e2e/phase6_tablet.py"""
import asyncio, os, pathlib, sys
from playwright.async_api import async_playwright
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import harness as h
from harness import phase, tap

SHOTS = os.environ.get("SHOTS") == "1"
OUT = pathlib.Path(__file__).resolve().parent / "shots"


async def start_fight(pg, fid):
    await pg.evaluate("""id => {
        const m = window.__shockmate, s = m.state, e = m.all.find(x => x.id === id);
        s.mode = 'solo'; s.camp = null; s.prep = false; s.fromGame = false; s.duel = null;
        s.encounters = [e]; s.index = 0;
        m.startEncounter();
    }""", fid)
    await phase(pg, "think")
    return await pg.evaluate("window.__shockmate.current()")


async def box(pg, sel):
    return await pg.eval_on_selector(sel, "e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, b: r.bottom, r: r.right }; }")


async def no_sideways(pg):
    assert await pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "the page scrolls sideways"


async def shot(pg, name):
    if SHOTS:
        OUT.mkdir(exist_ok=True)
        await pg.screenshot(path=str(OUT / (name + ".png")))


async def size(b, base, fake, w, hgt, tablet, wide_column=False):
    ph = await h.phone(b, base, fake, viewport={"width": w, "height": hgt})
    pg = ph.page
    await h.boot(ph)
    label = "%dx%d" % (w, hgt)
    await no_sideways(pg)
    await shot(pg, "home-" + label)
    enc = await start_fight(pg, "01")
    await no_sideways(pg)
    board, prompt, powers, bubble = await box(pg, ".board-wrap"), await box(pg, "#prompt"), await box(pg, "#powers"), await box(pg, ".glitch-row")
    await shot(pg, "fight-" + label)
    if tablet:
        assert board["r"] <= prompt["x"] and board["r"] <= powers["x"] and board["r"] <= bubble["x"], ("board left, words right", label, board, prompt, powers)
        assert board["w"] >= 400, ("a tablet board is bigger than a phone's", label, board["w"])
        assert powers["b"] <= hgt and prompt["b"] <= hgt, ("powers and prompt on screen without scrolling", label, powers, prompt)
        assert abs(board["h"] - board["w"]) < 2, ("the board stays square", label, board)
    else:
        assert prompt["y"] >= board["b"] and powers["y"] >= board["b"], ("a column: words under the board", label, board, prompt)
        if wide_column:
            assert board["w"] >= 500 and powers["b"] <= hgt, ("an upright tablet gets a bigger board with the powers still on screen", label, board, powers)
        else:
            assert board["w"] <= 420, label
    # the board still answers: pick the best move from the square it starts on
    await tap(pg, enc["best"][:2])
    assert await pg.evaluate("!!document.querySelector('.sq.sel')"), ("a tap selects a square", label)
    await tap(pg, enc["best"][2:4])
    await pg.wait_for_function("() => ['card', 'gate', 'think', 'end', 'busy'].includes(window.__shockmate.state.phase) && window.__shockmate.state.phase !== 'think'", timeout=20000)
    # other screens stay a column no wider than the phone's
    await pg.evaluate("window.__shockmate.renderCollection && window.__shockmate.renderCollection()")
    await pg.click("#btn-collection")
    await pg.wait_for_function("document.body.dataset.screen === 'screen-collection'")
    app = await box(pg, "#app")
    assert app["w"] <= 460, ("the binder is a centred column", label, app)
    await shot(pg, "binder-" + label)
    assert not ph.errors, ph.errors
    await ph.ctx.close()
    print("  ok", label, "board %dpx" % board["w"])


async def main():
    httpd, base = h.serve()
    fake = h.FakeSupabase()
    try:
        async with async_playwright() as p:
            b = await h.launch(p)
            await size(b, base, fake, 1024, 768, True)
            await size(b, base, fake, 820, 1180, False, wide_column=True)
            await size(b, base, fake, 390, 844, False)
            await size(b, base, fake, 844, 390, False)   # a phone on its side keeps the column
            await b.close()
    finally:
        httpd.shutdown()
    print("OK e2e phase6: a tablet on its side puts the board left and the words right, upright it widens the column to a 560px board, no sideways scroll, powers and prompt on screen, a square still answers; phone portrait and landscape keep the phone column; the binder stays a centred column everywhere")


h.run(main)
