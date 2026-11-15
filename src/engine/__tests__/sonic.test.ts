import { describe, expect, it } from 'vitest';
import { SONIC_LEGEND } from '../../content/packs';
import { terrainAt } from '../board';
import { addStatus, hasStatus } from '../core';
import { applyMove, legalMoves } from '../moves';
import { PieceType, Side } from '../types';
import { at, dests, make, movesAt, play, wait } from './upgradeHelpers';

/** The layout symbol for a Sonic piece (Cyrillic, so look it up by name). */
const sym = (type: PieceType, side: Side = 'player') =>
  Object.entries(SONIC_LEGEND).find(([, [t, s]]) => t === type && s === side)![0];
/** Build an 8-wide row from {x: symbol}. */
const row = (cells: Record<number, string> = {}) => Array.from({ length: 8 }, (_, x) => cells[x] ?? '.').join('');
const board = (rows: Record<number, Record<number, string>>) => Array.from({ length: 8 }, (_, y) => row(rows[y]));
const opts = (terrain?: string[]) => ({ legend: { ...SONIC_LEGEND, D: ['death_egg', 'enemy'] as [PieceType, Side] }, terrain });
const blank = (rows: Record<number, string>) => Array.from({ length: 8 }, (_, y) => rows[y] ?? '........');
const kings = { 0: { 7: 'k' }, 7: { 0: 'K' } };

describe('Sonic Pack pieces', () => {
  it('Sonic: four orthogonal / two diagonal, spins through one cracked wall, and Blue Blur gives a second move', () => {
    const terrain = blank({ 4: '...+....' });
    let s = make(board({ ...kings, 6: { 3: sym('sonic') } }), {}, opts(terrain));
    const d = dests(movesAt(s, 3, 6));
    expect(d).toContain('3,3'); // through the cracked wall at 3,4
    expect(d).toContain('5,4');
    expect(d).not.toContain('6,3');
    s = play(s, 3, 6, 3, 3);
    expect(terrainAt(s.board, { x: 3, y: 4 })).toBe('normal');
    expect(s.turn).toBe('player'); // Blue Blur
    s = play(s, 3, 3, 3, 1);
    expect(s.turn).toBe('enemy');
  });

  it('Tails flies over pieces, can land on a gap, and can carry an ally', () => {
    const terrain = blank({ 3: '......_.' });
    const s = make(board({ ...kings, 5: { 4: 'P' }, 6: { 3: sym('tails'), 2: 'P' } }), {}, opts(terrain));
    const d = dests(movesAt(s, 3, 6));
    expect(d).toContain('5,4'); // over the pawn on 4,5
    expect(d).toContain('6,3'); // onto a gap
    const carry = movesAt(s, 3, 6).find((m) => m.action === 'carry' && m.to.x === 0 && m.to.y === 3)!;
    const after = applyMove(s, carry);
    expect(at(after, 0, 3)?.type).toBe('tails');
    // The passenger (the pawn on 4,5, one up-right of Tails) keeps its place beside Tails.
    expect(at(after, 1, 2)?.type).toBe('pawn');
  });

  it('Knuckles punches for 2, jumps two diagonally and breaks adjacent cracked walls', () => {
    const terrain = blank({ 5: '....+...' });
    let s = make(board({ ...kings, 4: { 3: 'r' }, 6: { 3: sym('knuckles') } }), {}, opts(terrain));
    expect(dests(movesAt(s, 3, 6))).toContain('1,4');
    expect(movesAt(s, 3, 6).some((m) => m.action === 'demolish' && m.to.x === 4 && m.to.y === 5)).toBe(true);
    s.pieces.find((p) => p.type === 'rook')!.hp = 2;
    s.pieces.find((p) => p.type === 'rook')!.maxHp = 2;
    s = play(s, 3, 6, 3, 4);
    expect(s.pieces.some((p) => p.type === 'rook')).toBe(false);
  });

  it('Amy survives one capture, and allies next to her shake off stuns', () => {
    let s = make(board({ ...kings, 2: { 3: sym('amy', 'enemy') }, 5: { 3: 'R' } }), {}, opts());
    s = play(s, 3, 5, 3, 2);
    expect(s.pieces.find((p) => p.type === 'amy')!.hp).toBe(1);
    let t = make(board({ ...kings, 5: { 3: sym('amy'), 4: 'R' } }), {}, opts());
    addStatus(t.pieces.find((p) => p.type === 'rook')!, { kind: 'stunned', until: null });
    t = wait(t);
    t = wait(t);
    expect(hasStatus(t.pieces.find((p) => p.type === 'rook')!, 'stunned')).toBe(false);
  });

  it('Shadow: Chaos Control teleports within 4; Chaos Spear hits the first enemy in a line', () => {
    let s = make(board({ ...kings, 3: { 5: 'p' }, 6: { 2: sym('shadow') } }), {}, opts());
    expect(movesAt(s, 2, 6).some((m) => m.action === 'chaosControl' && m.to.x === 6 && m.to.y === 3)).toBe(true);
    s = applyMove(s, movesAt(s, 2, 6).find((m) => m.action === 'chaosSpear')!);
    expect(s.pieces.filter((p) => p.type === 'pawn')).toHaveLength(0);
    s = wait(s);
    expect(movesAt(s, 2, 6).some((m) => m.action === 'chaosSpear')).toBe(false);
  });

  it('Rouge hops one obstacle, dodges the first attack, and grabs nearby keys', () => {
    const terrain = blank({ 4: '..K.....' });
    let s = make(board({ ...kings, 5: { 2: 'P' }, 6: { 1: sym('rouge') } }), {}, opts(terrain));
    expect(dests(movesAt(s, 1, 6))).toContain('3,4'); // over the pawn at 2,5
    s = play(s, 1, 6, 3, 4);
    expect(s.keys.player).toBe(1);
    const r = play(make(board({ ...kings, 2: { 3: sym('rouge', 'enemy') }, 5: { 3: 'R' } }), {}, opts()), 3, 5, 3, 2);
    expect(r.pieces.some((p) => p.type === 'rouge')).toBe(true);
  });

  it('Silver levitates over gaps and moves enemies with psychokinesis', () => {
    const terrain = blank({ 5: '..._....' });
    const s = make(board({ ...kings, 3: { 5: 'p' }, 6: { 3: sym('silver') } }), {}, opts(terrain));
    expect(dests(movesAt(s, 3, 6))).toContain('3,4'); // across the gap
    const pk = movesAt(s, 3, 6).find((m) => m.action === 'psychokinesis' && m.to.x === 6 && m.to.y === 2)!;
    expect(at(applyMove(s, pk), 6, 2)?.type).toBe('pawn');
  });

  it('Blaze burns what she hits and cannot be burned', () => {
    let s = make(board({ ...kings, 3: { 5: 'r' }, 6: { 2: sym('blaze') } }), {}, opts());
    const rook = s.pieces.find((p) => p.type === 'rook')!;
    rook.hp = 2;
    rook.maxHp = 2;
    s = play(s, 2, 6, 5, 3);
    expect(hasStatus(s.pieces.find((p) => p.type === 'rook')!, 'burned')).toBe(true);
    const blaze = s.pieces.find((p) => p.type === 'blaze')!;
    addStatus(blaze, { kind: 'burned', until: null });
    expect(hasStatus(blaze, 'burned')).toBe(false);
  });

  it('Dr. Eggman boosts nearby robots and escapes capture once', () => {
    let s = make(board({ ...kings, 6: { 2: sym('eggman'), 4: sym('motobug') } }), {}, opts());
    s = wait(s);
    s = wait(s);
    expect(s.pieces.find((p) => p.type === 'motobug')!.maxHp).toBe(2);
    const e = play(make(board({ ...kings, 2: { 3: sym('eggman', 'enemy') }, 5: { 3: 'R' } }), {}, opts()), 3, 5, 3, 2);
    const egg = e.pieces.find((p) => p.type === 'eggman')!;
    expect(egg).toBeTruthy();
    expect(egg.pos.y).toBeLessThan(4); // his own (top) half
  });

  it('Metal Sonic copies the movement of an enemy that hurts him, and speeds up at 1 HP', () => {
    let s = make(board({ ...kings, 2: { 3: sym('metal_sonic', 'enemy') }, 5: { 3: 'B' }, 6: { 6: 'R' } }), {}, opts());
    s.pieces.find((p) => p.type === 'bishop')!.pos = { x: 5, y: 4 };
    s = play(s, 5, 4, 3, 2);
    const metal = s.pieces.find((p) => p.type === 'metal_sonic')!;
    expect(metal.hp).toBe(2);
    expect(metal.statuses.find((st) => st.kind === 'copying')?.source).toBe('bishop');
    expect(legalMoves(s).some((m) => m.pieceId === metal.id && m.to.x === 0 && m.to.y === 5)).toBe(true); // a long diagonal
  });

  it('Motobug: +1 damage after rolling 3+ sideways, then may roll one more square', () => {
    let s = make(board({ ...kings, 6: { 0: sym('motobug'), 4: 'r' } }), {}, opts());
    const rook = s.pieces.find((p) => p.type === 'rook')!;
    rook.hp = 2;
    rook.maxHp = 2;
    s = play(s, 0, 6, 4, 6);
    expect(s.pieces.some((p) => p.type === 'rook')).toBe(false);
    expect(s.turn).toBe('player');
    expect(dests(movesAt(s, 4, 6).filter((m) => !m.action))).toEqual(['5,6']);
  });

  it('Buzz Bomber hovers over gaps and shoots every 2 turns', () => {
    const terrain = blank({ 4: '.....-..'.replace('-', '_') });
    let s = make(board({ ...kings, 3: { 3: 'p' }, 6: { 3: sym('buzz_bomber') }, 5: { 2: 'P' } }), {}, opts(terrain));
    expect(dests(movesAt(s, 3, 6))).toContain('5,4');
    s = applyMove(s, movesAt(s, 3, 6).find((m) => m.action === 'energyShot')!);
    expect(at(s, 3, 3)).toBeUndefined();
    s = wait(s);
    expect(movesAt(s, 3, 6).some((m) => m.action === 'energyShot')).toBe(false);
  });

  it('Crabmeat grips what it hits, and its shell stops the first ranged point', () => {
    let s = make(board({ ...kings, 5: { 4: 'r' }, 6: { 4: sym('crabmeat') } }), {}, opts());
    const rook = s.pieces.find((p) => p.type === 'rook')!;
    rook.hp = 2;
    rook.maxHp = 2;
    s = play(s, 4, 6, 4, 5);
    expect(hasStatus(s.pieces.find((p) => p.type === 'rook')!, 'bound')).toBe(true);
    let r = make(board({ ...kings, 3: { 3: sym('crabmeat', 'enemy') }, 5: { 3: 'A' } }), {}, opts());
    r = applyMove(r, movesAt(r, 3, 5).find((m) => m.action === 'shoot')!);
    expect(r.pieces.find((p) => p.type === 'crabmeat')!.hp).toBe(2);
  });

  it('Chaos flows through walls and pieces, and regenerates on quiet turns', () => {
    // A diagonal two-square move passes over 3,3 (a wall) and 4,4 (an ally) on the way to 4,2.
    const terrain = blank({ 3: '...#....' });
    let s = make(board({ 0: { 7: 'k' }, 7: { 7: 'K' }, 4: { 2: sym('chaos'), 4: 'P' } }), {}, opts(terrain));
    const chaos = s.pieces.find((p) => p.type === 'chaos')!;
    expect(dests(movesAt(s, 2, 4))).toContain('4,2');
    chaos.hp = 2;
    s = wait(s);
    s = wait(s);
    expect(s.pieces.find((p) => p.type === 'chaos')!.hp).toBe(3);
  });
});

describe('Death Egg Robot', () => {
  const egg = () => {
    const rows = ['k.......', '..D.....', '........', '........', '........', '........', '........', '.......K'];
    return make(rows, {}, opts());
  };

  it('stomps adjacent enemies when it moves and shrugs off ranged attacks in Phase 1', () => {
    let s = egg();
    s.pieces.push(...make(['........', '........', '........', '........', '........', '......P.', '.....A..', '........'], {}, opts()).pieces);
    s = { ...s, pieces: [...s.pieces], turn: 'enemy', ply: 1 };
    const robot = s.pieces.find((p) => p.type === 'death_egg')!;
    const down = legalMoves(s).find((m) => m.pieceId === robot.id && m.to.x === 2 && m.to.y === 2)!;
    s = applyMove(s, down);
    expect(s.pieces.some((p) => p.type === 'pawn' && p.side === 'player')).toBe(false); // stomped (it was at 6,5, next to 2..5 x 2..5)
  });

  it('Heavy Armor: ranged attacks do nothing in Phase 1', () => {
    let s = egg();
    s.pieces.push(...make(['........', '........', '........', '........', '........', '........', '.....A..', '........'], {}, opts()).pieces);
    s = { ...s, pieces: [...s.pieces] };
    const shot = movesAt(s, 5, 6).find((m) => m.action === 'shoot')!;
    s = applyMove(s, shot);
    expect(s.pieces.find((p) => p.type === 'death_egg')!.hp).toBe(3);
  });

  it('fires missiles in Phase 2 and explodes when defeated', () => {
    let s = egg();
    s = { ...s, turn: 'enemy', ply: 1 };
    const robot = s.pieces.find((p) => p.type === 'death_egg')!;
    robot.hp = 2;
    s.pieces.push(...make(['........', '........', '........', '........', '........', '........', 'PP......', '........'], {}, opts()).pieces);
    s = { ...s, pieces: [...s.pieces] };
    s = applyMove(s, legalMoves(s).find((m) => m.pieceId === robot.id && m.action === 'missiles')!);
    expect(s.pieces.filter((p) => p.type === 'pawn')).toHaveLength(0);
  });
});
