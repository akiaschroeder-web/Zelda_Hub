import { describe, expect, it } from 'vitest';
import { parseBoard } from '../board';
import { applyMove, inCheck, legalMoves } from '../moves';
import { createGame, parsePlacements } from '../setup';
import { GameState, Move, Piece, PieceType } from '../types';

const EMPTY8 = Array(8).fill('........');

function game(pieces: string[], terrain: string[] = EMPTY8, checkRules = true): GameState {
  const s = createGame(parseBoard(terrain), parsePlacements(pieces), { checkRules });
  s.pieces = s.pieces.map((p) => (p.type === 'pawn' ? { ...p, hasMoved: true } : p));
  return s;
}

const find = (s: GameState, type: PieceType, side: 'player' | 'enemy' = 'player'): Piece =>
  s.pieces.find((p) => p.type === type && p.side === side)!;

const movesOf = (s: GameState, id: string, action?: Move['action']) =>
  legalMoves(s).filter((m) => m.pieceId === id && m.action === action);

const squares = (ms: Move[]) => ms.map((m) => `${m.to.x},${m.to.y}`).sort();

describe('Archer', () => {
  it('steps one square diagonally and cannot capture by moving', () => {
    const s = game(['....k...', '........', '........', '....p...', '...A....', '........', '........', 'K.......']);
    const a = find(s, 'archer');
    expect(squares(movesOf(s, a.id))).toEqual(['2,3', '2,5', '4,5']);
  });

  it('shoots an enemy exactly two squares away orthogonally without moving', () => {
    const s = game(['....k...', '........', '...p....', '........', '...A....', '........', '........', 'K.......']);
    const a = find(s, 'archer');
    const shots = movesOf(s, a.id, 'shoot');
    expect(squares(shots)).toEqual(['3,2']);
    const next = applyMove(s, shots[0]);
    expect(next.pieces.some((p) => p.type === 'pawn')).toBe(false);
    expect(find(next, 'archer').pos).toEqual({ x: 3, y: 4 });
  });

  it('a shot that fails to destroy its target does not move the Archer', () => {
    const s = game(['....k...', '........', '...j....', '........', '...A....', '........', '........', 'K.......']);
    // Juggernaut at (3,2)-(4,3): (3,3) is one square away, so shoot is at range 2 -> (3,2)
    const a = find(s, 'archer');
    const shot = movesOf(s, a.id, 'shoot')[0];
    const next = applyMove(s, shot);
    expect(find(next, 'juggernaut', 'enemy').hp).toBe(2);
    expect(find(next, 'archer').pos).toEqual({ x: 3, y: 4 });
  });

  it('walls between the Archer and its target block the shot; gaps and pieces do not', () => {
    const blocked = game(['....k...', '........', '...p....', '........', '...A....', '........', '........', 'K.......'], [
      '........', '........', '........', '...#....', '........', '........', '........', '........',
    ]);
    expect(movesOf(blocked, find(blocked, 'archer').id, 'shoot')).toHaveLength(0);
    const overGap = game(['....k...', '........', '...p....', '...P....', '...A....', '........', '........', 'K.......']);
    expect(movesOf(overGap, find(overGap, 'archer').id, 'shoot')).toHaveLength(1);
  });

  it("a shot at the King counts as check", () => {
    const s = game(['........', '........', '...k....', '........', '...A....', '........', '........', 'K.......']);
    expect(inCheck(s, 'enemy')).toBe(true);
  });
});

describe('Lancer', () => {
  it('leaps exactly 2 or 3 squares orthogonally over pieces and gaps', () => {
    const s = game(
      ['....k...', '........', '........', '........', '...L....', '...P....', '........', 'K.......'],
      ['........', '........', '........', '....____', '........', '........', '........', '........'],
    );
    const l = find(s, 'lancer');
    expect(squares(movesOf(s, l.id))).toEqual(['0,4', '1,4', '3,1', '3,2', '3,6', '3,7', '5,4', '6,4'].sort());
  });

  it('cannot leap over a wall', () => {
    const s = game(['....k...', '........', '........', '........', '...L....', '........', '........', 'K.......'], [
      '........', '........', '........', '...#....', '........', '........', '........', '........',
    ]);
    const l = find(s, 'lancer');
    const up = movesOf(s, l.id).filter((m) => m.to.x === 3 && m.to.y < 4);
    expect(up).toHaveLength(0);
  });
});

describe('Guardian', () => {
  it('takes a hit meant for an adjacent ally once per battle, and the attacker bounces', () => {
    const s = game(['....k...', '........', '........', '..pg....', '........', '........', '..R.....', 'K.......']);
    const rook = find(s, 'rook');
    const attack = legalMoves(s).find((m) => m.pieceId === rook.id && m.to.x === 2 && m.to.y === 3)!;
    const next = applyMove(s, attack);
    const pawn = find(next, 'pawn', 'enemy');
    const guardian = find(next, 'guardian', 'enemy');
    expect(pawn).toBeDefined();
    expect(guardian.hp).toBe(1);
    expect(guardian.used).toContain('intercept');
    // travelled 3 -> bounce 2 back from (2,3)
    expect(find(next, 'rook').pos).toEqual({ x: 2, y: 5 });
  });

  it('if the Guardian falls, the attacker takes its square and the ally survives', () => {
    const s = game(['....k...', '........', '........', '..pg....', '........', '........', '..R.....', 'K.......']);
    s.pieces = s.pieces.map((p) => (p.type === 'guardian' ? { ...p, hp: 1 } : p));
    const rook = find(s, 'rook');
    const next = applyMove(s, legalMoves(s).find((m) => m.pieceId === rook.id && m.to.x === 2 && m.to.y === 3)!);
    expect(next.pieces.some((p) => p.type === 'guardian')).toBe(false);
    expect(find(next, 'pawn', 'enemy')).toBeDefined();
    expect(find(next, 'rook').pos).toEqual({ x: 3, y: 3 });
  });

  it('does not intercept a second time', () => {
    const s = game(['....k...', '........', '........', '..pg....', '........', '........', '..R.....', 'K.......']);
    s.pieces = s.pieces.map((p) => (p.type === 'guardian' ? { ...p, used: ['intercept'] } : p));
    const rook = find(s, 'rook');
    const next = applyMove(s, legalMoves(s).find((m) => m.pieceId === rook.id && m.to.x === 2 && m.to.y === 3)!);
    expect(next.pieces.some((p) => p.type === 'pawn')).toBe(false);
  });

  it('never protects the King', () => {
    const s = game(['........', '........', '........', '..kg....', '........', '........', '..R.....', 'K.......']);
    expect(inCheck(s, 'enemy')).toBe(true);
  });
});

describe('Siege Engine', () => {
  it('demolishes an adjacent cracked wall instead of moving, opening the square', () => {
    const s = game(['....k...', '........', '........', '........', '...S....', '........', '........', 'K.......'], [
      '........', '........', '........', '...+#...', '........', '........', '........', '........',
    ]);
    const se = find(s, 'siege');
    const demo = movesOf(s, se.id, 'demolish');
    expect(squares(demo)).toEqual(['3,3']); // solid wall at (4,3) cannot be demolished
    const next = applyMove(s, demo[0]);
    expect(next.board.terrain[3][3]).toBe('normal');
    expect(s.board.terrain[3][3]).toBe('cracked'); // original state untouched
    expect(find(next, 'siege').pos).toEqual({ x: 3, y: 4 });
  });
});

describe('Mage', () => {
  it('moves up to 2 squares diagonally', () => {
    const s = game(['....k...', '........', '........', '........', '...M....', '........', '........', 'K.......']);
    s.pieces = s.pieces.map((p) => (p.type === 'mage' ? { ...p, used: ['teleport'] } : p));
    expect(squares(movesOf(s, find(s, 'mage').id))).toEqual(
      ['1,2', '2,3', '4,3', '5,2', '2,5', '1,6', '4,5', '5,6'].sort(),
    );
  });

  it('teleports once per battle to an empty square within 3, ignoring walls and gaps', () => {
    const s = game(['....k...', '........', '........', '........', '...M....', '........', '........', 'K.......'], [
      '........', '........', '...###..', '........', '........', '........', '........', '........',
    ]);
    const mage = find(s, 'mage');
    const tps = movesOf(s, mage.id, 'teleport');
    expect(tps.some((m) => m.to.x === 3 && m.to.y === 1)).toBe(true); // beyond the wall
    expect(tps.some((m) => m.to.x === 4 && m.to.y === 2)).toBe(false); // wall square itself
    expect(tps.some((m) => m.to.x === 4 && m.to.y === 3)).toBe(false); // reachable normally
    const next = applyMove(s, tps.find((m) => m.to.x === 3 && m.to.y === 1)!);
    expect(find(next, 'mage').pos).toEqual({ x: 3, y: 1 });
    const again = { ...next, turn: 'player' as const };
    expect(movesOf(again, mage.id, 'teleport')).toHaveLength(0);
  });
});

describe('Switcher', () => {
  it('swaps with an ally within 2 squares once per battle, but never the King', () => {
    const s = game(['....k...', '........', '........', '.....N..', '...W....', '....K...', '........', '........']);
    const sw = find(s, 'switcher');
    const swaps = movesOf(s, sw.id, 'swap');
    expect(swaps).toHaveLength(1); // the Knight, not the King
    const next = applyMove(s, swaps[0]);
    expect(find(next, 'switcher').pos).toEqual({ x: 5, y: 3 });
    expect(find(next, 'knight').pos).toEqual({ x: 3, y: 4 });
    expect(movesOf({ ...next, turn: 'player' }, sw.id, 'swap')).toHaveLength(0);
  });
});

describe('Chancellor', () => {
  it('moves like a Rook plus a Knight', () => {
    const s = game(['....k...', '........', '........', '........', '...C....', '........', '........', 'K.......']);
    const n = movesOf(s, find(s, 'chancellor').id).length;
    // rook from d4 on empty 8x8 = 14 (minus none blocked), knight = 8
    expect(n).toBe(14 + 8);
  });
});

describe('Medic', () => {
  it('moves one square diagonally or sideways, not straight ahead or back', () => {
    const s = game(['....k...', '........', '........', '........', '...H....', '........', '........', 'K.......']);
    expect(squares(movesOf(s, find(s, 'medic').id))).toEqual(['2,3', '2,4', '2,5', '4,3', '4,4', '4,5']);
  });

  it('heals an adjacent wounded ally by 1, up to its maximum', () => {
    const s = game(['....k...', '........', '........', '...J....', '..H.....', '........', '........', 'K.......']);
    s.pieces = s.pieces.map((p) => (p.type === 'juggernaut' ? { ...p, hp: 1 } : p));
    const heal = movesOf(s, find(s, 'medic').id, 'heal');
    expect(heal).toHaveLength(1);
    const next = applyMove(s, heal[0]);
    expect(find(next, 'juggernaut').hp).toBe(2);
  });

  it('offers no heal when nobody nearby is hurt', () => {
    const s = game(['....k...', '........', '........', '...J....', '..H.....', '........', '........', 'K.......']);
    expect(movesOf(s, find(s, 'medic').id, 'heal')).toHaveLength(0);
  });
});

describe('the Vanguard Clash encounter', () => {
  it('is valid and the AI can play a move from it', async () => {
    const { ENCOUNTERS } = await import('../encounters');
    const { createEncounter } = await import('../setup');
    const { chooseMove } = await import('../ai');
    const s = createEncounter(ENCOUNTERS.find((e) => e.id === 'vanguard')!);
    const afterPlayer = applyMove(s, legalMoves(s)[0]);
    expect(chooseMove(afterPlayer, 2)).not.toBeNull();
  });
});
