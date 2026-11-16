import { describe, expect, it } from 'vitest';
import { MARIO_LEGEND } from '../../content/packs';
import { terrainAt } from '../board';
import { addStatus, hasStatus } from '../core';
import { bowserPhase } from '../mario';
import { applyMove, legalMoves } from '../moves';
import { GameState, PieceType, Side } from '../types';
import { at, dests, make, movesAt, play, shields, wait } from './upgradeHelpers';

const sym = (type: PieceType, side: Side = 'player') => Object.entries(MARIO_LEGEND).find(([, [t, s]]) => t === type && s === side)![0];
const row = (cells: Record<number, string> = {}) => Array.from({ length: 8 }, (_, x) => cells[x] ?? '.').join('');
const board = (rows: Record<number, Record<number, string>>) => Array.from({ length: 8 }, (_, y) => row(rows[y]));
const blank = (rows: Record<number, string>) => Array.from({ length: 8 }, (_, y) => rows[y] ?? '........');
const opts = (terrain?: string[]) => ({ legend: MARIO_LEGEND, terrain });
const kings = { 0: { 7: 'k' }, 7: { 0: 'K' } };
const action = (s: GameState, x: number, y: number, kind: string, tx: number, ty: number) => {
  const m = movesAt(s, x, y).find((m) => m.action === kind && m.to.x === tx && m.to.y === ty);
  expect(m, `no ${kind} from ${x},${y} to ${tx},${ty}`).toBeDefined();
  return applyMove(s, m!);
};
const setHp = (s: GameState, x: number, y: number, hp: number, maxHp = hp) => {
  const p = at(s, x, y)!;
  p.maxHp = maxHp;
  p.hp = hp;
};

describe('Super Mario Pack pieces', () => {
  it('Mario: two orthogonally, a diagonal jump of two, Super Jump, and Stomp after a jumping capture', () => {
    let s = make(board({ ...kings, 4: { 5: 'p' }, 6: { 3: sym('mario') } }), {}, opts(blank({ 5: '..#.....' })));
    const d = dests(movesAt(s, 3, 6));
    expect(d).toContain('3,4');
    expect(d).toContain('1,4'); // jumps over the wall diagonally
    expect(d).toContain('3,3'); // Super Jump
    expect(d).not.toContain('2,5');
    s = play(s, 3, 6, 5, 4);
    expect(s.bonus[0]?.source).toBe('stomp');
    const hop = legalMoves(s).find((m) => m.param === 'stomp' && m.to.x === 5 && m.to.y === 3)!;
    s = applyMove(s, hop);
    expect(at(s, 5, 3)?.type).toBe('mario');
  });

  it('Luigi: High Jump four straight up; Scaredy-Cat flees the first enemy to come next to him', () => {
    let s = make(board({ ...kings, 2: { 4: 'r' }, 6: { 3: sym('luigi') } }), {}, opts());
    expect(movesAt(s, 3, 6).some((m) => m.uses?.includes('high_jump') && m.to.x === 3 && m.to.y === 2)).toBe(true);
    s = wait(s);
    s = play(s, 4, 2, 4, 6);
    expect(at(s, 3, 6)?.type).not.toBe('luigi');
    const luigi = s.pieces.find((p) => p.type === 'luigi')!;
    expect(Math.max(Math.abs(luigi.pos.x - 4), Math.abs(luigi.pos.y - 6))).toBeGreaterThan(1);
  });

  it('Peach floats over gaps and heals an ally within 2', () => {
    let s = make(board({ ...kings, 6: { 3: sym('peach'), 5: 'N' } }), {}, opts(blank({ 5: '....____' })));
    expect(dests(movesAt(s, 3, 6))).toContain('5,4'); // over the gap
    setHp(s, 5, 6, 1, 2);
    s = action(s, 3, 6, 'royalSupport', 5, 6);
    expect(at(s, 5, 6)?.hp).toBe(2);
  });

  it('Daisy kicks for 2 on her first attack; Competitive Spirit after an ally captures', () => {
    let s = make(board({ ...kings, 3: { 3: 'r' }, 6: { 3: sym('daisy') } }), {}, opts());
    setHp(s, 3, 3, 2);
    s = play(s, 3, 6, 3, 3);
    expect(at(s, 3, 3)?.type).toBe('daisy');
    let t = make(board({ ...kings, 4: { 5: 'p' }, 6: { 3: sym('daisy'), 5: 'R' } }), {}, opts());
    t = play(t, 5, 6, 5, 4);
    expect(t.pieces.find((p) => p.type === 'daisy')!.statuses.some((st) => st.kind === 'rangeBuff')).toBe(true);
  });

  it('Yoshi: Flutter Jump over pieces (not walls); Tongue Grab eats a 1 HP enemy two squares away', () => {
    // A wall stops the Flutter Jump; pieces don't.
    const walled = make(board({ ...kings, 6: { 3: sym('yoshi') } }), {}, opts(blank({ 4: '...#....' })));
    expect(movesAt(walled, 3, 6).some((m) => m.uses?.includes('flutter_jump') && m.to.x === 3 && m.to.y === 2)).toBe(false);
    const grab = make(board({ ...kings, 4: { 3: 'p' }, 6: { 3: sym('yoshi') } }), {}, opts());
    expect(movesAt(grab, 3, 6).some((m) => m.uses?.includes('flutter_jump') && m.to.x === 3 && m.to.y === 2)).toBe(true);
    const s = action(grab, 3, 6, 'tongue', 3, 4);
    expect(s.pieces.some((p) => p.type === 'pawn')).toBe(false);
    expect(at(s, 3, 6)?.type).toBe('yoshi');
  });

  it("Toad's mushroom grows an ally, then he may step one square", () => {
    let s = make(board({ ...kings, 6: { 3: sym('toad'), 4: 'N' } }), {}, opts());
    s = action(s, 3, 6, 'mushroom', 4, 6);
    expect(at(s, 4, 6)?.maxHp).toBe(2);
    expect(at(s, 4, 6)?.hp).toBe(2);
    expect(s.bonus[0]?.source).toBe('quick_delivery');
    s = applyMove(s, legalMoves(s).find((m) => m.param === 'quick_delivery' && m.to.x === 3 && m.to.y === 5)!);
    expect(at(s, 3, 5)?.type).toBe('toad');
  });

  it('Toadette: adjacent allies slide further; Mushroom Rescue saves an adjacent ally once', () => {
    const s = make(board({ ...kings, 6: { 3: sym('toadette'), 4: sym('toad') } }), {}, opts());
    expect(dests(movesAt(s, 4, 6))).toContain('4,3'); // Toad slides 3 instead of 2
    let t = make(board({ ...kings, 2: { 4: 'r' }, 6: { 3: sym('toadette'), 4: 'N' } }), {}, opts());
    t = wait(t);
    t = play(t, 4, 2, 4, 6);
    expect(t.pieces.some((p) => p.type === 'knight')).toBe(true);
    expect(at(t, 4, 6)?.type).not.toBe('knight');
  });

  it('Wario: Shoulder Bash for 2 after moving exactly two, and Greedy gold', () => {
    let s = make(board({ ...kings, 4: { 3: 'r' }, 6: { 3: sym('wario') } }), {}, opts());
    setHp(s, 3, 4, 2);
    s = play(s, 3, 6, 3, 4);
    expect(at(s, 3, 4)?.type).toBe('wario');
    expect(s.goldBonus).toBe(8);
  });

  it("Waluigi swaps with an adjacent enemy and hits for 2 on one that can't move", () => {
    let s = make(board({ ...kings, 5: { 3: 'n' }, 6: { 3: sym('waluigi') } }), {}, opts());
    s = action(s, 3, 6, 'dirtyTrick', 3, 5);
    expect(at(s, 3, 5)?.type).toBe('waluigi');
    expect(at(s, 3, 6)?.type).toBe('knight');
    let t = make(board({ ...kings, 4: { 5: 'r' }, 6: { 3: sym('waluigi') } }), {}, opts());
    setHp(t, 5, 4, 2);
    addStatus(at(t, 5, 4)!, { kind: 'bound', until: 99 });
    t = play(t, 3, 6, 5, 4);
    expect(at(t, 5, 4)?.type).toBe('waluigi');
  });

  it('Rosalina: Luma Shield on an ally within 3; Star Spin hits every adjacent enemy', () => {
    let s = make(board({ ...kings, 5: { 2: 'p', 4: 'p' }, 6: { 3: sym('rosalina'), 6: 'N' } }), {}, opts());
    s = action(s, 3, 6, 'lumaShield', 6, 6);
    expect(shields(at(s, 6, 6))).toBe(1);
    s = wait(s);
    s = action(s, 3, 6, 'starSpin', 3, 6);
    expect(s.pieces.some((p) => p.type === 'pawn')).toBe(false);
  });

  it('Goombas swarm for 2 and march forward together', () => {
    let s = make(board({ ...kings, 4: { 4: 'r' }, 5: { 5: sym('goomba') }, 6: { 3: sym('goomba') } }), {}, opts());
    setHp(s, 4, 4, 2);
    s = play(s, 3, 6, 4, 5);
    // The Goomba at 5,5 now has a friend next to it: it marches forward.
    expect(at(s, 5, 4)?.type).toBe('goomba');
    s = wait(s);
    s = play(s, 4, 5, 4, 4);
    expect(at(s, 4, 4)?.type).toBe('goomba');
  });

  it("Koopa Troopa's shell softens the first attack; Shell Slide hits for 2", () => {
    let s = make(board({ ...kings, 2: { 3: 'r' }, 6: { 3: sym('koopa') } }), {}, opts());
    s = wait(s);
    s = play(s, 3, 2, 3, 6);
    expect(at(s, 3, 6)?.type).toBe('koopa');
    expect(at(s, 3, 6)?.hp).toBe(2);
    let t = make(board({ ...kings, 2: { 3: 'r' }, 6: { 3: sym('koopa') } }), {}, opts());
    setHp(t, 3, 2, 2);
    const slide = movesAt(t, 3, 6).find((m) => m.uses?.includes('shell_slide') && m.to.y === 2)!;
    t = applyMove(t, slide);
    expect(at(t, 3, 2)?.type).toBe('koopa');
  });

  it("Boo drifts through walls and pieces, and can't capture with another enemy next to it", () => {
    const s = make(board({ ...kings, 4: { 3: 'P' } }), {}, opts(blank({ 5: '...#....' })));
    const b = make(board({ ...kings, 6: { 3: sym('boo') }, 4: { 3: 'P' } }), {}, opts(blank({ 5: '...#....' })));
    expect(dests(movesAt(b, 3, 6))).not.toContain('3,4');
    expect(movesAt(b, 3, 6).some((m) => m.uses?.includes('ghostly_passage'))).toBe(false);
    expect(s).toBeDefined();
    const c = make(board({ ...kings, 6: { 3: sym('boo') } }), {}, opts(blank({ 5: '...#....' })));
    expect(dests(movesAt(c, 3, 6))).toContain('3,4');
    const shy = make(board({ ...kings, 5: { 2: 'p', 4: 'p' }, 6: { 3: sym('boo') } }), {}, opts());
    expect(movesAt(shy, 3, 6).some((m) => m.targets?.length)).toBe(false);
  });

  it('Hammer Bros throw over one obstacle, and two of them hit two enemies', () => {
    let s = make(board({ ...kings, 3: { 3: 'r', 5: 'r' }, 4: { 3: 'P' }, 6: { 3: sym('hammer_bro'), 5: sym('hammer_bro') } }), {}, opts());
    setHp(s, 3, 3, 2);
    setHp(s, 5, 3, 2);
    const both = movesAt(s, 3, 6).find((m) => m.action === 'hammer' && m.param);
    expect(both).toBeUndefined(); // only one target in reach of this Bro
    s = action(s, 3, 6, 'hammer', 3, 3);
    expect(at(s, 3, 3)?.hp).toBe(1);
    const pair = make(board({ ...kings, 3: { 3: 'r' }, 6: { 0: 'r', 3: sym('hammer_bro'), 4: sym('hammer_bro') } }), {}, opts());
    expect(movesAt(pair, 3, 6).some((m) => m.action === 'hammer' && !!m.param)).toBe(true);
  });

  it('Bowser: phases, fire breath down a line, spiked shell, and the ground slam', () => {
    let s = make(board({ 0: { 7: 'k' }, 7: { 0: 'K' }, 1: { 3: sym('bowser', 'enemy') }, 5: { 3: 'R', 4: 'N' } }), {}, opts());
    s = wait(s);
    const bowser = s.pieces.find((p) => p.type === 'bowser')!;
    expect(bowserPhase(bowser)).toBe(1);
    const fire = legalMoves(s).find((m) => m.pieceId === bowser.id && m.action === 'fireBreath' && m.param === '0,1')!;
    expect(fire).toBeDefined();
    s = applyMove(s, fire);
    expect(s.pieces.some((p) => p.type === 'rook')).toBe(false);
    expect(s.pieces.some((p) => p.type === 'knight')).toBe(false);
    // Phase 2: an adjacent attacker gets bitten.
    let t = make(board({ 0: { 7: 'k' }, 7: { 0: 'K' }, 1: { 3: sym('bowser', 'enemy') }, 4: { 3: 'R' } }), {}, opts());
    t.pieces.find((p) => p.type === 'bowser')!.hp = 3;
    t = play(t, 3, 4, 3, 2);
    expect(t.pieces.find((p) => p.type === 'bowser')!.hp).toBe(2);
    expect(t.pieces.some((p) => p.type === 'rook')).toBe(false);
    // Phase 3: Ground Slam.
    let u = make(board({ 0: { 7: 'k' }, 7: { 0: 'K' }, 1: { 3: sym('bowser', 'enemy') }, 3: { 2: 'N' } }), {}, opts(blank({ 1: '.....+..' })));
    u.pieces.find((p) => p.type === 'bowser')!.hp = 1;
    u = wait(u);
    const slam = legalMoves(u).find((m) => m.action === 'groundSlam')!;
    u = applyMove(u, slam);
    expect(u.pieces.some((p) => p.type === 'knight')).toBe(false);
    expect(terrainAt(u.board, { x: 5, y: 1 })).toBe('normal');
    expect(hasStatus(u.pieces.find((p) => p.type === 'bowser')!, 'stunned')).toBe(false);
  });
});
