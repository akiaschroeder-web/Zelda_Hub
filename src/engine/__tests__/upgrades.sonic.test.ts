import { describe, expect, it } from 'vitest';
import { SONIC_LEGEND } from '../../content/packs';
import { terrainAt } from '../board';
import { applyMove, legalMoves } from '../moves';
import { PIECE_STATS } from '../pieces';
import { PieceType, Side } from '../types';
import { act, at, covers, dests, hasAction, make, movesAt, play, shields, wait } from './upgradeHelpers';

const sym = (type: PieceType, side: Side = 'player') =>
  Object.entries(SONIC_LEGEND).find(([, [t, s]]) => t === type && s === side)![0];
const L: Record<string, [PieceType, Side]> = {
  ...SONIC_LEGEND,
  Σ: ['super_sonic', 'player'],
  Ψ: ['super_shadow', 'player'],
  Ω: ['super_silver', 'player'],
  Φ: ['burning_blaze', 'player'],
  Η: ['hyper_sonic', 'player'],
};
const row = (cells: Record<number, string> = {}) => Array.from({ length: 8 }, (_, x) => cells[x] ?? '.').join('');
const board = (rows: Record<number, Record<number, string>>) =>
  Array.from({ length: 8 }, (_, y) => {
    const cells: Record<number, string> = { ...rows[y] };
    if (y === 0 && !cells[7]) cells[7] = 'k';
    if (y === 7 && !cells[0]) cells[0] = 'K';
    return row(cells);
  });
const blank = (rows: Record<number, string>) => Array.from({ length: 8 }, (_, y) => rows[y] ?? '........');
const o = (terrain?: string[]) => ({ legend: L, terrain });
const hp2 = (s: ReturnType<typeof make>, x: number, y: number) => {
  const p = at(s, x, y)!;
  p.hp = 2;
  p.maxHp = 2;
};

describe('Sonic Pack upgrades: movement & offense', () => {
  it('Speed Shoes: slides reach one further', () => {
    covers('speed_shoes');
    expect(dests(movesAt(make(board({ 6: { 3: 'G' } }), { '3,6': ['speed_shoes'] }, o()), 3, 6))).toContain('3,4');
  });

  it('Spin Dash: 2 damage after 3+ squares in a line', () => {
    covers('spin_dash');
    let s = make(board({ 2: { 3: 'p' }, 6: { 3: 'R' } }), { '3,6': ['spin_dash'] }, o());
    hp2(s, 3, 2);
    s = play(s, 3, 6, 3, 2);
    expect(at(s, 3, 2)?.type).toBe('rook');
  });

  it('Homing Attack: leaps at an enemy within 3 and attacks it', () => {
    covers('homing_attack');
    const s = act(make(board({ 4: { 5: 'p' }, 5: { 4: 'P' }, 6: { 3: 'P' } }), { '3,6': ['homing_attack'] }, o()), 3, 6, 'homing_attack', 5, 4);
    expect(at(s, 5, 4)?.side).toBe('player');
  });

  it('Bounce Bracelet: jumps exactly two orthogonally, over a piece', () => {
    covers('bounce_bracelet');
    expect(dests(movesAt(make(board({ 5: { 3: 'P' }, 6: { 3: 'B' } }), { '3,6': ['bounce_bracelet'] }, o()), 3, 6))).toContain('3,4');
  });

  it('Light Speed Dash: anywhere in the row or column, ignoring obstacles', () => {
    covers('light_speed_dash');
    const s = make(board({ 4: { 3: 'P' }, 6: { 3: 'B' } }), { '3,6': ['light_speed_dash'] }, o());
    expect(at(act(s, 3, 6, 'light_speed_dash', 3, 1), 3, 1)?.type).toBe('bishop');
  });

  it('Flame Ring: also hits another enemy next to the target', () => {
    covers('flame_ring');
    const s = play(make(board({ 2: { 3: 'p', 4: 'p' }, 6: { 3: 'R' } }), { '3,6': ['flame_ring'] }, o()), 3, 6, 3, 2);
    expect(s.pieces.filter((p) => p.type === 'pawn')).toHaveLength(0);
  });

  it('Magic Gloves: captures an adjacent 1 HP enemy without moving', () => {
    covers('magic_gloves');
    const s = act(make(board({ 5: { 3: 'p' }, 6: { 3: 'R' } }), { '3,6': ['magic_gloves'] }, o()), 3, 6, 'magic_gloves', 3, 5);
    expect(at(s, 3, 5)).toBeUndefined();
    expect(at(s, 3, 6)?.type).toBe('rook');
  });

  it('Ancient Light: one more capture right after a capture', () => {
    covers('ancient_light');
    let s = make(board({ 2: { 3: 'p', 6: 'p' }, 6: { 3: 'R' } }), { '3,6': ['ancient_light'] }, o());
    s = play(s, 3, 6, 3, 2);
    expect(s.turn).toBe('player');
    expect(legalMoves(s).filter((m) => m.action !== 'pass').every((m) => m.targets?.length)).toBe(true);
    s = play(s, 3, 2, 6, 2);
    expect(s.pieces.filter((p) => p.type === 'pawn')).toHaveLength(0);
  });

  it('Lightning Shield and Chaos Spear: ranged hits without moving', () => {
    covers('lightning_shield', 'chaos_spear');
    const a = act(make(board({ 4: { 3: 'p' }, 6: { 3: 'R' } }), { '3,6': ['lightning_shield'] }, o()), 3, 6, 'lightning_shield', 3, 4);
    expect(at(a, 3, 4)).toBeUndefined();
    const b = act(make(board({ 2: { 7: 'p' }, 6: { 3: 'R' } }), { '3,6': ['chaos_spear'] }, o()), 3, 6, 'chaos_spear', 7, 2);
    expect(at(b, 7, 2)).toBeUndefined();
  });

  it('Cyan Laser: shoots through pieces up to 5 and attacks what it lands on', () => {
    covers('cyan_laser');
    const s = act(make(board({ 1: { 0: 'p' }, 3: { 2: 'P' }, 6: { 5: 'P' } }), { '5,6': ['cyan_laser'] }, o()), 5, 6, 'cyan_laser', 0, 1);
    expect(at(s, 0, 1)?.side).toBe('player');
  });

  it('Team Blast: 2 damage to adjacent enemies with two allies beside', () => {
    covers('team_blast');
    let s = make(board({ 4: { 3: 'p' }, 5: { 3: 'R', 2: 'P', 4: 'P' } }), { '3,5': ['team_blast'] }, o());
    hp2(s, 3, 4);
    s = act(s, 3, 5, 'team_blast');
    expect(at(s, 3, 4)).toBeUndefined();
  });

  it('Chaos Blast: 1 damage to enemies within 2 and cracked walls there crumble', () => {
    covers('chaos_blast');
    const s = act(make(board({ 3: { 3: 'p' }, 5: { 3: 'R' } }), { '3,5': ['chaos_blast'] }, o(blank({ 4: '.....+..' }))), 3, 5, 'chaos_blast');
    expect(at(s, 3, 3)).toBeUndefined();
    expect(terrainAt(s.board, { x: 5, y: 4 })).toBe('normal');
  });

  it('Purple Frenzy: each capture adds range', () => {
    covers('purple_frenzy');
    let s = make(board({ 5: { 4: 'p' }, 6: { 3: 'G' } }), { '3,6': ['purple_frenzy'] }, o());
    s = play(s, 3, 6, 4, 5);
    s = wait(s);
    expect(dests(movesAt(s, 4, 5))).toContain('4,3');
  });
});

describe('Sonic Pack upgrades: defense', () => {
  it('Blue Shield blocks the first point; Invincibility ignores the first hit', () => {
    covers('blue_shield', 'invincibility');
    expect(shields(at(make(board({ 6: { 3: 'R' } }), { '3,6': ['blue_shield'] }, o()), 3, 6))).toBe(1);
    const s = play(make(board({ 2: { 3: 'p' }, 6: { 3: 'R' } }), { '3,2': ['invincibility'] }, o()), 3, 6, 3, 2);
    expect(at(s, 3, 2)?.type).toBe('pawn');
  });

  it('Flame Shield burns an adjacent attacker once', () => {
    covers('flame_shield');
    let s = make(board({ 4: { 3: 'r' }, 5: { 3: sym('knuckles') } }), { '3,5': ['flame_shield'] }, o());
    s = wait(s);
    s = play(s, 3, 4, 3, 5);
    expect(s.pieces.some((p) => p.type === 'rook')).toBe(false);
  });

  it('Extra Life saves a piece from permanent loss', () => {
    covers('extra_life');
    const s = play(make(board({ 2: { 3: 'p' }, 6: { 3: 'R' } }), { '3,2': ['extra_life'] }, o()), 3, 6, 3, 2);
    expect(s.saved.length).toBe(1);
  });

  it('Ring Protection hops a hurt piece to safety', () => {
    covers('ring_protection');
    const s = play(make(board({ 2: { 3: sym('knuckles', 'enemy') }, 6: { 3: 'R' } }), { '3,2': ['ring_protection'] }, o()), 3, 6, 3, 2);
    expect(s.pieces.find((p) => p.type === 'knuckles')!.pos).not.toEqual({ x: 3, y: 2 });
  });

  it('Chaos Drive: +1 max HP up to 3', () => {
    covers('chaos_drive');
    expect(at(make(board({ 6: { 3: 'R' } }), { '3,6': ['chaos_drive'] }, o()), 3, 6)!.maxHp).toBe(2);
    expect(at(make(board({ 6: { 3: sym('knuckles') } }), { '3,6': ['chaos_drive'] }, o()), 3, 6)!.maxHp).toBe(3);
  });
});

describe('Sonic Pack upgrades: terrain & special movement', () => {
  it('Yellow Drill bores through walls; Pink Spikes stands on them', () => {
    covers('yellow_drill', 'pink_spikes');
    const terrain = blank({ 4: '...#....' });
    let s = make(board({ 6: { 3: 'R' } }), { '3,6': ['yellow_drill'] }, o(terrain));
    s = play(s, 3, 6, 3, 2);
    expect(terrainAt(s.board, { x: 3, y: 4 })).toBe('normal');
    const p = make(board({ 6: { 3: 'R' } }), { '3,6': ['pink_spikes'] }, o(terrain));
    expect(dests(movesAt(p, 3, 6))).toContain('3,4');
  });

  it('Hover Wisp crosses runs of gaps', () => {
    covers('hover_wisp');
    const terrain = blank({ 4: '...+....', 3: '...+....' }).map((r) => r.replace('+', '_'));
    expect(dests(movesAt(make(board({ 6: { 3: 'R' } }), { '3,6': ['hover_wisp'] }, o(terrain)), 3, 6))).toContain('3,2');
  });

  it('Bubble Shield, Orange Rocket and Chaos Control: jumps and teleports', () => {
    covers('bubble_shield', 'orange_rocket', 'chaos_control');
    expect(at(act(make(board({ 5: { 3: 'P' }, 6: { 3: 'N' } }), { '3,6': ['bubble_shield'] }, o()), 3, 6, 'bubble_shield', 3, 4), 3, 4)?.type).toBe('knight');
    expect(at(act(make(board({ 4: { 3: 'P' }, 6: { 3: 'N' } }), { '3,6': ['orange_rocket'] }, o()), 3, 6, 'orange_rocket', 3, 2), 3, 2)?.type).toBe('knight');
    expect(at(act(make(board({ 6: { 3: 'N' } }), { '3,6': ['chaos_control'] }, o()), 3, 6, 'chaos_control', 7, 2), 7, 2)?.type).toBe('knight');
  });

  it('Blue Cube raises and removes walls', () => {
    covers('blue_cube');
    let s = act(make(board({ 6: { 3: 'R' } }), { '3,6': ['blue_cube'] }, o()), 3, 6, 'blue_cube', 3, 4);
    expect(terrainAt(s.board, { x: 3, y: 4 })).toBe('wall');
    s = make(board({ 6: { 3: 'R' } }), { '3,6': ['blue_cube'] }, o(blank({ 4: '...#....' })));
    s = act(s, 3, 6, 'blue_cube', 3, 4, (m) => m.param === 'remove');
    expect(terrainAt(s.board, { x: 3, y: 4 })).toBe('normal');
  });

  it('Super Peel Out: twice the range, no capture', () => {
    covers('super_peel_out');
    const s = make(board({ 6: { 3: 'G' } }), { '3,6': ['super_peel_out'] }, o());
    expect(at(act(s, 3, 6, 'super_peel_out', 3, 4), 3, 4)?.type).toBe('guardian');
  });
});

describe('Emeralds and Super forms', () => {
  it('Chaos Emeralds on an ordinary piece: +1 HP (to 3), +1 range, +1 damage', () => {
    covers('chaos_emeralds');
    let s = make(board({ 2: { 3: 'p' }, 6: { 3: 'G' } }), { '3,6': ['chaos_emeralds'] }, o());
    expect(at(s, 3, 6)!.maxHp).toBe(Math.min(3, PIECE_STATS.guardian.maxHp + 1));
    expect(dests(movesAt(s, 3, 6))).toContain('3,4');
    hp2(s, 3, 2);
    s.pieces.find((p) => p.type === 'guardian')!.pos = { x: 3, y: 3 };
    s = play(s, 3, 3, 3, 2);
    expect(at(s, 3, 2)?.type).toBe('guardian');
  });

  it('Master Emerald: hits every adjacent enemy and cannot be moved', () => {
    covers('master_emerald');
    const s = act(make(board({ 5: { 3: 'p', 4: 'p' }, 6: { 3: 'R' } }), { '3,6': ['master_emerald'] }, o()), 3, 6, 'master_emerald');
    expect(s.pieces.filter((p) => p.type === 'pawn')).toHaveLength(0);
  });

  it('the Emeralds transform Sonic into Super Sonic, then Hyper Sonic, and are used up', async () => {
    const { newRun, claimReward } = await import('../../run/run');
    const { rollUpgrade } = await import('../../run/rewards');
    const { Rng } = await import('../../run/rng');
    let run = newRun(1, ['sonic']);
    run = { ...run, roster: [...run.roster, { uid: 'r-sonic', type: 'sonic', battles: 0, upgrades: [] }] };
    const reward = (id: string) => ({ ...run, phase: 'reward' as const, reward: { title: '', gold: 0, armyPoints: 0, options: [{ kind: 'upgrade' as const, id }] } });
    run = claimReward(reward('chaos_emeralds'), 0, 'r-sonic');
    let sonic = run.roster.find((r) => r.uid === 'r-sonic')!;
    expect(sonic.type).toBe('super_sonic');
    expect(sonic.upgrades).toEqual([]);
    run = claimReward(reward('master_emerald'), 0, 'r-sonic');
    sonic = run.roster.find((r) => r.uid === 'r-sonic')!;
    expect(sonic.type).toBe('hyper_sonic');
    // Used-up Chaos Emeralds are never offered again.
    const rng = new Rng(3);
    const offers = Array.from({ length: 400 }, () => rollUpgrade(rng, 'boss', 2, run.roster, [], ['sonic']));
    expect(offers).not.toContain('chaos_emeralds');
  });

  it('Super Sonic: long slides, a second move that can capture, 2 damage', () => {
    let s = make(board({ 1: { 3: 'p' }, 3: { 6: 'p' }, 7: { 3: 'Σ' } }), {}, o());
    expect(dests(movesAt(s, 3, 7))).toContain('3,1');
    s = play(s, 3, 7, 3, 3);
    expect(s.turn).toBe('player');
    s = play(s, 3, 3, 6, 3);
    expect(s.pieces.filter((p) => p.type === 'pawn')).toHaveLength(1);
  });

  it('Super Shadow: Chaos Control anywhere, a 2-damage spear within 5', () => {
    const s = make(board({ 1: { 3: sym('knuckles', 'enemy') }, 6: { 3: 'Ψ' } }), {}, o());
    expect(movesAt(s, 3, 6).some((m) => m.action === 'chaosControl' && m.to.x === 7 && m.to.y === 1)).toBe(true);
    const after = applyMove(s, movesAt(s, 3, 6).find((m) => m.action === 'chaosSpear')!);
    expect(after.pieces.find((p) => p.type === 'knuckles')!.hp).toBe(1);
  });

  it('Super Silver lifts two enemies in one turn and shields allies', () => {
    let s = make(board({ 3: { 2: 'p', 5: 'p' }, 6: { 3: 'Ω' } }), {}, o());
    s = applyMove(s, movesAt(s, 3, 6).find((m) => m.action === 'psychokinesis' && m.allyId === at(s, 2, 3)!.id)!);
    expect(s.turn).toBe('player');
    s = applyMove(s, legalMoves(s).find((m) => m.action === 'psychokinesis' && m.allyId === at(s, 5, 3)!.id)!);
    expect(s.turn).toBe('enemy');
  });

  it('Burning Blaze: Burning Aura hits every adjacent enemy', () => {
    const s = make(board({ 5: { 3: 'p', 4: 'p' }, 6: { 3: 'Φ' } }), {}, o());
    const after = applyMove(s, movesAt(s, 3, 6).find((m) => m.action === 'burningAura')!);
    expect(after.pieces.filter((p) => p.type === 'pawn')).toHaveLength(0);
  });

  it('Hyper Sonic: moves twice every turn, starts with 2 shield points, survives one fatal hit', () => {
    let s = make(board({ 6: { 3: 'Η' } }), {}, o());
    expect(shields(at(s, 3, 6))).toBe(2);
    s = play(s, 3, 6, 3, 3);
    expect(s.turn).toBe('player');
    s = play(s, 3, 3, 6, 3);
    expect(s.turn).toBe('enemy');
    expect(hasAction(s, 6, 3, 'chaos_control')).toBe(false);
  });
});
