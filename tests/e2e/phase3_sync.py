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
            def note(m):
                if m.type == "error" and "ERR_NAME_NOT_RESOLVED" not in m.text:
                    errors.append(m.text)   # the fake project below is meant to fail to resolve
            pg.on("console", note)

            await pg.goto(url)
            await pg.wait_for_function("() => !!window.__shockmate")

            # With no API details on the device, the login fields stay hidden and the backup still works.
            await pg.click("#btn-settings")
            assert await pg.is_visible("#sync-off"), "an unconfigured device asks for the API details"
            assert await pg.is_hidden("#sync-on"), "no family login offered until then"
            assert await pg.is_visible("#btn-export"), "the backup file works regardless"

            # Saving API details reveals the family login; a bound slot is code + username + 4-digit PIN.
            await pg.fill("#opt-url", "https://example.supabase.co")
            await pg.fill("#opt-key", "test-anon-key")
            await pg.click("#btn-save-api")
            assert await pg.is_visible("#sync-on"), "family login appears once the device is configured"
            await pg.fill("#opt-code", "abcd 1234")
            await pg.fill("#opt-user-0", "Mia_B")
            await pg.fill("#opt-pin-0", "1234")  # the field caps at 4; stripping non-digits is unit-tested
            await pg.click("#btn-sync")
            await pg.wait_for_timeout(400)
            login = await pg.evaluate("window.__shockmate.state.settings.sync")
            assert login["code"] == "ABCD1234", login
            assert login["players"][0] == {"username": "mia_b", "pin": "1234"}, login
            assert not login["players"][1]["username"], "an unbound second slot stays device-local"
            # The fake project cannot answer, so the state line must report it and keep the cards.
            state_line = await pg.inner_text("#sync-state")
            assert "synced" not in state_line.lower() or "Last synced" not in state_line, state_line

            await pg.evaluate("""() => {
                const s = window.__shockmate.state.settings;
                s.sync = { url: "", anonKey: "", code: "", players: [{username:"",pin:""},{username:"",pin:""}] };
            }""")
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
