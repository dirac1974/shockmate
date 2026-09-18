#!/usr/bin/env python3
"""Phase 3: the family, the backup file, and the offline install.

  - Backup: win a card, save the file from Settings, wipe storage, restore it; a second restore
    merges rather than overwrites.
  - Family, one household code: the fake Yomple household CEDAR-Q7K2 already has Ada, Ben and Dad.
    Phone A types a wrong code (not found, with what a code looks like), then "cedar q7k2"; the
    roster comes from Yomple; Ada is new to Shockmate and makes a PIN, twice. Phone B arrives from
    yomple.com (?u=ben&from=yomple&f=CODE), Ben is marked, a mismatched PIN is refused, then he makes
    one. Phone C is Ada again: a wrong PIN is refused, the right one lets her in; a card won on C
    reaches A through Sync now. Nothing on the join path registers anything with Yomple.
  - Start a family: phone D has no code; the kids' names and PINs, a minted WORD-XXXX code that is
    made in Shockmate and registered with Yomple.
  - Offline: with the service worker installed and the network gone, a reload still loads every fight.
All Supabase traffic goes to harness.FakeSupabase; both phones share it.
Run: python tests/e2e/phase3_family.py
"""
import json, pathlib, tempfile

from playwright.async_api import async_playwright

import harness as h
from harness import phase


async def backup_and_offline(b, base, fake):
    ph = await h.phone(b, base, fake, service_workers="allow", accept_downloads=True)
    pg = ph.page
    await h.boot(ph)
    online_count = await pg.evaluate("window.SHOCKMATE_ENCOUNTERS.length")

    # With no family, Settings offers "Set up this phone" and the backup still works.
    await h.unlock_settings(pg)
    assert await pg.is_visible("#family-off") and await pg.is_hidden("#family-on")
    assert await pg.is_visible("#btn-export")
    await pg.click("#btn-close-settings")

    await pg.click("#btn-start")
    enc = await h.win_fight(pg)
    await phase(pg, "card")
    assert enc["id"] in await pg.evaluate("Object.keys(window.__shockmate.state.stats.cardsEarned)")

    await pg.click("#btn-home")
    await h.unlock_settings(pg)
    async with pg.expect_download() as dl_info:
        await pg.click("#btn-export")
    download = await dl_info.value
    saved = pathlib.Path(tempfile.gettempdir()) / "shockmate-e2e-backup.json"
    await download.save_as(saved)
    blob = json.loads(saved.read_text())
    assert blob["app"] == "shockmate" and enc["id"] in blob["profiles"][0]["cardsEarned"], "the card is in the file"
    assert blob["parent"]["pin"] == h.COACH_PIN, "the coach rides in the file"

    # Wipe the device the way iOS eviction would. The harness re-seeds settings, not cards.
    await pg.evaluate("localStorage.clear()")
    await pg.reload()
    await pg.wait_for_function("() => !!window.__shockmate")
    assert await pg.evaluate("Object.keys(window.__shockmate.state.stats.cardsEarned).length") == 0, "storage really was wiped"
    await h.unlock_settings(pg)
    await pg.set_input_files("#file-import", str(saved))
    await pg.wait_for_function("id => Object.keys(window.__shockmate.state.stats.cardsEarned).includes(id)", arg=enc["id"])

    # A restore merges: a card won after the backup survives restoring it again.
    await pg.evaluate("() => { window.__shockmate.state.stats.cardsEarned['zz'] = { critical: false, tries: 1, t: Date.now() }; }")
    await pg.set_input_files("#file-import", str(saved))
    await pg.wait_for_timeout(500)
    after = await pg.evaluate("Object.keys(window.__shockmate.state.stats.cardsEarned)")
    assert "zz" in after and enc["id"] in after, after
    await pg.click("#btn-close-settings")

    # Installable and offline: the service worker takes over, then the network goes away.
    await pg.evaluate("() => navigator.serviceWorker.ready")
    await pg.reload()
    await pg.wait_for_function("() => !!window.__shockmate && !!navigator.serviceWorker.controller")
    manifest = await pg.evaluate("() => document.querySelector('link[rel=manifest]').href")
    assert manifest.endswith("manifest.webmanifest"), manifest
    await ph.ctx.set_offline(True)
    await pg.reload()
    await pg.wait_for_function("() => !!window.__shockmate", timeout=20000)
    assert await pg.evaluate("window.SHOCKMATE_ENCOUNTERS.length") == online_count, "every fight loads offline"
    await pg.click("#btn-start")
    await h.win_fight(pg)
    await phase(pg, "card")
    await ph.ctx.set_offline(False)
    ph.check("backup/offline")
    await ph.ctx.close()


async def roster_names(pg):
    return await pg.eval_on_selector_all("#fam-roster button[data-pick]", "els => els.map(e => e.textContent)")


async def family(b, base, fake):
    code = "CEDAR-Q7K2"
    # The household the other Yomple apps already made: Ada in two apps, Ben and Dad in one, and a
    # placeholder player that is not a kid.
    fake.household(code, ["Ada", "Ben", "Dad", "Player 1"], "hop_players")
    fake.household(code, ["Ada"], "garden_players")
    fresh = {"names": ["Player 1", "Player 2"], "family": {"skipped": False}}

    # Phone A: first launch leads with the code box. A wrong code first, then his, typed loosely.
    a = await h.phone(b, base, fake, settings=fresh)
    await h.boot(a)
    pa = a.page
    await h.screen(pa, "screen-family")
    assert await pa.is_visible("#fam-choose") and await pa.is_visible("#fam-code-input")
    assert "same one your other apps use" in (await pa.text_content("#fam-choose"))
    assert "No code yet? Start a family" in (await pa.text_content("#btn-fam-new"))
    await pa.fill("#fam-code-input", "cedar q7k3")
    await pa.click("#btn-fam-find")
    await pa.wait_for_function("() => /No family has that code/.test(document.getElementById('fam-state').textContent)")
    assert "Codes look like MAPLE-K7Q2" in (await pa.text_content("#fam-state"))
    await pa.fill("#fam-code-input", "cedar q7k2")
    assert await pa.input_value("#fam-code-input") == "cedar q7k2", "the box takes the whole code, space and all"
    await pa.click("#btn-fam-find")
    await pa.wait_for_selector("#fam-pick:not([hidden])")
    assert await roster_names(pa) == ["Ada", "Ben", "Dad"], await roster_names(pa)
    assert await pa.is_visible("#fam-roster button[data-other]"), "Someone else is always offered"
    # Ada is new to Shockmate: she makes a PIN, twice.
    await pa.click('#fam-roster button[data-pick="0"]')
    await pa.wait_for_function("() => document.getElementById('fam-pin-title').textContent === 'Ada, pick a secret PIN'")
    await h.fam_pin(pa, "1111")
    await pa.wait_for_function("() => document.getElementById('fam-pin-title').textContent === 'Ada, type it again'")
    await h.fam_pin(pa, "1111")
    await h.screen(pa, "screen-title")
    assert fake.families[code]["players"] == {0: {"name": "Ada", "pin": "1111", "progress": fake.families[code]["players"][0]["progress"]}}
    fam_a = await pa.evaluate("window.__shockmate.state.settings.family")
    assert fam_a["code"] == code and fam_a["me"] == 0 and fam_a["pins"] == ["1111", ""], fam_a

    # Phone B comes from yomple.com as Ben: the roster opens with Ada (in Shockmate) first and Ben marked.
    bph = await h.phone(b, base, fake, settings=fresh)
    await h.boot(bph, "u=ben&from=yomple&f=" + code)
    pb = bph.page
    await pb.wait_for_selector("#fam-pick:not([hidden])")
    assert await roster_names(pb) == ["Ada", "Ben", "Dad"], await roster_names(pb)
    assert await pb.get_attribute('#fam-roster button[data-pick="0"]', "data-slot") == "0", "Ada has a Shockmate slot now"
    assert "me" in (await pb.get_attribute('#fam-roster button[data-pick="1"]', "class")), "the hub's kid is marked"
    await pb.click('#fam-roster button[data-pick="1"]')
    await pb.wait_for_function("() => document.getElementById('fam-pin-title').textContent === 'Ben, pick a secret PIN'")
    await h.fam_pin(pb, "2222")
    await h.fam_pin(pb, "2223")
    await pb.wait_for_function("() => /did not match/.test(document.getElementById('fam-state').textContent)")
    await h.fam_pin(pb, "2222")
    await pb.wait_for_function("() => document.getElementById('fam-pin-title').textContent === 'Ben, type it again'")
    await h.fam_pin(pb, "2222")
    await h.screen(pb, "screen-title")
    assert fake.families[code]["players"][1]["name"] == "Ben" and fake.families[code]["players"][1]["pin"] == "2222"
    fam_b = await pb.evaluate("window.__shockmate.state.settings.family")
    assert fam_b["code"] == code and fam_b["me"] == 1 and fam_b["pins"] == ["", "2222"], fam_b
    assert await pb.evaluate("window.__shockmate.state.settings.profile") == 1
    assert await pb.evaluate("window.__shockmate.state.settings.names") == ["Ada", "Ben"], "the roster names the kids"
    assert await pb.is_visible("#live-row"), "two kids in Shockmate: two-phone play is offered"

    # Phone C: Ada again, on a second phone. She already has a Shockmate PIN: wrong, then right.
    cph = await h.phone(b, base, fake, settings=fresh)
    await h.boot(cph, "family=" + code.lower())
    pc = cph.page
    await pc.wait_for_selector("#fam-pick:not([hidden])")
    await pc.click('#fam-roster button[data-slot="0"]')
    await pc.wait_for_function("() => document.getElementById('fam-pin-title').textContent === 'Ada, type your PIN'")
    await h.fam_pin(pc, "9999")
    await pc.wait_for_function("() => /Not that one/.test(document.getElementById('fam-state').textContent)")
    assert await pc.evaluate("window.__shockmate.state.settings.family.code") == "", "a wrong PIN joins nothing"
    await h.fam_pin(pc, "1111")
    await h.screen(pc, "screen-title")
    fam_c = await pc.evaluate("window.__shockmate.state.settings.family")
    assert fam_c["code"] == code and fam_c["me"] == 0 and fam_c["pins"] == ["1111", ""], fam_c
    assert fake.registered == [], "joining never registers anything with Yomple"

    # A card Ada wins on C reaches A.
    await pc.click("#btn-start")
    enc = await h.win_fight(pc)
    await phase(pc, "card")
    await pc.click("#btn-home")
    await h.unlock_settings(pc)
    assert code in (await pc.text_content("#family-code"))
    await pc.click("#btn-sync")
    await pc.wait_for_function("() => /Last synced/.test(document.getElementById('sync-state').textContent)")
    assert enc["id"] in fake.families[code]["players"][0]["progress"].get("cardsEarned", {}), "C pushed the card"
    await h.unlock_settings(pa)
    await pa.click("#btn-sync")
    await pa.wait_for_function("id => !!window.__shockmate.state.profiles[0].cardsEarned[id]", arg=enc["id"])
    assert await pb.evaluate("Object.keys(window.__shockmate.state.profiles[1].cardsEarned).length") == 0, "Ben's cards are Ben's"
    for ph, who in ((a, "A"), (bph, "B"), (cph, "C")):
        ph.check("family " + who)
        await ph.ctx.close()

    # No code yet: start a family. The phone mints a household code, checks Yomple has no such
    # household, makes the family, and registers the code with Yomple.
    d = await h.phone(b, base, fake, settings=fresh)
    await h.boot(d)
    pd = d.page
    await h.screen(pd, "screen-family")
    await pd.click("#btn-fam-new")
    await pd.fill("#fam-name-0", "Cy")
    await pd.fill("#fam-name-1", "Di")
    await pd.click("#btn-fam-names-go")
    for who, pin in (("Cy", "3333"), ("Di", "4444")):
        await pd.wait_for_function("w => document.getElementById('fam-pin-title').textContent === w + ', pick a secret PIN'", arg=who)
        await h.fam_pin(pd, pin)
        await pd.wait_for_function("w => document.getElementById('fam-pin-title').textContent === w + ', type it again'", arg=who)
        await h.fam_pin(pd, pin)
    await pd.wait_for_selector("#fam-code-card:not([hidden])")
    new_code = (await pd.text_content("#fam-code-big")).strip()
    assert h.CODE_RE.match(new_code), new_code
    assert new_code in fake.families and [p["name"] for p in fake.families[new_code]["players"].values()] == ["Cy", "Di"]
    for _ in range(50):
        if new_code in fake.registered:
            break
        await pd.wait_for_timeout(100)
    assert fake.registered == [new_code], ("the minted code is registered with Yomple", fake.registered)
    assert await pd.is_visible("#fam-me-row"), "two kids: the phone asks who it plays as"
    await pd.click("#btn-fam-done")
    await h.screen(pd, "screen-title")
    fam_d = await pd.evaluate("window.__shockmate.state.settings.family")
    assert fam_d["code"] == new_code and fam_d["me"] == 0 and fam_d["pins"] == ["3333", "4444"], fam_d
    assert await pd.is_visible("#live-row"), "two kids joined: two-phone play is offered"
    d.check("start a family")
    await d.ctx.close()


async def main():
    httpd, base = h.serve()
    fake = h.FakeSupabase()
    try:
        async with async_playwright() as p:
            b = await h.launch(p)
            await backup_and_offline(b, base, fake)
            await family(b, base, fake)
            await b.close()
    finally:
        httpd.shutdown()
    print("OK e2e phase3: backup save/restore round trip and merge; join by Yomple household code (not found, roster "
          "from Yomple, new kid makes a PIN, hub link marks the kid, existing kid's wrong PIN refused then right); a card "
          "won on C reaches A by sync; start a family mints and registers a code; offline reload loads every fight")


h.run(main)
