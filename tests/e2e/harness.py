"""Shared harness for the browser suites.

Serves web/ over http on a free port, launches Chromium at a phone viewport, seeds localStorage
before the app script runs, fails on any console error or page error, and answers every call to
Shockmate's Supabase project from an in-memory fake of the sm_* RPCs, and every call to the Yomple
household project from a fake of the two yomple_* RPCs Shockmate uses, so no suite ever touches a
real backend.

Browser: Google Chrome (channel "chrome") on Windows or with E2E_CHANNEL=chrome, the bundled
Chromium everywhere else (CI).
"""
import asyncio, copy, datetime, functools, http.server, json, os, pathlib, random, re, socketserver, sys, threading, time, uuid

WEB = pathlib.Path(__file__).resolve().parents[2] / "web"
SUPABASE = "**/*.supabase.co/**"
FONTS = re.compile(r"https://fonts\.(googleapis|gstatic)\.com/")
PHONE = {"width": 390, "height": 844}
COACH_PIN = "1234"


# ---------------------------------------------------------------- static server

class _Quiet(http.server.SimpleHTTPRequestHandler):
    extensions_map = dict(http.server.SimpleHTTPRequestHandler.extensions_map,
                          **{".wasm": "application/wasm", ".js": "text/javascript", ".json": "application/json",
                             ".webmanifest": "application/manifest+json", ".mp3": "audio/mpeg"})

    def log_message(self, *a):
        pass


class _Server(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True


def serve():
    httpd = _Server(("127.0.0.1", 0), functools.partial(_Quiet, directory=str(WEB)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, "http://127.0.0.1:%d/" % httpd.server_address[1]


# ---------------------------------------------------------------- fake Supabase

WORDS = "OAK|MAPLE|PINE|CEDAR|ELM|BIRCH|WILLOW|ASPEN|LAUREL|HOLLY"
CODE_RE = re.compile(r"^(%s)-[2-9A-HJKMNP-Z]{4}$" % WORDS)
FLEX_RE = re.compile(r"^(%s)([2-9A-HJKMNP-Z]{4})$" % WORDS)
YOMPLE_TABLES = ("hop_players", "bloom_players", "garden_players", "star_players", "field_players")


def _now_iso():
    return datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")


class FakeSupabase:
    """The sm_* RPCs, as supabase/migrations/0002, 0003 and 0005 define them, over plain dicts, plus
    Yomple's yomple_family_players / yomple_family_upsert over `yomple` (code -> {table: [rows]}).
    Contexts that share one instance share one backend, so two phones can see each other."""

    def __init__(self):
        self.families = {}   # code -> {name, players: {slot: {name, pin, progress}}}
        self.games = {}      # id -> row
        self.yomple = {}     # household code -> {table: [{username, display_name, ...}]}
        self.registered = [] # codes yomple_family_upsert was asked to register
        self.calls = []

    # -- helpers
    def _code(self, raw):
        m = FLEX_RE.match(re.sub(r"[^A-Za-z0-9]", "", str(raw or "")).upper())
        if not m:
            raise ValueError("bad family code")
        return m.group(1) + "-" + m.group(2)

    def household(self, code, names, table="hop_players"):
        """A Yomple household with these kids (display names), as the other apps made it."""
        self.yomple.setdefault(code, {}).setdefault(table, []).extend(
            {"username": n.lower(), "display_name": n, "avatar": "*", "family_code": code, "has_pin": False} for n in names)

    def _auth(self, body):
        code = self._code(body.get("p_code"))
        slot, pin = body.get("p_slot"), str(body.get("p_pin") or "")
        if slot not in (0, 1):
            raise ValueError("bad slot")
        if not re.match(r"^[0-9]{4}$", pin):
            raise ValueError("pin must be 4 digits")
        fam = self.families.get(code)
        player = fam and fam["players"].get(slot)
        if not player or player["pin"] != pin:
            return code, slot, "pin"
        return code, slot, "ok"

    def _json(self, g):
        return {k: g[k] for k in ("id", "white_slot", "black_slot", "inviter_slot", "fen", "status", "result",
                                  "ended_by", "updated_at", "created_at")} | {"moves": list(g["moves"]), "ply": len(g["moves"])}

    def _game(self, body, code, slot):
        g = self.games.get(body.get("p_id"))
        if not g or g["family"] != code or slot not in (g["white_slot"], g["black_slot"]):
            raise ValueError("no such game")
        return g

    def _touch(self, g, **kw):
        g.update(kw)
        g["updated_at"] = _now_iso()

    # -- the RPCs
    def sm_family_create(self, b):
        code = self._code(b.get("p_code"))
        kids = b.get("p_kids") or []
        if not 1 <= len(kids) <= 2:
            raise ValueError("one or two kids")
        for k in kids:
            if not (1 <= len(str(k.get("name") or "").strip()) <= 16) or not re.match(r"^[0-9]{4}$", str(k.get("pin") or "")):
                raise ValueError("bad kid")
        if code in self.families:
            return {"error": "taken"}
        self.families[code] = {"name": b.get("p_name") or "Family",
                               "players": {i: {"name": k["name"].strip(), "pin": k["pin"], "progress": {}} for i, k in enumerate(kids)}}
        return {"code": code}

    def sm_family_adopt(self, b):
        code, slot = self._code(b.get("p_code")), b.get("p_slot")
        name, pin = str(b.get("p_name") or "").strip(), str(b.get("p_pin") or "")
        if slot not in (0, 1) or not 1 <= len(name) <= 16 or not re.match(r"^[0-9]{4}$", pin):
            raise ValueError("bad adopt")
        fam = self.families.setdefault(code, {"name": "Family", "players": {}})
        if slot in fam["players"]:
            return {"error": "taken"}
        if any(p["name"].lower() == name.lower() for p in fam["players"].values()):
            return {"error": "name"}
        fam["players"][slot] = {"name": name, "pin": pin, "progress": {}}
        return {"code": code, "slot": slot, "name": name}

    # -- Yomple's two, as yomple/supabase/migrations/20260918000100_yomple_rpc_lockdown.sql defines them
    def yomple_family_players(self, b):
        if b.get("p_table") not in YOMPLE_TABLES:
            raise ValueError("unknown player table")
        code = str(b.get("p_code") or "").strip().upper()
        return list(self.yomple.get(code, {}).get(b["p_table"], [])) if CODE_RE.match(code) else []

    def yomple_family_upsert(self, b):
        code = str(b.get("p_code") or "").strip().upper()
        if not CODE_RE.match(code):
            return {"ok": False, "error": "code"}
        self.registered.append(code)
        self.yomple.setdefault(code, {})
        return {"ok": True, "family_code": code}

    def sm_family_roster(self, b):
        fam = self.families.get(self._code(b.get("p_code")))
        return [{"slot": s, "name": p["name"]} for s, p in sorted((fam or {"players": {}})["players"].items())]

    def sm_pull(self, b):
        code, slot, ok = self._auth(b)
        return {"error": ok} if ok != "ok" else self.families[code]["players"][slot]["progress"]

    def sm_push(self, b):
        code, slot, ok = self._auth(b)
        if ok != "ok":
            return {"error": ok}
        if not isinstance(b.get("p_progress"), dict):
            raise ValueError("progress must be an object")
        self.families[code]["players"][slot]["progress"] = copy.deepcopy(b["p_progress"])
        return {"updated_at": _now_iso()}

    def sm_rename(self, b):
        code, slot, ok = self._auth(b)
        if ok != "ok":
            return {"error": ok}
        self.families[code]["players"][slot]["name"] = str(b.get("p_name") or "").strip()[:16]
        return {"name": self.families[code]["players"][slot]["name"]}

    def sm_live_invite(self, b):
        code, slot, ok = self._auth(b)
        if ok != "ok":
            return {"error": ok}
        opp, white = b.get("p_opponent_slot"), b.get("p_white_slot")
        if opp == slot or white not in (slot, opp) or opp not in self.families[code]["players"]:
            raise ValueError("bad invite")
        for g in self.games.values():
            if g["family"] == code and g["status"] != "over":
                self._touch(g, status="over", result="replaced", ended_by=slot)
        gid, t = str(uuid.uuid4()), _now_iso()
        self.games[gid] = {"id": gid, "family": code, "white_slot": white, "black_slot": opp if white == slot else slot,
                           "inviter_slot": slot, "fen": None, "moves": [], "status": "invited", "result": None,
                           "ended_by": None, "updated_at": t, "created_at": t}
        return {"id": gid}

    def sm_live_list(self, b):
        code, slot, ok = self._auth(b)
        if ok != "ok":
            return {"error": ok}
        rows = [g for g in self.games.values()
                if g["family"] == code and g["status"] != "over" and slot in (g["white_slot"], g["black_slot"])]
        return [self._json(g) for g in sorted(rows, key=lambda g: g["updated_at"], reverse=True)]

    def sm_live_accept(self, b):
        code, slot, ok = self._auth(b)
        if ok != "ok":
            return {"error": ok}
        g = self._game(b, code, slot)
        if g["inviter_slot"] == slot:
            return {"error": "same"}
        if g["status"] == "invited":
            self._touch(g, status="active")
        return self._json(g)

    def sm_live_move(self, b):
        code, slot, ok = self._auth(b)
        if ok != "ok":
            return {"error": ok}
        g = self._game(b, code, slot)
        if g["status"] != "active":
            return {"error": "over", "game": self._json(g)}
        n = len(g["moves"])
        if b.get("p_ply") != n:
            return {"error": "ply", "game": self._json(g)}
        if (g["white_slot"] if n % 2 == 0 else g["black_slot"]) != slot:
            return {"error": "turn", "game": self._json(g)}
        g["moves"].append(b["p_uci"])
        self._touch(g, fen=b.get("p_fen") or g["fen"])
        return self._json(g)

    def sm_live_get(self, b):
        code, slot, ok = self._auth(b)
        return {"error": ok} if ok != "ok" else self._json(self._game(b, code, slot))

    def sm_live_end(self, b):
        code, slot, ok = self._auth(b)
        if ok != "ok":
            return {"error": ok}
        g = self._game(b, code, slot)
        if g["status"] != "over":
            self._touch(g, status="over", result=b.get("p_result"), ended_by=slot)
        return self._json(g)

    async def handle(self, route):
        req = route.request
        name = req.url.split("/rest/v1/rpc/")[-1].split("?")[0] if "/rest/v1/rpc/" in req.url else ""
        if req.method == "OPTIONS":
            return await route.fulfill(status=204, headers=_cors())
        try:
            body = json.loads(req.post_data or "{}")
        except ValueError:
            body = {}
        self.calls.append(name)
        fn = getattr(self, name, None) if name.startswith(("sm_", "yomple_")) else None
        if fn is None:
            # Anything that is not a known RPC is a table read the real projects refuse.
            return await route.fulfill(status=200, headers=_cors(), content_type="application/json", body="[]")
        try:
            out = fn(body)
            await route.fulfill(status=200, headers=_cors(), content_type="application/json", body=json.dumps(out))
        except ValueError as e:
            # PostgREST answers a raised exception with 400. The suites never trigger one on purpose,
            # so one showing up is an error the console check catches.
            await route.fulfill(status=400, headers=_cors(), content_type="application/json",
                                body=json.dumps({"code": "22023", "message": str(e)}))


def _cors():
    return {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS"}


# ---------------------------------------------------------------- browser

def channel():
    if os.environ.get("E2E_CHANNEL"):
        return os.environ["E2E_CHANNEL"] or None
    return "chrome" if os.name == "nt" else None


async def launch(p):
    ch = channel()
    return await (p.chromium.launch(channel=ch) if ch else p.chromium.launch())


DEFAULT_SETTINGS = {
    "names": ["Ada", "Ben"], "cap": 6, "sound": False, "readAloud": False, "coords": True, "coordsV2": True,
    "hurry": False, "profile": 0, "seats": 1,
    "parent": {"name": "Test", "pin": COACH_PIN},
    "family": {"code": "", "me": None, "pins": ["", ""], "roster": [], "skipped": True},
}


def settings_with(overrides=None):
    s = copy.deepcopy(DEFAULT_SETTINGS)
    for k, v in (overrides or {}).items():
        if isinstance(v, dict) and isinstance(s.get(k), dict):
            s[k] = dict(s[k], **v)
        else:
            s[k] = v
    return s


class Phone:
    """One browser context: one phone. `errors` collects console errors and page errors."""

    def __init__(self, ctx, page, base, errors):
        self.ctx, self.page, self.base, self.errors = ctx, page, base, errors
        self.ignore = []

    def url(self, query=""):
        return self.base + "index.html?fast=1" + ("&" + query if query else "")

    def check(self, where=""):
        bad = [e for e in self.errors if not any(re.search(p, e) for p in self.ignore)]
        assert not bad, (where, bad)


async def phone(browser, base, fake, settings=None, profiles=None, seed=True, service_workers="block",
                viewport=None, accept_downloads=False):
    """A new context with the Supabase fake and font stubs routed, storage seeded once per wipe."""
    ctx = await browser.new_context(viewport=viewport or PHONE, service_workers=service_workers,
                                    accept_downloads=accept_downloads)
    await ctx.route(SUPABASE, fake.handle)
    await ctx.route(FONTS, lambda route: route.fulfill(status=200, content_type="text/css", body=""))
    if seed:
        store = {"shockmate-v2:settings": json.dumps(settings_with(settings))}
        for i, p in enumerate(profiles or []):
            if p is not None:
                store["shockmate-v2:p%d" % i] = json.dumps(p)
        # Seeded only when storage is empty of the app's keys, so a reload keeps what the app saved.
        await ctx.add_init_script(
            "(() => { try { if (localStorage.getItem('shockmate-v2:settings')) return;"
            " const s = %s; for (const k in s) localStorage.setItem(k, s[k]); } catch (e) {} })();" % json.dumps(store))
    page = await ctx.new_page()
    page.set_default_timeout(15000)
    errors = []
    page.on("console", lambda m: errors.append("console: " + m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
    return Phone(ctx, page, base, errors)


# ---------------------------------------------------------------- app helpers

async def boot(ph, query=""):
    await ph.page.goto(ph.url(query))
    await ph.page.wait_for_function("() => !!window.__shockmate")


async def phase(pg, want, timeout=20000):
    await pg.wait_for_function("w => window.__shockmate && window.__shockmate.state.phase === w", arg=want, timeout=timeout)


async def screen(pg, sid, timeout=20000):
    await pg.wait_for_selector("#%s.active" % sid, timeout=timeout)


async def tap(pg, square):
    await pg.click('.sq[data-sq="%s"]' % square)


async def move(pg, uci):
    await tap(pg, uci[:2])
    await tap(pg, uci[2:4])


async def unlock_settings(pg, pin=COACH_PIN):
    await pg.click("#btn-settings")
    await screen(pg, "screen-gate")
    for d in pin:
        await pg.click('#keypad .key[data-key="%s"]' % d)
    await screen(pg, "screen-settings")


async def fam_pin(pg, pin):
    for d in pin:
        await pg.click('#fam-keypad button[data-fkey="%s"]' % d)


async def gate(pg, enc):
    """The why-gate: tap every target, land on the card."""
    await phase(pg, "gate")
    for s in enc["whyTargets"]["squares"]:
        await tap(pg, s)


async def look_first(pg):
    """If the look-first tap is up, answer it. Returns True when it was asked."""
    await pg.wait_for_function("() => ['threat', 'think'].includes(window.__shockmate.state.phase)", timeout=20000)
    if await pg.evaluate("window.__shockmate.state.phase") == "threat":
        target = await pg.evaluate("window.__shockmate.state.gate.targets[0]")
        await tap(pg, target)
        await phase(pg, "think")
        return True
    return False


async def flash_item(pg, wrong_first=False, wrong_control=False):
    """Answer whatever Flash item is up. Returns the item. One tap, or one chip.
    The control board (a random position, item["control"]) is a GONE tap like any other; with
    wrong_control it is missed all three times, and item["joke"] is the line Glitch owned up with."""
    await pg.wait_for_function("() => { const s = window.__shockmate.state;"
                               " return s.phase === 'flash' && s.gate && s.gate.flash; }")
    item = await pg.evaluate("window.__shockmate.state.gate.item")
    i = await pg.evaluate("window.__shockmate.state.flash.i")
    if item.get("control") and wrong_control:
        bad = [f + r for f in "abcdefgh" for r in "12345678" if f + r not in item["squares"]]
        for k in range(3):
            await tap(pg, bad[k])
        await pg.wait_for_function("n => { const s = window.__shockmate.state; return !s.flash || s.flash.i >= n; }", arg=i + 1)
        item["joke"] = await pg.text_content("#glitch-line")
        return item
    if wrong_first:
        if item["kind"] == "chip":
            bad = next(n for n in (1, 2, 3, 4) if n != item["count"])
            await pg.click('#flash-chips button[data-flash="%d"]' % bad)
        else:
            await tap(pg, next(f + r for f in "abcdefgh" for r in "12345678" if f + r not in item["squares"]))
        assert await pg.evaluate("window.__shockmate.state.phase") == "flash", "a wrong answer keeps the question up"
    if item["kind"] == "chip":
        await pg.click('#flash-chips button[data-flash="%d"]' % item["count"])
    else:
        await tap(pg, item["squares"][0])
    await pg.wait_for_function("n => { const s = window.__shockmate.state; return !s.flash || s.flash.i >= n; }", arg=i + 1)
    if item.get("control"):
        item["joke"] = await pg.text_content("#glitch-line")
    return item


async def flash_drill(pg, n, wrong_on=-1, wrong_control=False):
    """Answer n Flash items in a row. Returns the items."""
    return [await flash_item(pg, wrong_first=(i == wrong_on), wrong_control=wrong_control) for i in range(n)]


async def win_fight(pg, answer_look=True):
    """Whatever fight is up: look first if asked, best move, why-gate, card. Returns the fight."""
    if answer_look:
        await look_first(pg)
    await phase(pg, "think")
    enc = await pg.evaluate("window.__shockmate.current()")
    await move(pg, enc["best"])
    await gate(pg, enc)
    await pg.wait_for_function("() => ['card', 'duel', 'think', 'end'].includes(window.__shockmate.state.phase)", timeout=20000)
    return enc


def run(main):
    t0 = time.time()
    asyncio.run(main())
    print("   (%.1f s)" % (time.time() - t0))
