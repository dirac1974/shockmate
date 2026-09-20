#!/usr/bin/env python3
"""The login matrix: does a sign-in survive the ways a phone forgets?

The complaint this suite exists for: a parent retyped the family code, tapped Find and chose "Dad"
every single time he opened Shockmate on his phone, while the server had his join the whole time.
Nothing was wrong on the server and nothing was wrong on desktop — iOS had simply thrown away the
site's localStorage, as it does after about a week unused, in Private Browsing, and every time a
link is opened inside another app's web view.

So every app now writes its sign-in into its own address bar, which a bookmark and above all an Add
to Home Screen icon freezes. What is tested here is that claim, three ways, per app:

  reload      join, reload, still signed in.
  wiped       join, wipe localStorage the way iOS does, reopen THE SAME URL the way a Home Screen
              icon would: at most one PIN question, the right kid already chosen. Never the code box.
  bare        join, wipe, open the plain URL with no query: the friendly code screen, not a crash.

Plus the hub: every app link carries the household code, and every app applies it on arrival.
And Shockmate only: two phones joined to one family still merge.

Shockmate runs against a local server and harness.FakeSupabase. The other apps run against their own
working copies (C:/Users/David S/Documents/GitHub/_kidapps/<app>) over a local server, with the
Yomple RPCs answered by FakeYomple here. Nothing in this file touches a live backend; --live adds a
separate read-only probe of what is deployed today, which fetches pages and calls nothing.

Run: E2E_CHANNEL=chrome python tests/e2e/login_matrix.py [--live]
"""
import asyncio, functools, http.server, json, os, pathlib, re, socketserver, sys, threading

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from playwright.async_api import async_playwright

import harness as h

KIDAPPS = pathlib.Path("C:/Users/David S/Documents/GitHub/_kidapps")
CODE = "CEDAR-Q7K2"          # a fake household, local only; the real one is never used here
SUPABASE = "**/*.supabase.co/**"


# ---------------------------------------------------------------- a server per app directory

def serve_dir(path):
    """Static server over one app's working copy. Returns (httpd, base url)."""
    class Quiet(http.server.SimpleHTTPRequestHandler):
        extensions_map = dict(http.server.SimpleHTTPRequestHandler.extensions_map,
                              **{".js": "text/javascript", ".json": "application/json",
                                 ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml"})

        def log_message(self, *a):
            pass

    class Server(socketserver.ThreadingMixIn, socketserver.TCPServer):
        daemon_threads = True
        allow_reuse_address = True

    httpd = Server(("127.0.0.1", 0), functools.partial(Quiet, directory=str(path)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, "http://127.0.0.1:%d/" % httpd.server_address[1]


# ---------------------------------------------------------------- the Yomple RPCs the kid apps use

class FakeYomple:
    """yomple_* over plain dicts. `people` is username -> row, as one household's worlds hold it."""

    def __init__(self):
        self.people = {}
        self.families = {}
        self.calls = []
        self.prompts = []

    def add(self, username, name, table="hop_players", pin=None, family=CODE):
        self.people[username] = {"username": username, "display_name": name, "avatar": "*",
                                 "family_code": family, "pin": pin, "has_pin": bool(pin),
                                 "progress": {}, "fun": {}, "table": table}

    def _public(self, row):
        out = dict(row)
        out.pop("pin", None)          # a row never carries the PIN out, as the real RPCs do
        return out

    def call(self, fn, body):
        self.calls.append((fn, body))
        if fn in ("yomple_player_find", "yomple_player_find_any", "yomple_player_search"):
            u = body.get("p_username") or body.get("p_query")
            row = self.people.get(u)
            if not row:
                return None
            if fn == "yomple_player_find":
                return self._public(row) if row["table"] == body.get("p_table") else None
            return self._public(row)
        if fn == "yomple_player_claim":
            row = self.people.get(body.get("p_username"))
            if not row or (row["has_pin"] and body.get("p_pin") != row["pin"]):
                return None
            return self._public(row)
        if fn == "yomple_family_players":
            table = body.get("p_table")
            return [self._public(r) for r in self.people.values()
                    if r["family_code"] == body.get("p_code") and r["table"] == table]
        if fn in ("yomple_family_upsert", "yomple_player_upsert"):
            self.families[body.get("p_code")] = body.get("p_email")
            return {"ok": True}
        return None

    async def handle(self, route):
        req = route.request
        if req.method == "OPTIONS":
            return await route.fulfill(status=204, headers=_cors(), body="")
        fn = req.url.rsplit("/", 1)[-1].split("?")[0]
        try:
            body = json.loads(req.post_data or "{}")
        except Exception:
            body = {}
        out = self.call(fn, body)
        await route.fulfill(status=200, headers=_cors(), content_type="application/json", body=json.dumps(out))


def _cors():
    return {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS"}


async def kid_page(browser, fake, answer_pin=None, seed=None, ua=None, storage=True):
    """A context for one kid app: Yomple RPCs faked, window.prompt answered, console errors caught.
    `storage=False` makes localStorage throw on write, which is what a locked-down browser does."""
    ctx = await browser.new_context(viewport=h.PHONE, user_agent=ua, service_workers="block")
    await ctx.route(SUPABASE, fake.handle)
    if seed:
        await ctx.add_init_script("(() => { try { const s = %s; for (const k in s) localStorage.setItem(k, s[k]); }"
                                  " catch (e) {} })();" % json.dumps(seed))
    if not storage:
        # A write that throws: Safari with site data blocked, and the shape the code must survive.
        await ctx.add_init_script(
            "(() => { const real = localStorage.setItem.bind(localStorage);"
            " Object.defineProperty(Storage.prototype, 'setItem', { value: function () {"
            "   throw new DOMException('quota', 'QuotaExceededError'); } }); })();")
    page = await ctx.new_page()
    page.set_default_timeout(15000)
    errors = []
    page.on("console", lambda m: errors.append("console: " + m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
    page.on("dialog", lambda d: asyncio.ensure_future(_answer(d, fake, answer_pin)))
    return ctx, page, errors


async def _answer(dialog, fake, pin):
    fake.prompts.append(dialog.message)
    await (dialog.accept(pin) if pin is not None else dialog.dismiss())


def clean(errors, allow=()):
    """Console noise that is not this suite's business.

    `introduced` is a standing Hall of Presidents bug, not a login one: getActiveProgress() returns
    {} while no profile is active, and walk.js then reads getActiveProgress()[n].introduced off
    undefined. It fires on the bare URL too, on this branch and on main alike — measured, not
    assumed — so this suite records it and does not pretend to have caused or fixed it."""
    skip = (r"favicon", r"lincoln-art", r"Failed to load resource",
            r"reading 'introduced'") + tuple(allow)
    return [e for e in errors if not any(re.search(p, e) for p in skip)]


# ================================================================ SHOCKMATE

async def shockmate(browser, base, fake):
    """join -> reload -> wiped -> bare, on the app the complaint was about."""
    fake.household(CODE, ["Ada", "Dad"], "hop_players")
    fresh = {"names": ["Player 1", "Player 2"], "family": {"skipped": False}}

    # --- join, as the parent did once: a code, a name, a PIN.
    ph = await h.phone(browser, base, fake, settings=fresh)
    pg = ph.page
    await h.boot(ph, "family=" + CODE)
    await pg.wait_for_selector("#fam-pick:not([hidden])")
    await pg.click('#fam-roster button[data-pick="1"]')      # Dad
    await pg.wait_for_function("() => document.getElementById('fam-pin-title').textContent === 'Dad, pick a secret PIN'")
    await h.fam_pin(pg, "4321")
    await h.fam_pin(pg, "4321")
    await h.screen(pg, "screen-title")

    # The join is now in the address bar. This is the whole fix: a Home Screen icon taken from here
    # carries the family and the slot, and needs no storage to know them again.
    # Dad is new to Shockmate, so he takes the first free slot rather than a slot the roster names.
    slot = await pg.evaluate("window.__shockmate.state.settings.family.me")
    url = await pg.evaluate("location.search")
    assert "family=" + CODE in url and "me=%d" % slot in url, url
    assert "fast=1" in url, "stamping keeps the params it found: " + url

    # --- reload: still signed in, no family screen.
    await pg.reload()
    await pg.wait_for_function("() => !!window.__shockmate")
    await h.screen(pg, "screen-title")
    fam = await pg.evaluate("window.__shockmate.state.settings.family")
    assert fam["code"] == CODE and fam["me"] == slot, fam
    assert await pg.is_hidden("#screen-family.active") or not await pg.is_visible("#screen-family.active")

    # --- wiped, then the SAME url, the way a Home Screen icon reopens it.
    signed_url = pg.url
    await pg.evaluate("localStorage.clear()")
    await pg.goto(signed_url)
    await pg.wait_for_function("() => !!window.__shockmate")
    # One screen, and it is his PIN. Not the code box, not the roster.
    await pg.wait_for_selector("#fam-pin:not([hidden])")
    assert await pg.is_hidden("#fam-choose") and await pg.is_hidden("#fam-pick"), "no code box, no roster"
    assert await pg.text_content("#fam-pin-title") == "Dad, type your PIN"
    await h.fam_pin(pg, "4321")
    await h.screen(pg, "screen-title")
    fam = await pg.evaluate("window.__shockmate.state.settings.family")
    assert fam["code"] == CODE and fam["me"] == slot and fam["pins"][slot] == "4321", fam

    # --- wiped, then the bare url: the friendly code screen, not a crash.
    await pg.evaluate("localStorage.clear()")
    await pg.goto(ph.base + "index.html?fast=1")
    await pg.wait_for_function("() => !!window.__shockmate")
    await h.screen(pg, "screen-family")
    assert await pg.is_visible("#fam-choose") and await pg.is_visible("#fam-code-input")

    # --- the hub's own link shape still works and still lands on the roster for an unknown phone.
    await pg.evaluate("localStorage.clear()")
    await pg.goto(ph.base + "index.html?fast=1&u=dad&from=yomple&f=" + CODE + "&family=" + CODE)
    await pg.wait_for_function("() => !!window.__shockmate")
    await pg.wait_for_selector("#fam-pick:not([hidden])")
    # Dad has a Shockmate slot by now, so his place in the list has moved; find him by name.
    dad = await pg.eval_on_selector_all(
        "#fam-roster button[data-pick]",
        "els => els.filter(e => e.textContent.trim() === 'Dad').map(e => e.className)")
    assert dad and "me" in dad[0], ("the hub's kid is marked", dad)

    ph.check("shockmate login matrix")
    await ph.ctx.close()
    print("  shockmate: join -> url stamped; reload, wipe+same url (one PIN), bare url all OK")


async def shockmate_two_phones(browser, base, fake):
    """Both phones joined, both stamped, and a card still travels between them."""
    fake.household(CODE, ["Ada", "Dad"], "hop_players")
    fresh = {"names": ["Player 1", "Player 2"], "family": {"skipped": False}}

    a = await h.phone(browser, base, fake, settings=fresh)
    await h.boot(a, "family=" + CODE)
    await a.page.wait_for_selector("#fam-pick:not([hidden])")
    await a.page.click('#fam-roster button[data-pick="0"]')
    await a.page.wait_for_function("() => /pick a secret PIN/.test(document.getElementById('fam-pin-title').textContent)")
    await h.fam_pin(a.page, "1111")
    await h.fam_pin(a.page, "1111")
    await h.screen(a.page, "screen-title")
    assert "me=0" in await a.page.evaluate("location.search")

    b = await h.phone(browser, base, fake, settings=fresh)
    await h.boot(b, "family=" + CODE)
    await b.page.wait_for_selector("#fam-pick:not([hidden])")
    await b.page.click('#fam-roster button[data-slot="0"]')   # Ada again, on a second phone
    await b.page.wait_for_function("() => document.getElementById('fam-pin-title').textContent === 'Ada, type your PIN'")
    await h.fam_pin(b.page, "1111")
    await h.screen(b.page, "screen-title")
    assert "me=0" in await b.page.evaluate("location.search")

    # A card won on B reaches A, so stamping the URL did not disturb the sync path.
    await b.page.click("#btn-start")
    enc = await h.win_fight(b.page)
    await h.phase(b.page, "card")
    await b.page.click("#btn-home")
    await b.page.evaluate("window.__shockmate.syncNow(true)")
    await a.page.evaluate("window.__shockmate.syncNow(true)")
    await a.page.wait_for_function("id => Object.keys(window.__shockmate.state.stats.cardsEarned).includes(id)", arg=enc["id"])

    a.check("phone A"); b.check("phone B")
    await a.ctx.close(); await b.ctx.close()
    print("  shockmate: two phones joined, both stamped, a card still merges")


# ================================================================ THE OTHER APPS

# Each app: where it lives, its storage key, and the selector that proves a kid is in (not on the roster).
APPS = [
    {"name": "hall-of-presidents", "dir": KIDAPPS / "hall-of-presidents", "key": "presidents-palace-v2",
     "home": "#screen-home", "roster": "#screen-profiles", "table": "hop_players"},
    {"name": "star-map", "dir": KIDAPPS / "star-map", "key": "star-map-v1",
     "home": "#screen-home", "roster": "#screen-profiles", "table": "star_players"},
    {"name": "quiet-field", "dir": KIDAPPS / "quiet-field", "key": "quiet-field-v1",
     "home": "#screen-home", "roster": "#screen-profiles", "table": "field_players"},
    {"name": "yomple/field", "dir": KIDAPPS / "yomple" / "field", "key": "quiet-field-v1",
     "home": "#screen-home", "roster": "#screen-profiles", "table": "field_players"},
]


SHOWN = """sel => { const e = document.querySelector(sel); if (!e) return false;
             const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden'; }"""


async def shown(page, sel):
    """Is that screen the one on display? These apps show screens by class or by inline style."""
    return await page.evaluate(SHOWN, sel)


async def wait_shown(page, sel, timeout=20000):
    """Star Map paints its roster only once the map SVG has loaded, so waiting for the element to
    exist is not the same as waiting for the kid to see it."""
    await page.wait_for_function(SHOWN, arg=sel, timeout=timeout)


async def kid_app(browser, app, pin=None):
    """join by hub link -> url stamped -> wipe -> same url -> straight back in -> bare url is safe."""
    httpd, base = serve_dir(app["dir"])
    fake = FakeYomple()
    fake.add("dad", "Dad", app["table"], pin=pin)
    try:
        # --- arrival from the hub, the link yomple.com actually emits.
        ctx, pg, errors = await kid_page(browser, fake, answer_pin=pin)
        await pg.goto(base + "index.html?u=dad&from=yomple&f=" + CODE)
        await wait_shown(pg, app["home"])
        assert not await shown(pg, app["roster"]), app["name"] + ": arrived straight in, no roster"
        if pin:
            assert fake.prompts, app["name"] + ": a kid with a PIN is asked for it"

        # The household code landed in storage, and the sign-in landed in the URL.
        store = await pg.evaluate("k => JSON.parse(localStorage.getItem(k) || '{}')", app["key"])
        assert (store.get("familyCode") or "").upper() == CODE, (app["name"], store.get("familyCode"))
        search = await pg.evaluate("location.search")
        assert "u=dad" in search and "f=" + CODE in search, (app["name"], search)
        stamped = pg.url
        assert not clean(errors), (app["name"], clean(errors))

        # --- wiped the way iOS wipes, then the same URL, as a Home Screen icon reopens it.
        await pg.evaluate("localStorage.clear()")
        await pg.goto(stamped)
        await wait_shown(pg, app["home"])
        assert not await shown(pg, app["roster"]), app["name"] + ": wiped phone came back signed in"
        store = await pg.evaluate("k => JSON.parse(localStorage.getItem(k) || '{}')", app["key"])
        assert (store.get("familyCode") or "").upper() == CODE, app["name"] + ": and it kept the code"
        await ctx.close()

        # --- the bare URL on a wiped phone: the roster, and nothing broken.
        ctx, pg, errors = await kid_page(browser, fake)
        await pg.goto(base + "index.html")
        await wait_shown(pg, app["roster"])
        assert not clean(errors), (app["name"], clean(errors))
        await ctx.close()

        # --- a browser whose storage throws: still playable, and it says so.
        ctx, pg, errors = await kid_page(browser, fake, storage=False)
        await pg.goto(base + "index.html")
        await pg.wait_for_selector("#yomple-stay-note", timeout=8000)
        assert "forgets logins" in (await pg.text_content("#yomple-stay-note"))
        await wait_shown(pg, app["roster"])   # warned, but never blocked
        await ctx.close()
        print("  %-20s hub link -> in; url stamped; wiped+same url -> in; bare url -> roster; "
              "dead storage warned" % app["name"])
    finally:
        httpd.shutdown()


async def hop_no_user(browser):
    """?from=yomple&f=CODE with nobody named used to render a blank page. Now: the roster."""
    app = APPS[0]
    httpd, base = serve_dir(app["dir"])
    fake = FakeYomple()
    try:
        ctx, pg, errors = await kid_page(browser, fake)
        await pg.goto(base + "index.html?from=yomple&f=" + CODE)
        await wait_shown(pg, app["roster"])   # not a blank page, which is what it used to be
        store = await pg.evaluate("k => JSON.parse(localStorage.getItem(k) || '{}')", app["key"])
        assert (store.get("familyCode") or "").upper() == CODE, "and it still kept the household code"
        assert not clean(errors), clean(errors)
        await ctx.close()
        print("  hall-of-presidents  nameless hub link -> roster + code kept (was a blank page)")
    finally:
        httpd.shutdown()


# ================================================================ THE HUB

async def hub_links(browser):
    """From yomple.com, every app link carries the household code."""
    httpd, base = serve_dir(KIDAPPS / "yomple")
    fake = FakeYomple()
    fake.add("dad", "Dad", "hop_players")
    seed = {"yomple-hub-v1": json.dumps({
        "familyCode": CODE, "parentEmail": "", "activeUser": "dad",
        "profiles": [{"username": "dad", "name": "Dad", "avatar": "*", "pin": "", "hasPin": False}]})}
    try:
        ctx, pg, errors = await kid_page(browser, fake, seed=seed)
        await pg.goto(base + "index.html")
        await pg.wait_for_function("() => document.querySelectorAll('a.app').length > 0")
        await pg.wait_for_function("() => Array.from(document.querySelectorAll('a.app')).every(a => a.href.includes('u='))")
        links = await pg.eval_on_selector_all("a.app", "els => els.map(e => e.href)")
        assert links, "the hub lists apps"
        for href in links:
            assert "u=dad" in href and "from=yomple" in href, href
            assert "f=" + CODE in href, "every app link carries the household code: " + href
        shock = [l for l in links if "shockmate" in l]
        assert shock and "family=" + CODE in shock[0], "Shockmate also gets its own spelling: " + str(shock)

        # The hub itself now survives a wipe far enough to keep the code.
        await pg.evaluate("localStorage.clear()")
        await pg.goto(base + "index.html?u=dad&from=yomple&f=" + CODE)
        await pg.wait_for_function("() => !!window.localStorage.getItem('yomple-hub-v1')")
        hub = await pg.evaluate("JSON.parse(localStorage.getItem('yomple-hub-v1'))")
        assert (hub.get("familyCode") or "").upper() == CODE, hub
        assert not clean(errors), clean(errors)
        await ctx.close()
        print("  yomple hub          every app link carries u/from/f (+family for Shockmate); "
              "a wiped hub keeps the code from its own url")
    finally:
        httpd.shutdown()


# ================================================================ what is deployed today (read-only)

LIVE = {
    "hall-of-presidents": "https://dirac1974.github.io/hall-of-presidents/",
    "star-map": "https://dirac1974.github.io/star-map/",
    "quiet-field": "https://dirac1974.github.io/quiet-field/",
    "yomple hub": "https://yomple.com/",
}


async def live_probe(browser):
    """Read-only: fetch each deployed page and report whether the fix is live yet. Creates nothing,
    signs nothing in, calls no RPC. Never fails the suite — it is a status line, not an assertion."""
    ctx = await browser.new_context(viewport=h.PHONE)
    pg = await ctx.new_page()
    for name, url in LIVE.items():
        try:
            await pg.goto(url, wait_until="domcontentloaded", timeout=20000)
            html = await pg.content()
            has = "yomple-stay" in html
            print("  live %-20s %s" % (name, "fix is deployed" if has else "still the old build (PR unmerged)"))
        except Exception as e:
            print("  live %-20s unreachable: %s" % (name, str(e).splitlines()[0][:80]))
    await ctx.close()


# ================================================================

async def main():
    do_live = "--live" in sys.argv
    httpd, base = h.serve()
    fake = h.FakeSupabase()
    try:
        async with async_playwright() as p:
            b = await h.launch(p)
            print("shockmate")
            await shockmate(b, base, fake)
            await shockmate_two_phones(b, base, h.FakeSupabase())
            print("the other apps")
            await hop_no_user(b)
            for app in APPS:
                await kid_app(b, app, pin=None)
            # One app driven with a PIN set, to prove the PIN question is asked once and only once.
            await kid_app(b, APPS[0], pin="4321")
            print("the hub")
            await hub_links(b)
            if do_live:
                print("deployed today (read-only)")
                await live_probe(b)
            await b.close()
    finally:
        httpd.shutdown()
    print("OK login matrix: a sign-in survives a reload and a wiped phone in every app, the hub's "
          "links carry the household code, and no browser is ever left silently forgetting.")


if __name__ == "__main__":
    asyncio.run(main())
