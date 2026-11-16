import { describe, expect, it } from 'vitest';
import { CRASH_LEGEND } from '../../content/packs';
import { terrainAt } from '../board';
import { hasStatus } from '../core';
import { applyMove, legalMoves } from '../moves';
import { canTake } from '../upgrades/eligibility';
import { GameState } from '../types';
import { act, at, covers, dests, hasAction, make, movesAt, play, shields, wait } from './upgradeHelpers';

const blank = (rows: Record<number, string>) => Array.from({ length: 8 }, (_, y) => rows[y] ?? '........');
const setHp = (s: GameState, x: number, y: number, hp: number, maxHp = hp) => {
  const p = at(s, x, y)!;
  p.maxHp = maxHp;
  p.hp = hp;
};

describe('Crash Pack upgrades: classic power-ups', () => {
  it('Aku Aku Mask and Golden Aku Aku start the battle with one and two points of shielding', () => {
    covers('aku_aku_mask', 'golden_aku_aku');
    const s = make(blank({ 0: '.......k', 6: '..N.B...', 7: 'K.......' }), { '2,6': ['aku_aku_mask'], '4,6': ['golden_aku_aku'] });
    expect(shields(at(s, 2, 6))).toBe(1);
    expect(shields(at(s, 4, 6))).toBe(2);
  });

  it('Wumpa Fruit heals 1 every third capture', () => {
    covers('wumpa_fruit');
    let s = make(blank({ 0: '.......k', 3: 'p.......', 4: 'p.......', 5: 'p.......', 7: 'R.....K.' }), { '0,7': ['wumpa_fruit'] });
    setHp(s, 0, 7, 1, 2);
    for (const y of [5, 4, 3]) {
      s = play(s, 0, y + 2 === 7 ? 7 : y + 1, 0, y);
      s = wait(s);
    }
    expect(at(s, 0, 3)?.hp).toBe(2);
  });

  it('Super Belly Flop jumps two squares and hurts every enemy next to the landing', () => {
    covers('super_belly_flop');
    let s = make(blank({ 0: '.......k', 3: '..r.r...', 6: '...N....', 7: 'K.......' }), { '3,6': ['super_belly_flop'] });
    setHp(s, 2, 3, 2);
    setHp(s, 4, 3, 2);
    s = act(s, 3, 6, 'super_belly_flop', 3, 4);
    expect(at(s, 3, 4)?.type).toBe('knight');
    expect(at(s, 2, 3)?.hp).toBe(1);
    expect(at(s, 4, 3)?.hp).toBe(1);
  });

  it('Death Tornado Spin: after a capture, another move of up to 2 that may capture', () => {
    covers('death_tornado_spin');
    let s = make(blank({ 0: '.......k', 3: '...p.p..', 6: '...R....', 7: 'K.......' }), { '3,6': ['death_tornado_spin'] });
    s = play(s, 3, 6, 3, 3);
    expect(s.bonus[0]?.source).toBe('death_tornado');
    s = play(s, 3, 3, 5, 3);
    expect(at(s, 5, 3)?.type).toBe('rook');
    expect(s.turn).toBe('enemy');
  });

  it('Double Jump: a second non-capturing move after a quiet one', () => {
    covers('double_jump');
    let s = make(blank({ 0: '.......k', 6: '...N....', 7: 'K.......' }), { '3,6': ['double_jump'] });
    s = play(s, 3, 6, 4, 4);
    expect(s.bonus[0]?.source).toBe('double_jump');
    s = play(s, 4, 4, 5, 2);
    expect(s.turn).toBe('enemy');
  });

  it('Fruit Bazooka hits the first enemy within 5 in an orthogonal line', () => {
    covers('fruit_bazooka');
    let s = make(blank({ 0: '.......k', 1: '...r....', 6: '...N....', 7: 'K.......' }), { '3,6': ['fruit_bazooka'] });
    setHp(s, 3, 1, 2);
    s = act(s, 3, 6, 'fruit_bazooka', 3, 1);
    expect(at(s, 3, 1)?.hp).toBe(1);
  });

  it('Crash Dash slides one square further', () => {
    covers('crash_dash');
    const g = make(blank({ 0: '.......k', 6: '...G....', 7: 'K.......' }), { '3,6': ['crash_dash'] });
    expect(dests(movesAt(g, 3, 6))).toContain('3,4');
  });
});

describe('Crash Pack upgrades: crates', () => {
  it('Wooden and Iron Crates build a cracked wall and a wall', () => {
    covers('wooden_crate', 'iron_crate');
    let s = make(blank({ 0: '.......k', 6: '...N.B..', 7: 'K.......' }), { '3,6': ['wooden_crate'], '5,6': ['iron_crate'] });
    s = act(s, 3, 6, 'wooden_crate', 3, 5);
    expect(terrainAt(s.board, { x: 3, y: 5 })).toBe('cracked');
    s = wait(s);
    s = act(s, 5, 6, 'iron_crate', 5, 5);
    expect(terrainAt(s.board, { x: 5, y: 5 })).toBe('wall');
  });

  it('TNT Crate blocks the way, then explodes after 2 turns', () => {
    covers('tnt_crate');
    let s = make(blank({ 0: '.......k', 4: '....r...', 6: '...N....', 7: 'K.......' }), { '3,6': ['tnt_crate'] });
    s = act(s, 3, 6, 'tnt_crate', 4, 5);
    expect(terrainAt(s.board, { x: 4, y: 5 })).toBe('cracked');
    for (let i = 0; i < 4 && s.tiles.some((t) => t.kind === 'tntCrate'); i++) s = wait(s);
    expect(s.tiles.some((t) => t.kind === 'tntCrate')).toBe(false);
    expect(terrainAt(s.board, { x: 4, y: 5 })).toBe('normal');
    expect(s.pieces.some((p) => p.type === 'rook' && p.side === 'enemy' && p.pos.y === 4)).toBe(false);
  });

  it('Nitro Crate explodes when a piece moves next to it', () => {
    covers('nitro_crate');
    let s = make(blank({ 0: '.......k', 2: '....r...', 6: '...N....', 7: 'K.......' }), { '3,6': ['nitro_crate'] });
    s = act(s, 3, 6, 'nitro_crate', 4, 5);
    s = play(s, 4, 2, 4, 4);
    expect(s.tiles.some((t) => t.kind === 'nitroCrate')).toBe(false);
    expect(s.pieces.some((p) => p.type === 'rook')).toBe(false);
  });

  it('Bounce Crate: a three-square orthogonal jump over anything, every 3 turns', () => {
    covers('bounce_crate');
    const terrain = blank({ 5: '...#....' });
    let s = make(blank({ 0: '.......k', 6: '...B....', 7: 'K.......' }), { '3,6': ['bounce_crate'] }, { terrain });
    const jump = movesAt(s, 3, 6).find((m) => m.uses?.includes('bounce_crate') && m.to.x === 3 && m.to.y === 3);
    expect(jump).toBeDefined();
    s = applyMove(s, jump!);
    expect(at(s, 3, 3)?.counters.bounce_crateCd).toBeGreaterThan(0);
  });

  it('Checkpoint Crate: once, a captured piece goes back to its start with 1 HP', () => {
    covers('checkpoint_crate');
    let s = make(blank({ 0: '.......k', 2: '...r....', 6: '...N....', 7: 'K.......' }), { '3,6': ['checkpoint_crate'] });
    s = play(s, 3, 6, 4, 4);
    s = play(s, 3, 2, 3, 4, () => true);
    s = wait(s);
    s = play(s, 3, 4, 4, 4);
    expect(s.pieces.find((p) => p.type === 'knight')?.pos).toEqual({ x: 3, y: 6 });
  });

  it('Arrow Crate: after sliding 2+ in a line, one more square', () => {
    covers('arrow_crate');
    let s = make(blank({ 0: '.......k', 6: '...R....', 7: 'K.......' }), { '3,6': ['arrow_crate'] });
    s = play(s, 3, 6, 3, 4);
    expect(s.bonus[0]).toMatchObject({ source: 'arrow_crate', to: { x: 3, y: 3 } });
  });
});

describe('Crash Pack upgrades: Quantum Masks', () => {
  it('Lani-Loli: a slide through walls and pieces, ending on an empty square', () => {
    covers('lani_loli');
    const terrain = blank({ 5: '...#....' });
    const s = make(blank({ 0: '.......k', 6: '...Գ....', 7: 'K.......' }), { '3,6': ['lani_loli'] }, { terrain, legend: CRASH_LEGEND });
    expect(movesAt(s, 3, 6).some((m) => m.uses?.includes('lani_loli') && m.to.y === 4 && m.to.x === 3)).toBe(true);
  });

  it('Akano charges up to 4, smashing cracked walls, and hits for 2', () => {
    covers('akano');
    const terrain = blank({ 5: '...+....' });
    let s = make(blank({ 0: '.......k', 3: '...r....', 6: '...N....', 7: 'K.......' }), { '3,6': ['akano'] }, { terrain });
    setHp(s, 3, 3, 2);
    const charge = movesAt(s, 3, 6).find((m) => m.uses?.includes('akano') && m.to.x === 3 && m.to.y === 3)!;
    s = applyMove(s, charge);
    expect(terrainAt(s.board, { x: 3, y: 5 })).toBe('normal');
    expect(at(s, 3, 3)?.type).toBe('knight');
  });

  it("Kupuna-Wa: an enemy within 3 can't act next turn", () => {
    covers('kupuna_wa');
    let s = make(blank({ 0: '.......k', 3: '...r....', 6: '...N....', 7: 'K.......' }), { '3,6': ['kupuna_wa'] });
    s = act(s, 3, 6, 'kupuna_wa', 3, 3);
    expect(hasStatus(at(s, 3, 3)!, 'stunned')).toBe(true);
  });

  it('Ika-Ika moves an adjacent enemy one square', () => {
    covers('ika_ika');
    let s = make(blank({ 0: '.......k', 5: '...p....', 6: '...N....', 7: 'K.......' }), { '3,6': ['ika_ika'] });
    s = act(s, 3, 6, 'ika_ika', 2, 4);
    expect(at(s, 2, 4)?.type).toBe('pawn');
  });
});

describe('Crash Pack upgrades: villain tech', () => {
  it('Cortex Ray Gun shoots diagonally; N. Gin’s Rockets fly over pieces', () => {
    covers('cortex_ray_gun', 'n_gins_rockets');
    let s = make(blank({ 0: '.......k', 3: '......r.', 4: '...P....', 5: '...p....', 6: '...N....', 7: 'K.......' }), {
      '3,6': ['cortex_ray_gun', 'n_gins_rockets'],
    });
    setHp(s, 6, 3, 2);
    s = act(s, 3, 6, 'cortex_ray_gun', 6, 3);
    expect(at(s, 6, 3)?.hp).toBe(1);
    s = wait(s);
    expect(hasAction(s, 3, 6, 'n_gins_rockets')).toBe(true);
  });

  it('Vacuum Cannon pulls; Grappling Hook swings to a wall', () => {
    covers('vacuum_cannon', 'grappling_hook');
    const terrain = blank({ 2: '......#.' });
    let s = make(blank({ 0: '.......k', 3: '...p....', 6: '...N....', 7: 'K.......' }), { '3,6': ['vacuum_cannon', 'grappling_hook'] }, { terrain });
    s = act(s, 3, 6, 'vacuum_cannon', 3, 4);
    expect(at(s, 3, 4)?.type).toBe('pawn');
    s = wait(s);
    s = act(s, 3, 6, 'grappling_hook', 5, 3);
    expect(at(s, 5, 3)?.type).toBe('knight');
  });

  it('Mutagen Potion: max HP 3 for 3 turns, then back', () => {
    covers('mutagen_potion');
    let s = make(blank({ 0: '.......k', 6: '...N....', 7: 'K.......' }), { '3,6': ['mutagen_potion'] });
    s = act(s, 3, 6, 'mutagen_potion', 3, 6);
    expect(at(s, 3, 6)?.maxHp).toBe(3);
    expect(at(s, 3, 6)?.hp).toBe(3);
    for (let i = 0; i < 6; i++) s = wait(s);
    expect(at(s, 3, 6)?.maxHp).toBe(1);
    expect(at(s, 3, 6)?.hp).toBe(1);
  });

  it('Time Relic: take back the move just made', () => {
    covers('time_relic');
    let s = make(blank({ 0: '.......k', 6: '...N....', 7: 'K.......' }), { '3,6': ['time_relic'] });
    s = play(s, 3, 6, 4, 4);
    expect(s.bonus[0]?.source).toBe('time_relic');
    s = act(s, 4, 4, 'time_relic');
    expect(at(s, 3, 6)?.type).toBe('knight');
    expect(s.turn).toBe('player');
    s = play(s, 3, 6, 2, 4);
    expect(s.turn).toBe('enemy'); // spent: no second chance
  });
});

describe('Crash Pack upgrades: racing & special', () => {
  it('Turbo Boost doubles one slide', () => {
    covers('turbo_boost');
    const s = make(blank({ 0: '.......k', 7: 'K..Գ....' }), { '3,7': ['turbo_boost'] }, { legend: CRASH_LEGEND });
    expect(movesAt(s, 3, 7).some((m) => m.uses?.includes('turbo_boost') && m.to.y === 3)).toBe(true);
  });

  it('Bowling Bomb rolls to the first piece and blasts everything around it', () => {
    covers('bowling_bomb');
    let s = make(blank({ 0: '.......k', 3: '..ppp...', 6: '...N....', 7: 'K.......' }), { '3,6': ['bowling_bomb'] });
    s = act(s, 3, 6, 'bowling_bomb', 3, 3);
    expect(s.pieces.filter((p) => p.type === 'pawn')).toHaveLength(0);
  });

  it('Warp Orb hits the farthest enemy', () => {
    covers('warp_orb');
    let s = make(blank({ 0: 'r......k', 5: '...p....', 6: '...N....', 7: 'K.......' }), { '3,6': ['warp_orb'] });
    s = act(s, 3, 6, 'warp_orb', 0, 0);
    expect(at(s, 0, 0)).toBeUndefined();
  });

  it('Clear Gem and Power Crystal raise max HP (up to 3); the Crystal adds range, damage and a Surge', () => {
    covers('clear_gem', 'power_crystal');
    let s = make(blank({ 0: '.......k', 3: '...r.p..', 6: '...G....', 7: 'K.......' }), { '3,6': ['power_crystal'], '0,7': [] });
    expect(at(s, 3, 6)?.maxHp).toBe(3);
    const g = make(blank({ 0: '.......k', 6: '...N....', 7: 'K.......' }), { '3,6': ['clear_gem'] });
    expect(at(g, 3, 6)?.maxHp).toBe(2);
    setHp(s, 3, 3, 2);
    s = play(s, 3, 6, 3, 3);
    expect(at(s, 3, 3)?.type).toBe('guardian');
    expect(s.bonus[0]?.source).toBe('crystal_surge');
    expect(canTake('power_crystal', 'king', [])).toBe(false);
  });
});
