/* Play mode, minus the screen. Everything here is pure: given a search result and a dice roll it
   says which move Glitch plays; given a pair of evaluations it says whether the kid dropped
   material; given a recorded game it hands back fights in exactly the shape game.js already knows
   how to run. No DOM, no engine, no clock, so tests/test_play.js can hold all of it.

   The two things it must never do: put a number on screen, and take something away. Evaluations
   are read silently and thrown away; the only thing a game leaves behind is more fights and more
   counters that climb. */
(function (root) {
  const BAR = 150;             // a move that costs this much becomes a fight. The same bar the build uses.
  const MATE_CLAMP = 3000;     // a forced mate, as centipawns, so one mate swing cannot drown the ranking
  const LINE_MAX = 4;          // plies of line kept for the board animation
  const FIGHT_CAP = 3, STORE_CAP = 20;

  /* ---------- evaluations ---------- */
  // A UCI score, always from the point of view of the side to move, flattened to one number.
  function cpOf(score) {
    if (!score) return 0;
    if (score.mate != null && isFinite(score.mate)) {
      const n = Math.abs(Math.round(score.mate));
      const v = Math.max(400, MATE_CLAMP - n * 50);
      return score.mate < 0 ? -v : v;
    }
    const cp = Number(score.cp);
    return isFinite(cp) ? Math.max(-MATE_CLAMP, Math.min(MATE_CLAMP, cp)) : 0;
  }
  function whiteCp(score, turn) { return turn === "b" ? -cpOf(score) : cpOf(score); }
  // The kid is always White. `before` is read with him to move, `after` with Glitch to move, so the
  // two have to be flipped onto one side before they can be subtracted.
  function dropOf(before, after) { return whiteCp(before, "w") - whiteCp(after, "b"); }
  function isBlunder(before, after, bar) { return dropOf(before, after) >= (bar == null ? BAR : bar); }

  /* Glitch folds when it is hopeless, so a won game does not turn into forty moves of mopping up a
     kid cannot finish. Two turns in a row eight hundred down, or mate coming at him inside three.
     He still loses the game; the kid still gets the win. */
  const RESIGN = { cp: -800, inARow: 2, mateIn: 3 };
  function shouldResign(evals, opts) {
    const o = Object.assign({}, RESIGN, opts || {});
    const all = (evals || []).filter(Boolean);
    const last = all[all.length - 1];
    if (!last) return { resign: false, why: null };
    if (last.mate != null && last.mate < 0 && Math.abs(last.mate) <= o.mateIn) return { resign: true, why: "mate" };
    const window = all.slice(-o.inARow);
    if (window.length >= o.inARow && window.every(function (e) { return cpOf(e) <= o.cp; })) return { resign: true, why: "hopeless" };
    return { resign: false, why: null };
  }

  /* ---------- Glitch's move ----------
     A crony is bad in one of two ways, never in a third: he shrugs and plays a legal move (Sleepy),
     or he takes a worse move out of MultiPV, which is still a move a person would play. He never
     plays something random when a capture back is obvious, and he never walks past a mate in one —
     a villain who refuses a free win is not funny, he is broken. */
  function weightedWorse(n, roll) {
    let total = 0;
    for (let i = 0; i < n; i++) total += i + 1;
    let x = roll * total;
    for (let i = 0; i < n; i++) { x -= i + 1; if (x < 0) return i; }
    return n - 1;
  }
  function mateNow(lines) { return (lines || []).filter(function (l) { return l.mate != null && l.mate > 0; })[0] || null; }
  function chooseMove(result, level, legal, rng, opts) {
    const r = typeof rng === "function" ? rng : Math.random;
    const lv = level || {}, o = opts || {};
    const lines = (result && result.lines) || [];
    const best = (result && result.best) || (lines[0] && lines[0].uci) || null;
    const list = (legal || []).filter(Boolean);
    const forced = !!o.obvious || !!mateNow(lines);
    if (!forced && lv.random && r() < lv.random && list.length) {
      const pick = list[Math.min(list.length - 1, Math.floor(r() * list.length))];
      return { uci: pick, why: "shrug" };
    }
    if (!forced && lv.blunder && lines.length > 1 && r() < lv.blunder) {
      const worse = lines.slice(1);
      const pick = worse[weightedWorse(worse.length, r())];
      if (pick && pick.uci) return { uci: pick.uci, why: "blunder" };
    }
    if (best) return { uci: best, why: "best" };
    return { uci: list[0] || null, why: list.length ? "only" : "none" };
  }
  // He "thinks". Long enough to read as a person, short enough that a kid does not wander off.
  const DELAY = { min: 600, max: 1400 };
  function moveDelay(rng) {
    const r = typeof rng === "function" ? rng : Math.random;
    return Math.round(DELAY.min + r() * (DELAY.max - DELAY.min));
  }

  /* ---------- what Glitch says, all game ----------
     Ten or more per situation (sixteen for the three he says on every move), each speaking as
     `vk-(i+1)` from web/voice/. game.js picks with S.pickLine, which never repeats any of the last
     five; `say` below still walks a table in turn for anything that wants a fixed order. */
  function tbl(mood, vk, lines, opts) {
    const t = { mood: mood, vk: vk, lines: lines.slice(), speak: lines.map(function () { return null; }) };
    if (opts && opts.voice) t.voice = opts.voice;
    return t;
  }
  const SAY = {
    start: tbl("taunt", "g-play-start", [
      "A whole game? Against ME? Adorable.",
      "Full game. No hints, no second try, no crying.",
      "You move first. Enjoy it. It is the last thing you enjoy.",
      "I have played this game nine thousand times. In a row. Backwards.",
      "White goes first. Black goes last. I like going last.",
      "Set the clock. Actually don't. I want this to drag.",
      "Rated nine thousand. Unofficially. Officially too, in my head.",
      "A whole game! I've packed snacks for the long bits.",
      "Let's play. Every timeline where I lose is fake.",
      "Ready? I've been warming up. By sleeping."]),
    capture: tbl("smug", "g-play-capture", [
      "Mine now. Thanks.",
      "Om nom. Delicious.",
      "You left it out. I do not leave things out.",
      "I'll take that. And the next one.",
      "Snack acquired. Timeline improving.",
      "Was that one important? It looked important.",
      "Into the bag it goes.",
      "Crunch. That one was crunchy.",
      "Got it. My collection grows.",
      "Yoink!",
      "That piece is mine now. It lives in my pocket.",
      "Taken! I'll put it with the others.",
      "Mmm. Tastes like victory. My victory.",
      "Oops. Did I take that? I did. On purpose.",
      "Lunch is served. Thank you.",
      "My timeline just got one piece better."]),
    check: tbl("smug", "g-play-check", [
      "CHECK. Move him. Go on.",
      "Your king. My finger. Pointing.",
      "Check! I love this bit.",
      "Run, little king. Run in a small circle.",
      "Check, and I am not even trying yet.",
      "That is a check. You do have to answer it.",
      "Knock knock. It's check.",
      "Check! Your king should really get a hobby.",
      "Check. Your king looks worried. Mine looks fabulous.",
      "Ding ding! Check!",
      "Check. That's the scary word. Say it with me.",
      "CHECK! I've always wanted to shout that.",
      "Check. Find a safe square. If there is one.",
      "Your king is in my spotlight. Check!",
      "Check! Rated nine thousand, remember?",
      "Poke. Check. I'll poke again later."]),
    quiet: tbl("taunt", "g-play-quiet", [
      "There. Deal with that.",
      "Quiet move. The scary ones are quiet.",
      "I am improving my position. You are improving nothing.",
      "Nothing happened. Probably.",
      "Look at it. Look at it properly.",
      "That move is a trap. Or it isn't. Good luck.",
      "I moved. Your turn to be wrong.",
      "Tiny move. Huge plan. Possibly.",
      "I'm setting something up. Don't ask what.",
      "Hmm. Hmm. Yes. That one.",
      "Shuffle shuffle. Very clever shuffle.",
      "My piece moved. Now it's staring at your pieces.",
      "That's a timeline move. Very advanced. Even I don't get it.",
      "Sneaky move. Probably. I'll decide later.",
      "I moved there because it looked comfy.",
      "Your turn. I've left you a surprise. Maybe."]),
    gloat: tbl("smug", "g-play-gloat", [
      "OOH. That was bad. That was SO bad.",
      "Ha! Did you look before you did that?",
      "You just gave me something. Again.",
      "I did not even have to set that one up.",
      "That is going in my scrapbook.",
      "Write that one down. In the bad book.",
      "Thank you! Genuinely. Thank you.",
      "Oops for you. Yay for me.",
      "In MY timeline, that was a gift.",
      "Thanks! I'll put it next to my trophy."]),
    rage: tbl("rage", "g-play-rage", [
      "WHAT. That was MINE.",
      "No no no no NO.",
      "Give it BACK.",
      "That is theft! That is time-theft!",
      "I was using that piece!",
      "Rrrgh. Fine. FINE.",
      "You cannot just TAKE things.",
      "My piece! My beautiful piece!",
      "That one had a name! It was Gary!",
      "Not fair! I was about to use that!"]),
    nervous: tbl("nervous", "g-play-nervous", [
      "This is fine. Everything is fine.",
      "I am not losing. I am repositioning.",
      "Sweating? Goblins do not sweat.",
      "I meant to do that. All of it.",
      "It only LOOKS bad from your side.",
      "I have a plan. I will have a plan. Soon.",
      "My rating is still nine thousand. It's just resting.",
      "I'm fine. I'm just checking the other timelines.",
      "This is all part of my plan. The plan is to panic.",
      "Nobody panic. Especially me."]),
    resign: tbl("hide", "g-play-resign", [
      "Time glitch! This timeline never happened!",
      "You know what? This whole game was a rehearsal. Doesn't count. BYE.",
      "I am needed elsewhere. Urgently. In a different century.",
      "TIMELINE CORRUPTED. Nobody saw anything.",
      "I'm calling it. Technical fault. Mine.",
      "I have to go. My snacks are burning.",
      "Wrong timeline! I'm off to find a better one.",
      "I'm not losing, I'm LEAVING. Big difference.",
      "Glitch has left the board. Glitch was never here.",
      "Oh look, a distraction! Bye!"]),
    glitchMated: tbl("hide", "g-play-mated", [
      "Mate. On me. In front of everyone.",
      "That is mate and I hate it here.",
      "Checkmate. I am going to lie down.",
      "Checkmate?! In THIS timeline?!",
      "Mate. I'm going to go sit in a cupboard.",
      "That's mate. I'm telling everyone it was a draw.",
      "My king! He had nowhere to go! Nowhere!",
      "Checkmate. My rating just fainted.",
      "Mated. By you. I need a snack. A big one.",
      "That's mate. Let's never speak of this."]),
    kidMated: tbl("smug", "g-play-mates", [
      "Checkmate. That is the whole game, that is.",
      "Mate! Your king ran out of floor.",
      "And that is mate. Camp tomorrow, maybe?",
      "Mate! That was fun. For me.",
      "Checkmate! Rematch? I'd love another win.",
      "That's mate. Good game. Mostly MY good game.",
      "Checkmate. Put that one in my highlights.",
      "Mate! My king is doing a victory lap.",
      "Checkmate. Look back and find where it turned.",
      "That's the game. I'm rated nine thousand, you know."]),
    stalemate: tbl("nervous", "g-play-stalemate", [
      "Stalemate! No moves and no check. I'll take the half.",
      "Ha! You squeezed me so hard I stopped existing. Draw.",
      "Stalemate. Leave me a square next time. Actually, don't.",
      "Stalemate! I can't move, but I'm not in check. Half!",
      "No moves! Not checkmate though. Stalemate. Phew.",
      "Stalemate. My king is stuck, but safe. I'll take that.",
      "Stuck! Not mated. Stuck. That's a draw!",
      "Stalemate! You were SO close. I was SO lucky.",
      "Frozen! Nobody wins. Everybody sulks.",
      "Stalemate. Next time, leave my king a little window."]),
    repetition: tbl("smug", "g-play-repetition", [
      "Same position three times. Even I am bored.",
      "Round and round. Draw. I'll allow it.",
      "We have done this. Twice. Draw.",
      "Haven't we been here before? Draw.",
      "Same moves, same board, same draw.",
      "We keep doing this. Draw!",
      "Three times the same. Even my goblin brain noticed.",
      "Round and round we go. It's a draw.",
      "Repeat, repeat, repeat. Draw.",
      "This position again? Draw. I'm dizzy."]),
    fifty: tbl("smug", "g-play-fifty", [
      "Fifty moves, no pawn, no capture. Draw, by law.",
      "Nothing has happened for fifty moves. That is a draw and that is your fault.",
      "Fifty moves of nothing. Draw!",
      "No captures, no pawn moves, fifty times. That's a draw.",
      "Fifty moves! I fell asleep twice. Draw.",
      "The fifty move rule. Look it up. Draw.",
      "Fifty moves, zero action. Draw.",
      "Draw by fifty moves. I counted on my toes.",
      "Fifty moves! My snacks ran out. Draw.",
      "Nothing happened for ages. Draw."]),
    material: tbl("nervous", "g-play-material", [
      "Neither of us can mate with that. Draw.",
      "Two kings staring. Thrilling. Draw.",
      "Not enough pieces to mate. Draw!",
      "Nobody can checkmate with that. Draw.",
      "Too few pieces. Nobody wins. Draw.",
      "That's not enough to mate. We call it a draw.",
      "My army's gone. Yours is too small. Draw.",
      "Just kings, basically. Draw.",
      "Nobody can finish anybody. Draw.",
      "Not enough wood left. Draw."]),
    quit: tbl("smug", "g-play-quit", [
      "Resigning?! Against ME? Say it louder.",
      "Giving up. Noted. Filed. Laminated.",
      "You can resign. I am writing it down though.",
      "Stopping? I'll count it as a win. In my head.",
      "You stopped. I'm doing a small victory dance.",
      "Bye! Come back when you want another go.",
      "Giving up? I'll tell my cronies I won.",
      "Stopping here. Fine. The board will wait for you.",
      "Quitting! My rating goes up. In my imagination.",
      "Leaving already? I was just getting good."]),
    // Not Glitch talking: he is the one who is asleep. The narrator says it.
    asleep: tbl("hide", "play-asleep", [
      "Glitch is asleep. This phone cannot wake him.",
      "He will not come out. Fight him the normal way instead."], { voice: "narrator" }),
  };
  /* Each crony plays with his own voice, lent by Glitch. `taunt` joins the start and quiet lines,
     `gloat` the capture and gloat lines, `rage` the rage lines, only while that crony is playing. */
  const CRONY = {
    sleepy: {
      taunt: ["Sleepy's playing. He's mostly yawning.", "Zzz. Oh. Is it my move? Sleepy says yes.",
        "Sleepy moved. With his eyes shut. Honest.", "Sleepy wants a nap. And your queen. Mostly the nap.",
        "Shh. Sleepy's thinking. Or snoring."],
      gloat: ["Sleepy got one! He's so proud. He's asleep again.", "Even Sleepy caught that one. In his sleep.",
        "Sleepy took it. Yawned. Took it anyway.", "Yawn. Thanks. Sleepy will eat that later.",
        "Sleepy grabbed it without waking up."],
      rage: ["Sleepy woke up! He's grumpy now!", "Hey! Sleepy was dreaming about that piece!",
        "You took it while Sleepy was napping! Rude!", "Sleepy's crying into his pillow.",
        "Waaah. Sleepy wants his piece back. And his blanket."] },
    rookie: {
      taunt: ["Rookie's here! He's read the rules. Some of them.", "Rookie moved! On purpose, he says.",
        "Rookie's got a plan. He won't say what. He doesn't know.", "Rookie's so excited. He might drop something.",
        "Rookie says good luck. Then he giggles."],
      gloat: ["Rookie got one! First time this week!", "Rookie took it! He's doing a lap of the kitchen.",
        "Look at Rookie go! He actually saw that!", "Rookie grabbed it. He's never been happier.",
        "Rookie says thank you. Politely. Then laughs."],
      rage: ["Rookie dropped it! Again! Rookie!", "Rookie wasn't looking! He never looks!",
        "Rookie's piece! He only had a few!", "Rookie, you have to GUARD things!",
        "Rookie's sulking. He'll be fine. He won't."] },
    cadet: {
      taunt: ["Cadet has checked the board twice. Now three times.", "Cadet's move is textbook. Page one.",
        "Cadet salutes. Then attacks.", "Cadet says: get your pieces out. So he did.",
        "Cadet made a neat move. He loves neat."],
      gloat: ["Cadet spotted it. Cadet always reads the board.", "By the book! Cadet collects.",
        "Cadet took it. Neatly. With a salute.", "Cadet says: loose pieces get taken. Rule twelve.",
        "Cadet files that piece under mine."],
      rage: ["That's not in Cadet's book!", "Cadet's checklist didn't cover that!",
        "Cadet is writing a very angry report.", "Cadet lost a piece. Cadet NEVER loses pieces!",
        "Hey! Cadet was only on page two!"] },
    agent: {
      taunt: ["Agent moves in the shadows. Also on the board.", "Agent has counted everything. Twice.",
        "Agent's move is classified.", "Agent sees your plan. Agent always sees.",
        "Agent adjusts his sunglasses. Moves."],
      gloat: ["Agent counted. Mission complete.", "Agent takes. Agent does not miss.",
        "Loose piece detected. Agent collects.", "Agent smiles. Agents don't smile. He smiled.",
        "Agent to base. Piece captured."],
      rage: ["Agent's cover is blown!", "Agent did NOT see that coming. Agents see everything!",
        "Mission failed! Agent is so embarrassed.", "Agent lost his piece AND his sunglasses.",
        "Abort! Abort! Agent's piece is gone!"] },
    marshal: {
      taunt: ["Marshal marches in. Everybody salute!", "Marshal plays properly. He tells everyone.",
        "Marshal has a medal for every move.", "Marshal does not blunder. Marshal says so.",
        "Attention! Marshal is on the board!"],
      gloat: ["Marshal expected nothing less.", "Marshal takes. Marshal always takes.",
        "Victory for Marshal! Medal, please.", "Marshal collects pieces like medals.",
        "Marshal says: that is how it's done."],
      rage: ["Marshal is OUTRAGED! Marshal is never outraged!", "Marshal lost a piece?! Unthinkable!",
        "Marshal demands a rematch. Right now. Mid-game.", "Marshal's medals are rattling with fury!",
        "Impossible! Marshal studied for this!"] },
  };
  const CRONY_SLOT = { start: "taunt", quiet: "taunt", capture: "gloat", gloat: "gloat", rage: "rage" };
  function cronyKey(level, slot, i) { return "g-crony-" + level + "-" + slot + "-" + (i + 1); }
  /* The table a moment draws from against this crony: Glitch's own lines plus the crony's, each
     keeping its own voice key. Same shape as any other table, so S.pickLine takes it as it is. */
  function poolFor(kind, level) {
    const g = SAY[kind];
    if (!g) return null;
    const base = { mood: g.mood, vk: g.vk, voice: g.voice, lines: g.lines.slice(), speak: g.speak.slice(),
      keys: g.lines.map(function (l, i) { return g.vk + "-" + (i + 1); }) };
    const slot = CRONY_SLOT[kind], c = CRONY[level];
    if (slot && c && c[slot]) c[slot].forEach(function (l, i) { base.lines.push(l); base.speak.push(null); base.keys.push(cronyKey(level, slot, i)); });
    return base;
  }
  function say(kind, prev) {
    const g = SAY[kind];
    if (!g) return { text: "", mood: "taunt", index: -1, key: null };
    const i = typeof prev === "number" && prev >= 0 ? (prev + 1) % g.lines.length : 0;
    return { text: g.lines[i], mood: g.mood, index: i, key: g.vk + "-" + (i + 1) };
  }
  // Which of the three move lines fits what he just did.
  function moveKind(san) {
    const s = String(san || "");
    if (s.indexOf("+") >= 0 || s.indexOf("#") >= 0) return "check";
    if (s.indexOf("x") >= 0) return "capture";
    return "quiet";
  }

  /* ---------- turning the game into fights ----------
     Three at most, worst first, each one the position the kid was actually sitting in. The shape is
     the same shape the build writes for every other fight, so the whole flow — arrive, look-first,
     think, tease, futures, why-gate, card — runs on it with no special cases. */
  const TEXT = {
    hanging: { mascot: "LOOSE LUNCH", room: "Your games",
      hook: "You left one out in the open here. Find it before he does.",
      why: "A piece nobody is guarding is the move. Find the loose one first.",
      whyLong: "Glitch took this one for free, and free pieces decide games. Before every move, look for a piece of yours nobody is guarding — then look for one of his.",
      short: "Look for the loose piece.",
      taunt: "Oh, THIS board. You gave me a present on this board.",
      gloat: "Free again! You keep wrapping them up for me.",
      rage: "No! Not that one! I was SAVING that one!" },
    mateThreat: { mascot: "THE END", room: "Your games",
      hook: "The game could have ended right here. Find the finish.",
      why: "Look at the checks first. The win hides in a check.",
      whyLong: "There was a forced mate on this board and you played something else. Checks, captures, threats — look in that order, every single move.",
      short: "Check first. Mate hides there.",
      taunt: "You had me here. HAD me. And you looked away.",
      gloat: "You missed it! You actually missed the whole game!",
      rage: "NOOO. My king had nowhere to go!" },
    fork: { mascot: "TWO HEADS", room: "Your games",
      hook: "One of his pieces was about to hit two of yours. Stop it first.",
      why: "One piece, two targets. He only lets you save one.",
      whyLong: "His move hit two things at once and you could only rescue one of them. Before you move, ask what a knight or a queen could hit from its next square.",
      short: "He hits two at once.",
      taunt: "Remember this? I got two for one.",
      gloat: "Two at once! Pick which one you love more.",
      rage: "My fork! You saw my fork!" },
    counting: { mascot: "COUNTED", room: "Your games",
      hook: "You walked into something here. Count before you touch a piece.",
      why: "Count attackers and defenders before you move there.",
      whyLong: "The square you chose was covered more times than you had it covered. Count both sides every time before you put a piece on a square.",
      short: "Count before you move there.",
      taunt: "This is the board where you did not count.",
      gloat: "You did not count! You NEVER count!",
      rage: "Fine. You counted. Once." },
  };
  function textFor(motif) { return TEXT[motif] || TEXT.counting; }

  const ROLE = { p: "p", n: "n", b: "b", r: "r", q: "q", k: "k" };
  function boardList(chess) {
    const out = [];
    chess.board().forEach(function (row) {
      (row || []).forEach(function (cell) {
        if (cell) out.push({ color: cell.color, role: ROLE[cell.type] || cell.type, sq: cell.square });
      });
    });
    return out.sort(function (a, b) { return a.sq < b.sq ? -1 : a.sq > b.sq ? 1 : 0; });
  }
  function packList(list) {
    return (list || []).map(function (p) { return p.color + p.role + p.sq; }).join("");
  }
  // The same packed shape game.js expects: every legal move of the side to move, keyed by its square.
  function legalPack(chess) {
    const out = {};
    chess.moves({ verbose: true }).forEach(function (m) {
      (out[m.from] = out[m.from] || []).push({ to: m.to, uci: m.lan, san: m.san, capture: m.flags.indexOf("c") >= 0 || m.flags.indexOf("e") >= 0 });
    });
    return out;
  }
  function moveAt(chess, uci) {
    return chess.moves({ verbose: true }).filter(function (m) { return m.lan === uci; })[0] || null;
  }
  /* futures.js animates a line by picking one piece up and putting it down, which is the truth for
     every move except castling, en passant and promotion. Those get trimmed off the end of a line
     rather than drawn as a lie. A fight whose own first move is one of them is dropped. */
  function plainMove(m) {
    const f = String((m && m.flags) || "");
    return !!m && f.indexOf("k") < 0 && f.indexOf("q") < 0 && f.indexOf("e") < 0 && f.indexOf("p") < 0;
  }
  function safeLine(Chess, fen, ucis, max) {
    const c = new Chess(fen), out = [];
    const list = (ucis || []).slice(0, max || LINE_MAX);
    for (let i = 0; i < list.length; i++) {
      const m = moveAt(c, list[i]);
      if (!plainMove(m)) break;
      c.move(m.san); out.push(list[i]);
    }
    return out;
  }
  function kingSquare(chess, color) {
    return (boardList(chess).filter(function (p) { return p.color === color && p.role === "k"; })[0] || {}).sq || null;
  }
  // How many enemy pieces the piece on `sq` now hits. Two or more after a capture reads as a fork.
  function hitsFrom(F, list, sq) {
    if (!F || !F.enemyAttacked) return 0;
    return F.enemyAttacked(F.piecesFromList(list), sq).length;
  }

  function buildFight(row, ctx) {
    const Chess = ctx.Chess, F = ctx.F;
    const start = new Chess(row.fen);
    if (start.turn() !== "w") return null;                 // the kid is always White; anything else is not his move
    const baitMove = moveAt(start, row.bait.uci), bestMove = moveAt(start, row.best.uci);
    if (!plainMove(baitMove) || !plainMove(bestMove)) return null;

    const pieces = boardList(start);
    const afterBest = new Chess(row.fen); afterBest.move(bestMove.san);
    const afterBait = new Chess(row.fen); afterBait.move(baitMove.san);
    const punishUci = (row.punish || [])[0] || null;
    const punish = punishUci ? moveAt(afterBait, punishUci) : null;

    const missedMate = !!(bestMove.san.indexOf("#") >= 0 || (row.before && row.before.mate != null && row.before.mate > 0));
    const punishCaptures = !!(punish && punish.flags.indexOf("c") >= 0);
    let punishForks = false;
    if (punish) {
      const afterPunish = new Chess(afterBait.fen()); afterPunish.move(punish.san);
      punishForks = hitsFrom(F, boardList(afterPunish), punish.to) >= 2;
    }
    const motif = missedMate ? "mateThreat" : punishForks ? "fork" : punishCaptures ? "hanging" : "counting";

    /* The why-gate. Whatever it asks for has to be tappable on the board it is shown on, which is
       either the start position or the position after the best move — those are the only two boards
       game.js can put up. Every branch below is checked against the board it names. */
    let why = null;
    const startMap = {}; pieces.forEach(function (p) { startMap[p.sq] = p; });
    if (missedMate) {
      const k = kingSquare(afterBest, "b");
      if (k) why = { at: "after", squares: [k], prompt: "Tap the king you could have mated." };
    }
    if (!why && punishCaptures && punish.to !== baitMove.to && startMap[punish.to] && startMap[punish.to].color === "w") {
      why = { at: "start", squares: [punish.to], prompt: "Tap the piece that was hanging." };
    }
    if (!why && punishCaptures && punish.to === baitMove.to) {
      why = { at: "start", squares: [baitMove.from], prompt: "Tap the piece you walked into it." };
    }
    if (!why && bestMove.flags.indexOf("c") >= 0) {
      why = { at: "start", squares: [bestMove.to], prompt: "Tap the piece the better move takes." };
    }
    if (!why && bestMove.san.indexOf("+") >= 0) {
      const k = kingSquare(afterBest, "b");
      if (k) why = { at: "after", squares: [k], prompt: "Tap the king the better move checks." };
    }
    if (!why) why = { at: "after", squares: [bestMove.to], prompt: "Tap the square the better move lands on." };

    const t = textFor(motif);
    const bestLine = safeLine(Chess, row.fen, [row.best.uci].concat((row.best.pv || []).slice(1)), LINE_MAX);
    const baitLine = safeLine(Chess, row.fen, [row.bait.uci].concat(row.punish || []), LINE_MAX);
    const candidates = [bestMove.from, bestMove.to, baitMove.from].filter(function (s, i, a) { return a.indexOf(s) === i; });
    const moves = {};
    moves[row.best.uci] = { san: bestMove.san, cp: Math.round(row.drop), tier: "best" };
    moves[row.bait.uci] = { san: baitMove.san, cp: -Math.round(row.drop), tier: "bait" };

    return {
      id: ctx.id, pack: "game", generated: true, boss: false, motif: motif,
      // Every game fight of one motif speaks the same six lines: game-<motif>-hook ... -rage.
      voice: "game-" + (TEXT[motif] ? motif : "counting"),
      title: "Your game, move " + (row.n || 1),
      palaceRoom: t.room, mascot: t.mascot,
      fen: row.fen, turn: "w",
      arrive: row.arrive || null, arrivePosition: row.arrivePosition || null,
      position: packList(pieces), pieces: pieces, legal: legalPack(start), candidates: candidates,
      best: row.best.uci, bestSan: bestMove.san, bait: row.bait.uci, tempting: row.bait.uci, temptingSan: baitMove.san,
      moves: moves, bestLineUci: bestLine, temptingLineUci: baitLine,
      whyTargets: why,
      hook: t.hook, why: t.why, whyLong: t.whyLong, short: t.short,
      glitch: { taunt: t.taunt, gloat: t.gloat, rage: t.rage },
      level: ctx.level || null, drop: Math.round(row.drop), t: ctx.t || 0,
    };
  }

  /* Every kid move the game recorded, worst first, capped. A row that cannot be turned into an
     honest board (a castle, a promotion, a position the engine never scored) is dropped rather
     than patched: a fight that does not run is worse than one fewer fight. */
  function gameFights(records, opts) {
    const o = opts || {};
    if (!o.Chess) throw new Error("gameFights needs a Chess");
    const bar = o.bar == null ? BAR : o.bar, cap = o.cap == null ? FIGHT_CAP : o.cap;
    // `tag` letters the ids apart so a board out of a game against Glitch and a board out of a game
    // against a sibling can never collide in the same binder room.
    const stamp = o.t || Date.now(), who = o.profile == null ? 0 : o.profile, tag = o.tag || "G";
    const rows = (records || [])
      .filter(function (r) { return r && r.fen && r.bait && r.bait.uci && r.best && r.best.uci && r.best.uci !== r.bait.uci; })
      .map(function (r) { return Object.assign({}, r, { drop: dropOf(r.before, r.after) }); })
      .filter(function (r) { return r.drop >= bar; })
      .sort(function (a, b) { return b.drop - a.drop; });
    const out = [], seen = {};
    for (let i = 0; i < rows.length && out.length < cap; i++) {
      if (seen[rows[i].fen]) continue;
      let fight = null;
      try { fight = buildFight(rows[i], { Chess: o.Chess, F: o.F, t: stamp, level: o.level,
        id: tag + who + stamp + (out.length + 1) }); } catch (e) { fight = null; }
      if (!fight) continue;
      seen[rows[i].fen] = true; out.push(fight);
    }
    return out;
  }
  // Newest first, deduped by position, capped. Nothing is ever dropped for being old until 20 newer
  // ones have arrived, and a board already in the list is not stored twice.
  function storeFights(list, fresh, cap) {
    const max = cap == null ? STORE_CAP : cap;
    const out = [], seen = {};
    (fresh || []).concat(list || []).forEach(function (f) {
      if (!f || !f.fen || seen[f.fen] || out.length >= max) return;
      seen[f.fen] = true; out.push(f);
    });
    return out;
  }

  const api = { BAR, MATE_CLAMP, LINE_MAX, FIGHT_CAP, STORE_CAP, RESIGN, DELAY, SAY, TEXT,
    cpOf, whiteCp, dropOf, isBlunder, shouldResign, chooseMove, weightedWorse, mateNow, moveDelay,
    say, moveKind, CRONY, CRONY_SLOT, cronyKey, poolFor, boardList, packList, legalPack, moveAt, plainMove, safeLine, kingSquare,
    buildFight, gameFights, storeFights, textFor };
  root.ShockmatePlay = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
