"""Backup, restore and offline install, over http so the service worker is real.

Service workers refuse to register on file://, so this suite serves web/ on a local port,
plays a fight, saves the backup file, wipes storage, restores it, and then pulls the plug
to check the app still boots from the cache.
"""
import asyncio, functools, http.server, json, pathlib, socketserver, threading

from playwright.async_api import async_playwright

WEB = pathlib.Path(__file__).resolve().parents[2] / "web"


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):  # keep the suite's output to its own result line
        pass


def serve():
    handler = functools.partial(Quiet, directory=str(WEB))
    httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, "http://127.0.0.1:%d/index.html" % httpd.server_address[1]


async def phase(pg, want, timeout=20000):
    await pg.wait_for_function("() => window.__shockmate.state.phase === %r" % want, timeout=timeout)


async def win_fight(pg):
    await phase(pg, "think")
    enc = await pg.evaluate("window.__shockmate.current()")
    await pg.click('.sq[data-sq="%s"]' % enc["best"][:2])
    await pg.click('.sq[data-sq="%s"]' % enc["best"][2:4])
    await phase(pg, "gate")
    for s in enc["whyTargets"]["squares"]:
        await pg.click('.sq[data-sq="%s"]' % s)
    await phase(pg, "card")
    return enc


async def run():
    httpd, url = serve()
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            ctx = await browser.new_context(viewport={"width": 390, "height": 844}, accept_downloads=True)
            pg = await ctx.new_page()
            errors = []
            pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

            await pg.goto(url)
            await pg.wait_for_function("() => !!window.__shockmate")

            # Sync is off until sync-config.js is filled in — the controls say so instead of failing.
            await pg.click("#btn-settings")
            assert await pg.is_visible("#sync-off"), "unconfigured build explains that sync is off"
            assert await pg.is_hidden("#sync-on"), "no code field offered without a project"
            assert await pg.is_visible("#btn-export"), "the backup file works regardless"
            await pg.click("#btn-close-settings")

            # Win a card, then save a backup file.
            await pg.click("#btn-start")
            enc = await win_fight(pg)
            earned = await pg.evaluate("Object.keys(window.__shockmate.state.stats.cardsEarned)")
            assert enc["id"] in earned, earned

            await pg.click("#btn-settings")
            async with pg.expect_download() as dl_info:
                await pg.click("#btn-export")
            download = await dl_info.value
            saved = pathlib.Path("/tmp/shockmate-backup.json")
            await download.save_as(saved)
            blob = json.loads(saved.read_text())
            assert blob["app"] == "shockmate" and enc["id"] in blob["profiles"][0]["cardsEarned"], "the card is in the file"

            # Wipe the device the way iOS eviction or "clear data" would, then restore.
            await pg.evaluate("localStorage.clear()")
            await pg.reload()
            await pg.wait_for_function("() => !!window.__shockmate")
            assert await pg.evaluate("Object.keys(window.__shockmate.state.stats.cardsEarned).length") == 0, "storage really was wiped"

            await pg.click("#btn-settings")
            await pg.set_input_files("#file-import", str(saved))
            await pg.wait_for_function(
                "id => Object.keys(window.__shockmate.state.stats.cardsEarned).includes(id)", arg=enc["id"], timeout=10000
            )

            # A restore merges: a card won after the backup must survive restoring it again.
            await pg.evaluate("""() => {
                const s = window.__shockmate.state;
                s.stats.cardsEarned['zz'] = { critical: false, tries: 1, t: Date.now() };
            }""")
            await pg.set_input_files("#file-import", str(saved))
            await pg.wait_for_timeout(600)
            after = await pg.evaluate("Object.keys(window.__shockmate.state.stats.cardsEarned)")
            assert "zz" in after and enc["id"] in after, after

            # Installable and offline: the service worker takes over, then the network goes away.
            await pg.evaluate("() => navigator.serviceWorker.ready")
            manifest = await pg.evaluate("() => document.querySelector('link[rel=manifest]').href")
            assert manifest.endswith("manifest.webmanifest"), manifest
            await ctx.set_offline(True)
            await pg.reload()
            await pg.wait_for_function("() => !!window.__shockmate", timeout=20000)
            offline_count = await pg.evaluate("window.SHOCKMATE_ENCOUNTERS.length")
            assert offline_count == 23, offline_count
            await ctx.set_offline(False)

            assert not errors, errors
            await browser.close()
    finally:
        httpd.shutdown()
    print("OK e2e sync: sync controls gated on config, backup file round trip, restore merges, "
          "service worker serves all 23 fights with the network off")


asyncio.run(run())
