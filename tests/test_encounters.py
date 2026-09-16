#!/usr/bin/env python3
import json, sys
from pathlib import Path
try:
    import chess
except ImportError:
    print("python-chess required")
    sys.exit(1)
DATA = Path(__file__).resolve().parents[1] / "data" / "encounters.json"
def test():
    data = json.loads(DATA.read_text())
    assert len(data) == 12
    for e in data:
        board = chess.Board(e["fen"])
        assert board.is_valid()
        best = chess.Move.from_uci(e["best"])
        tempt = chess.Move.from_uci(e["tempting"])
        assert best in board.legal_moves and tempt in board.legal_moves
        assert board.san(best) == e["bestSan"]
        assert board.san(tempt) == e["temptingSan"]
    print("OK encounter legality")
if __name__ == "__main__":
    test()
