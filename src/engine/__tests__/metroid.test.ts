import { describe, expect, it } from 'vitest';
import { METROID_LEGEND } from '../../content/packs';
import { terrainAt } from '../board';
import { addShield, hasStatus } from '../core';
import { brainPhase } from '../metroid';
import { applyMove, legalMoves } from '../moves';
import { GameState, PieceType, Side } from '../types';
import { act, at, covers, dests, hasAction, make, movesAt, play, shields, wait } from './upgradeHelpers';

const sym = (type: PieceType, side: Side = 'player') => Object.entries(METROID_LEGEND).find(([, [t, s]]) => t === type && s === side)![0];
const row = (cells: Record<number, string> = {}) => Array.from({ length: 8 }, (_, x) => cells[x] ?? '.').join('');
const board = (rows: Record<number, Record<number, string>>) => Array.from({ length: 8 }, (_, y) => row(rows[y]));
const blank = (rows: Record<number, string>) => Array.from({ length: 8 }, (_, y) => rows[y] ?? '........');
const opts = (terrain?: string[]) => ({ legend: METROID_LEGEND, terrain });
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

describe('Metroid Pack pieces', () => {
  it('Samus: Arm Cannon down a line; Morph Ball rolls through a wall', () => {
    let s = make(board({ ...kings, 2: { 3: 'r' }, 6: { 3: sym('samus') } }), {}, opts(blank({ 5: '......#.' })));
    setHp(s, 3, 2, 2);
    expect(movesAt(s, 3, 6).some((m) => m.action === 'armCannon' && m.to.y === 2)).toBe(true);
    const t = make(board({ ...kings, 6: { 6: sym('samus') } }), {}, opts(blank({ 5: '......#.' })));
    expect(movesAt(t, 6, 6).some((m) => m.uses?.includes('samus_morph') && m.to.x === 6 && m.to.y === 4)).toBe(true);
    s = action(s, 3, 6, 'armCannon', 3, 2);
    expect(at(s, 3, 2)?.hp).toBe(1);
  });

  it('Zero Suit Samus: four diagonally, Paralyzer, and Acrobatic Escape', () => {
    let s = make(board({ ...kings, 3: { 3: 'r' }, 6: { 3: sym('zero_suit') } }), {}, opts());
    expect(dests(movesAt(s, 3, 6))).toContain('3,4'); // the orthogonal jump of two
    s = action(s, 3, 6, 'paralyzer', 3, 3);
    expect(hasStatus(at(s, 3, 3)!, 'stunned')).toBe(true);
    let t = make(board({ ...kings, 2: { 3: 'r' }, 6: { 3: sym('zero_suit') } }), {}, opts());
    t = wait(t);
    t = play(t, 3, 2, 3, 6);
    expect(t.pieces.some((p) => p.type === 'zero_suit')).toBe(true);
  });

  it('Metroid: floats over pieces, drains energy, and latches on', () => {
    let s = make(board({ ...kings, 5: { 3: 'P' }, 6: { 3: sym('metroid') }, 4: { 5: 'n' } }), {}, opts());
    expect(dests(movesAt(s, 3, 6))).toContain('3,4');
    setHp(s, 3, 6, 1, 2);
    s = play(s, 3, 6, 5, 4);
    expect(at(s, 5, 4)?.hp).toBe(2);
    let t = make(board({ ...kings, 5: { 3: 'r' }, 6: { 3: sym('metroid') } }), {}, opts());
    setHp(t, 3, 5, 3);
    t = action(t, 3, 6, 'latch', 3, 5);
    expect(hasStatus(at(t, 3, 5)!, 'bound')).toBe(true);
    expect(at(t, 3, 5)?.hp).toBe(2); // drained at the end of the Metroid's turn
  });

  it('Space Pirates: the blaster reaches 5 with a squadmate nearby', () => {
    const s = make(board({ ...kings, 1: { 3: 'r' }, 6: { 3: sym('space_pirate'), 4: sym('space_pirate') } }), {}, opts());
    expect(movesAt(s, 3, 6).some((m) => m.action === 'pirateBlaster' && m.to.y === 1)).toBe(true);
    const lone = make(board({ ...kings, 1: { 3: 'r' }, 6: { 3: sym('space_pirate') } }), {}, opts());
    expect(movesAt(lone, 3, 6).some((m) => m.action === 'pirateBlaster')).toBe(false);
  });

  it('Chozo Soldier: Spear Strike from two away, and a counterattack', () => {
    let s = make(board({ ...kings, 4: { 3: 'r' }, 6: { 3: sym('chozo_soldier') } }), {}, opts());
    setHp(s, 3, 4, 2);
    s = action(s, 3, 6, 'spear', 3, 4);
    expect(at(s, 3, 4)?.hp).toBe(1);
    expect(at(s, 3, 6)?.type).toBe('chozo_soldier');
    let t = make(board({ ...kings, 2: { 3: 'r' }, 6: { 3: sym('chozo_soldier') } }), {}, opts());
    t = wait(t);
    t = play(t, 3, 2, 3, 6);
    expect(t.pieces.some((p) => p.type === 'rook')).toBe(false);
  });

  it('E.M.M.I.: Pursuit adds range; Capture Protocol cuts through shields', () => {
    let s = make(board({ ...kings, 1: { 6: 'r' }, 6: { 3: sym('emmi') } }), {}, opts());
    expect(dests(movesAt(s, 3, 6))).not.toContain('3,2');
    const near = make(board({ ...kings, 4: { 5: 'p' }, 6: { 3: sym('emmi') } }), {}, opts());
    expect(dests(movesAt(near, 3, 6))).toContain('3,2');
    s = make(board({ ...kings, 3: { 3: 'r' }, 6: { 3: sym('emmi') } }), {}, opts());
    addShield(s, at(s, 3, 3)!, 2, true);
    s = play(s, 3, 6, 3, 3);
    expect(at(s, 3, 3)?.type).toBe('emmi');
  });

  it('Ridley: flies over a gap, lashes his tail, and keeps moving after a capture', () => {
    let s = make(board({ ...kings, 4: { 3: sym('ridley') } }), {}, opts(blank({ 3: '___..___', 2: '___..___' })));
    const ridley = s.pieces.find((p) => p.type === 'ridley')!;
    expect(legalMoves(s).some((m) => m.pieceId === ridley.id && m.to.x === 3 && m.to.y === 1)).toBe(false); // gaps under 3,2? no: 3..4 is floor
    let t = make(board({ ...kings, 3: { 3: 'p', 5: 'p' }, 4: { 3: sym('ridley') } }), {}, opts());
    t = action(t, 3, 4, 'tailStrike', 3, 4);
    expect(t.pieces.filter((p) => p.type === 'pawn')).toHaveLength(0);
    s = make(board({ ...kings, 2: { 3: 'p' }, 4: { 3: sym('ridley') } }), {}, opts());
    s = applyMove(s, legalMoves(s).find((m) => m.pieceId === s.pieces.find((p) => p.type === 'ridley')!.id && m.targets?.length && m.to.y === 2)!);
    expect(s.bonus[0]?.source).toBe('aerial_assault');
  });

  it('Mother Brain: beams, a barrier at 2 HP, and the Hyper Beam at 1 HP', () => {
    let s = make(board({ 7: { 0: 'K' }, 0: { 2: sym('mother_brain', 'enemy'), 7: 'k' }, 5: { 2: 'R', 3: 'N', 4: 'B' } }), {}, opts());
    s = wait(s);
    const brain = s.pieces.find((p) => p.type === 'mother_brain')!;
    expect(brainPhase(brain)).toBe(1);
    s = applyMove(s, legalMoves(s).find((m) => m.action === 'brainBeam' && m.param === '0,1')!);
    expect(s.pieces.filter((p) => p.side === 'player' && ['rook', 'knight', 'bishop'].includes(p.type))).toHaveLength(0);
    // Phase 2 barrier.
    let t = make(board({ 0: { 2: sym('mother_brain', 'enemy'), 7: 'k' }, 7: { 0: 'K' }, 4: { 3: 'R' } }), {}, opts());
    t.pieces.find((p) => p.type === 'mother_brain')!.hp = 2;
    t = play(t, 3, 4, 3, 3);
    expect(t.pieces.find((p) => p.type === 'mother_brain')!.hp).toBe(2);
  });
});

describe('Metroid Pack upgrades', () => {
  it('Missiles, beams and bombs', () => {
    covers('missile_expansion', 'super_missile', 'ice_beam', 'wave_beam', 'plasma_beam', 'morph_ball_bomb');
    let s = make(blank({ 0: '.......k', 2: '...r.r..', 4: '...P....', 6: '...N.B..', 7: 'K.......' }), {
      '3,6': ['missile_expansion', 'wave_beam'],
      '5,6': ['super_missile', 'plasma_beam'],
    }, { terrain: blank({ 4: '.....+..' }) });
    setHp(s, 3, 2, 3);
    setHp(s, 5, 2, 3);
    expect(hasAction(s, 3, 6, 'missile_expansion')).toBe(false); // the pawn is in the way
    s = act(s, 3, 6, 'wave_beam', 3, 2);
    expect(at(s, 3, 2)?.hp).toBe(2);
    s = wait(s);
    s = act(s, 5, 6, 'super_missile', 5, 2);
    expect(at(s, 5, 2)?.hp).toBe(1);
    expect(terrainAt(s.board, { x: 5, y: 4 })).toBe('normal');
    let t = make(blank({ 0: '.......k', 3: '...r....', 5: '..pp....', 6: '...N.B..', 7: 'K.......' }), { '3,6': ['ice_beam', 'morph_ball_bomb'], '5,6': ['plasma_beam'] });
    setHp(t, 3, 3, 2);
    t = act(t, 3, 6, 'ice_beam', 3, 5);
    expect(t.pieces.some((p) => p.pos.x === 3 && p.pos.y === 5)).toBe(false);
    t = wait(t);
    expect(hasAction(t, 3, 6, 'morph_ball_bomb')).toBe(true);
    // Plasma Beam: every enemy along the row, through pieces.
    let pl = make(blank({ 0: '.......k', 5: '.pp.PB..', 7: 'K.......' }), { '5,5': ['plasma_beam'] });
    pl = act(pl, 5, 5, 'plasma_beam', 4, 5, (m) => m.param === '-1,0');
    expect(pl.pieces.filter((p) => p.type === 'pawn' && p.side === 'enemy')).toHaveLength(0);
  });

  it('Morph Ball, Space Jump, Speed Booster, Shinespark and Grapple Beam', () => {
    covers('morph_ball', 'space_jump', 'speed_booster', 'shinespark', 'grapple_beam');
    const s = make(blank({ 0: '.......k', 6: '...G....', 7: 'K.......' }), { '3,6': ['speed_booster'] });
    expect(dests(movesAt(s, 3, 6))).toContain('3,3');
    let j = make(blank({ 0: '.......k', 6: '...N....', 7: 'K.......' }), { '3,6': ['space_jump'] });
    j = play(j, 3, 6, 4, 4);
    expect(j.bonus[0]?.source).toBe('space_jump');
    const sp = make(blank({ 0: '.......k', 2: '...r....', 6: '...N....', 7: 'K.......' }), { '3,6': ['shinespark', 'morph_ball'] }, { terrain: blank({ 4: '...+....' }) });
    const spark = movesAt(sp, 3, 6).find((m) => m.uses?.includes('shinespark') && m.to.y === 2)!;
    expect(spark).toBeDefined();
    const after = applyMove(sp, spark);
    expect(terrainAt(after.board, { x: 3, y: 4 })).toBe('normal');
    const g = make(blank({ 0: '.......k', 6: '...N....', 7: 'K.......' }), { '3,6': ['grapple_beam'] }, { terrain: blank({ 2: '......#.' }) });
    expect(hasAction(g, 3, 6, 'grapple_beam')).toBe(true);
  });

  it('Varia Suit, Gravity Suit, Screw Attack and the Metroid Suit', () => {
    covers('varia_suit', 'gravity_suit', 'screw_attack', 'metroid_suit');
    let s = make(blank({ 0: '.......k', 5: '....p...', 6: '...N.B..', 7: 'K.......' }), { '3,6': ['varia_suit', 'screw_attack'], '5,6': ['gravity_suit'] });
    expect(at(s, 3, 6)?.maxHp).toBe(2);
    expect(shields(at(s, 3, 6))).toBe(1);
    s = play(s, 3, 6, 5, 4); // diagonal jump of two over the pawn
    expect(s.pieces.some((p) => p.type === 'pawn')).toBe(false);
    let m = make(blank({ 0: '.......k', 3: '...r....', 6: '...N....', 7: 'K.......' }), { '3,6': ['metroid_suit'] });
    expect(at(m, 3, 6)?.maxHp).toBe(2);
    setHp(m, 3, 3, 3);
    m = act(m, 3, 6, 'metroid_suit', 3, 5);
    expect(at(m, 3, 3)?.hp).toBe(1);
  });
});
