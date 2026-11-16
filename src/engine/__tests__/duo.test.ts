import { describe, expect, it } from 'vitest';
import { DUO_LEGEND } from '../../content/packs';
import { terrainAt } from '../board';
import { applyMove, legalMoves } from '../moves';
import { GameState } from '../types';
import { act, at, covers, dests, hasAction, make, movesAt, play, wait } from './upgradeHelpers';

const blank = (rows: Record<number, string>) => Array.from({ length: 8 }, (_, y) => rows[y] ?? '........');
const opts = (terrain?: string[]) => ({ legend: DUO_LEGEND, terrain });
const hurt = (s: GameState, x: number, y: number, hp = 1, maxHp = 2) => {
  const p = at(s, x, y)!;
  p.maxHp = maxHp;
  p.hp = hp;
};
const harmony = (s: GameState, x: number, y: number, tx: number, ty: number) => {
  const m = movesAt(s, x, y).find((m) => m.action === 'harmony' && m.to.x === tx && m.to.y === ty);
  expect(m, `no Digital Harmony ${x},${y} -> ${tx},${ty}`).toBeDefined();
  return applyMove(s, m!);
};

describe('Digital Duo pieces', () => {
  it('Miku: up to three diagonally or one orthogonally', () => {
    const s = make(blank({ 0: '.......k', 4: '...ミ....', 7: 'K.......' }), {}, opts());
    const d = dests(movesAt(s, 3, 4));
    for (const sq of ['0,1', '6,1', '6,7', '3,3', '2,4', '4,4', '3,5']) expect(d).toContain(sq);
    expect(d).not.toContain('3,2');
    expect(d).not.toContain('5,4');
  });

  it('Teto: up to three orthogonally or one diagonally', () => {
    const s = make(blank({ 0: '.......k', 4: '...テ....', 7: 'K.......' }), {}, opts());
    const d = dests(movesAt(s, 3, 4));
    for (const sq of ['3,1', '0,4', '6,4', '3,7', '2,3', '4,5']) expect(d).toContain(sq);
    expect(d).not.toContain('1,2');
    expect(d).not.toContain('3,0');
  });

  it('Digital Harmony heals an ally within 3 instead of moving, then waits 3 turns', () => {
    let s = make(blank({ 0: '.......k', 4: '...ミ....', 7: 'K....R..' }), {}, opts());
    hurt(s, 5, 7);
    expect(movesAt(s, 3, 4).some((m) => m.action === 'harmony')).toBe(true);
    s = harmony(s, 3, 4, 5, 7);
    expect(at(s, 5, 7)!.hp).toBe(2);
    expect(at(s, 3, 4)).toBeDefined(); // Miku stays put
    hurt(s, 5, 7);
    s = wait(s); // the enemy's turn
    for (let turn = 0; turn < 2; turn++) {
      expect(movesAt(s, 3, 4).some((m) => m.action === 'harmony')).toBe(false);
      s = wait(wait(s));
    }
    expect(movesAt(s, 3, 4).some((m) => m.action === 'harmony')).toBe(true);
  });

  it('Duet: Miku healing an ally also heals Teto within 3, if Teto is hurt', () => {
    let s = make(blank({ 0: '.......k', 4: '...ミ.テ..', 7: 'K....R..' }), {}, opts());
    hurt(s, 5, 7);
    hurt(s, 5, 4);
    s = harmony(s, 3, 4, 5, 7);
    expect(at(s, 5, 7)!.hp).toBe(2);
    expect(at(s, 5, 4)!.hp).toBe(2);
  });

  it('Drill Break: Teto smashes an adjacent cracked wall instead of moving', () => {
    const terrain = blank({ 3: '....+...' });
    let s = make(blank({ 0: '.......k', 4: '...テ....', 7: 'K.......' }), {}, opts(terrain));
    const m = movesAt(s, 3, 4).find((m) => m.action === 'demolish');
    expect(m?.to).toEqual({ x: 4, y: 3 });
    s = applyMove(s, m!);
    expect(terrainAt(s.board, { x: 4, y: 3 })).toBe('normal');
    expect(at(s, 3, 4)?.type).toBe('teto');
  });

  it("Duet: Teto's first attack deals 2 with Miku within 3, and only the first", () => {
    const rows = blank({ 0: '.......k', 2: '...r..r.', 4: '...テ....', 6: '.ミ......', 7: 'K.......' });
    let s = make(rows, {}, opts());
    hurt(s, 3, 2, 2, 2);
    hurt(s, 6, 2, 2, 2);
    s = play(s, 3, 4, 3, 2);
    expect(s.pieces.some((p) => p.pos.x === 3 && p.pos.y === 2 && p.type === 'rook')).toBe(false);
    expect(at(s, 3, 2)?.type).toBe('teto');
    s = wait(s);
    s = play(s, 3, 2, 6, 2);
    expect(at(s, 6, 2)?.type).toBe('rook');
    expect(at(s, 6, 2)!.hp).toBe(1);
  });

  it('Without Miku nearby, Teto hits for 1', () => {
    let s = make(blank({ 0: '.......k', 2: '...r....', 4: '...テ....', 7: 'K......ミ' }), {}, opts());
    hurt(s, 3, 2, 2, 2);
    s = play(s, 3, 4, 3, 2);
    expect(at(s, 3, 2)?.type).toBe('rook');
    expect(at(s, 3, 2)!.hp).toBe(1);
  });
});

describe('Digital Duo upgrades', () => {
  covers('leek', 'baguette', 'duet_microphone');
  it('Leek heals an adjacent ally every 3 turns', () => {
    let s = make(blank({ 0: '.......k', 6: '...BR...', 7: 'K.......' }), { '3,6': ['leek'] }, opts());
    hurt(s, 4, 6);
    s = act(s, 3, 6, 'leek', 4, 6);
    expect(at(s, 4, 6)!.hp).toBe(2);
    hurt(s, 4, 6);
    s = wait(s);
    for (let turn = 0; turn < 2; turn++) {
      expect(hasAction(s, 3, 6, 'leek')).toBe(false);
      s = wait(wait(s));
    }
    expect(hasAction(s, 3, 6, 'leek')).toBe(true);
  });

  it('Baguette: +1 on the first attack, and 1 HP back if it defeats the target', () => {
    let s = make(blank({ 0: '.......k', 3: '...r....', 6: '...R....', 7: 'K.......' }), { '3,6': ['baguette'] }, opts());
    hurt(s, 3, 3, 2, 2);
    hurt(s, 3, 6, 1, 2);
    s = play(s, 3, 6, 3, 3);
    expect(at(s, 3, 3)?.type).toBe('rook');
    expect(at(s, 3, 3)?.side).toBe('player');
    expect(at(s, 3, 3)!.hp).toBe(2);
  });

  it('Baguette: only the first attack of the battle is boosted', () => {
    let s = make(blank({ 0: '.......k', 3: '...p..r.', 6: '...R....', 7: 'K.......' }), { '3,6': ['baguette'] }, opts());
    hurt(s, 6, 3, 2, 2);
    s = play(s, 3, 6, 3, 3);
    s = wait(s);
    s = play(s, 3, 3, 6, 3);
    expect(at(s, 6, 3)?.side).toBe('enemy');
    expect(at(s, 6, 3)!.hp).toBe(1);
  });

  it('Duet Microphone: both pieces get +1 range and +1 damage until their next turn ends', () => {
    let s = make(blank({ 0: '.......k', 6: '...R.N..', 7: 'K.......' }), { '3,6': ['duet_microphone'] }, opts());
    s = act(s, 3, 6, 'duet_microphone', 5, 6);
    for (const [x, y] of [
      [3, 6],
      [5, 6],
    ]) {
      const p = at(s, x, y)!;
      expect(p.statuses.find((st) => st.kind === 'rangeBuff')?.amount).toBe(1);
      expect(p.statuses.find((st) => st.kind === 'damageBuff')?.amount).toBe(1);
    }
    s = wait(s); // enemy turn
    s = wait(s); // the buffs last through the player's next turn...
    s = wait(s);
    expect(at(s, 5, 6)!.statuses.some((st) => st.kind === 'rangeBuff')).toBe(false); // ...and then end
    expect(legalMoves(s).length).toBeGreaterThan(0);
  });
});
