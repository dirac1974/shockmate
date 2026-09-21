"""phase5: the update path and the safety net. Drives the real app with service workers ALLOWED, over
a local http server that sends the same max-age=600 header GitHub Pages sends, and proves three things
the other suites cannot see because they block the worker:
  1. a phone on build A that receives build B shows "Shockmate updated." with a Reload button, and the
     reload actually runs build B even though the browser's own cache still holds A (the
     cache: "reload" install in sw.js);
  2. a thrown error shows the toast, unhides Home, and is kept under shockmate-v2:fault;
  3. the coach's Settings foot shows that fault and the build.
Copies web/ to a temp dir so the working tree is never touched. Run: python tests/e2e/phase5_update.py"""
import asyncio, functools, http.server, pathlib, re, shutil, sys, tempfile, threading
from playwright.async_api import async_playwright
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from harness import launch

ROOT = pathlib.Path(__file__).resolve().parents[2]
PORT = 8791


class Pages(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "max-age=600")   # what GitHub Pages sends
        super().end_headers()

    def log_message(self, *a):
        pass


def serve(directory):
    handler = functools.partial(Pages, directory=directory)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def set_build(webdir, build, cache):
    g = webdir / "game.js"
    g.write_text(re.sub(r'const BUILD = "v[^"]+";', 'const BUILD = "%s";' % build, g.read_text(encoding="utf-8")), encoding="utf-8")
    s = webdir / "sw.js"
    s.write_text(re.sub(r'const CACHE = "[^"]+";', 'const CACHE = "%s";' % cache, s.read_text(encoding="utf-8")), encoding="utf-8")


async def main():
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="sm-"))
    web = tmp / "web"
    shutil.copytree(ROOT / "web", web, ignore=shutil.ignore_patterns("voice", "__pycache__"))
    (web / "voice").mkdir()
    srv = serve(str(tmp))
    base = "http://127.0.0.1:%d/web/" % PORT
    set_build(web, "v0.30-A", "shockmate-check-A")
    errors = []
    async with async_playwright() as p:
        browser = await launch(p)
        ctx = await browser.new_context(viewport={"width": 390, "height": 844}, service_workers="allow")
        page = await ctx.new_page()
        page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        # seed: family skipped, sound off, coach PIN 1234 (the same shape harness.phone seeds)
        await page.add_init_script("""
          if (!localStorage.getItem('shockmate-v2:settings')) localStorage.setItem('shockmate-v2:settings', JSON.stringify({
            family: {code:'', me:null, pins:['',''], roster:[], skipped:true}, sound:false, names:['A','B'], parent:{name:'Coach', pin:'1234'}}));
        """)
        await page.goto(base)
        await page.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller !== null", timeout=15000)
        build = await page.evaluate("window.__shockmate.BUILD")
        note_hidden = await page.evaluate("document.getElementById('app-note').hidden")
        print("1a. first visit on", build, "| update note hidden on first visit:", note_hidden)
        assert build == "v0.30-A" and note_hidden

        # reload once more so the browser HTTP cache definitely holds build A's game.js
        await page.reload()
        await page.wait_for_function("window.__shockmate && window.__shockmate.BUILD")
        print("1b. second load still", await page.evaluate("window.__shockmate.BUILD"))

        # ship build B on the server while the phone holds A in both caches
        set_build(web, "v0.30-B", "shockmate-check-B")
        await page.reload()
        await page.wait_for_function("window.__shockmate && window.__shockmate.BUILD")
        print("1c. after the bump, this load ran", await page.evaluate("window.__shockmate.BUILD"), "(cached shell, expected A)")
        await page.wait_for_function("!document.getElementById('app-note').hidden && !document.getElementById('btn-note-act').hidden", timeout=20000)
        text = await page.evaluate("document.getElementById('app-note-text').textContent")
        print("1d. note shown:", repr(text), "| Reload button visible")
        assert "updated" in text
        await page.click("#btn-note-act")
        await page.wait_for_function("window.__shockmate && window.__shockmate.BUILD === 'v0.30-B'", timeout=15000)
        print("1e. after Reload the page runs", await page.evaluate("window.__shockmate.BUILD"), "| note hidden:", await page.evaluate("document.getElementById('app-note').hidden"))

        # 2. the safety net
        await page.evaluate("document.getElementById('btn-home').hidden = true")
        await page.evaluate("setTimeout(function () { throw new Error('check fault ' + 42); }, 0)")
        await page.wait_for_function("!document.getElementById('toast').hidden", timeout=5000)
        toast = await page.evaluate("document.getElementById('toast').textContent")
        home = await page.evaluate("document.getElementById('btn-home').hidden")
        fault = await page.evaluate("localStorage.getItem('shockmate-v2:fault')")
        print("2. toast:", repr(toast), "| home hidden:", home, "| stored:", fault)
        assert "Home" in toast and home is False and "check fault 42" in fault
        await page.evaluate("setTimeout(function () { Promise.reject(new Error('check promise')); }, 0)")
        await page.wait_for_timeout(300)
        print("2b. rejection stored:", "check promise" in (await page.evaluate("localStorage.getItem('shockmate-v2:fault')")))

        # 3. the coach sees it: open Settings past the PIN keypad
        await page.click("#btn-settings")
        await page.wait_for_timeout(300)
        for d in "1234":
            btn = page.locator("button:visible", has_text=re.compile(r"^%s$" % d))
            if await btn.count():
                await btn.first.click()
        await page.wait_for_timeout(600)
        diag = await page.evaluate("(document.getElementById('diag') || {}).textContent")
        shown = await page.evaluate("document.body.dataset.screen")
        print("3. screen:", shown, "| diag:", repr(diag))
        assert diag and "v0.30-B" in diag and "check promise" in diag

        # 4. the accessibility floor is in the shipped files
        css = await page.evaluate("[...document.styleSheets].some(s => { try { return [...s.cssRules].some(r => r.selectorText === ':focus-visible'); } catch (e) { return false; } })")
        live = await page.evaluate("document.getElementById('toast').getAttribute('aria-live') + '/' + document.getElementById('banner').getAttribute('aria-live')")
        print("4. :focus-visible rule loaded:", css, "| aria-live toast/banner:", live)
        assert css and live == "polite/polite"
        await browser.close()
    srv.shutdown()
    shutil.rmtree(tmp, ignore_errors=True)
    unexpected = [e for e in errors if "check fault" not in e and "check promise" not in e]
    assert not unexpected, unexpected
    print("OK phase5: a phone on build A is told about build B and one tap runs it past both caches; a thrown error and a rejected promise reach the coach and never freeze the kid; focus ring and live regions present")


asyncio.run(main())
