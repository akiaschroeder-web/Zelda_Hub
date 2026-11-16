import { describe, expect, it } from 'vitest';
import { MARIO_LEGEND } from '../../content/packs';
import { terrainAt } from '../board';
import { hasStatus } from '../core';
import { sizeOf } from '../pieces';
import { applyMove } from '../moves';
import { GameState } from '../types';
import { act, at, covers, dests, hasAction, make, movesAt, play, shields, wait } from './upgradeHelpers';

const blank = (rows: Record<number, string>) => Array.from({ length: 8 }, (_, y) => rows[y] ?? '........');
const setHp = (s: GameState, x: number, y: number, hp: number, maxHp = hp) => {
  const p = at(s, x, y)!;
  p.maxHp = maxHp;
  p.hp = hp;
};
/** Rosalina (up to 3 any direction) is a handy finite slider. */
const ROSA = 'É';
const opts = (terrain?: string[]) => ({ legend: MARIO_LEGEND, terrain });

describe('Mario Pack upgrades: power-ups', () => {
  it('Super Mushroom and Elephant Fruit add max HP', () => {
    covers('super_mushroom', 'elephant_fruit');
    let s = make(blank({ 0: '.......k', 5: '...p....', 6: '...N.B..', 7: 'K.......' }), { '3,6': ['super_mushroom'], '5,6': ['elephant_fruit'] });
    expect(at(s, 3, 6)?.maxHp).toBe(2);
    expect(at(s, 5, 6)?.maxHp).toBe(2);
    s = wait(wait(s));
    expect(hasAction(s, 5, 6, 'elephant_fruit')).toBe(false); // nobody adjacent
    const t = make(blank({ 0: '.......k', 5: '....p...', 6: '...N.B..', 7: 'K.......' }), { '5,6': ['elephant_fruit'] });
    const u = act(t, 5, 6, 'elephant_fruit', 5, 6);
    expect(u.pieces.some((p) => p.type === 'pawn')).toBe(false);
  });

  it('Fire Flower burns, Ice Flower freezes a survivor', () => {
    covers('fire_flower', 'ice_flower');
    let s = make(blank({ 0: '.......k', 3: '...r.r..', 6: '...N.B..', 7: 'K.......' }), { '3,6': ['fire_flower'], '5,6': ['ice_flower'] });
    setHp(s, 3, 3, 2);
    setHp(s, 5, 3, 2);
    s = act(s, 3, 6, 'fire_flower', 3, 3);
    expect(at(s, 3, 3)?.hp).toBe(1);
    s = wait(s);
    s = act(s, 5, 6, 'ice_flower', 5, 3);
    expect(hasStatus(at(s, 5, 3)!, 'bound')).toBe(true);
  });

  it('Super Star: invincible for 2 turns and hitting harder', () => {
    covers('super_star');
    let s = make(blank({ 0: '.......k', 2: '...r....', 6: '...N....', 7: 'K.......' }), { '3,6': ['super_star'] });
    s = act(s, 3, 6, 'super_star', 3, 6);
    s = play(s, 3, 2, 3, 6);
    expect(at(s, 3, 6)?.type).toBe('knight');
  });

  it('1-Up Mushroom: back to the start square once', () => {
    covers('one_up_mushroom');
    let s = make(blank({ 0: '.......k', 2: '...r....', 6: '...N....', 7: 'K.......' }), { '3,6': ['one_up_mushroom'] });
    s = play(s, 3, 6, 4, 4);
    s = play(s, 3, 2, 3, 4, () => true);
    s = wait(s);
    s = play(s, 3, 4, 4, 4);
    expect(s.pieces.find((p) => p.type === 'knight')?.pos).toEqual({ x: 3, y: 6 });
  });

  it('Mini Mushroom slips through pieces and walls but hits for at most 1', () => {
    covers('mini_mushroom');
    const s = make(blank({ 0: '.......k', 5: '...P....', 6: '...' + ROSA + '....', 7: 'K.......' }), { '3,6': ['mini_mushroom'] }, opts(blank({ 4: '...#....' })));
    expect(movesAt(s, 3, 6).some((m) => m.uses?.includes('mini_mushroom') && m.to.x === 3 && m.to.y === 3)).toBe(true);
  });

  it('Mega Mushroom: a 2×2 giant for 3 turns, then back', () => {
    covers('mega_mushroom');
    let s = make(blank({ 0: '.......k', 6: '...N....', 7: 'K.......' }), { '3,6': ['mega_mushroom'] });
    s = act(s, 3, 6, 'mega_mushroom', 3, 5);
    const giant = s.pieces.find((p) => p.type === 'knight')!;
    expect(sizeOf(giant)).toBe(2);
    expect(giant.maxHp).toBe(3);
    for (let i = 0; i < 6; i++) s = wait(s);
    const back = s.pieces.find((p) => p.type === 'knight')!;
    expect(sizeOf(back)).toBe(1);
    expect(back.maxHp).toBe(1);
  });
});

describe('Mario Pack upgrades: suits', () => {
  it('Super Leaf glides over gaps and jumps three diagonally; Frog Suit jumps two', () => {
    covers('super_leaf', 'frog_suit');
    const s = make(blank({ 0: '.......k', 6: '...N.B..', 7: 'K.......' }), { '3,6': ['super_leaf'], '5,6': ['frog_suit'] });
    expect(movesAt(s, 3, 6).some((m) => m.uses?.includes('super_leaf') && m.to.x === 6 && m.to.y === 3)).toBe(true);
    expect(dests(movesAt(s, 5, 6))).toContain('5,4');
  });

  it('Tanooki Suit: a statue takes no damage and bites back', () => {
    covers('tanooki_suit');
    let s = make(blank({ 0: '.......k', 4: '...r....', 6: '...N....', 7: 'K.......' }), { '3,6': ['tanooki_suit'] });
    setHp(s, 3, 4, 2);
    s = act(s, 3, 6, 'tanooki_suit', 3, 6);
    s = play(s, 3, 4, 3, 6);
    expect(at(s, 3, 6)?.type).toBe('knight');
    expect(s.pieces.find((p) => p.type === 'rook')?.hp).toBe(1);
  });

  it('Hammer Suit and Boomerang Flower throw over pieces', () => {
    covers('hammer_suit', 'boomerang_flower');
    let s = make(blank({ 0: '.......k', 3: '...r.r..', 4: '...P.P..', 6: '...N.B..', 7: 'K.......' }), { '3,6': ['hammer_suit'], '5,6': ['boomerang_flower'] });
    setHp(s, 3, 3, 2);
    setHp(s, 5, 3, 2);
    s = act(s, 3, 6, 'hammer_suit', 3, 3);
    expect(at(s, 3, 3)?.hp).toBe(1);
    s = wait(s);
    s = act(s, 5, 6, 'boomerang_flower', 5, 3);
    expect(at(s, 5, 3)?.hp).toBe(1);
  });

  it('Super Bell climbs walls and pounces next to one', () => {
    covers('super_bell');
    const s = make(blank({ 0: '.......k', 6: '...' + ROSA + '....', 7: 'K.......' }), { '3,6': ['super_bell'] }, opts(blank({ 5: '...#....' })));
    expect(dests(movesAt(s, 3, 6))).toContain('3,5'); // onto the wall
    expect(hasAction(s, 3, 6, 'super_bell')).toBe(true);
  });

  it('Double Cherry makes a 1 HP copy', () => {
    covers('double_cherry');
    let s = make(blank({ 0: '.......k', 6: '...R....', 7: 'K.......' }), { '3,6': ['double_cherry'] });
    s = act(s, 3, 6, 'double_cherry', 4, 6);
    expect(at(s, 4, 6)?.type).toBe('rook');
    expect(at(s, 4, 6)?.upgrades).toEqual([]);
    expect(at(s, 4, 6)?.temp).toBeDefined();
  });

  it('Bee Mushroom flies to any empty square within 3', () => {
    covers('bee_mushroom');
    let s = make(blank({ 0: '.......k', 6: '...N....', 7: 'K.......' }), { '3,6': ['bee_mushroom'] });
    s = act(s, 3, 6, 'bee_mushroom', 6, 3);
    expect(at(s, 6, 3)?.type).toBe('knight');
  });
});

describe('Mario Pack upgrades: abilities & items', () => {
  it('Cappy captures a weakened enemy and borrows its moves', () => {
    covers('cappy');
    let s = make(blank({ 0: '.......k', 4: '...r....', 6: '...N....', 7: 'K.......' }), { '3,6': ['cappy'] });
    s = act(s, 3, 6, 'cappy', 3, 4);
    expect(at(s, 3, 4)?.type).toBe('knight');
    s = wait(s);
    expect(dests(movesAt(s, 3, 4))).toContain('3,0'); // moves like a Rook now
  });

  it('Spin Attack hits an adjacent enemy', () => {
    covers('spin_attack');
    let s = make(blank({ 0: '.......k', 5: '...p....', 6: '...N....', 7: 'K.......' }), { '3,6': ['spin_attack'] });
    s = act(s, 3, 6, 'spin_attack', 3, 5);
    expect(s.pieces.some((p) => p.type === 'pawn')).toBe(false);
  });

  it('P-Wing flies within 5; Propeller Mushroom jumps 4 and lands hard', () => {
    covers('p_wing', 'propeller_mushroom');
    let s = make(blank({ 0: '.......k', 2: '...r....', 6: '...N.B..', 7: 'K.......' }), { '3,6': ['propeller_mushroom'], '5,6': ['p_wing'] });
    expect(movesAt(s, 5, 6).some((m) => m.uses?.includes('p_wing') && m.to.x === 2 && m.to.y === 1)).toBe(true);
    setHp(s, 3, 2, 2);
    s = applyMove(s, movesAt(s, 3, 6).find((m) => m.uses?.includes('propeller_mushroom') && m.to.y === 2)!);
    expect(at(s, 3, 2)?.type).toBe('knight');
  });

  it('Cloud Flower bridges a gap; Bubble Flower traps an enemy until it is hit', () => {
    covers('cloud_flower', 'bubble_flower');
    let s = make(blank({ 0: '.......k', 3: '...r....', 6: '...N.B..', 7: 'K.......' }), { '3,6': ['cloud_flower'], '5,6': ['bubble_flower'] }, { terrain: blank({ 5: '..._....' }) });
    s = act(s, 3, 6, 'cloud_flower', 3, 5);
    expect(terrainAt(s.board, { x: 3, y: 5 })).toBe('normal');
    s = wait(s);
    s = act(s, 5, 6, 'bubble_flower', 3, 3);
    expect(hasStatus(at(s, 3, 3)!, 'stunned')).toBe(true);
  });

  it('Drill Mushroom bores through cracked walls', () => {
    covers('drill_mushroom');
    let s = make(blank({ 0: '.......k', 6: '...' + ROSA + '....', 7: 'K.......' }), { '3,6': ['drill_mushroom'] }, opts(blank({ 5: '...+....', 4: '...#....' })));
    const drill = movesAt(s, 3, 6).find((m) => m.uses?.includes('drill_mushroom') && m.to.x === 3 && m.to.y === 3)!;
    expect(drill).toBeDefined();
    s = applyMove(s, drill);
    expect(terrainAt(s.board, { x: 3, y: 5 })).toBe('normal');
    expect(terrainAt(s.board, { x: 3, y: 4 })).toBe('wall');
  });

  it('P-Switch opens cracked walls for 3 turns', () => {
    covers('p_switch');
    let s = make(blank({ 0: '.......k', 6: '...N....', 7: 'K.......' }), { '3,6': ['p_switch'] }, { terrain: blank({ 4: '..+.+...' }) });
    s = act(s, 3, 6, 'p_switch', 3, 6, (m) => m.param === 'open');
    expect(terrainAt(s.board, { x: 2, y: 4 })).toBe('normal');
    for (let i = 0; i < 7; i++) s = wait(s);
    expect(terrainAt(s.board, { x: 2, y: 4 })).toBe('cracked');
  });

  it('POW Block, Red Shell and Spiny Shell', () => {
    covers('pow_block', 'red_shell', 'spiny_shell');
    let s = make(blank({ 0: 'r......k', 4: '..p.....', 5: '....p...', 6: '...N.B.Q', 7: 'K.......' }), { '3,6': ['pow_block'], '5,6': ['red_shell'], '7,6': ['spiny_shell'] });
    setHp(s, 0, 0, 3);
    s = act(s, 3, 6, 'pow_block', 3, 6);
    expect(s.pieces.filter((p) => p.type === 'pawn')).toHaveLength(0);
    s = wait(s);
    s = act(s, 7, 6, 'spiny_shell', 0, 0);
    expect(at(s, 0, 0)?.hp).toBe(1);
    const t = make(blank({ 0: '.......k', 3: '.....r..', 4: '.....P..', 6: '...N.B..', 7: 'K.......' }), { '5,6': ['red_shell'] });
    expect(hasAction(t, 5, 6, 'red_shell')).toBe(true);
  });

  it('Super Horn pushes adjacent enemies away, and hurts any that are stuck', () => {
    covers('super_horn');
    let s = make(blank({ 0: '.......k', 5: '..pp....', 6: '...N....', 7: 'K.......' }), { '3,6': ['super_horn'] }, { terrain: blank({ 4: '.#......' }) });
    s = act(s, 3, 6, 'super_horn', 3, 6);
    expect(at(s, 3, 4)?.type).toBe('pawn'); // pushed straight up
    expect(s.pieces.filter((p) => p.type === 'pawn')).toHaveLength(1); // the other hit a wall and took 1
  });

  it('Gold Coin earns gold per capture; Wonder Flower boosts for 3 turns', () => {
    covers('gold_coin', 'wonder_flower');
    let s = make(blank({ 0: '.......k', 3: '...p....', 6: '...R....', 7: 'K.......' }), { '3,6': ['gold_coin'] });
    s = play(s, 3, 6, 3, 3);
    expect(s.goldBonus).toBe(8);
    let w = make(blank({ 0: '.......k', 6: '...' + ROSA + '....', 7: 'K.......' }), { '3,6': ['wonder_flower'] }, opts());
    w = act(w, 3, 6, 'wonder_flower', 3, 6);
    w = wait(w);
    expect(dests(movesAt(w, 3, 6))).toContain('3,1'); // 3 + 2 squares
    expect(shields(at(w, 3, 6))).toBe(0);
  });
});
