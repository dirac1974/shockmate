#!/usr/bin/env python3
"""Phase 4: the modes that are more than one fight.

  - Flash: six board-vision items from the map chip, one tap or one chip each, a wrong answer that
    does not end the item, the debrief and the chip reading "done today".
  - Camp: two Flash boards, two spot-the-attack warm-ups, four fights, two counters from the defence
    pack, the debrief, and the chip reading "done today".
  - Play vs Sleepy with the real WASM engine: the kid (python-chess, three plies of alpha-beta on material) hangs a
    piece on purpose, then plays to Glitch's resignation or to mate; the move he hung comes back as a
    game fight, played through to a card.
  - Versus on one phone: fool's mate between the two kids, two result cards.
  - Two phones live over the fake RPCs: invite, accept, moves both ways, resign, one card per phone.
  - Tournament week: the look-first tap before a fight, wrong then right.
Run: python tests/e2e/phase4_modes.py
"""
import random, time

import chess
from playwright.async_api import async_playwright

import harness as h
from harness import move, phase, tap

ENGINE_MS = 90000           # the first boot of the WASM engine on a CI runner
GAME_S = 300
VALUE = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9, chess.KING: 0}


# ---------------------------------------------------------------- a small, honest opponent for Sleepy

def material(board):
    return sum(VALUE[p.piece_type] * (1 if p.color == chess.WHITE else -1) for p in board.piece_map().values())


def reply_score(board):
    """White's material after Black's best reply (one ply), mates counted."""
    if board.is_checkmate():
        return 1000
    if board.is_game_over():
        return -50
    worst = None
    for m in board.legal_moves:
        board.push(m)
        s = -1000 if board.is_checkmate() else material(board)
        board.pop()
        worst = s if worst is None else min(worst, s)
    return worst


def negamax(board, depth, alpha, beta):
    """Alpha-beta over material from the side to move; mates beat everything, draws are worth -50."""
    if board.is_checkmate():
        return -1000 - depth
    if board.is_stalemate() or board.is_insufficient_material() or board.is_repetition(2):
        return -50 if board.turn == chess.WHITE else 50
    if depth == 0:
        return material(board) * (1 if board.turn == chess.WHITE else -1)
    moves = sorted(board.legal_moves, key=lambda m: (not board.is_capture(m), not board.gives_check(m)))
    best = -10000
    for m in moves:
        board.push(m)
        v = -negamax(board, depth - 1, -beta, -alpha)
        board.pop()
        if v > best:
            best = v
        alpha = max(alpha, v)
        if alpha >= beta:
            break
    return best


def best_move(board, rng):
    """Three plies of alpha-beta: enough to take what Sleepy leaves and never walk into a short mate."""
    scored = []
    for m in board.legal_moves:
        board.push(m)
        s = -negamax(board, 2, -10000, 10000) + rng.random() * 0.1
        board.pop()
        scored.append((s, m))
    return max(scored, key=lambda x: x[0])[1]


def hanging_move(board):
    """A quiet piece move (no pawn, king, capture, castle or promotion) that loses at least a knight."""
    base = material(board)
    for m in sorted(board.legal_moves, key=lambda m: m.uci()):
        piece = board.piece_at(m.from_square)
        if piece.piece_type in (chess.PAWN, chess.KING) or board.is_capture(m) or board.is_castling(m) or m.promotion:
            continue
        board.push(m)
        if not board.is_check() and reply_score(board) <= base - 3:
            board.pop()
            return m
        board.pop()
    return None


def ucis(board, m):
    return m.uci()[:4]


# ---------------------------------------------------------------- suites

async def flash(b, base, fake):
    """The Flash chip: six items, one tap or one chip each, a wrong answer that does not end it,
    the debrief, and the once-a-day counter on the map."""
    ph = await h.phone(b, base, fake)
    pg = ph.page
    await h.boot(ph)
    assert "2 minutes" in (await pg.text_content('.day-chip[data-day="-2"]'))
    await pg.click('.day-chip[data-day="-2"]')
    await pg.wait_for_function("() => !!window.__shockmate.state.flash")
    plan = await pg.evaluate("() => { const f = window.__shockmate.state.flash;"
                             " return { n: f.items.length, types: f.items.map(i => i.type), reveal: f.revealMs,"
                             " kinds: f.items.map(i => i.kind), ids: f.items.map(i => i.encId) }; }")
    assert plan["n"] == 6, plan
    assert len(set(plan["ids"])) == 6, ("no board is asked about twice", plan)
    assert "imagine" not in plan["types"], ("the hard rung is shut on a fresh profile", plan)
    assert plan["types"].count("gone") >= 2, plan
    assert plan["reveal"] == 5000, plan
    # The reveal window really is a window: the board goes up, then it goes away.
    await pg.wait_for_function("() => Object.keys(window.__shockmate.state.pieces).length > 4")
    assert not await pg.is_hidden("#flash-ring"), "the ring counts the reveal down without a digit"
    items = await h.flash_drill(pg, 6, wrong_on=1)
    await pg.wait_for_selector("#session-end:not([hidden])")
    assert "Flash done" in (await pg.text_content("#end-title"))
    st = await pg.evaluate("window.__shockmate.state.stats.flash")
    assert st["items"] == 6, st
    assert st["correct"] == 5, ("one wrong answer, honestly counted", st)
    assert st["byType"]["gone"]["items"] >= 2, st
    await pg.click("#btn-end-ok")
    await h.screen(pg, "screen-title")
    assert "done today" in (await pg.text_content('.day-chip[data-day="-2"]'))
    ph.check("flash")
    await ph.ctx.close()
    return [i["type"] for i in items]


async def camp(b, base, fake):
    ph = await h.phone(b, base, fake)
    pg = ph.page
    await h.boot(ph)
    await pg.click('.day-chip[data-day="-1"]')
    await pg.wait_for_function("() => !!window.__shockmate.state.camp")
    plan = await pg.evaluate("() => { const p = window.__shockmate.state.camp.plan;"
                             " return { flash: p.flash.length, warm: p.warmups.length, fights: p.fights.length,"
                             " counters: p.counters.map(e => e.pack), ids: p.all.map(e => e.id) }; }")
    assert plan["flash"] == 2 and plan["warm"] == 2 and plan["fights"] == 4 and len(plan["counters"]) == 2, plan
    assert plan["counters"] == ["defence", "defence"], ("counters come from the defence pack", plan)
    assert len(set(plan["ids"])) == len(plan["ids"]), ("no board appears twice in a camp", plan)
    # The warm-up is two flash boards, then two spot-the-attack boards. Same minutes, two kinds of looking.
    await h.flash_drill(pg, plan["flash"])
    for i in range(plan["warm"]):
        await pg.wait_for_function("() => { const s = window.__shockmate.state; return s.phase === 'threat' && s.gate && s.gate.camp; }")
        assert ("SPOT THE ATTACK  %d/%d" % (i + 1, plan["warm"])) in (await pg.text_content("#banner"))
        targets = await pg.evaluate("window.__shockmate.state.gate.targets")
        for t in targets:
            await tap(pg, t)
        await pg.wait_for_function("n => window.__shockmate.state.camp.w === n", arg=i + 1)
    stages = []
    for i in range(plan["fights"] + len(plan["counters"])):
        await h.win_fight(pg)
        await phase(pg, "card")
        stages.append(await pg.evaluate("window.__shockmate.state.camp.stage"))
        await pg.click("#btn-next")
    assert stages == ["fights"] * plan["fights"] + ["counter"] * len(plan["counters"]), stages
    await pg.wait_for_selector("#session-end:not([hidden])")
    assert "Camp done" in (await pg.text_content("#end-title"))
    assert await pg.is_visible("#end-say"), "the debrief ends on the line to say tomorrow"
    camp_stats = await pg.evaluate("window.__shockmate.state.stats.threats")
    assert camp_stats and camp_stats.get("asked", camp_stats.get("targets", 1)), camp_stats
    flash_stats = await pg.evaluate("window.__shockmate.state.stats.flash")
    assert flash_stats and flash_stats["items"] == plan["flash"], ("camp's flash items are counted too", flash_stats)
    await pg.click("#btn-end-ok")
    await h.screen(pg, "screen-title")
    assert "done today" in (await pg.text_content('.day-chip[data-day="-1"]'))
    ph.check("camp")
    await ph.ctx.close()


async def play_sleepy(b, base, fake):
    ph = await h.phone(b, base, fake)
    pg = ph.page
    await h.boot(ph)
    await pg.click("#btn-play")
    await h.screen(pg, "screen-pregame")
    await pg.wait_for_function("() => !document.getElementById('btn-play-go').disabled", timeout=ENGINE_MS)
    await pg.click('#level-row button[data-level="sleepy"]')
    assert "Sleepy" in (await pg.text_content("#btn-play-go"))
    await pg.click("#btn-play-go")
    await h.screen(pg, "screen-play")

    rng, kid_moves, hung = random.Random(7), 0, []
    t0 = time.time()
    while True:
        assert time.time() - t0 < GAME_S, "the game against Sleepy did not end in time"
        await pg.wait_for_function("() => { const s = window.__shockmate.state;"
                                   " return document.getElementById('screen-gameover').classList.contains('active')"
                                   " || (s.game && s.phase === 'think' && s.game.chess.turn() === 'w'); }", timeout=ENGINE_MS)
        if await pg.is_visible("#screen-gameover.active"):
            break
        board = chess.Board(await pg.evaluate("window.__shockmate.state.game.chess.fen()"))
        m = hanging_move(board) if kid_moves == 2 else None
        if m:
            hung.append(m.uci())
        else:
            m = best_move(board, rng)
        await move(pg, ucis(board, m))
        kid_moves += 1
        await pg.wait_for_function("n => { const s = window.__shockmate.state; return !s.game || s.game.moves >= n; }", arg=kid_moves)
    assert hung, "the kid never found a piece to hang"
    title = await pg.text_content("#over-title")
    assert "YOU WIN" in title, ("the kid beats Sleepy", title, kid_moves)
    games = await pg.evaluate("window.__shockmate.state.stats.games")
    assert games["played"] == 1 and games["wins"] == 1, games
    fights = await pg.evaluate("window.__shockmate.state.stats.gameFights || []")
    assert fights, ("the hung piece became a game fight", hung)
    assert await pg.is_visible("#btn-review"), "the moment it turned is offered"
    await pg.click("#btn-review")
    await h.screen(pg, "screen-review", 30000)
    await pg.click("#btn-fight-now")
    # "Fight it now" runs every board the game made, in order, then goes home.
    await phase(pg, "think")
    boards = await pg.evaluate("window.__shockmate.state.encounters.length")
    for _ in range(boards):
        enc = await h.win_fight(pg)
        await phase(pg, "card")
        assert enc["id"] in [f["id"] for f in fights], (enc["id"], [f["id"] for f in fights])
        assert await pg.evaluate("id => !!window.__shockmate.state.stats.cardsEarned[id]", enc["id"]), "the game fight earns a card"
        await pg.click("#btn-next")
    await h.screen(pg, "screen-title")
    await pg.click("#btn-collection")
    rooms = await pg.eval_on_selector_all("#palace-rooms h3", "els => els.map(e => e.textContent)")
    assert "Your games" in rooms, rooms
    ph.check("play")
    await ph.ctx.close()
    return kid_moves, " ".join(hung), title


async def versus_one_phone(b, base, fake):
    ph = await h.phone(b, base, fake)
    pg = ph.page
    await h.boot(ph)
    await pg.click("#seat-2")
    await pg.click("#btn-versus")
    await h.screen(pg, "screen-versus-pre")
    await pg.wait_for_function("() => !document.getElementById('btn-vs-go').disabled", timeout=ENGINE_MS)
    white = await pg.text_content("#vs-white-name")
    await pg.click("#btn-vs-go")
    for n, uci in enumerate(["f2f3", "e7e5", "g2g4", "d8h4"]):
        await pg.wait_for_function("n => { const s = window.__shockmate.state; return s.game && s.phase === 'think' && s.game.chess.history().length === n; }", arg=n)
        assert await pg.evaluate("window.__shockmate.state.flip") == (n % 2 == 1), "the board turns to whoever moves"
        await move(pg, uci)
    await h.screen(pg, "screen-versus-over")
    assert "CHECKMATE" in (await pg.text_content("#vs-over-title"))
    cards = await pg.eval_on_selector_all("#vs-cards .vs-card .mascot", "els => els.map(e => e.textContent)")
    assert sorted(cards) == ["Ada", "Ben"], cards
    played = await pg.evaluate("window.__shockmate.state.profiles.map(p => (p.versus || {}).played || 0)")
    assert played == [1, 1], played
    await pg.click("#btn-vs-done")
    await h.screen(pg, "screen-title")
    ph.check("versus")
    await ph.ctx.close()
    return white


async def live_two_phones(b, base, fake):
    code = "ABCDEFGH"
    fake.families[code] = {"name": "Family", "players": {0: {"name": "Ada", "pin": "1111", "progress": {}},
                                                         1: {"name": "Ben", "pin": "2222", "progress": {}}}}
    roster = [{"slot": 0, "name": "Ada"}, {"slot": 1, "name": "Ben"}]
    a = await h.phone(b, base, fake, settings={"family": {"code": code, "me": 0, "pins": ["1111", "2222"], "roster": roster}})
    bb = await h.phone(b, base, fake, settings={"profile": 1, "family": {"code": code, "me": 1, "pins": ["", "2222"], "roster": roster}})
    pa, pb = a.page, bb.page
    await h.boot(a)
    await h.boot(bb)
    await pa.wait_for_selector("#live-row:not([hidden])")
    assert "Ben" in (await pa.text_content("#btn-live-invite"))
    await pa.click("#btn-live-invite")
    await phase(pa, "wait", ENGINE_MS)
    assert "Waiting for Ben" in (await pa.text_content("#prompt"))
    await pb.wait_for_selector("#live-invite:not([hidden])", timeout=20000)   # the home poller runs every 5 s
    await pb.click("#btn-live-accept")
    colours = {}
    for pg in (pa, pb):
        await pg.wait_for_function("() => { const g = window.__shockmate.state.game; return g && g.live && g.status === 'active'; }", timeout=ENGINE_MS)
        colours[await pg.evaluate("window.__shockmate.state.game.colour")] = pg
    assert set(colours) == {"w", "b"}, colours
    assert await colours["b"].evaluate("window.__shockmate.state.flip") is True, "Black's phone has Black at the bottom"
    for n, uci in enumerate(["e2e4", "e7e5", "g1f3"]):
        mover = colours["w" if n % 2 == 0 else "b"]
        await mover.wait_for_function("n => { const s = window.__shockmate.state; return s.game && s.phase === 'think' && s.game.chess.history().length === n; }", arg=n, timeout=20000)
        await move(mover, uci)
    for pg in (pa, pb):
        await pg.wait_for_function("() => { const g = window.__shockmate.state.game; return g && g.chess.history().length === 3; }", timeout=20000)
    game = next(iter(fake.games.values()))
    assert game["moves"] == ["e2e4", "e7e5", "g1f3"], game["moves"]
    await colours["b"].click("#btn-resign")
    for pg in (pa, pb):
        await h.screen(pg, "screen-versus-over", 20000)
        assert "RESIGNED" in (await pg.text_content("#vs-over-title"))
        assert await pg.eval_on_selector_all("#vs-cards .vs-card", "els => els.length") == 1, "one card per phone"
    assert await pa.text_content("#vs-cards .mascot") == "Ada" and await pb.text_content("#vs-cards .mascot") == "Ben"
    assert game["status"] == "over" and game["result"] == "resign", game
    a.check("live A")
    bb.check("live B")
    await a.ctx.close()
    await bb.ctx.close()


async def look_first(b, base, fake):
    ph = await h.phone(b, base, fake, settings={"tournament": True})
    pg = ph.page
    await h.boot(ph)
    fid = await pg.evaluate("window.SHOCKMATE_ENCOUNTERS.filter(e => !e.generated)"
                            ".find(e => window.ShockmateFutures.threatTargets(e).length > 0).id")
    await pg.evaluate("""id => {
        const m = window.__shockmate, s = m.state;
        s.encounters = [m.all.find(x => x.id === id)]; s.index = 0; m.startEncounter();
    }""", fid)
    await pg.wait_for_function("() => { const s = window.__shockmate.state; return s.phase === 'threat' && s.gate && s.gate.look; }")
    assert "LOOK FIRST" in (await pg.text_content("#banner"))
    targets = await pg.evaluate("window.__shockmate.state.gate.targets")
    wrong = next(f + r for f in "abcdefgh" for r in "12345678" if f + r not in targets)
    await tap(pg, wrong)
    assert await pg.evaluate("window.__shockmate.state.phase") == "threat", "a wrong tap keeps the question up"
    assert await pg.evaluate("window.__shockmate.state.gate.wrong") == 1
    await tap(pg, targets[0])
    await phase(pg, "think")
    assert await pg.is_visible("#ritual"), "tournament week puts the two questions in front of the move"
    threats = await pg.evaluate("window.__shockmate.state.stats.threats")
    assert threats, threats
    enc = await pg.evaluate("window.__shockmate.current()")
    await move(pg, enc["best"])
    await h.gate(pg, enc)
    await phase(pg, "card")
    ph.check("look-first")
    await ph.ctx.close()
    return fid


async def main():
    httpd, base = h.serve()
    fake = h.FakeSupabase()
    try:
        async with async_playwright() as p:
            b = await h.launch(p)
            types = await flash(b, base, fake)
            await camp(b, base, fake)
            fid = await look_first(b, base, fake)
            white = await versus_one_phone(b, base, fake)
            await live_two_phones(b, base, fake)
            n, hung, title = await play_sleepy(b, base, fake)
            await b.close()
    finally:
        httpd.shutdown()
    print("OK e2e phase4: flash 6 items (%s) with a wrong answer and the once-a-day chip; "
          "camp 2 flash + 2 warm-ups + 4 fights + 2 counters + debrief; look-first on %s wrong then right; "
          "versus fool's mate (%s White) to two cards; two-phone invite/accept/moves/resign, one card each; "
          "Sleepy beaten in %d moves (%s) after hanging %s, game fight played to a card"
          % (",".join(types), fid, white, n, title.strip(), hung))


h.run(main)
