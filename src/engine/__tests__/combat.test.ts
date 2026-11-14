import { describe, expect, it } from 'vitest';
import { parseBoard } from '../board';
import { applyMove, bounceSquare, inCheck, legalMoves } from '../moves';
import { createGame, parsePlacements } from '../setup';
import { GameState, Move, Piece } from '../types';

const EMPTY8 = Array(8).fill('........');

function game(pieces: string[], terrain: string[] = EMPTY8, checkRules = true): GameState {
  const s = createGame(parseBoard(terrain), parsePlacements(pieces), { checkRules });
  s.pieces = s.pieces.map((p) => (p.type === 'pawn' ? { ...p, hasMoved: true } : p));
  return s;
}

const piece = (s: GameState, type: string, side: 'player' | 'enemy'): Piece =>
  s.pieces.find((p) => p.type === type && p.side === side)!;

const moveTo = (s: GameState, id: string, x: number, y: number): Move | undefined =>
  legalMoves(s).find((m) => m.pieceId === id && m.to.x === x && m.to.y === y);

describe('bounceback distance', () => {
  it('is half the distance travelled, rounded up, minimum one', () => {
    const cases = [
      [1, 1],
      [2, 1],
      [3, 2],
      [4, 2],
      [5, 3],
      [6, 3],
    ];
    for (const [travelled, back] of cases) {
      const land = bounceSquare({ x: 0, y: 7 }, { x: 0, y: 7 - travelled }, false);
      expect(land).toEqual({ x: 0, y: 7 - travelled + back });
    }
  });

  it('works on diagonals', () => {
    expect(bounceSquare({ x: 0, y: 0 }, { x: 4, y: 4 }, false)).toEqual({ x: 2, y: 2 });
  });

  it('returns leapers to the square they jumped from', () => {
    expect(bounceSquare({ x: 1, y: 7 }, { x: 2, y: 5 }, true)).toEqual({ x: 1, y: 7 });
  });
});

describe('attacking a multi-HP piece', () => {
  it('a Rook travelling six squares deals 1 damage and bounces back three', () => {
    const s = game(['.j..k...', '........', '........', '........', '........', '........', '........', '.R..K...']);
    const rook = piece(s, 'rook', 'player');
    const jug = piece(s, 'juggernaut', 'enemy');
    // Juggernaut occupies (1,0)-(2,1); the rook hits its square (1,1) after 6 squares.
    const m = moveTo(s, rook.id, 1, 1)!;
    expect(m.targets).toEqual([jug.id]);
    const next = applyMove(s, m);
    expect(next.pieces.find((p) => p.id === jug.id)!.hp).toBe(2);
    expect(next.pieces.find((p) => p.id === rook.id)!.pos).toEqual({ x: 1, y: 4 });
  });

  it('the hit that reduces it to 0 HP captures it and the attacker takes the square', () => {
    const s = game(['.j..k...', '........', '........', '........', '........', '........', '........', '.R..K...']);
    s.pieces = s.pieces.map((p) => (p.type === 'juggernaut' ? { ...p, hp: 1 } : p));
    const rook = piece(s, 'rook', 'player');
    const next = applyMove(s, moveTo(s, rook.id, 1, 1)!);
    expect(next.pieces.some((p) => p.type === 'juggernaut')).toBe(false);
    expect(next.pieces.find((p) => p.id === rook.id)!.pos).toEqual({ x: 1, y: 1 });
    expect(next.captured.map((p) => p.type)).toEqual(['juggernaut']);
  });

  it('a Knight that fails to destroy its target returns to where it jumped from', () => {
    const s = game(['....k...', '........', '........', '........', '..j.....', '........', '.N......', '....K...']);
    const knight = piece(s, 'knight', 'player');
    const next = applyMove(s, moveTo(s, knight.id, 2, 4)!);
    expect(next.pieces.find((p) => p.id === knight.id)!.pos).toEqual({ x: 1, y: 6 });
    expect(next.pieces.find((p) => p.type === 'juggernaut')!.hp).toBe(2);
  });

  it('shields absorb damage before HP, and the attacker still bounces', () => {
    const s = game(['.j..k...', '........', '........', '........', '........', '........', '........', '.R..K...']);
    s.pieces = s.pieces.map((p) => (p.type === 'juggernaut' ? { ...p, shields: 1 } : p));
    const rook = piece(s, 'rook', 'player');
    const next = applyMove(s, moveTo(s, rook.id, 1, 1)!);
    const jug = piece(next, 'juggernaut', 'enemy');
    expect(jug.hp).toBe(3);
    expect(jug.shields).toBe(0);
    expect(next.pieces.find((p) => p.id === rook.id)!.pos).toEqual({ x: 1, y: 4 });
  });

  it('a shield on a 1 HP piece makes the attacker bounce instead of capturing', () => {
    const s = game(['....k...', '........', '........', '.p......', '........', '........', '........', '.R..K...']);
    s.pieces = s.pieces.map((p) => (p.type === 'pawn' ? { ...p, shields: 1 } : p));
    const rook = piece(s, 'rook', 'player');
    const next = applyMove(s, moveTo(s, rook.id, 1, 3)!);
    expect(piece(next, 'pawn', 'enemy').shields).toBe(0);
    // travelled 4 -> bounce 2 back from (1,3)
    expect(next.pieces.find((p) => p.id === rook.id)!.pos).toEqual({ x: 1, y: 5 });
  });
});

describe('the Juggernaut', () => {
  it('occupies a 2x2 footprint that blocks sliding pieces', () => {
    // Juggernaut footprint (3,5)-(4,6); the rook on row 5 is stopped before it.
    const s = game(['....k...', '........', '........', '........', '........', 'R..J....', '........', '....K...']);
    const rook = piece(s, 'rook', 'player');
    const right = legalMoves(s).filter((m) => m.pieceId === rook.id && m.to.y === 5).map((m) => m.to.x);
    expect(right.sort()).toEqual([1, 2]);
  });

  it('moves one square orthogonally only', () => {
    const s = game(['....k...', '........', '........', '...J....', '........', '........', '........', 'K.......']);
    const jug = piece(s, 'juggernaut', 'player');
    const dests = legalMoves(s)
      .filter((m) => m.pieceId === jug.id)
      .map((m) => `${m.to.x},${m.to.y}`)
      .sort();
    expect(dests).toEqual(['2,3', '3,2', '3,4', '4,3']);
  });

  it('cannot move onto walls, gaps, friendly pieces or off the board', () => {
    const terrain = ['........', '........', '..#.....', '........', '.....__.', '........', '........', '........'];
    const s = game(['....k...', '........', '........', '...JP...', '........', '........', '........', 'K.......'].map((r, y) => (y === 3 ? '...J.P..' : r)), terrain);
    const jug = piece(s, 'juggernaut', 'player');
    const dests = legalMoves(s)
      .filter((m) => m.pieceId === jug.id)
      .map((m) => `${m.to.x},${m.to.y}`)
      .sort();
    // up (3,2): footprint (3,2),(4,2),(3,3),(4,3) - clear.  left (2,3): (2,3),(3,3),(2,4),(3,4) - clear.
    // right (4,3): covers (5,3) friendly pawn -> no.  down (3,4): covers (5,4)? no: (3,4),(4,4),(3,5),(4,5) - clear.
    expect(dests).toEqual(['2,3', '3,2', '3,4']);
    // Now put the wall in the way of "up".
    const s2 = game(['....k...', '........', '........', '...J....', '........', '........', '........', 'K.......'], [
      '........',
      '........',
      '....#...',
      '........',
      '........',
      '........',
      '........',
      '........',
    ]);
    const j2 = piece(s2, 'juggernaut', 'player');
    expect(moveTo(s2, j2.id, 3, 2)).toBeUndefined();
  });

  it('captures every 1 HP enemy under its new footprint at once', () => {
    const s = game(['....k...', '........', '...pp...', '...J....', '........', '........', '........', 'K.......']);
    const jug = piece(s, 'juggernaut', 'player');
    const m = moveTo(s, jug.id, 3, 2)!;
    expect(m.targets).toHaveLength(2);
    const next = applyMove(s, m);
    expect(next.pieces.filter((p) => p.type === 'pawn')).toHaveLength(0);
    expect(next.pieces.find((p) => p.id === jug.id)!.pos).toEqual({ x: 3, y: 2 });
  });

  it('when one target survives, the others still take damage and the Juggernaut bounces back', () => {
    // Enemy pawn at (3,2); enemy Juggernaut covering (4,1)-(5,2).
    const s = game(['....k...', '....j...', '...p....', '...J....', '........', '........', '........', 'K.......']);
    const mine = s.pieces.find((p) => p.type === 'juggernaut' && p.side === 'player')!;
    const m = moveTo(s, mine.id, 3, 2)!;
    expect(m.targets).toHaveLength(2);
    const next = applyMove(s, m);
    expect(next.pieces.some((p) => p.type === 'pawn')).toBe(false);
    expect(next.pieces.find((p) => p.type === 'juggernaut' && p.side === 'enemy')!.hp).toBe(2);
    expect(next.pieces.find((p) => p.id === mine.id)!.pos).toEqual({ x: 3, y: 3 });
  });

  it('a single hit damages a large piece once even if the footprint overlaps it twice', () => {
    const s = game(['....k...', '...j....', '........', '...J....', '........', '........', '........', 'K.......']);
    const mine = s.pieces.find((p) => p.type === 'juggernaut' && p.side === 'player')!;
    const m = moveTo(s, mine.id, 3, 2)!;
    expect(m.targets).toHaveLength(1);
    const next = applyMove(s, m);
    expect(next.pieces.find((p) => p.type === 'juggernaut' && p.side === 'enemy')!.hp).toBe(2);
  });

  it('gives check when the enemy King is under one of its next footprints', () => {
    const s = game(['........', '........', '...k....', '........', '...J....', '........', '........', 'K.......']);
    // Enemy king at (3,2); our Juggernaut at (3,4)-(4,5) can step up into (3,3)-(4,4)... which does not cover (3,2).
    expect(inCheck(s, 'enemy')).toBe(false);
    const s2 = game(['........', '........', '........', '...k....', '...J....', '........', '........', 'K.......']);
    expect(inCheck(s2, 'enemy')).toBe(true);
  });

  it('cannot be passed by a pawn pushing forward into it', () => {
    const s = game(['....k...', '........', '........', '...j....', '........', '...P....', '........', 'K.......']);
    const pawn = piece(s, 'pawn', 'player');
    expect(legalMoves(s).filter((m) => m.pieceId === pawn.id && !m.targets)).toHaveLength(0);
    // ...but it can attack it diagonally: pawn at (3,5) attacks (2,4) and (4,4); (4,4) is a Juggernaut square.
    const atk = moveTo(s, pawn.id, 4, 4)!;
    const next = applyMove(s, atk);
    expect(next.pieces.find((p) => p.id === pawn.id)!.pos).toEqual({ x: 3, y: 5 });
  });
});

describe('encounter setup', () => {
  it('every built-in encounter has a valid layout', async () => {
    const { ENCOUNTERS } = await import('../encounters');
    const { createEncounter } = await import('../setup');
    for (const e of ENCOUNTERS) expect(() => createEncounter(e)).not.toThrow();
  });

  it('rejects pieces placed on walls or overlapping a large piece', () => {
    expect(() => game(['....k...', '........', '...J....', '....P...', '........', '........', '........', 'K.......'])).toThrow(/overlaps/);
    expect(() =>
      game(['....k...', '........', '........', '........', '........', '........', '........', 'K..P....'], [
        '........',
        '........',
        '........',
        '........',
        '........',
        '........',
        '........',
        '...#....',
      ]),
    ).toThrow(/blocked/);
  });
});
