#!/usr/bin/env python3
"""Generate data/ladder.src.json and the ladder days in web/days.js from the Lichess puzzle database.

  python tools/build_ladder.py [--sf PATH] [--workers N]
  python tools/build_encounters.py            # then the normal build scores everything

Source: https://database.lichess.org/lichess_db_puzzle.csv.zst (CC0), downloaded once to
~/tools/lichess/ and never committed. FEN is the position before Glitch's move; Moves[0] is his
move (our `arrive`), Moves[1] is the solution's first move (our `best`).

Every puzzle that would fail the build or tests/test_encounters.py is dropped here, so the build
itself rejects nothing. Text is templated per motif and picked by puzzle-id hash, then nudged so no
two fights in one ladder day share a taunt, gloat, rage, title or hook set. Voiced lines carry no
square names, so a mirrored board never changes their words and audio is shared per template."""
import csv, hashlib, io, json, os, re, string, sys, threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import chess, chess.engine, zstandard
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_encounters as B

DB = Path.home() / "tools/lichess/lichess_db_puzzle.csv.zst"
OUT, DAYS_JS = B.ROOT / "data/ladder.src.json", B.ROOT / "web/days.js"
RUNGS = [(500, 700), (700, 850), (850, 1000), (1000, 1150), (1150, 1300), (1300, 1450)]
PER_RUNG, PER_MOTIF, DAY_SIZE, SHORTLIST, TRIES = 20, 3, 5, 80, 16
MIN_POP, MIN_PLAYS, MAX_RD, MAX_PLIES, BUSY, BUSY_RUNGS = 80, 500, 90, 5, 24, 2
BAIT_GAP, HEADROOM, UNIQUE, BEST_TOL, MATE_BAIT_CAP = 150, 50, 30, 45, 1500
FIRST_DAY = 9

# Theme -> motif, in priority order: the first theme a puzzle carries decides its lesson.
THEMES = [("backRankMate", "backRank"), ("mateIn1", "mateThreat"), ("fork", "fork"), ("pin", "pin"),
          ("skewer", "skewer"), ("discoveredAttack", "discovery"), ("trappedPiece", "trapped"),
          ("capturingDefender", "attackers"), ("hangingPiece", "hanging"), ("defensiveMove", "defend"),
          ("deflection", "counter"), ("attraction", "counter"), ("promotion", "kingMarch"),
          ("advancedPawn", "kingMarch"), ("mateIn2", "mateThreat")]
BUCKETS = ["fork", "hanging", "pin", "mateThreat", "skewer", "discovery", "backRank", "trapped",
           "attackers", "counter", "defend", "kingMarch"]
NAME = {chess.PAWN: "pawn", chess.KNIGHT: "horse", chess.BISHOP: "bishop", chess.ROOK: "rook", chess.QUEEN: "queen", chess.KING: "king"}
VAL = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9, chess.KING: 100}
BLURB = ["Glitch says 500s can't touch this.", "Glitch says 700s go home crying.",
         "Glitch says 850s can't touch this.", "Glitch says 1000s need a nap first.",
         "Glitch says 1150s never beat him. Ever.", "Glitch says 1300s are scared of him."]

# ---------------------------------------------------------------- text
# Slots: {bm} the piece that plays best, {t1}/{t2} the why-gate pieces, {won} what best wins
# ({WON} shouting), {grab} what the bait captures, {mover} the piece the bait moves.
# hook/why/short/whyLong share one index k per fight (voice "<motif>-v<k>"), and hook/why/short are
# slot-free so one recording serves every fight on that template.
T = {
 "fork": dict(room="Fork Hall", mascot="TWO HEADS",
  title=["Two Throats", "Double Bite", "Fork in the Road", "Two for One", "Greedy Fork", "Split Snack"],
  hook=["One piece. Two targets. He can only save one.", "Find the square that bites twice.",
        "Two of his pieces are standing in the wrong place.", "One move can hit two things at once."],
  why=["Your piece hits two things at once. He can only save one.", "One move makes two attacks. Whatever he saves, the other falls.",
       "The fork bites twice. He runs with one and loses the other.", "Attack two pieces with one move and collect the one he leaves."],
  short=["Hit two at once. He saves one.", "One move, two attacks. One falls.", "Bite twice. He loses one.", "Two attacks, one move. Take the leftover."],
  whyLong=["Your {bm} hits his {t1} and his {t2}. He only gets one move to fix it.",
           "A fork is two threats in one move. The {t1} or the {t2}: he picks, you eat.",
           "Look for the square that touches two of his pieces. Your {bm} lands on it.",
           "He cannot save the {t1} and the {t2} in one move. Nobody can."],
  prompt="Tap the 2 pieces your {bm} bites.",
  taunt=["Forks are for spaghetti. Do something else.", "Your {mover} looks bored. Move it. Anywhere.", "Two targets? Nah. Pick the easy one."],
  gloat=["No fork, no problem. For me.", "Both my pieces are safe. Thanks for lunch.", "You missed the double bite. I saw it. Hee hee.",
         "Two heads walked away. You got nothing.", "Where was the fork? In the drawer? Ha!", "I keep everything. You keep the crumbs."],
  rage=["Two heads?! That's cheating!", "BOTH of them?! You can't hit BOTH!", "A FORK?! Who let you have cutlery?!",
        "I can only save ONE?! Unfair! UNFAIR!", "Forked like spaghetti! Twirled and EATEN!", "Double bite?! My pieces had PLANS!",
        "My {won}! My poor {won}! Forked!", "NOOOO. Not the {won}! Anything but the {won}!"]),
 "royalFork": dict(room="Fork Hall", mascot="TWO HEADS",
  title=["Crown Fork", "Royal Pain", "King and Company", "Two Crowns", "Check and Chomp", "Royal Double"],
  hook=["His king and a big piece are standing too close.", "Check the king. Bite something else at the same time.",
        "The king has company. Bad company for him.", "A check can do two jobs."],
  why=["Check the king and hit another piece. He must save the king.", "The king must move first, so the other piece is yours.",
       "A royal fork: the check comes first, the free piece comes next.", "He has to answer the check, and the second piece falls."],
  short=["Check him. Take what he leaves.", "King moves first. The other piece falls.", "Check and bite. Collect next move.", "He saves the king. You eat."],
  whyLong=["Your {bm} checks the king and hits his {t2}. The king must move, so the {t2} is lunch.",
           "When the king is one of the two targets, he never gets a choice.",
           "Check plus attack is the strongest fork there is. Here it wins his {t2}.",
           "Kings must run from check. Whatever stood near him gets eaten."],
  prompt="Tap the king and the {t2} your {bm} hits.",
  taunt=["Leave my king alone. He's napping.", "Checks are rude. Do something polite.", "My king is perfectly safe. Look somewhere else!"],
  gloat=["My king walks away and keeps his friend. Ha!", "No check, no fork, no chance. Lovely.", "You forgot the king can be poked. I didn't.",
         "Crown safe. Everything safe. Bye bye.", "The royal family thanks you for your kindness.", "You looked right past my king. Hee hee."],
  rage=["CROWNS?! You forked the CROWN?!", "Check AND a bite?! That's two moves in one!", "Royal fork?! I'm telling the Queen!",
        "My king ran and left his friend behind!", "The king has to move?! Says WHO?!", "Two crowns?! I only have ONE king!",
        "The KING and the {won}?! Rude! So rude!", "My king has to run and my {won} gets EATEN?!"]),
 "pin": dict(room="Pin Parlor", mascot="THUMBTACK",
  title=["Thumbtack", "Glued", "Stuck Fast", "Nailed Down", "Can't Move", "Pinned and Grinning"],
  hook=["Two of his pieces are standing on one line.", "Glue something to his king.",
        "One of his pieces is not allowed to move.", "Line up. Something is stuck in the middle."],
  why=["The front piece is glued. If it moves, the one behind dies.", "Pin it to the bigger piece behind. Then attack it again.",
       "A pinned piece cannot run. Hit it while it is stuck.", "He cannot move the front piece without losing the back one."],
  short=["It is glued. Hit it.", "Pin it, then pile on.", "Stuck pieces cannot run. Attack.", "Front piece moves, back piece dies."],
  whyLong=["His {t1} cannot move. Behind it sits his {t2}, and your {bm} sees them both.",
           "A pin turns his {t1} into a statue. Statues are easy to eat.",
           "Line your {bm} up with the {t1} and the {t2}. The front one is stuck.",
           "If the {t1} steps aside, the {t2} falls. So it stays, and you win it."],
  prompt="Tap the stuck {t1} and the {t2} behind it.",
  taunt=["Lines are boring. Look over here instead.", "My pieces are just standing around. Nothing to see.", "Pins are for sewing. Do something fun."],
  gloat=["No glue, no problem. My pieces are free.", "Everybody moves. Nobody's stuck. Lovely.", "You had a pin and dropped it. Hee hee.",
         "My pieces wriggled free. Thanks!", "Straight line? What straight line? Ha!", "Unstuck and unbothered. That's me."],
  rage=["Glued?! Unglue it! UNGLUE IT!", "Stuck on a LINE?! Like a bug on a pin?!", "Pinned! Pinned like a butterfly! NOOOO!",
        "A thumbtack?! In MY pieces?! Ouch!", "Who put glue on my board?! WHO?!", "It can't move?! It's supposed to MOVE!",
        "My {won} can't MOVE?! Who put glue there?!", "Move, {won}! MOVE! Why won't you move?!"]),
 "skewer": dict(room="Skewer Kitchen", mascot="SKEWER STICK",
  title=["Skewer Stick", "Shish Kebab", "Through the Middle", "Run or Lose", "Kebab Time", "Line of Fire"],
  hook=["Stab through the big piece. Find what hides behind.", "A big piece stands in front of a smaller one.",
        "Poke the front. Take the back.", "His big piece is shielding a friend."],
  why=["Attack the big piece. It runs, and the one behind dies.", "The front piece must move. The piece behind it falls.",
       "A skewer is a pin backwards. Big piece runs, small piece dies.", "Hit the front piece. When it steps away, take the back one."],
  short=["Hit the front. Eat the back.", "Front runs. Back falls.", "Big piece runs. Small piece dies.", "Poke the front. Take the back."],
  whyLong=["Your {bm} hits his {t1}. It has to move, and the {t2} behind it is lunch.",
           "The {t1} cannot stay and cannot hide the {t2}. That is a skewer.",
           "Big pieces in front of small ones on a line are a kebab waiting to happen.",
           "When the {t1} steps off the line, your {bm} eats the {t2}."],
  prompt="Tap the {t1} that must run and the {t2} behind.",
  taunt=["Straight lines are boring. Try a zigzag.", "My pieces are lined up nicely. Don't touch.", "Nothing to stab here. Move along."],
  gloat=["No kebab today. Everybody's safe.", "My big piece stays. My little piece stays. Ha!", "Slow and safe. And nothing.",
         "You missed the line. I didn't.", "Skewer? Never heard of her.", "Both my pieces say thank you."],
  rage=["Through the middle?! That's a shish kebab!", "Kebab?! I'm not a KEBAB!", "Stabbed through the middle?! Ouch! OUCH!",
        "Who taught you skewers?! Was it the cook?!", "It ran away and the other one DIED?!", "Poked in the front, robbed in the back!",
        "My {won} was HIDING back there! Unfair!", "It ran, and you ate my {won}?! NOOOO!"]),
 "hanging": dict(room="Hanging Buffet", mascot="LOOSE LUNCH",
  title=["Loose Lunch", "Free Meal", "Nobody Home", "Unguarded", "Open Buffet", "Snack Attack"],
  hook=["Something of his has no guard at all.", "One of his pieces is all alone.",
        "Count the guards. One piece has zero.", "Somebody forgot to protect something."],
  why=["That piece has no guard at all. Take it for free.", "Count the guards. Zero means it is yours for nothing.",
       "A piece with no guard is a free meal. Eat it.", "He left it alone. Take it before he wakes up."],
  short=["No guard. Take it free.", "Zero guards. It is yours.", "Free piece. Eat it.", "It is alone. Take it."],
  whyLong=["His {t1} had no guard at all. Always count guards before you grab.",
           "A loose {t1} is a free gift. Take gifts.",
           "Your {bm} takes the {t1} and nobody can take back.",
           "Before any move, look for pieces with zero guards. Here it was his {t1}."],
  prompt="Tap the piece nobody was guarding.",
  taunt=["My pieces are all guarded. Promise. Cross my heart.", "Nothing loose here. Look somewhere else.", "Don't count. Counting is boring."],
  gloat=["You walked right past a free meal. Ha!", "My piece was loose and you didn't notice. Hee hee.", "Free food, and you ordered the poison. Yum.",
         "Buffet closed. You missed it.", "You grabbed the wrong plate. My favorite.", "Nobody guarded it and you STILL missed it!"],
  rage=["Guards! GUARDS! Where were the guards?!", "You COUNTED?! Nobody counts! Stop counting!", "I left it out for ONE second!",
        "Free?! It was NOT free! It was expensive!", "Who was on guard duty?! NOBODY?!", "My lunch! You ate my LUNCH!",
        "NOOOO. That was my WHOLE {WON}!", "Who was guarding my {won}?! NOBODY?!"]),
 "attackers": dict(room="Counting House", mascot="GUARD DOWN",
  title=["Kill the Guard", "Guard Down", "Bodyguard", "Take the Guard", "No Bodyguard", "Remove the Shield"],
  hook=["One piece is doing all his guarding.", "Knock out the bodyguard first.",
        "Something is guarding everything. Remove it.", "His defence has one weak link."],
  why=["Take the guard. Then the piece it protected is loose too.", "Knock out the bodyguard and everything behind it falls.",
       "Count what it guards. Take the guard and win the rest.", "One piece holds his defence together. Take that piece."],
  short=["Take the guard first.", "No bodyguard, no defence.", "Take the guard. Win the rest.", "Take the piece holding it together."],
  whyLong=["His {t1} was the key guard. Your {bm} takes it, and his defence falls apart.",
           "Before you attack a piece, ask who guards it. Then take the guard.",
           "Take away the {t1} and his other pieces have no one looking after them.",
           "The best capture is often the bodyguard, not the prize. Here it was his {t1}."],
  prompt="Tap the guard your {bm} knocks out.",
  taunt=["My guards are super strong. Don't even try.", "Attack the big stuff! Forget the little guard!", "Nothing to count. Nothing at all."],
  gloat=["My bodyguard is still on duty. Ha!", "You went for the prize. The guard said no.", "Guard stays, defence stays. Lovely.",
         "You poked the wrong piece. Hee hee.", "My defence is perfect. Just like me.", "Wrong target. My guard laughs at you."],
  rage=["You took the BODYGUARD?! That's not allowed!", "No guard?! Now everything is loose! NOOOO!", "You COUNTED to three?! Nobody counts to three!",
        "My whole defence! Gone! Like a sandcastle!", "The guard was the TRICK?! Who told you?!", "Knocked out?! My guard was on BREAK!",
        "My {won} was GUARDING everything! Who took it?!", "Not my {won}! It had one job!"]),
 "backRank": dict(room="Back-Rank Basement", mascot="BACK DOOR",
  title=["Basement Door", "Back Row", "Locked In", "No Escape Hatch", "Bottom Floor", "Door Slam"],
  hook=["His own pawns locked the door.", "His king has no escape square.",
        "Look at his back row. Who guards it?", "The king is tucked in too tight."],
  why=["His pawns trap his own king. Land on the back row.", "The king has no square to run to. The back row is mate.",
       "Nobody guards the back row. Slide in and it is over.", "Mate beats any snack. His own pawns block the exit."],
  short=["His pawns trap him. Back row.", "No escape square. Back row mates.", "Nobody guards the back row. Slide in.", "Mate beats a snack."],
  whyLong=["His pawns stand in front of his king like a wall. The back row is the only way in.",
           "Always give your own king a little air. He never did.",
           "Your {bm} lands on his back row and the king has nowhere to go.",
           "Before you grab anything, check the back row. It ends the game."],
  prompt="Tap the king with no escape square.",
  taunt=["My king is cozy in bed. Leave him be.", "The back row is fine. Totally fine.", "Forget my king. Snacks are more fun."],
  gloat=["You went snack hunting. The game goes on. And on.", "My king stays cozy. Thanks!", "No mate, no problem. Hee hee.",
         "You missed the door. I locked it back.", "My king is still in bed. Snoring.", "The back row sends its regards. Ha!"],
  rage=["MY OWN PAWNS locked the door?!", "Trapped in my own basement?! NOOOO!", "Who built this house with no back door?!",
        "My pawns were supposed to PROTECT me!", "Mate?! On the BACK ROW?! Again?!", "I needed ONE little escape square! ONE!"]),
 "mateThreat": dict(room="Checkmate Chamber", mascot="THE END",
  title=["Checkmate Time", "Finish Him", "Curtain Call", "Game Over", "The End", "Final Move"],
  hook=["The game can end right now.", "Look for the checkmate before the snack.",
        "His king is closer to trouble than he thinks.", "Checks first. One of them ends everything."],
  why=["Checkmate ends the game. No snack is worth more.", "Look at every check first. One of them is mate.",
       "His king has nowhere to go. Finish it now.", "Mate beats any piece you could grab."],
  short=["Mate beats any snack.", "Look at checks. One mates.", "No escape. Finish him.", "Mate first. Snacks never."],
  whyLong=["Checks, captures, threats: look in that order. The win is hiding in the checks.",
           "Your {bm} goes for the king. Grabbing stuff only lets him keep playing.",
           "Every square around his king is covered, or soon will be. That is what mate looks like.",
           "When the king has no way out, stop counting pieces and finish."],
  prompt="Tap the king you are mating.",
  taunt=["Ignore my king. He's not important. At all.", "Why end the game? Let's keep playing forever!", "Grab stuff! Grabbing is the fun part!"],
  gloat=["You took the snack. I'm still alive. Rude.", "Still breathing! Hee hee. Your turn.", "You had mate and chose lunch. Lovely.",
         "My king lives to annoy you another day.", "No mate? Then the fight goes on. Forever.", "Close one. Not close enough. Ha!"],
  rage=["Mate?! I was offering you FREE stuff!", "Game OVER?! I wasn't READY!", "You looked at the CHECKS?! Who does that?!",
        "Checkmate?! Take it back! TAKE IT BACK!", "The end?! But I had a whole plan!", "NOOOO. My king had nowhere to go!"]),
 "discovery": dict(room="Discovery Observatory", mascot="DISCOVERY",
  title=["Hidden Laser", "Peekaboo", "Surprise Attack", "Out of the Way", "Curtain Pull", "Secret Weapon"],
  hook=["One of your pieces is hiding behind another.", "Move the front piece. Something wakes up.",
        "There's a laser behind your own piece.", "Two attackers are waiting in one line."],
  why=["Move the front piece. The one behind it attacks too.", "One step aside opens a hidden attack. Two threats at once.",
       "The piece that moves attacks. The piece behind attacks too.", "Uncover the laser. He cannot stop two attacks."],
  short=["Step aside. The piece behind fires.", "Step aside. Two attacks at once.", "Both pieces attack. He saves one.", "Move it. The laser fires."],
  whyLong=["Your {bm} steps out of the way, and your {t1} suddenly sees his {t2}.",
           "A discovered attack is two threats for the price of one move.",
           "Your {t1} was aiming all along. It just needed the road cleared.",
           "When your piece stands in front of your own laser, move it with a threat."],
  prompt="Tap your hidden {t1} and the {t2} it hits.",
  taunt=["Your pieces are in a traffic jam. Ha!", "Nothing hiding here. Nothing at all.", "Don't move that piece. It's comfy there."],
  gloat=["The laser stayed hidden. Lucky me.", "You forgot what was behind you. Hee hee.", "One attack. Easy to block. Ha!",
         "Your secret weapon stayed secret. From you!", "Peekaboo? Nope. No peekaboo today.", "Traffic jam. Your pieces are stuck. Lovely."],
  rage=["A LASER?! Behind your own piece?!", "Where did THAT come from?! It was HIDING!", "Two attacks from ONE move?! Cheater!",
        "Peekaboo?! I HATE peekaboo!", "Who opened the curtain?! Close it! CLOSE IT!", "A secret weapon?! Nobody told ME!",
        "My {won}! It came out of NOWHERE!"]),
 "trapped": dict(room="Trap Room", mascot="NO EXIT",
  title=["No Exit", "Cornered", "Boxed In", "Dead End", "Nowhere to Run", "Trap Door"],
  hook=["One of his pieces has nowhere to go.", "Take away his piece's last escape.",
        "A piece that cannot move is already lost.", "Something of his is stuck in a corner."],
  why=["His piece has no safe square. Attack it and it dies.", "It cannot run anywhere. Hit it and collect.",
       "Every escape is covered. The piece is trapped.", "No squares to run to. Attack it, don't trade it."],
  short=["No safe square. Attack it.", "It cannot run. Hit it.", "Escapes covered. It is trapped.", "Trapped. Attack, do not trade."],
  whyLong=["His {t1} has no safe squares left. Your {bm} attacks it and it cannot run.",
           "A piece with no squares is already lost. Attack it and wait.",
           "Look at every square the {t1} could go to. All covered.",
           "Before you chase a piece, check if it can even run. His {t1} cannot."],
  prompt="Tap the {t1} with no way out.",
  taunt=["My pieces have lots of room. Tons of room.", "Leave my pieces alone. They're resting.", "Chasing is boring. Grab something instead!"],
  gloat=["My piece wriggled out. Bye bye!", "You left the door open. Thanks!", "Escaped! Like a sneaky little mouse. Hee hee.",
         "No trap today. Just a party.", "You blinked. My piece ran away. Ha!", "The cage was open. I noticed."],
  rage=["No way out?! Not even a tiny one?!", "TRAPPED?! In a box?! Like a sandwich?!", "Every door is locked?! Who has the key?!",
        "Cornered?! I don't DO corners!", "A trap?! On MY board?! Rude!", "Stuck! Stuck like gum on a shoe!",
        "My {won} can't MOVE?! Who designed this?!", "Run, {won}! RUN! Why can't you run?!"]),
 "defend": dict(room="Shield Room", mascot="HOLD IT",
  title=["Hold the Line", "Shield Up", "Stand Firm", "Don't Panic", "Guard It", "Brace"],
  hook=["He attacks first. Answer without giving anything away.", "His last move made a threat. Deal with it.",
        "Something of yours is under fire.", "Stop. What did his move just attack?"],
  why=["His move attacked you. Fix the threat first, then play.", "Answer the attack with the one move that keeps everything.",
       "Defend first. The fancy move loses what he attacked.", "See his threat, then stop it. Everything else can wait."],
  short=["Fix his threat first.", "One move keeps everything safe.", "Defend first. Fancy later.", "See the threat. Stop it."],
  whyLong=["His {t2} was hitting your {t1}. The best move deals with that first.",
           "Every enemy move asks a question. His {t2} asked about your {t1}.",
           "Before your own plan, ask what his last move attacked. Here: your {t1}.",
           "A good defence keeps everything. The wrong one hands him the game."],
  prompt="Tap his {t2} and the {t1} it attacks.",
  taunt=["Attack! Attack! Defence is for scaredy cats!", "Ignore me. My move did nothing. Promise.", "Forget my threat. Go do your own thing!"],
  gloat=["You forgot my threat. I didn't. Ha!", "My attack worked. Your stuff is mine.", "Didn't look, did you? Hee hee.",
         "One question, wrong answer. Lovely.", "My threat was real. Surprise!", "You played your plan. I played mine better."],
  rage=["You SAW it?! You were supposed to be busy!", "My attack bounced off?! Like a rubber ball?!", "Blocked?! By THAT?! Rude!",
        "You defended AND kept everything?! Cheater!", "My big threat! Fizzled! Like wet fireworks!", "You asked what I attacked?! Stop ASKING!"]),
 "counter": dict(room="Counter Yard", mascot="HIT BACK",
  title=["Hit Back", "Bigger Threat", "Answer Back", "Turn the Tables", "Counterpunch", "No Running"],
  hook=["He attacks you. Hit back harder.", "Don't run. Look for something bigger.",
        "His attack left something open.", "A check or a capture beats running away."],
  why=["Don't run. Answer his attack with a bigger one.", "A check or capture first. He has to deal with yours.",
       "Hit back harder, and his attack no longer matters.", "Running loses time. Your threat is bigger than his."],
  short=["Don't run. Hit back bigger.", "Check or capture first.", "Hit back harder. His attack fades.", "Your threat is bigger. Play it."],
  whyLong=["His move hit your {t1}. Instead of running, your {bm} hits back harder.",
           "A check is a free move. Answer an attack with a bigger one.",
           "Before you run, look for checks and captures of your own.",
           "Your {t1} was attacked, but your counterattack is worth more."],
  prompt="Tap his {t2} and the {t1} it attacks.",
  taunt=["Run! Run away! Quick, before it's too late!", "Scared yet? You should be. Hide something!", "Just protect your stuff. Nothing else matters."],
  gloat=["You ran away. I keep everything. Lovely.", "You hid. I kept my stuff. Same as always.", "Running is my favorite thing you do.",
         "Scared you! Hee hee. Works every time.", "You ran. My piece is fine. Thanks for playing.", "Hide and seek! You hid. I win."],
  rage=["You hit BACK?! You were supposed to be SCARED!", "I attacked FIRST! That's not fair!", "CHECK?! I was in the middle of something!",
        "My attack! Ignored! How rude!", "You didn't RUN?! Everybody runs!", "Bigger threat?! Mine was big! Mine was HUGE!"]),
 "kingMarch": dict(room="Endgame Vault", mascot="CROWN RUN",
  title=["Crown Run", "Push It", "Queen Me", "March On", "Pawn Power", "Last Step"],
  hook=["One of your pawns smells a crown.", "The last row is closer than it looks.",
        "A little pawn wants a big promotion.", "Push the right pawn and he can't keep up."],
  why=["Push the pawn. It becomes a queen faster than he can stop it.", "The pawn runs, and his pieces are too far to catch it.",
       "A new queen beats any snack on the board.", "Your pawn is closer to the end than his defenders are."],
  short=["Push the pawn. It becomes a queen.", "The pawn runs. Nobody catches it.", "A new queen beats snacks.", "Push. His guards are too far."],
  whyLong=["Your pawn marches to the last row and becomes a queen. Count the steps before you snack.",
           "Passed pawns must be pushed. His pieces are too far away to stop it.",
           "Every step your pawn takes, his pieces get more nervous.",
           "A pawn one step from a crown is worth more than most pieces."],
  prompt="Tap the pawn that wants a crown.",
  taunt=["Pawns are tiny. Forget about pawns.", "Leave that little pawn alone. It's sleepy.", "Pawns are slow. Do something fast!"],
  gloat=["Your pawn stayed home. Boring! Lovely!", "No crown for you today. Hee hee.", "My king walks over and eats your pawn. Yum.",
         "Tiny pawn, tiny chance. Ha!", "You forgot about the pawn. I didn't.", "The crown stays in MY treasure box."],
  rage=["A PAWN did that?!", "A new QUEEN?! Where did she come from?!", "It was just a little pawn! A LITTLE one!",
        "The pawn got a CROWN?! I want a crown!", "Stop it! Pawns are not allowed to grow up!", "NOOOO. It reached the end! Who let it?!"]),
}
# Shared by bait kind: Glitch dangles the actual piece the bait grabs or moves.
BAIT = {
 "taunt": {
  "cap": ["Psst. Free {grab}. Grab it. Nobody's looking.", "That {grab} is begging to be eaten.", "Look at that juicy {grab}. Just take it!",
          "Free {grab}! Free {grab}! Take it before I change my mind!", "Eat the {grab}. Snacks first, thinking later.",
          "A whole {grab}, just lying there. Go on.", "Take the {grab}. What could possibly go wrong?", "Mmm, {grab}. Crunchy. Grab it quick!"],
  "chk": ["Check him with your {mover}! Checks are always good!", "Your {mover} can give check. Loud and scary. Do it!",
          "Check! Check! Everybody loves a check!", "Poke his king with your {mover}. He hates that.", "Just check him. Checks never lose. Trust me.",
          "Your {mover} wants to say check. Let it!", "Scare the king! Check first, think never!"],
  "quiet": ["Careful, careful. Just move your {mover} somewhere safe.", "Tuck your {mover} away. Nothing bad ever happens.",
            "Slow and safe. Shuffle your {mover}. Yawn.", "Your {mover} looks nervous. Move it. Quick!",
            "Play it safe. Your {mover} wants a little walk.", "Nothing to see here. Just nudge your {mover}.",
            "Be sensible. Move your {mover}. Sensible is good."]},
 "gloat": {
  "cap": ["Ha! You ate the {grab}. Now watch me eat.", "Enjoy the {grab}. It was poisoned. Hee hee.",
          "One {grab} for you. The whole game for me.", "Yum, the {grab}. That was my trap. Hee hee."],
  "chk": ["You checked. I moved. We can do this all day.", "Big loud check. Nothing happened. Lovely."],
  "quiet": ["Slow and safe. And now I win. Ha!", "You played it safe. Safe for ME."]},
 "whyLong": {
  "cap": ["Grabbing the {grab} was the bait.", "The {grab} was poisoned cheese.", "Glitch wanted you busy eating the {grab}.", "The free {grab} was a trap."],
  "chk": ["The loud check was the bait.", "That check looked scary and did nothing.", "Glitch wanted a check that goes nowhere.", "Checking just for fun was the trap."],
  "quiet": ["The safe-looking move was the bait.", "Moving the {mover} just gave him time.", "The slow move was a trap.", "Glitch wanted you to play it safe."]},
}
SQUARE = re.compile(r"\b[a-h][1-8]\b")
NOTATION = re.compile(r"\b[KQRBN][a-h][1-8]\b")

def slots(t: str) -> set:
    return {n for _, n, _, _ in string.Formatter().parse(t) if n}

def fill(t: str, f: dict) -> str:
    return t.format_map(dict(f, WON=(f.get("won") or "").upper()))

def usable(t: str, f: dict) -> bool:
    return all(f.get(s.lower() if s == "WON" else s) for s in slots(t))

def words(t: str) -> int:
    return len(t.split())

def check_templates() -> None:
    """Static rules the tests hold every filled line to, checked once over every template."""
    for m, t in T.items():
        for k in ("hook", "why", "short", "whyLong"): assert len(t[k]) == 4, f"{m} {k} needs 4 variants"
        for k in ("taunt",): assert len(t[k]) >= 3, m
        for k in ("gloat", "rage"): assert len([x for x in t[k] if not slots(x)]) >= 6, f"{m} {k} needs 6 slot-free variants"
        assert len(t["title"]) >= 6, m
        for i in range(4):
            for k in ("hook", "why", "short"):
                assert not slots(t[k][i]) and not SQUARE.search(t[k][i]), f"{m} {k}{i}: voiced lines are slot-free, no squares"
            s = t["short"][i]
            assert 4 <= words(s) <= 9 and words(s) < words(t["why"][i]), f"{m} short{i} must be 4-9 words and shorter than its why"
            assert re.match(r"^[A-Z].*[.!?]$", s), f"{m} short{i} must be a sentence"
        for k in ("taunt", "gloat", "rage"):
            for x in t[k]: assert 3 <= words(x) <= 14 and not SQUARE.search(x), f"{m} {k}: {x}"
    for k, fams in BAIT.items():
        for fam, xs in fams.items():
            for x in xs: assert not SQUARE.search(x), x

# ---------------------------------------------------------------- stage 1: stream and shortlist
def rung_of(rating: int):
    for i, (lo, hi) in enumerate(RUNGS):
        if lo <= rating < hi: return i + 1
    return None

def primary(themes: set):
    for t, m in THEMES:
        if t in themes: return m
    return None

def shortlist() -> dict:
    """Best SHORTLIST puzzles per (rung, motif) bucket: oneMove first, then fewest plies, then most popular."""
    lists, n = {}, 0
    with open(DB, "rb") as f:
        rows = csv.DictReader(io.TextIOWrapper(zstandard.ZstdDecompressor().stream_reader(f), encoding="utf-8"))
        for row in rows:
            n += 1
            try:
                rating, rd, pop, plays = int(row["Rating"]), int(row["RatingDeviation"]), int(row["Popularity"]), int(row["NbPlays"])
            except ValueError:
                continue
            rung = rung_of(rating)
            if not rung or pop < MIN_POP or plays < MIN_PLAYS or rd > MAX_RD: continue
            moves = row["Moves"].split()
            if len(moves) < 2 or len(moves) - 1 > MAX_PLIES: continue
            themes = set(row["Themes"].split()); motif = primary(themes)
            if not motif: continue
            if rung <= BUSY_RUNGS and sum(c.isalpha() for c in row["FEN"].split()[0]) > BUSY + 1: continue
            key = (0 if "oneMove" in themes else 1, len(moves), -pop, -plays, row["PuzzleId"])
            bucket = lists.setdefault((rung, motif), [])
            bucket.append((key, {"pid": row["PuzzleId"], "fen": row["FEN"], "moves": moves, "rating": rating, "themes": sorted(themes)}))
            if len(bucket) > SHORTLIST * 4:
                bucket.sort(key=lambda kv: kv[0]); del bucket[SHORTLIST:]
    for b in lists.values():
        b.sort(key=lambda kv: kv[0]); del b[SHORTLIST:]
    print(f"streamed {n} puzzles; shortlisted {sum(len(b) for b in lists.values())} in {len(lists)} buckets")
    return {k: [c for _, c in v] for k, v in lists.items()}

# ---------------------------------------------------------------- stage 2: structure (no engine)
def ray_pair(b: chess.Board, sq: int, df: int, dr: int) -> list:
    out, f, r = [], chess.square_file(sq) + df, chess.square_rank(sq) + dr
    while 0 <= f < 8 and 0 <= r < 8 and len(out) < 2:
        s = chess.square(f, r)
        if b.piece_at(s): out.append(s)
        f += df; r += dr
    return out

def targets(motif: str, board: chess.Board, best: chess.Move, arrive: chess.Move):
    """Why-gate squares and the piece names the text needs, or None when the lesson is not on the board."""
    us, them = board.turn, not board.turn
    after = board.copy(); after.push(best)
    mover = board.piece_at(best.from_square)
    def foe(b, s):
        p = b.piece_at(s); return p if p and p.color == them else None
    nm = lambda b, s: NAME[b.piece_at(s).piece_type]
    val = lambda b, s: VAL[b.piece_at(s).piece_type]
    f = {"bm": NAME[mover.piece_type]}
    if motif == "fork":
        hit = sorted((s for s in after.attacks(best.to_square) if foe(after, s) and after.piece_at(s).piece_type != chess.PAWN),
                     key=lambda s: (-val(after, s), s))
        if len(hit) < 2: return None
        a, b2 = hit[:2]
        if after.piece_at(a).piece_type == chess.KING: motif = "royalFork"
        f.update(t1=nm(after, a), t2=nm(after, b2), won=nm(after, b2))
        return motif, [chess.square_name(a), chess.square_name(b2)], f
    if motif in ("pin", "skewer"):
        pt = after.piece_at(best.to_square).piece_type
        dirs = ([(1, 1), (1, -1), (-1, 1), (-1, -1)] if pt in (chess.BISHOP, chess.QUEEN) else []) + \
               ([(1, 0), (-1, 0), (0, 1), (0, -1)] if pt in (chess.ROOK, chess.QUEEN) else [])
        pairs = []
        for df, dr in dirs:
            p = ray_pair(after, best.to_square, df, dr)
            if len(p) == 2 and foe(after, p[0]) and foe(after, p[1]):
                front, back = val(after, p[0]), val(after, p[1])
                if (motif == "pin" and back > front) or (motif == "skewer" and front > back): pairs.append(p)
        if not pairs and motif == "pin":
            king = after.king(them)
            pinned = sorted((s for s in chess.SQUARES if foe(after, s) and after.piece_at(s).piece_type not in (chess.PAWN, chess.KING)
                             and after.is_pinned(them, s)), key=lambda s: (-val(after, s), s))
            if pinned and king is not None: pairs = [[pinned[0], king]]
        if not pairs: return None
        pairs.sort(key=lambda p: (-(val(after, p[1]) if motif == "pin" else val(after, p[0])), p))
        front, back = pairs[0]
        won = front if motif == "pin" else back
        f.update(t1=nm(after, front), t2=nm(after, back), won=nm(after, won) if val(after, won) < 100 else None)
        return motif, [chess.square_name(front), chess.square_name(back)], f
    if motif in ("hanging", "attackers"):
        cap = foe(board, best.to_square)
        if not cap or cap.piece_type == chess.KING: return None
        f.update(t1=NAME[cap.piece_type], won=NAME[cap.piece_type])
        return motif, [chess.square_name(best.to_square)], f
    if motif in ("backRank", "mateThreat"):
        k = board.king(them)
        if k is None: return None
        if motif == "backRank" and chess.square_rank(k) != (7 if them == chess.BLACK else 0): return None
        f.update(t1="king")
        return motif, [chess.square_name(k)], f
    if motif == "discovery":
        found = []
        for s in chess.SQUARES:
            p = after.piece_at(s)
            if not p or p.color != us or s == best.to_square or p.piece_type not in (chess.BISHOP, chess.ROOK, chess.QUEEN): continue
            for t in after.attacks(s) & ~board.attacks(s):
                if foe(after, t) and after.piece_at(t).piece_type != chess.PAWN: found.append((-val(after, t), s, t))
        if not found: return None
        _, s, t = sorted(found)[0]
        f.update(t1=nm(after, s), t2=nm(after, t), won=nm(after, t) if val(after, t) < 100 else None)
        return motif, [chess.square_name(s), chess.square_name(t)], f
    if motif == "trapped":
        hit = sorted((s for s in after.attacks(best.to_square) if foe(after, s) and after.piece_at(s).piece_type not in (chess.PAWN, chess.KING)),
                     key=lambda s: (-val(after, s), s))
        if not hit: return None
        f.update(t1=nm(after, hit[0]), won=nm(after, hit[0]))
        return motif, [chess.square_name(hit[0])], f
    if motif in ("defend", "counter"):
        if motif == "counter" and not (board.is_capture(best) or board.gives_check(best)): return None
        a = arrive.to_square
        mine = [s for s in board.attacks(a) if board.piece_at(s) and board.piece_at(s).color == us]
        if not mine: return None
        mine.sort(key=lambda s: (board.piece_at(s).piece_type == chess.KING, -val(board, s), s))
        f.update(t1=nm(board, mine[0]), t2=nm(board, a))
        return motif, [chess.square_name(mine[0]), chess.square_name(a)], f
    if motif == "kingMarch":
        if mover.piece_type != chess.PAWN: return None
        f.update(t1="pawn")
        return motif, [chess.square_name(best.from_square)], f
    return None

def structure(c: dict, bucket: str, known: set):
    board = chess.Board(c["fen"])
    arrive = chess.Move.from_uci(c["moves"][0])
    if arrive not in board.legal_moves or board.is_castling(arrive) or board.is_en_passant(arrive) or arrive.promotion: return None
    taken = board.piece_at(arrive.to_square)
    board.push(arrive)
    if c["rung"] <= BUSY_RUNGS and len(board.piece_map()) > BUSY: return None
    if board.board_fen() in known or board.mirror().board_fen() in known: return None
    best = chess.Move.from_uci(c["moves"][1])
    if best not in board.legal_moves: return None
    tg = targets(bucket, board, best, arrive)
    if not tg: return None
    motif, squares, facts = tg
    e = {"fen": board.fen(), "arrive": arrive.uci(), "best": best.uci(), "bait": best.uci(),
         "whyTargets": {"prompt": "", "squares": squares}, "glitch": {}, "id": "L" + c["pid"]}
    if taken: e["arriveCaptured"] = taken.symbol().lower()
    try:
        B.prepare(e)
    except AssertionError:
        return None
    return dict(c, motif=motif, facts=facts, entry=e, board_fen=board.board_fen())

# ---------------------------------------------------------------- stage 3: engine, bait, and the build's own checks
_local = threading.local()
_engines, _lock = [], threading.Lock()

def engine() -> chess.engine.SimpleEngine:
    if not hasattr(_local, "e"):
        _local.e = chess.engine.SimpleEngine.popen_uci(B.sf_path())
        _local.e.configure({"Threads": 1, "Hash": 64})
        with _lock: _engines.append(_local.e)
    return _local.e

def unmirror(u: str) -> str:
    m = chess.Move.from_uci(u)
    return chess.Move(chess.square_mirror(m.from_square), chess.square_mirror(m.to_square), promotion=m.promotion).uci()

def judge(c: dict):
    """Score every move the way the build does, pick the bait a 400 kid plays, and run the built fight
    through the same rules tests/test_encounters.py holds it to. None means drop the puzzle."""
    try:
        eng = engine()
        e = B.prepare(dict(c["entry"]))
        board = chess.Board(e["fen"]); best = e["best"]
        scores = B.score_moves(eng, board)
        top, sb = max(scores.values()), scores[best]
        if sb < top: return None
        others = [v for u, v in scores.items() if u != best]
        if not others: return None
        if sb < B.MATE - 100 and max(others) > sb - UNIQUE: return None
        def ok(u):
            v = scores[u]
            if sb - v < BAIT_GAP + HEADROOM: return False
            return not (sb >= B.MATE - 100 and v > MATE_BAIT_CAP)
        pool = [u for u in scores if u != best and ok(u)]
        if not pool: return None
        mv = {u: chess.Move.from_uci(u) for u in pool}
        def grab(u):
            p = board.piece_at(mv[u].to_square); return VAL[p.piece_type] if p else (1 if board.is_en_passant(mv[u]) else 0)
        caps = [u for u in pool if board.is_capture(mv[u])]
        checks = [u for u in pool if board.gives_check(mv[u])]
        if caps: bait, kind = max(caps, key=lambda u: (grab(u), scores[u], u)), "cap"
        elif checks: bait, kind = max(checks, key=lambda u: (scores[u], u)), "chk"
        else: bait, kind = max(pool, key=lambda u: (scores[u], u)), "quiet"
        bm = chess.Move.from_uci(bait)
        facts = dict(c["facts"], kind=kind, mover=NAME[board.piece_at(bm.from_square).piece_type],
                     grab=NAME[board.piece_at(bm.to_square).piece_type] if kind == "cap" and board.piece_at(bm.to_square) else ("pawn" if kind == "cap" else None))
        src_bait = unmirror(bait) if e.get("mirrored") else bait
        entry = dict(c["entry"], bait=src_bait, bestTol=BEST_TOL, title="x", hook="x", why="x", whyLong="x", glitch={"taunt": "x", "gloat": "x", "rage": "x"})
        out = B.build(eng, entry, scores)
        m = out["moves"]; sb2, sbait = m[out["best"]]["cp"], m[out["bait"]]["cp"]
        top2 = max(v["cp"] for v in m.values())
        assert (sb2 >= B.MATE - 100 and sbait < B.MATE - 100) or sb2 - sbait >= BAIT_GAP
        assert top2 - sb2 <= max(10, abs(top2) * 0.04)
        assert m[out["best"]]["tier"] == "best" and m[out["bait"]]["tier"] == "bait"
        for key in ("bestLineUci", "temptingLineUci"): assert 1 <= len(out[key]) <= 5
        return {"bait": src_bait, "facts": facts, "best_cp": sb2, "bait_cp": sbait}
    except (AssertionError, chess.engine.EngineError, chess.engine.EngineTerminatedError, KeyError):
        return None

# ---------------------------------------------------------------- selection
def select(lists: dict, known: set, workers: int) -> dict:
    by_rung = {}
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for r in range(1, len(RUNGS) + 1):
            order = BUCKETS[(r - 1) % len(BUCKETS):] + BUCKETS[:(r - 1) % len(BUCKETS)]
            queue = {m: [dict(c, rung=r) for c in lists.get((r, m), [])] for m in order}
            ptr, tries, count, got, dropped = {m: 0 for m in order}, {m: 0 for m in order}, {}, [], {"structure": 0, "engine": 0}
            while len(got) < PER_RUNG:
                batch = []
                for m in order:
                    if count.get(m, 0) >= PER_MOTIF or tries[m] >= TRIES: continue
                    while ptr[m] < len(queue[m]):
                        c = queue[m][ptr[m]]; ptr[m] += 1
                        s = structure(c, m, known)
                        if s: batch.append((m, s)); tries[m] += 1; break
                        dropped["structure"] += 1
                if not batch: break
                for (m, s), res in zip(batch, pool.map(lambda ms: judge(ms[1]), batch)):
                    if not res: dropped["engine"] += 1; continue
                    if len(got) >= PER_RUNG or count.get(m, 0) >= PER_MOTIF or s["board_fen"] in known: continue
                    count[m] = count.get(m, 0) + 1; known.add(s["board_fen"])
                    got.append(dict(s, **res))
            print(f"rung {r} {RUNGS[r-1]}: {len(got)} fights {dict(sorted(count.items()))} dropped {dropped}")
            by_rung[r] = got
    return by_rung

# ---------------------------------------------------------------- text assignment
def seed(pid: str, salt: str) -> int:
    return int(hashlib.sha1(f"{pid}|{salt}".encode()).hexdigest(), 16)

def pick(options: list, f: dict, s: int, used: set):
    """options: [(key, template)]. Deterministic start by hash; step past anything used today."""
    opts = [(k, t) for k, t in options if usable(t, f)]
    assert opts, "no usable template"
    start = s % len(opts)
    for i in range(len(opts)):
        k, t = opts[(start + i) % len(opts)]
        txt = fill(t, f)
        if txt not in used: break
    else:
        k, t = opts[start]; txt = fill(t, f)
    sl = sorted(slots(t))
    vkey = k + "".join("-" + f[x.lower() if x == "WON" else x] for x in sl if x in ("grab", "mover", "won", "WON"))
    return vkey, txt

def glitch_pool(motif: str, kind: str, line: str, f: dict) -> list:
    own = [(f"{motif}-{line}{i+1}", t) for i, t in enumerate(T[motif][line])]
    shared = [(f"bait-{line}-{f['kind']}{i+1}", t) for i, t in enumerate(BAIT[line][f["kind"]])] if line in BAIT else []
    return own + shared

def dress(day: list) -> None:
    used = {k: set() for k in ("taunt", "gloat", "rage", "title", "v")}
    for c in day:
        m, f, pid = c["motif"], c["facts"], c["pid"]
        t = T[m]
        k = seed(pid, "v") % 4
        for i in range(4):
            if (m, (k + i) % 4) not in used["v"]: k = (k + i) % 4; break
        used["v"].add((m, k))
        voice = f"{m}-v{k+1}"
        title = pick([(f"{m}-title{i+1}", x) for i, x in enumerate(t["title"])], f, seed(pid, "title"), used["title"])[1]
        used["title"].add(title)
        g, keys = {}, {"hook": voice + "-hook", "why": voice + "-why", "short": voice + "-short"}
        for line in ("taunt", "gloat", "rage"):
            vk, txt = pick(glitch_pool(m, f["kind"], line, f), f, seed(pid, line), used[line])
            used[line].add(txt); g[line] = txt; keys[line] = vk
        bait_line = pick([(f"bait-whyLong-{f['kind']}{i+1}", x) for i, x in enumerate(BAIT["whyLong"][f["kind"]])], f, seed(pid, "wl"), set())[1]
        why_long = t["whyLong"][k] if usable(t["whyLong"][k], f) else t["whyLong"][1]
        e = c["entry"]
        c["out"] = {
            "id": c["id"], "pack": "ladder", "generated": True, "rung": c["rung"], "rating": c["rating"], "lichess": c["pid"],
            "motif": m, "title": title, "palaceRoom": t["room"], "mascot": t["mascot"],
            "fen": e["fen"], "arrive": e["arrive"], **({"arriveCaptured": e["arriveCaptured"]} if e.get("arriveCaptured") else {}),
            "best": e["best"], "bait": c["bait"], "bestTol": BEST_TOL,
            "hook": t["hook"][k], "why": t["why"][k], "whyLong": fill(why_long, f) + " " + bait_line,
            "whyTargets": {"prompt": fill(t["prompt"], f), "squares": e["whyTargets"]["squares"]},
            "glitch": g, "short": t["short"][k], "voice": voice, "voiceKeys": keys,
        }
        assert words(c["out"]["whyTargets"]["prompt"]) <= 12, c["out"]["whyTargets"]["prompt"]

# ---------------------------------------------------------------- output
def write_days(days: list) -> None:
    rows = [f'    {{ n: {d["n"]}, title: {json.dumps(d["title"], ensure_ascii=False)}, blurb: {json.dumps(d["blurb"])}, ladder: true, ids: {json.dumps(d["ids"])} }},'
            for d in days]
    block = "  /* LADDER:START generated by tools/build_ladder.py; do not edit by hand */\n  const LADDER = [\n" + "\n".join(rows) + "\n  ];\n  /* LADDER:END */"
    js = DAYS_JS.read_text(encoding="utf-8")
    js2, n = re.subn(r"  /\* LADDER:START.*?LADDER:END \*/", lambda _: block, js, flags=re.S)
    assert n == 1, "web/days.js is missing the LADDER:START/LADDER:END markers"
    DAYS_JS.write_text(js2, encoding="utf-8")

def known_boards() -> set:
    out = set()
    for p in B.SRCS:
        if p.exists() and p != OUT:
            for e in json.loads(p.read_text(encoding="utf-8")):
                try: out.add(B.prepare(e)["fen"].split()[0])
                except AssertionError: pass
    return out | {chess.Board(f + " w - - 0 1").mirror().board_fen() for f in out}

def main() -> None:
    check_templates()
    assert DB.exists(), f"download https://database.lichess.org/lichess_db_puzzle.csv.zst to {DB}"
    workers = int(sys.argv[sys.argv.index("--workers") + 1]) if "--workers" in sys.argv else max(1, min(6, (os.cpu_count() or 2) - 2))
    lists = shortlist()
    try:
        by_rung = select(lists, known_boards(), workers)
    finally:
        for e in _engines: e.quit()
    fights, days, n = [], [], FIRST_DAY
    for r, got in by_rung.items():
        got.sort(key=lambda c: (c["rating"], c["pid"]))
        for i, c in enumerate(got): c["id"] = f"L{r}{i+1:02d}"
        chunks = [got[i:i + DAY_SIZE] for i in range(0, len(got), DAY_SIZE)]
        for j, day in enumerate(chunks):
            dress(day)
            days.append({"n": n, "title": f"Ladder {r} · {j+1}/{len(chunks)}", "blurb": BLURB[r - 1], "ids": [c["id"] for c in day]}); n += 1
            fights += [c["out"] for c in day]
    OUT.write_text(json.dumps(fights, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    write_days(days)
    by_m = {}
    for e in fights: by_m[e["motif"]] = by_m.get(e["motif"], 0) + 1
    print(f"wrote {len(fights)} fights in {len(days)} ladder days -> {OUT.relative_to(B.ROOT)}; motifs {dict(sorted(by_m.items()))}")

if __name__ == "__main__": main()
