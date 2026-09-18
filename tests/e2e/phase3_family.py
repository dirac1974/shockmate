#!/usr/bin/env python3
"""Phase 3: the family, the backup file, and the offline install.

  - Backup: win a card, save the file from Settings, wipe storage, restore it; a second restore
    merges rather than overwrites.
  - Family: phone A makes a new family (two kids, a PIN each, typed twice) and shows the code;
    phone B opens ?family=CODE, picks the other kid, a wrong PIN is refused and the right one lets
    him in; a card won on B reaches A through Sync now.
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


async def family(b, base, fake):
    a = await h.phone(b, base, fake, settings={"names": ["Player 1", "Player 2"], "family": {"skipped": False}})
    await h.boot(a)
    pa = a.page
    # First launch: the one-tap setup card.
    await h.screen(pa, "screen-family")
    assert await pa.is_visible("#fam-choose")
    await pa.click("#btn-fam-new")
    await pa.fill("#fam-name-0", "Ada")
    await pa.fill("#fam-name-1", "Ben")
    await pa.click("#btn-fam-names-go")
    for who, pin in (("Ada", "1111"), ("Ben", "2222")):
        await pa.wait_for_function("w => document.getElementById('fam-pin-title').textContent.startsWith(w + ', pick')", arg=who)
        await h.fam_pin(pa, pin)
        await pa.wait_for_function("w => document.getElementById('fam-pin-title').textContent.startsWith(w + ', type it again')", arg=who)
        await h.fam_pin(pa, pin)
    await pa.wait_for_selector("#fam-code-card:not([hidden])")
    code = (await pa.text_content("#fam-code-big")).strip()
    assert code in fake.families, (code, list(fake.families))
    assert [p["name"] for p in fake.families[code]["players"].values()] == ["Ada", "Ben"]
    assert await pa.is_visible("#fam-me-row"), "two kids: the phone asks who it plays as"
    await pa.click("#btn-fam-done")
    await h.screen(pa, "screen-title")
    fam_a = await pa.evaluate("window.__shockmate.state.settings.family")
    assert fam_a["code"] == code and fam_a["me"] == 0 and fam_a["pins"] == ["1111", "2222"], fam_a
    assert await pa.is_visible("#live-row"), "two kids joined: two-phone play is offered"

    # Phone B opens the share link, picks Ben, gets the PIN wrong, then right.
    bph = await h.phone(b, base, fake, settings={"names": ["Player 1", "Player 2"], "family": {"skipped": False}})
    await h.boot(bph, "family=" + code)
    pb = bph.page
    await pb.wait_for_selector("#fam-pick:not([hidden])")
    names = await pb.eval_on_selector_all("#fam-roster button", "els => els.map(e => e.textContent)")
    assert names == ["Ada", "Ben"], names
    await pb.click('#fam-roster button[data-pick="1"]')
    await pb.wait_for_selector("#fam-pin:not([hidden])")
    await h.fam_pin(pb, "9999")
    await pb.wait_for_function("() => /Not that one/.test(document.getElementById('fam-state').textContent)")
    assert await pb.evaluate("window.__shockmate.state.settings.family.code") == "", "a wrong PIN joins nothing"
    await h.fam_pin(pb, "2222")
    await h.screen(pb, "screen-title")
    fam_b = await pb.evaluate("window.__shockmate.state.settings.family")
    assert fam_b["code"] == code and fam_b["me"] == 1 and fam_b["pins"] == ["", "2222"], fam_b
    assert await pb.evaluate("window.__shockmate.state.settings.profile") == 1
    assert await pb.evaluate("window.__shockmate.state.settings.names") == ["Ada", "Ben"], "the roster names the kids"

    # A card Ben wins on B reaches A.
    await pb.click("#btn-start")
    enc = await h.win_fight(pb)
    await phase(pb, "card")
    await pb.click("#btn-home")
    await h.unlock_settings(pb)
    assert code in (await pb.text_content("#family-code"))
    await pb.click("#btn-sync")
    await pb.wait_for_function("() => /Last synced/.test(document.getElementById('sync-state').textContent)")
    assert enc["id"] in fake.families[code]["players"][1]["progress"].get("cardsEarned", {}), "B pushed the card"
    assert await pa.evaluate("id => !window.__shockmate.state.profiles[1].cardsEarned[id]", enc["id"]), "not on A yet"
    await h.unlock_settings(pa)
    await pa.click("#btn-sync")
    await pa.wait_for_function("id => !!window.__shockmate.state.profiles[1].cardsEarned[id]", arg=enc["id"])
    assert await pa.evaluate("Object.keys(window.__shockmate.state.profiles[0].cardsEarned).length") == 0, "Ada's cards are Ada's"
    a.check("family A")
    bph.check("family B")
    await a.ctx.close()
    await bph.ctx.close()


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
    print("OK e2e phase3: backup save/restore round trip and merge; new family -> code; second phone joins by link, "
          "wrong PIN refused then right; a card won on B reaches A by sync; offline reload loads every fight")


h.run(main)
