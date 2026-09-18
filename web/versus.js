/* Versus: the two kids play each other on one phone, and the engine watches without ever taking a
   side. Everything here is pure — no DOM, no engine, no clock — so tests/test_versus.js can hold the
   whole of it and hand it faked evaluations.

   The one rule this file exists to protect: the two kids are NEVER scored against each other. There
   is no tally, no table, no "3 - 1". Every number a game produces belongs to exactly one kid and is
   only ever shown on that kid's own card. What crosses between them is a chess move, nothing else.

   The second rule, the usual one: nothing goes down. A versus game adds fights, best moments and
   counters that climb, and it is not allowed anywhere near S.suggestLevel — the crony a kid is
   offered is about his chess, not about who he happens to live with. */
(function (root, P) {
  const BAR = P.BAR;                 // a drop this big is a blunder, and a candidate for a fight
  const BEST_GAIN = 150;             // a swing this big in his favour, on the engine's own move, is a best moment
  const FIGHT_CAP = 2;               // worst two drops per kid per game become fights
  const BEST_CAP = 20;               // best moments kept per kid, newest first

  /* ---------- mirroring ----------
     A fight is always white-to-move with the kid's pieces at the bottom, because that is the one
     board orientation the arena, the art and every why-gate prompt were built for. The kid who
     played Black therefore gets his position mirrored exactly the way tools/build_encounters.py
     prepare() mirrors an opening authored from Black's side: colours swapped, ranks flipped. Same
     lesson, same board, no special case downstream. */
  function mirrorSquare(sq) {
    const s = String(sq || "");
    if (!/^[a-h][1-8]$/.test(s)) return s;
    return s[0] + (9 - Number(s[1]));
  }
  function mirrorUci(uci) {
    const u = String(uci || "");
    if (u.length < 4) return u;
    return mirrorSquare(u.slice(0, 2)) + mirrorSquare(u.slice(2, 4)) + u.slice(4);
  }
  function swapCase(ch) { return ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase(); }
  function mirrorFen(fen) {
    const parts = String(fen || "").trim().split(/\s+/);
    if (parts.length < 4) return fen;
    const rows = parts[0].split("/").reverse().map(function (r) {
      return r.split("").map(function (c) { return /[a-zA-Z]/.test(c) ? swapCase(c) : c; }).join("");
    }).join("/");
    const turn = parts[1] === "w" ? "b" : "w";
    const castle = parts[2] === "-" ? "-" : parts[2].split("").map(swapCase).sort().join("");
    const ep = parts[3] === "-" ? "-" : mirrorSquare(parts[3]);
    return [rows, turn, castle, ep, parts[4] == null ? "0" : parts[4], parts[5] == null ? "1" : parts[5]].join(" ");
  }
  // The build's board pack, "wra1bkg8…": colour, role, square, four characters each, sorted by square.
  function mirrorPack(pack) {
    const s = String(pack || ""), out = [];
    for (let i = 0; i + 3 < s.length; i += 4) {
      out.push((s[i] === "w" ? "b" : "w") + s[i + 1] + mirrorSquare(s.slice(i + 2, i + 4)));
    }
    return out.sort(function (a, b) { const x = a.slice(2), y = b.slice(2); return x < y ? -1 : x > y ? 1 : 0; }).join("");
  }
  // A recorded move, seen from the other side of the board. Evaluations are already point-of-view
  // relative — `before` is read with the mover to move, `after` with his sibling — so they do not move.
  function mirrorRow(row) {
    if (!row) return row;
    const out = Object.assign({}, row);
    out.fen = mirrorFen(row.fen);
    out.side = row.side === "b" ? "w" : "b";
    out.mirrored = true;
    if (row.bait) out.bait = Object.assign({}, row.bait, { uci: mirrorUci(row.bait.uci) });
    if (row.best) out.best = Object.assign({}, row.best, { uci: mirrorUci(row.best.uci),
      pv: (row.best.pv || []).map(mirrorUci) });
    if (row.punish) out.punish = row.punish.map(mirrorUci);
    if (row.arrive) out.arrive = mirrorUci(row.arrive);
    if (row.arrivePosition) out.arrivePosition = mirrorPack(row.arrivePosition);
    return out;
  }

  /* ---------- reading one kid's moves ----------
     Everything below takes the whole game's record and a side. It never looks at the other side's
     numbers, which is the cheapest way to guarantee there is no head-to-head anything. */
  function rowsFor(records, side) {
    return (records || []).filter(function (r) { return r && r.side === side; });
  }
  function dropOf(row) { return row && row.before && row.after ? P.dropOf(row.before, row.after) : 0; }
  function gainOf(row) { return -dropOf(row); }
  function isBlunderRow(row, bar) { return !!(row && row.before && row.after) && dropOf(row) >= (bar == null ? BAR : bar); }
  function matchedBest(row) {
    return !!(row && row.best && row.best.uci && row.bait && row.bait.uci && row.best.uci === row.bait.uci);
  }
  function deliversMate(row) { return /#/.test((row && row.bait && row.bait.san) || ""); }

  /* The moment it turned: his single worst drop. Null when he never dropped anything, which is a
     thing that happens and is not a failure to report. */
  function worstMoment(rows, bar) {
    const bad = (rows || []).filter(function (r) { return isBlunderRow(r, bar); });
    if (!bad.length) return null;
    return bad.slice().sort(function (a, b) { return dropOf(b) - dropOf(a); })[0];
  }
  /* His best moment: the biggest swing his way that the engine actually agrees with. Agreement is
     the whole point — a swing that came from his sibling hanging a queen is not something he did, so
     the move has to BE the engine's move and gain at least the blunder bar, or end the game. Mate
     outranks everything, because mate is the best move there has ever been. */
  function momentScore(row) { return deliversMate(row) ? 1e6 + gainOf(row) : gainOf(row); }
  function bestMoment(rows, opts) {
    const o = opts || {}, bar = o.bar == null ? BEST_GAIN : o.bar;
    const good = (rows || []).filter(function (r) {
      if (!r || !r.bait) return false;
      if (deliversMate(r)) return true;
      return matchedBest(r) && gainOf(r) >= bar;
    });
    if (!good.length) return null;
    return good.slice().sort(function (a, b) { return momentScore(b) - momentScore(a); })[0];
  }
  // What gets stored. `vs` is the literal word "sibling": the other kid's name is never written into
  // one kid's progress, so no later screen can accidentally build a scoreboard out of it.
  function momentCard(row, t) {
    if (!row) return null;
    return { t: t || 0, san: (row.bait && row.bait.san) || "", fen: row.fen || "", uci: (row.bait && row.bait.uci) || "",
      gain: Math.round(deliversMate(row) ? Math.max(gainOf(row), BEST_GAIN) : gainOf(row)), vs: "sibling", n: row.n || 0 };
  }

  // Pieces handed over: a drop whose punishment is a capture. Needs a board, so it is worth nothing
  // without one rather than guessed at.
  function punishTakes(row, Chess) {
    if (!Chess || !row || !row.fen || !row.bait || !row.punish || !row.punish[0]) return false;
    try {
      const c = new Chess(row.fen);
      const m = P.moveAt(c, row.bait.uci);
      if (!m) return false;
      c.move(m.san);
      const p = P.moveAt(c, row.punish[0]);
      return !!(p && (p.flags.indexOf("c") >= 0 || p.flags.indexOf("e") >= 0));
    } catch (e) { return false; }
  }

  /* Everything one kid's game was, in one object. Nothing in here is comparable to his sibling's
     copy on purpose: it is a report on him, not a result between them. */
  function summarise(records, side, opts) {
    const o = opts || {}, rows = rowsFor(records, side);
    const bar = o.bar == null ? BAR : o.bar;
    return {
      side: side, moves: rows.length,
      blunders: rows.filter(function (r) { return isBlunderRow(r, bar); }).length,
      matched: rows.filter(matchedBest).length,
      given: rows.filter(function (r) { return isBlunderRow(r, bar) && punishTakes(r, o.Chess); }).length,
      worst: worstMoment(rows, bar),
      best: bestMoment(rows, { bar: o.bestBar }),
    };
  }

  /* One kid's worst moves, as fights in HIS binder. The Black kid's rows are mirrored first, so what
     comes back out is white-to-move with his own pieces at the bottom, exactly like every other
     fight in the app. The extractor is Play's, unchanged: a fight made here and a fight made against
     Glitch are the same object and run through the same flow. */
  function kidFights(records, side, opts) {
    const o = opts || {};
    if (!o.Chess) throw new Error("kidFights needs a Chess");
    const rows = rowsFor(records, side).map(function (r) { return side === "b" ? mirrorRow(r) : r; });
    return P.gameFights(rows, { Chess: o.Chess, F: o.F, profile: o.profile, t: o.t,
      bar: o.bar, cap: o.cap == null ? FIGHT_CAP : o.cap, tag: o.tag == null ? "V" : o.tag });
  }

  /* ---------- who is White ----------
     It alternates by itself, because a rule nobody has to enforce is a rule nobody argues about.
     A chip swaps it for this one game; the swap is what gets remembered, so the next game alternates
     off what actually happened. */
  function nextWhite(lastWhite) { return lastWhite === 0 ? 1 : 0; }
  function seatsFor(white) {
    const w = white === 1 ? 1 : 0;
    return { white: w, black: w === 1 ? 0 : 1 };
  }
  function colourOf(seats, profile) { return seats.white === profile ? "w" : "b"; }
  function swapSeats(seats) { return seatsFor(seats.white === 1 ? 0 : 1); }

  /* ---------- the referee ----------
     Glitch is not playing. He is leaning on the board being unhelpful, and he is against both of
     them equally: every line names the kid it is about and nobody else, so a line can never turn
     into a comparison. `{name}` is filled in by say(). An entry is a string, or [shown, spoken]: the
     bubble names the kid, the pre-generated audio (`vk-(i+1)`) says the same line without the name.
     `turn` goes in the prompt at the start of the think window, so it is shown and never spoken. */
  function tbl(mood, vk, entries, opts) {
    const t = { mood: mood, vk: vk, lines: [], speak: [] };
    entries.forEach(function (e) {
      if (Array.isArray(e)) { t.lines.push(e[0]); t.speak.push(e[1]); } else { t.lines.push(e); t.speak.push(null); }
    });
    if (opts && opts.silent) t.silent = true;
    return t;
  }
  const SAY = {
    start: tbl("taunt", "g-ref-start", [
      "I'll referee. I'm rooting against both of you.",
      "Two of you. One board. No adults. This is my favourite.",
      "I will be fair. Fairly rude. To both.",
      "Referee Glitch. No takebacks, no crying, no touching my whistle.",
      "Whoever loses, I win. That is how refereeing works.",
      "Referee time! I've got a whistle and no idea how to use it.",
      "Two players! Double the mistakes. Double the fun.",
      "I'm neutral. Neutrally hoping you both blunder.",
      "Shake hands! Then ignore each other and look at the board.",
      "Let the game begin! Snacks are for the referee only."]),
    turn: tbl("taunt", "g-ref-turn", [
      "{name}. Your go. Look first.",
      "Over to {name}. Do something silly.",
      "{name} is up. I'm watching.",
      "Phone to {name}. Board's turned round for you.",
      "{name}'s move. Two questions first, remember?",
      "{name}, you're up. What did that move attack?",
      "{name}'s go. Take your time. I'll hum.",
      "Over to you, {name}. Look before you touch.",
      "{name}. Board's yours. Don't break it.",
      "Your turn, {name}. Checks, captures, threats.",
      "{name} to move. I'm pretending not to watch.",
      "Go on, {name}. Think first. Then tap.",
      "{name}'s turn. The board turned round for you.",
      "{name}. Why is that piece sitting there?",
      "{name}, you're on. Slow is smooth.",
      "{name}'s move. I'm rooting for chaos."], { silent: true }),
    blunder: tbl("smug", "g-ref-blunder", [
      ["OOH. {name}. That was bad. That was SO bad.", "OOH. That was bad. That was SO bad."],
      ["{name} just gave one away. In front of everyone.", "Somebody just gave one away. In front of everyone."],
      ["Did {name} look before doing that? Did {name}?", "Did you look before doing that? Did you?"],
      ["That one is going in my scrapbook under {name}.", "That one is going in my scrapbook."],
      ["{name}! I did not even have to set that up.", "I did not even have to set that up."],
      ["Thank you, {name}. Genuinely. Thank you.", "Thank you. Genuinely. Thank you."],
      ["{name} has decided to be generous today.", "Somebody has decided to be generous today."],
      ["Ooh, {name}. That piece is feeling very lonely now.", "Ooh. That piece is feeling very lonely now."],
      ["{name}! In my timeline, that's a gift.", "In my timeline, that's a gift."],
      ["Uh oh, {name}. Something just came loose.", "Uh oh. Something just came loose."],
      ["{name} left the door open. I love an open door.", "Somebody left the door open. I love an open door."],
      ["Whoops, {name}. The other side is smiling.", "Whoops. The other side is smiling."],
      ["{name}! Did you count? I don't think you counted.", "Did you count? I don't think you counted."],
      ["{name} just made my whole day.", "Somebody just made my whole day."],
      ["Yikes, {name}. Look what that move left behind.", "Yikes. Look what that move left behind."],
      ["{name}, that one's going on my fridge.", "That one's going on my fridge."]]),
    great: tbl("nervous", "g-ref-great", [
      ["…{name}. Where did THAT come from.", "…Where did THAT come from."],
      ["No. No no. {name} is not supposed to find those.", "No. No no. Nobody is supposed to find those."],
      ["Fine. {name} saw it. Anyone could have. Probably.", "Fine. You saw it. Anyone could have. Probably."],
      ["{name}, who taught you that. Was it me? It was me.", "Who taught you that? Was it me? It was me."],
      ["I am not nervous. {name} is just being annoying.", "I am not nervous. You are just being annoying."],
      ["That is the move. {name} found the move. Boo.", "That is the move. You found the move. Boo."],
      ["{name}! That was the engine's move! Stop it!", "That was the engine's move! Stop it!"],
      ["Whoa. {name} just played like a grown-up.", "Whoa. That was a grown-up move."],
      ["{name}, that was sneaky. I respect sneaky.", "That was sneaky. I respect sneaky."],
      ["Ugh. {name} found the best one. Again.", "Ugh. The best one. Again."],
      ["{name} is playing in the good timeline. Unfair.", "Somebody is playing in the good timeline. Unfair."],
      ["That move, {name}. I'm putting it in a museum.", "That move. I'm putting it in a museum."],
      ["{name}! Wow. I mean... boo. Wow.", "Wow. I mean... boo. Wow."],
      ["Big move, {name}. My rating just shivered.", "Big move. My rating just shivered."],
      ["{name} saw it coming. I didn't. I'm the villain!", "You saw it coming. I didn't. I'm the villain!"],
      ["Who gave {name} X-ray eyes? Give them back.", "Who gave you X-ray eyes? Give them back."]]),
    check: tbl("smug", "g-ref-check", [
      "CHECK. Move that king. Go on.",
      ["{name} says check. The king has to answer.", "Check. The king has to answer."],
      "Check! I love this bit.",
      "Run, little king. Run in a small circle.",
      "Knock knock. It's check.",
      "That is a check. You do have to deal with it.",
      "King's in trouble. Not my king though.",
      "Check! Somebody's king is sweating.",
      ["{name} pokes the king. Check!", "Poke! Check!"],
      "Ding ding! Check!",
      "Check. Out of the way, your majesty.",
      ["Check from {name}. Find a safe square.", "Check. Find a safe square."],
      "CHECK! The best word in chess.",
      "King under attack! This is SO exciting.",
      "Check. Block it, run, or take it.",
      ["{name} is hunting kings now. Check!", "Somebody is hunting kings now. Check!"]]),
    capture: tbl("smug", "g-ref-capture", [
      ["Gone. {name} ate it.", "Gone. Eaten."],
      "Om nom. Off the board.",
      ["{name} takes. Somebody left something out.", "Taken. Somebody left something out."],
      "Into the bag it goes.",
      ["Snack acquired. By {name}, sadly.", "Snack acquired. Sadly, not by me."],
      "Was that one important? It looked important.",
      "One fewer piece. I approve of fewer pieces.",
      "Crunch! That one was crunchy.",
      ["{name} grabs it. Yoink!", "Yoink!"],
      "Taken! Straight off the board.",
      ["{name} collects another one.", "Another one collected."],
      "Chomp. Delicious.",
      "Bye bye, little piece.",
      ["Lunch for {name}.", "Lunch is served."],
      "A piece falls! I'll hold a tiny funeral.",
      ["{name} takes. Was it free? Check it was free.", "Taken. Was it free? Check it was free."]]),
    quiet: tbl("taunt", "g-ref-quiet", [
      "Nothing happened. Probably.",
      ["Quiet move from {name}. The scary ones are quiet.", "Quiet move. The scary ones are quiet."],
      ["{name} is improving the position. Allegedly.", "Improving the position. Allegedly."],
      "Look at that move properly before you answer it.",
      "That is a trap. Or it isn't. Good luck.",
      ["{name} moved. Somebody else's turn to be wrong.", "Moved. Somebody else's turn to be wrong."],
      "Hm. I'd have taken something.",
      "Tiny move. Big plan? We'll see.",
      ["{name} is setting something up. I can smell it.", "Somebody is setting something up. I can smell it."],
      "Shuffle shuffle.",
      "A quiet one. What does it attack now?",
      ["Sneaky move, {name}. Or just a move.", "Sneaky move. Or just a move."],
      "Hmm. Hmm. Interesting. I have no idea.",
      "That piece looks comfy there.",
      ["{name} is thinking ahead. I never do that.", "Thinking ahead. I never do that."],
      "Ask the question. What did that move just do?"]),
    won: tbl("hide", "g-ref-won", [
      ["Fine. FINE. You win, {name}. Enjoy it, it never happens again.", "Fine. FINE. You win. Enjoy it, it never happens again."],
      ["{name} wins. I am appealing. To nobody.", "A win. I am appealing. To nobody."],
      ["Congratulations {name}, you beat a person. I remain undefeated by you.", "Congratulations, you beat a person. I remain undefeated by you."],
      ["{name} takes it. I was distracted. By the ceiling.", "You take it. I was distracted. By the ceiling."],
      ["{name} wins! I'll pretend I wasn't watching.", "A win! I'll pretend I wasn't watching."],
      ["Winner: {name}. Referee's mood: grumpy.", "Winner! Referee's mood: grumpy."],
      ["{name} did it. Take a bow. A small one.", "You did it. Take a bow. A small one."],
      ["{name} wins! I blame this timeline.", "You win! I blame this timeline."],
      ["Nice game, {name}. Don't let it go to your head.", "Nice game. Don't let it go to your head."],
      ["{name} wins. I'm writing it in my book. In tiny letters.", "You win. I'm writing it in my book. In tiny letters."]]),
    lost: tbl("smug", "g-ref-lost", [
      ["Bad luck {name}. The rematch is one tap away.", "Bad luck. The rematch is one tap away."],
      ["{name} lost this one. It happens to me constantly.", "Lost this one. It happens to me constantly."],
      ["Chin up, {name}. I enjoyed that enormously.", "Chin up. I enjoyed that enormously."],
      ["{name}! Again. I want to watch that again.", "Again! I want to watch that again."],
      ["Not this time, {name}. Your fight is waiting in the binder.", "Not this time. Your fight is waiting in the binder."],
      ["{name}, that one got away. The next one won't.", "That one got away. The next one won't."],
      ["Tough one, {name}. Even I lose. Mostly on purpose.", "Tough one. Even I lose. Mostly on purpose."],
      ["{name}, find the moment it turned. Then pounce next time.", "Find the moment it turned. Then pounce next time."],
      ["Hard luck, {name}. Rematch? I'll bring snacks.", "Hard luck. Rematch? I'll bring snacks."],
      ["{name} lost. In another timeline, {name} won. Probably.", "Lost. In another timeline, you won. Probably."]]),
    drew: tbl("taunt", "g-ref-drew", [
      "A draw. Nobody wins. Correct result, I think.",
      ["Half each. {name} gets half a thing.", "Half each. Half a thing for you."],
      "Drawn. Two of you and still no winner. Marvellous.",
      ["{name}, you have drawn with your own sibling. Historic.", "You have drawn with your own sibling. Historic."],
      ["Draw, {name}. Half a point. Half a snack.", "Draw. Half a point. Half a snack."],
      ["Nobody wins, {name}. Nobody loses. I'm confused.", "Nobody wins. Nobody loses. I'm confused."],
      "A draw! The timeline couldn't decide.",
      ["{name} gets a draw. A tie. A stalemate of feelings.", "A draw. A tie. A stalemate of feelings."],
      "Drawn. Shake hands. Or don't. I'm not your referee. Wait, I am.",
      ["Half a point for {name}. I'll keep the other half.", "Half a point for you. I'll keep the other half."]]),
    mate: tbl("smug", "g-ref-mate", [
      "CHECKMATE. That is the whole game, that is.",
      "Mate! The king ran out of floor.",
      "And that is mate. On a phone. In a kitchen.",
      "Checkmate. I saw it coming. I say that every time.",
      "Checkmate! The king has left the building.",
      ["Mate! Sorry, {name}. The king is stuck.", "Mate! Sorry. The king is stuck."],
      "That's mate. Game over. Snack time.",
      "Checkmate! What a finish.",
      "Mate! I'd clap, but I'm the villain.",
      "CHECKMATE. That one goes in the highlights."]),
    stalemate: tbl("nervous", "g-ref-stalemate", [
      "Stalemate! No moves and no check. Half each.",
      "Squeezed so hard the king stopped existing. Draw.",
      "Stalemate. Leave a square next time. Actually, don't.",
      "Stalemate! Can't move, not in check. Half each.",
      "Stuck king, no check. That's a draw!",
      "Stalemate! So close to mate. So far.",
      "Frozen! Nobody wins.",
      "Stalemate. Always leave the king a square. Or don't.",
      "No moves! That's stalemate. Draw!",
      "Stalemate! I did not see that coming. Nobody did."]),
    repetition: tbl("smug", "g-ref-repetition", [
      "Same position three times. Even I am bored.",
      "Round and round. Draw. I'll allow it.",
      "We have done this. Twice. Draw.",
      "Same moves again. Draw!",
      "That's three times. Draw by repetition.",
      "Wait, I've seen this board before. Three times. Draw.",
      "We're going in circles. Draw!",
      "Same board, same moves. The timeline is stuck. Draw.",
      "Same board three times. I'm dizzy. Draw.",
      "Again? And again? That's a draw."]),
    fifty: tbl("smug", "g-ref-fifty", [
      "Fifty moves, no pawn, no capture. Draw, by law.",
      "Nothing has happened for fifty moves. That is a draw and it is both your faults.",
      "Fifty. Moves. I counted. Draw.",
      "Fifty moves and nobody took anything. Draw.",
      "Fifty moves! Somebody was supposed to do something.",
      "Fifty quiet moves. The rule says draw.",
      "Fifty moves. I've aged. Draw.",
      "That's the fifty move rule. Draw!",
      "Fifty moves of dancing. Draw.",
      "Fifty! No pawn moved, nothing was taken. Draw."]),
    material: tbl("nervous", "g-ref-material", [
      "Neither of you can mate with that. Draw.",
      "Two kings staring. Thrilling. Draw.",
      "Not enough wood left to finish anyone. Draw.",
      "Not enough pieces left to mate. Draw.",
      "Nobody can checkmate with that. Draw!",
      "Too few pieces. It's a draw.",
      "Two lonely kings. Draw.",
      "That army can't finish a king. Draw.",
      "Not enough left for mate. Shake hands.",
      "Nobody can win from here. Draw."]),
    // Two phones. {name} is always the kid the line is about, never a pairing of the two.
    invite: tbl("taunt", "g-ref-invite", [
      ["{name} wants to play! On a whole other phone. Sneaky.", "Somebody wants to play! On a whole other phone. Sneaky."],
      ["Psst. {name} is challenging you. From over there.", "Psst. You've been challenged. From over there."],
      ["{name} wants a game. I'll referee from both phones.", "Somebody wants a game. I'll referee from both phones."],
      ["Incoming! {name} wants to play you.", "Incoming! Somebody wants to play you."],
      ["{name} sent a challenge! Accept, if you dare.", "A challenge! Accept, if you dare."],
      ["Ding! {name} wants a game.", "Ding! Somebody wants a game."],
      ["{name} is ready to play. Are you?", "Somebody is ready to play. Are you?"],
      ["A challenge from {name}! I'll bring the whistle.", "A challenge! I'll bring the whistle."],
      ["{name} wants a match. Or a rematch. A match.", "Somebody wants a match. Or a rematch."],
      ["Knock knock. It's {name}. With a chessboard.", "Knock knock. Somebody's here. With a chessboard."]]),
    waiting: tbl("taunt", "g-ref-waiting", [
      ["Waiting for {name}… I'm counting ceiling tiles.", "Waiting… I'm counting ceiling tiles."],
      ["{name} is thinking. Or eating. Hard to tell from here.", "Still thinking. Or eating. Hard to tell from here."],
      ["Still {name}'s go. I'll just float here.", "Still their go. I'll just float here."],
      ["Waiting for {name}. Resign is there if you get bored.", "Still waiting. Resign is there if you get bored."],
      ["{name} is taking ages. Good. Thinking is good.", "Taking ages. Good. Thinking is good."],
      ["Hmm hmm hmm. Waiting for {name}.", "Hmm hmm hmm. Waiting."],
      ["{name}'s move. I'm doing laps round the board.", "Their move. I'm doing laps round the board."],
      ["Still waiting for {name}. Snack break?", "Still waiting. Snack break?"],
      ["{name} is plotting something. I can hear it.", "Somebody is plotting something. I can hear it."],
      ["Tick tock. {name} is thinking hard.", "Tick tock. Somebody is thinking hard."]]),
    unfinished: tbl("nervous", "g-ref-unfinished", [
      "Nobody finished this one. It doesn't count for anyone.",
      "The game wandered off. No result, no harm.",
      "Unfinished. I'll pretend I didn't see it.",
      "Nobody finished. The game went for a walk.",
      "Unfinished! This timeline fizzled out.",
      "No result. Just like my homework.",
      "The game stopped. It counts for nobody.",
      "Half a game. I'll file it under maybe.",
      "Nobody won. Nobody lost. Somebody left.",
      "It fizzled. Start a fresh one any time."]),
    same: tbl("nervous", "g-ref-same", [
      ["Both phones think they're {name}! One of you pick the other name in Settings.", "Both phones think they're the same kid! One of you pick the other name in Settings."],
      ["Two {name}s? No. One phone has to be the other kid.", "Two of the same kid? No. One phone has to be the other kid."],
      ["I can't referee {name} against {name}. Switch one phone.", "I can't referee somebody against themselves. Switch one phone."],
      ["Two {name}s? One is plenty. Switch a phone.", "Two of the same? One is plenty. Switch a phone."],
      ["{name} on both phones? That's a mirror, not a game.", "The same kid on both phones? That's a mirror, not a game."],
      ["Hold on. {name} can't play {name}. Change one phone.", "Hold on. Nobody can play themselves. Change one phone."],
      ["Both phones say {name}. One of them is fibbing.", "Both phones say the same name. One of them is fibbing."],
      ["{name} versus {name}? Even I'm confused.", "The same kid versus the same kid? Even I'm confused."],
      ["One phone each, please. Not two {name}s.", "One phone each, please. Not two of the same kid."],
      ["Two {name}s is a timeline error. Fix one phone.", "Two of the same kid is a timeline error. Fix one phone."]]),
    resign: tbl("smug", "g-ref-resign", [
      ["{name} is giving up. Noted. Filed. Laminated.", "Giving up. Noted. Filed. Laminated."],
      "Resigning?! Against your own sibling? Say it louder.",
      ["{name} has stopped this one. I am writing it down though.", "Stopped this one. I am writing it down though."],
      ["{name} folds. I do that too. Constantly.", "Folding. I do that too. Constantly."],
      ["{name} resigns. The next game starts fresh.", "Resigned. The next game starts fresh."],
      ["{name} tips the king over. Dramatic. I like it.", "The king tips over. Dramatic. I like it."],
      ["White flag from {name}! Rematch?", "White flag! Rematch?"],
      ["{name} calls it. Brave. Honestly.", "Called it. Brave. Honestly."],
      ["{name} resigns. The board forgives you. I don't.", "Resigned. The board forgives you. I don't."],
      ["{name} is done. I'll stop the clock. There is no clock.", "All done. I'll stop the clock. There is no clock."]]),
  };
  function fill(text, name) { return String(text || "").replace(/\{name\}/g, String(name || "You")); }
  function lineKey(kind, i) { const g = SAY[kind]; return g && !g.silent && i >= 0 ? g.vk + "-" + (i + 1) : null; }
  function say(kind, prev, name) {
    const g = SAY[kind];
    if (!g) return { text: "", mood: "taunt", index: -1, key: null };
    const i = typeof prev === "number" && prev >= 0 ? (prev + 1) % g.lines.length : 0;
    return { text: fill(g.lines[i], name), mood: g.mood, index: i, key: lineKey(kind, i) };
  }
  // Which line fits what just happened. A blunder and a best move outrank the move itself: what the
  // move did to the position is more interesting than whether it took something.
  function reactionTo(row, opts) {
    const o = opts || {};
    if (isBlunderRow(row, o.bar)) return "blunder";
    if (row && (deliversMate(row) || (matchedBest(row) && gainOf(row) >= (o.bestBar == null ? BEST_GAIN : o.bestBar)))) return "great";
    return P.moveKind((row && row.bait && row.bait.san) || "");
  }

  /* ---------- the result, as two separate reports ----------
     Deliberately a list of one-kid cards and nothing else. There is no top-level anything that pairs
     their numbers, no winner field holding a name, no combined row — the outcome reaches each kid
     only as HIS own result, the way a scoresheet does. tests/test_versus.js asserts this by walking
     the object and refusing any key or string that could be read as a tally. */
  const DRAWN = { stalemate: 1, repetition: 1, fifty: 1, material: 1 };
  function resultFor(kind, side, loser) {
    if (DRAWN[kind]) return "draw";
    if (kind === "resign") return side === loser ? "loss" : "win";
    if (kind === "mate") return side === loser ? "loss" : "win";
    return "draw";
  }
  function resultCards(game, opts) {
    const g = game || {}, o = opts || {};
    const seats = seatsFor(g.white);
    const t = g.t || 0;
    const cards = [0, 1].map(function (profile) {
      const side = colourOf(seats, profile);
      const sum = summarise(g.records, side, { Chess: o.Chess, bar: o.bar, bestBar: o.bestBar });
      const result = resultFor(g.kind, side, g.loser);
      const name = (g.names || [])[profile] || ("Player " + (profile + 1));
      const line = say(result === "win" ? "won" : result === "loss" ? "lost" : "drew", o.sayIndex, name);
      let fights = [];
      try {
        fights = o.Chess ? kidFights(g.records, side, { Chess: o.Chess, F: o.F, profile: profile, t: t,
          bar: o.bar, cap: o.cap }) : [];
      } catch (e) { fights = []; }
      return { profile: profile, name: name, colour: side, result: result,
        moves: sum.moves, blunders: sum.blunders, matched: sum.matched, given: sum.given,
        best: momentCard(sum.best, t), worst: momentCard(sum.worst, t),
        fights: fights, say: line.text, sayKey: line.key, mood: line.mood };
    });
    return { t: t, kind: g.kind || "mate", cards: cards };
  }

  /* Two phones: each phone builds ONLY its own kid's card. Its record holds only his moves (the
     other phone scored the other kid's), his sibling's name never reaches it, and there is no second
     card to put next to it. An unfinished game (abandoned, expired) reports no result at all. */
  function liveResult(game, opts) {
    const g = game || {}, me = g.me === 1 ? 1 : 0;
    const names = ["", ""]; names[me] = (g.names || [])[me] || ("Player " + (me + 1));
    const kind = g.kind || "abandon";
    const all = resultCards({ kind: kind, records: (g.records || []).filter(function (r) { return r && r.profile === me; }),
      names: names, white: g.white, loser: g.loser, t: g.t }, opts);
    const card = all.cards.filter(function (c) { return c.profile === me; })[0];
    if (card && g.unfinished) {
      const l = say("unfinished", (opts || {}).sayIndex, names[me]);
      card.result = "unfinished"; card.say = l.text; card.sayKey = l.key; card.mood = l.mood;
    }
    return { t: all.t, kind: kind, live: true, cards: card ? [card] : [] };
  }

  const api = { BAR, BEST_GAIN, FIGHT_CAP, BEST_CAP, SAY, liveResult,
    mirrorSquare, mirrorUci, mirrorFen, mirrorPack, mirrorRow,
    rowsFor, dropOf, gainOf, isBlunderRow, matchedBest, deliversMate, worstMoment, bestMoment, momentCard,
    punishTakes, summarise, kidFights, nextWhite, seatsFor, colourOf, swapSeats,
    say, fill, lineKey, reactionTo, resultFor, resultCards };
  root.ShockmateVersus = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis,
  (typeof window !== "undefined" && window.ShockmatePlay) ||
  (typeof globalThis !== "undefined" && globalThis.ShockmatePlay) ||
  (typeof require === "function" ? require("./play.js") : null));
