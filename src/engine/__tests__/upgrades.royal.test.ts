import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { applyMove, legalMoves } from '../moves';
import { UPGRADES } from '../upgrades/catalog';
import { canTake } from '../upgrades/eligibility';
import { GameState } from '../types';
import { act, at, covers, dests, hasAction, make, movesAt, play, shields, wait } from './upgradeHelpers';

const B = (rows: Record<number, string>) =>
  Array.from({ length: 8 }, (_, y) => rows[y] ?? (y === 0 ? '.......k' : y === 7 ? 'K.......' : '........'));
const T = (rows: Record<number, string>) => Array.from({ length: 8 }, (_, y) => rows[y] ?? '........');
const enemyAlive = (s: GameState, type: string) => s.pieces.some((p) => p.type === type && p.side === 'enemy');

describe('King & royal upgrades', () => {
  it("Royal Guard and Crown's Reach protect the King", () => {
    covers('royal_guard', 'crowns_reach');
    const s = play(make(B({ 0: '........', 4: '...kb...', 6: '...R....' }), { '4,4': ['royal_guard'] }), 3, 6, 3, 4);
    expect(enemyAlive(s, 'king')).toBe(true);
    expect(enemyAlive(s, 'bishop')).toBe(false);
    const far = play(make(B({ 0: '........', 4: '...k.b..', 6: '...R....' }), { '5,4': ['royal_guard', 'crowns_reach'] }), 3, 6, 3, 4);
    expect(enemyAlive(far, 'king')).toBe(true);
  });

  it('Royal Sacrifice takes a fatal blow for the King', () => {
    covers('royal_sacrifice');
    const s = play(make(B({ 0: '.......b', 4: '...k....', 6: '...R....' }), { '7,0': ['royal_sacrifice'] }), 3, 6, 3, 4);
    expect(enemyAlive(s, 'king')).toBe(true);
  });

  it("Royal Escort moves the King alongside; King's Shield starts it shielded", () => {
    covers('royal_escort', 'kings_shield');
    let s = make(B({ 7: '...KR...' }), { '4,7': ['royal_escort', 'kings_shield'] });
    expect(shields(at(s, 3, 7))).toBe(1);
    const m = movesAt(s, 4, 7).find((m) => m.escort && m.to.y === 6 && m.to.x === 4)!;
    s = applyMove(s, m);
    expect(at(s, 3, 6)?.type).toBe('king');
  });

  it('Royal Rally and Royal Inspiration add range', () => {
    covers('royal_rally', 'royal_inspiration');
    const r = make(B({ 6: '.G......', 4: '.....B..' }), { '5,4': ['royal_rally'] });
    expect(dests(movesAt(r, 1, 6))).toContain('1,4');
    let i = make(B({ 4: '.....G..' }), { '5,4': ['royal_inspiration'] });
    i = play(i, 0, 7, 0, 6);
    expect(i.pieces.find((p) => p.type === 'guardian')?.statuses.some((st) => st.kind === 'rangeBuff')).toBe(true);
  });

  it('Royal Retreat, Royal Swap and Royal Authority move the King', () => {
    covers('royal_retreat', 'royal_swap', 'royal_authority');
    const retreat = act(make(B({ 7: '........', 3: '...K....', 4: '.B......' }), { '1,4': ['royal_retreat'] }), 1, 4, 'royal_retreat');
    expect(retreat.pieces.find((p) => p.type === 'king' && p.side === 'player')!.pos.y).toBeGreaterThanOrEqual(6);
    const swap = act(make(B({ 4: '...B....' }), { '3,4': ['royal_swap'] }), 3, 4, 'royal_swap');
    expect(at(swap, 3, 4)?.type).toBe('king');
    let auth = act(make(B({ 4: '...B....' }), { '3,4': ['royal_authority'] }), 3, 4, 'royal_authority');
    expect(auth.turn).toBe('player');
    expect(auth.bonus[0].pieceId).toBe(auth.pieces.find((p) => p.type === 'king' && p.side === 'player')!.id);
    auth = play(auth, 0, 7, 0, 6);
    expect(auth.turn).toBe('player');
    auth = play(auth, 3, 4, 5, 2);
    expect(auth.turn).toBe('enemy');
  });

  it("Crown Defender and King's Blessing reward standing by the King", () => {
    covers('crown_defender', 'kings_blessing');
    let s = make(B({ 6: '.G......' }), { '1,6': ['crown_defender', 'kings_blessing'] });
    s = { ...s, pieces: s.pieces.map((p) => (p.type === 'guardian' ? { ...p, hp: 1 } : p)) };
    s = play(s, 0, 7, 1, 7);
    expect(shields(at(s, 1, 6))).toBe(1);
    expect(at(s, 1, 6)?.hp).toBe(2);
  });

  it('Royal Formation adds damage between the King and the target', () => {
    covers('royal_formation');
    const s = play(make(B({ 7: '...K....', 5: '...R....', 2: '...g....' }), { '3,5': ['royal_formation'] }), 3, 5, 3, 2);
    expect(enemyAlive(s, 'guardian')).toBe(false);
  });

  it('Royal Command grants an adjacent ally an extra move', () => {
    covers('royal_command');
    let s = act(make(B({ 4: '...BR...' }), { '3,4': ['royal_command'] }), 3, 4, 'royal_command', 4, 4);
    expect(s.bonus[0].pieceId).toBe(at(s, 4, 4)!.id);
    s = play(s, 4, 4, 4, 1);
    expect(s.turn).toBe('player');
    expect(hasAction(s, 3, 4, 'royal_command')).toBe(false);
  });

  it('Throne Guardian shields up when the King is threatened', () => {
    covers('throne_guardian');
    let s = make(B({ 2: 'r.......', 5: '.....B..' }), { '5,5': ['throne_guardian'] });
    s = play(s, 5, 5, 6, 4);
    s = wait(s);
    expect(shields(at(s, 6, 4))).toBe(2);
  });

  it("Royal Sanctuary and King's Path", () => {
    covers('royal_sanctuary', 'kings_path');
    const z = act(make(B({ 4: '...B....' }), { '3,4': ['royal_sanctuary'] }), 3, 4, 'royal_sanctuary');
    expect(z.zones).toHaveLength(1);
    const p = act(make(B({ 4: '...B....' }), { '3,4': ['kings_path'] }, { terrain: T({ 6: '_.......' }) }), 3, 4, 'kings_path', 0, 6);
    expect(p.board.terrain[6][0]).toBe('normal');
  });

  it('Royal Vengeance and Last Royal Stand', () => {
    covers('royal_vengeance', 'last_royal_stand');
    let s = make(B({ 6: 'P.......', 4: '...B....', 2: 'r.......' }), { '3,4': ['royal_vengeance', 'last_royal_stand'] });
    s = play(s, 3, 4, 4, 3);
    s = play(s, 0, 2, 0, 6);
    const b = at(s, 4, 3)!;
    expect(b.statuses.find((st) => st.kind === 'damageBuff')?.amount).toBe(3);
    expect(shields(b)).toBe(1);
  });

  it('Royal Resilience and Royal Resurrection save a King once per run', () => {
    covers('royal_resilience', 'royal_resurrection');
    const r = play(make(B({ 0: '........', 4: '...k....', 6: '...R....' }), { '3,4': ['royal_resilience'] }), 3, 6, 3, 4);
    expect(enemyAlive(r, 'king')).toBe(true);
    expect(r.runFlags).toContain('royal_resilience');
    const spent = play(
      make(B({ 0: '........', 4: '...k....', 6: '...R....' }), { '3,4': ['royal_resilience'] }, { runFlags: ['royal_resilience'] }),
      3,
      6,
      3,
      4,
    );
    expect(enemyAlive(spent, 'king')).toBe(false);
    const res = play(make(B({ 0: '........', 4: '...k....', 6: '...R....' }), { '3,4': ['royal_resurrection'] }), 3, 6, 3, 4);
    expect(enemyAlive(res, 'king')).toBe(true);
  });
});

describe('Legendary upgrades', () => {
  it('Time Reversal undoes your last turn', () => {
    covers('time_reversal');
    let s = make(B({ 4: '...R....', 2: '...p....' }), { '3,4': ['time_reversal'] });
    s = play(s, 3, 4, 3, 2);
    s = wait(s);
    expect(s.pieces.some((p) => p.type === 'pawn')).toBe(false);
    s = act(s, 3, 2, 'time_reversal');
    expect(at(s, 3, 4)?.type).toBe('rook');
    expect(s.pieces.some((p) => p.type === 'pawn')).toBe(true);
    expect(at(s, 3, 4)?.used).toContain('time_reversal');
    expect(s.turn).toBe('player');
  });

  it('Temporal Echo repeats the last move for free', () => {
    covers('temporal_echo');
    let s = make(B({ 6: '...R....' }), { '3,6': ['temporal_echo'] });
    s = wait(play(s, 3, 6, 3, 5));
    s = act(s, 3, 5, 'temporal_echo', 3, 4);
    expect(at(s, 3, 4)?.type).toBe('rook');
    expect(s.turn).toBe('player');
  });

  it('Dimensional Shift and Board Rewrite', () => {
    covers('dimensional_shift', 'board_rewrite');
    const d = act(make(B({ 4: '...R....' }), { '3,4': ['dimensional_shift'] }), 3, 4, 'dimensional_shift', 6, 1);
    expect(at(d, 6, 1)?.type).toBe('rook');
    let b = act(make(B({ 4: '...R....' }), { '3,4': ['board_rewrite'] }), 3, 4, 'board_rewrite', 3, 3);
    expect(b.board.terrain[3][3]).toBe('gap');
    for (let i = 0; i < 2; i++) b = act(wait(b), 3, 4, 'board_rewrite', 5, 4);
    expect(hasAction(wait(b), 3, 4, 'board_rewrite')).toBe(false);
  });

  it('Absolute Capture removes a shielded heavy piece outright', () => {
    covers('absolute_capture');
    const s = play(make(B({ 2: '...j....', 6: '...R....' }), { '3,6': ['absolute_capture'], '3,2': ['heavy_armor'] }), 3, 6, 3, 3);
    expect(enemyAlive(s, 'juggernaut')).toBe(false);
  });

  it('Second Life marks a fallen piece to be saved', () => {
    covers('second_life');
    const s = play(make(B({ 4: '...p....', 6: '...R....' }), { '3,4': ['second_life'] }), 3, 6, 3, 4);
    expect(s.saved).toHaveLength(1);
  });

  it('Reality Anchor blocks terrain changes nearby', () => {
    covers('reality_anchor');
    const s = act(make(B({ 4: '...R....', 2: '...b....' }), { '3,4': ['gap_conversion'], '3,2': ['reality_anchor'] }), 3, 4, 'gap_conversion', 3, 3);
    expect(s.board.terrain[3][3]).toBe('normal');
  });

  it("King's Decree, Unbreakable Formation and Mass Promotion", () => {
    covers('kings_decree', 'unbreakable_formation', 'mass_promotion');
    const d = act(make(B({ 4: '...RB...' }), { '3,4': ['kings_decree'] }), 3, 4, 'kings_decree');
    expect(d.pieces.filter((p) => p.side === 'player').every((p) => shields(p) === 1)).toBe(true);
    const u = act(make(B({ 4: '...RB...' }), { '3,4': ['unbreakable_formation'] }), 3, 4, 'unbreakable_formation');
    expect(at(u, 4, 4)?.statuses.some((st) => st.kind === 'immune')).toBe(true);
    const m = act(make(B({ 4: '...R....', 5: 'PPPP....' }), { '3,4': ['mass_promotion'] }), 3, 4, 'mass_promotion');
    expect(m.pieces.filter((p) => p.type === 'knight')).toHaveLength(3);
  });

  it('Infinite Momentum keeps capturing', () => {
    covers('infinite_momentum');
    let s = make(B({ 4: '...p.p.p', 6: '...R....' }), { '3,6': ['infinite_momentum'] });
    s = play(s, 3, 6, 3, 4);
    s = play(s, 3, 4, 5, 4);
    s = play(s, 5, 4, 7, 4);
    expect(s.pieces.some((p) => p.type === 'pawn')).toBe(false);
  });

  it('Chrono Lock and Checkmate Gambit stop enemy actions', () => {
    covers('chrono_lock', 'checkmate_gambit');
    const c = act(make(B({ 4: '...B....', 2: '...r....' }), { '3,4': ['chrono_lock'] }), 3, 4, 'chrono_lock', 3, 2);
    expect(legalMoves(c).some((m) => m.pieceId === at(c, 3, 2)!.id)).toBe(false);
    let g = act(make(B({ 4: '...B....', 2: '...r....' }), { '3,4': ['checkmate_gambit'] }), 3, 4, 'checkmate_gambit', 3, 2);
    expect(g.turn).toBe('player');
    g = play(g, 3, 4, 5, 2);
    expect(g.turn).toBe('player');
  });

  it('Army Recall, Total Demolition and Fate Exchange', () => {
    covers('army_recall', 'total_demolition', 'fate_exchange');
    const a = act(make(B({ 2: '..G.G...', 4: '...B....' }), { '3,4': ['army_recall'] }), 3, 4, 'army_recall');
    expect(a.pieces.filter((p) => p.side === 'player' && p.pos.y >= 6).length).toBeGreaterThanOrEqual(3);
    const t = act(make(B({ 4: '...R....' }), { '3,4': ['total_demolition'] }, { terrain: T({ 1: '+.+.+...', 2: '.....+..' }) }), 3, 4, 'total_demolition');
    expect(t.board.terrain.flat().includes('cracked')).toBe(false);
    let f = make(B({ 4: '...Bj...' }), { '3,4': ['fate_exchange'] });
    f = act(f, 3, 4, 'fate_exchange', 4, 4);
    expect(f.pieces.find((p) => p.type === 'juggernaut')?.hp).toBe(1);
  });

  it('Final Gambit sacrifices the piece to blast its neighbours', () => {
    covers('final_gambit');
    const s = act(make(B({ 4: '...Bj...' }), { '3,4': ['final_gambit'] }), 3, 4, 'final_gambit');
    expect(s.pieces.some((p) => p.type === 'bishop')).toBe(false);
    expect(s.pieces.some((p) => p.type === 'juggernaut')).toBe(false);
    expect(s.captured.some((p) => p.type === 'bishop' && p.side === 'player')).toBe(true);
  });
});

describe('upgrade catalog', () => {
  it('has all 240 base upgrades plus 33 Zelda, 30 Sonic and 3 Digital Duo and 30 Crash upgrades, with unique numbers and ids', () => {
    expect(UPGRADES.filter((u) => !u.pack)).toHaveLength(240);
    expect(UPGRADES.filter((u) => u.pack === 'zelda')).toHaveLength(33);
    expect(UPGRADES.filter((u) => u.pack === 'sonic')).toHaveLength(30);
    expect(UPGRADES.filter((u) => u.pack === 'duo').map((u) => u.id)).toEqual(['leek', 'baguette', 'duet_microphone']);
    const crash = UPGRADES.filter((u) => u.pack === 'crash');
    expect(crash).toHaveLength(30);
    const mario = UPGRADES.filter((u) => u.pack === 'mario');
    expect(['common', 'uncommon', 'rare', 'legendary', 'mythical'].map((r) => mario.filter((u) => u.rarity === r).length)).toEqual([5, 9, 9, 5, 2]);
    const metroid = UPGRADES.filter((u) => u.pack === 'metroid');
    expect(['common', 'uncommon', 'rare', 'legendary', 'mythical'].map((r) => metroid.filter((u) => u.rarity === r).length)).toEqual([2, 5, 4, 3, 1]);
    const ben = UPGRADES.filter((u) => u.pack === 'ben10');
    expect(['common', 'uncommon', 'rare', 'legendary', 'mythical'].map((r) => ben.filter((u) => u.rarity === r).length)).toEqual([4, 9, 10, 5, 2]);
    expect(['common', 'uncommon', 'rare', 'legendary', 'mythical'].map((r) => crash.filter((u) => u.rarity === r).length)).toEqual([6, 9, 9, 5, 1]);
    expect(UPGRADES.filter((u) => u.rarity === 'mythical').map((u) => u.id).sort()).toEqual(['chaos_emeralds', 'dna_fusion', 'master_control', 'mega_mushroom', 'metroid_suit', 'power_crystal', 'triforce_courage', 'triforce_power', 'triforce_wisdom', 'wonder_flower']);
    expect(new Set(UPGRADES.map((u) => u.num)).size).toBe(411);
    expect(new Set(UPGRADES.map((u) => u.id)).size).toBe(411);
    expect(UPGRADES.filter((u) => u.excluded).map((u) => u.id).sort()).toEqual(
      ['anchor_feet', 'board_dominion', 'free_rotation', 'gap_sense', 'terrain_adaptation', 'wall_breaker'].sort(),
    );
  });

  it('every offerable upgrade has at least one test', () => {
    const dir = __dirname;
    const runDir = join(dir, '../../run/__tests__');
    const sources = [
      ...readdirSync(dir).map((f) => readFileSync(join(dir, f), 'utf8')),
      ...readdirSync(runDir).map((f) => readFileSync(join(runDir, f), 'utf8')),
    ].join('\n');
    const tested = new Set([...sources.matchAll(/covers\(([^)]*)\)/g)].flatMap((m) => [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1])));
    const missing = UPGRADES.filter((u) => !u.excluded && !tested.has(u.id)).map((u) => u.id);
    expect(missing).toEqual([]);
  });

  it('every offerable upgrade fits at least one piece type', () => {
    const types = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king', 'juggernaut', 'archer', 'guardian', 'lancer', 'siege', 'mage', 'switcher', 'chancellor', 'medic'] as const;
    // Some upgrades need a prerequisite upgrade; give every piece the usual prerequisites.
    const prereq = ['bind', 'decoy', 'pawn_summon', 'royal_guard', 'bridge_builder', 'demolition', 'field_medic'];
    const homeless = UPGRADES.filter((u) => !u.excluded).filter(
      (u) => !types.some((t) => canTake(u.id, t, []) || canTake(u.id, t, prereq.filter((p) => p !== u.id).slice(0, 1)) || prereq.some((p) => p !== u.id && canTake(u.id, t, [p]))),
    );
    expect(homeless.map((u) => u.id)).toEqual([]);
  });
});
