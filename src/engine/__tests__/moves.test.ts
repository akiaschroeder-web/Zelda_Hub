import { describe, expect, it } from 'vitest';
import { parseBoard } from '../board';
import { chooseMove } from '../ai';
import { applyMove, evaluateResult, inCheck, legalMoves } from '../moves';
import { createEncounter, createGame, parsePlacements } from '../setup';
import { ENCOUNTERS } from '../encounters';
import { GameState, Move } from '../types';

const EMPTY8 = Array(8).fill('........');

function game(pieces: string[], terrain: string[] = EMPTY8, checkRules = true): GameState {
  const s = createGame(parseBoard(terrain), parsePlacements(pieces), { checkRules });
  // Pawns away from their starting rank have already moved (no double step).
  s.pieces = s.pieces.map((p) =>
    p.type === 'pawn' && p.pos.y !== (p.side === 'player' ? s.board.height - 2 : 1) ? { ...p, hasMoved: true } : p,
  );
  return s;
}

function perft(s: GameState, depth: number): number {
  if (depth === 0) return 1;
  const moves = legalMoves(s);
  if (depth === 1) return moves.length;
  let n = 0;
  for (const m of moves) n += perft(applyMove(s, m), depth - 1);
  return n;
}

const targets = (moves: Move[], id: string) =>
  moves
    .filter((m) => m.pieceId === id)
    .map((m) => `${m.to.x},${m.to.y}`)
    .sort();

describe('standard chess rules', () => {
  it('matches perft counts from the starting position', () => {
    const s = createEncounter(ENCOUNTERS[0]);
    expect(perft(s, 1)).toBe(20);
    expect(perft(s, 2)).toBe(400);
    expect(perft(s, 3)).toBe(8902);
  });

  it('matches perft on Kiwipete (castling, en passant, promotion, pins)', () => {
    const s = game([
      'r...k..r',
      'p.ppqpb.',
      'bn..pnp.',
      '...PN...',
      '.p..P...',
      '..N..Q.p',
      'PPPBBPPP',
      'R...K..R',
    ]);
    expect(perft(s, 1)).toBe(48);
    expect(perft(s, 2)).toBe(2039);
  });

  it('matches perft on position 3 (en passant edge cases)', () => {
    const s = game([
      '........',
      '..p.....',
      '...p....',
      'KP.....r',
      '.R...p.k',
      '........',
      '....P.P.',
      '........',
    ]);
    expect(perft(s, 1)).toBe(14);
    expect(perft(s, 2)).toBe(191);
    expect(perft(s, 3)).toBe(2812);
  });

  it("detects fool's mate", () => {
    let s = createEncounter(ENCOUNTERS[0]);
    const play = (fx: number, fy: number, tx: number, ty: number) => {
      const m = legalMoves(s).find((m) => m.from.x === fx && m.from.y === fy && m.to.x === tx && m.to.y === ty);
      expect(m).toBeDefined();
      s = applyMove(s, m!);
    };
    play(5, 6, 5, 5); // f3
    play(4, 1, 4, 3); // e5
    play(6, 6, 6, 4); // g4
    play(3, 0, 7, 4); // Qh4#
    expect(inCheck(s, 'player')).toBe(true);
    expect(s.result).toEqual({ kind: 'checkmate', winner: 'enemy' });
  });

  it('detects stalemate as a draw', () => {
    const s = game(['k.......', '..Q.....', '.K......', '........', '........', '........', '........', '........']);
    const enemyToMove = { ...s, turn: 'enemy' as const };
    expect(legalMoves(enemyToMove)).toHaveLength(0);
    expect(evaluateResult(enemyToMove)).toEqual({ kind: 'draw', reason: 'stalemate' });
  });
});

describe('terrain', () => {
  it('stops sliders at gaps and walls', () => {
    const s = game(
      ['........', '........', '........', 'R.......', '........', '........', '........', 'K......k'],
      ['........', '..._....', '........', '..#.....', '........', '........', '........', '........'],
    );
    const rook = s.pieces.find((p) => p.type === 'rook')!;
    // Right: blocked by the wall at x=2. Up: open to the top edge.
    expect(targets(legalMoves(s), rook.id)).toEqual(
      ['0,0', '0,1', '0,2', '0,4', '0,5', '0,6', '1,3'].sort(),
    );
  });

  it('lets Knights jump gaps but not walls in their 2x3 rectangle', () => {
    const terrain = ['........', '........', '........', '._......', '........', '........', '........', '........'];
    const s = game(['........', '........', '........', '........', 'N.......', '........', '........', 'K......k'], terrain);
    const knight = s.pieces.find((p) => p.type === 'knight')!;
    expect(targets(legalMoves(s), knight.id)).toEqual(['1,2', '1,6', '2,3', '2,5'].sort());

    const walled = terrain.map((r, y) => (y === 3 ? '.#......' : r));
    const s2 = game(['........', '........', '........', '........', 'N.......', '........', '........', 'K......k'], walled);
    // The wall at (1,3) sits inside the rectangles for (1,2) and (2,3).
    const knight2 = s2.pieces.find((p) => p.type === 'knight')!;
    expect(targets(legalMoves(s2), knight2.id)).toEqual(['1,6', '2,5']);
  });

  it('cracked walls block like solid walls', () => {
    const s = game(
      ['........', '........', '........', 'Q.......', '........', '........', '........', 'K......k'],
      ['........', '........', '........', '.+......', '+.......', '........', '........', '........'],
    );
    const q = s.pieces.find((p) => p.type === 'queen')!;
    const t = targets(legalMoves(s), q.id);
    expect(t).not.toContain('1,3');
    expect(t).not.toContain('0,4');
    expect(t).toContain('1,2');
  });

  it('promotes on a special promotion square', () => {
    const s = game(
      ['....k...', '........', '........', '........', '........', '........', '........', 'K.......'].map((r, y) =>
        y === 3 ? '..P.....' : r,
      ),
      ['........', '........', '..*.....', '........', '........', '........', '........', '........'],
    );
    const promos = legalMoves(s).filter((m) => m.promotion);
    expect(promos.map((m) => m.promotion).sort()).toEqual(['bishop', 'knight', 'queen', 'rook']);
  });
});

describe('castling on unusual boards', () => {
  it('castles with a distant rook on a 10-wide board and moves the rook beside the king', () => {
    const terrain = Array(6).fill('..........');
    const s = game(['k.........', '..........', '..........', '..........', '..........', '...K...R..'], terrain);
    const castle = legalMoves(s).find((m) => m.castle);
    expect(castle).toBeDefined();
    const next = applyMove(s, castle!);
    const king = next.pieces.find((p) => p.type === 'king' && p.side === 'player')!;
    const rook = next.pieces.find((p) => p.type === 'rook')!;
    expect(king.pos).toEqual({ x: 5, y: 5 });
    expect(rook.pos).toEqual({ x: 4, y: 5 });
  });

  it('cannot castle across a gap', () => {
    const terrain = ['........', '........', '........', '........', '........', '.....__.'];
    const s = game(['k.......', '........', '........', '........', '........', '....K..R'], terrain);
    expect(legalMoves(s).some((m) => m.castle)).toBe(false);
  });
});

describe('extermination rules', () => {
  it('allows capturing the King directly and losing it ends the game', () => {
    const s = game(
      ['....k...', '........', '........', '....r...', '........', '........', '........', '....K...'],
      EMPTY8,
      false,
    );
    // No check restrictions: the King may step into the rook's line.
    const suicide = legalMoves(s).find((m) => m.to.x === 4 && m.to.y === 6);
    expect(suicide).toBeDefined();
    const afterPlayer = applyMove(s, suicide!);
    const kill = legalMoves(afterPlayer).find((m) => m.captureId?.startsWith('pking'))!;
    expect(applyMove(afterPlayer, kill).result).toEqual({ kind: 'kingCaptured', winner: 'enemy' });
  });

  it('wins by eliminating every enemy piece', () => {
    const s = game(['........', '........', '........', '....p...', '...Q....', '........', '........', 'K.......'], EMPTY8, false);
    const take = legalMoves(s).find((m) => m.captureId)!;
    expect(applyMove(s, take).result).toEqual({ kind: 'eliminated', winner: 'player' });
  });
});

describe('ai', () => {
  it('takes a free queen', () => {
    const s = game(['....k...', '........', '........', '...q....', '........', '........', '...R....', '....K...']);
    const m = chooseMove(s, 2, () => 0)!;
    expect(m.captureId).toMatch(/^equeen/);
  });

  it('finds mate in one', () => {
    const s = game(['k.......', '........', '.K......', '........', '........', '........', '........', '......Q.']);
    const m = chooseMove(s, 2, () => 0)!;
    expect(applyMove(s, m).result).toEqual({ kind: 'checkmate', winner: 'player' });
  });
});
