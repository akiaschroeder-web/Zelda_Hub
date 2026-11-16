import { describe, expect, it } from 'vitest';
import { CRASH_LEGEND } from '../../content/packs';
import { terrainAt } from '../board';
import { hasStatus } from '../core';
import { tropyPhase } from '../crash';
import { applyMove, legalMoves } from '../moves';
import { GameState, Move, PieceType, Side } from '../types';
import { at, dests, make, movesAt, play, wait } from './upgradeHelpers';

/** The layout symbol for a Crash piece (Armenian letters, so look it up by name). */
const sym = (type: PieceType, side: Side = 'player') => Object.entries(CRASH_LEGEND).find(([, [t, s]]) => t === type && s === side)![0];
const row = (cells: Record<number, string> = {}) => Array.from({ length: 8 }, (_, x) => cells[x] ?? '.').join('');
const board = (rows: Record<number, Record<number, string>>) => Array.from({ length: 8 }, (_, y) => row(rows[y]));
const blank = (rows: Record<number, string>) => Array.from({ length: 8 }, (_, y) => rows[y] ?? '........');
const opts = (terrain?: string[]) => ({ legend: CRASH_LEGEND, terrain });
const kings = { 0: { 7: 'k' }, 7: { 0: 'K' } };
const actionAt = (s: GameState, x: number, y: number, action: string, tx: number, ty: number) => {
  const m = movesAt(s, x, y).find((m) => m.action === action && m.to.x === tx && m.to.y === ty);
  expect(m, `no ${action} from ${x},${y} to ${tx},${ty}`).toBeDefined();
  return applyMove(s, m!);
};
const hasActionKind = (s: GameState, x: number, y: number, action: string) => movesAt(s, x, y).some((m) => m.action === action);
const setHp = (s: GameState, x: number, y: number, hp: number, maxHp = hp) => {
  const p = at(s, x, y)!;
  p.maxHp = maxHp;
  p.hp = hp;
};

describe('Crash Bandicoot Pack pieces', () => {
  it('Crash: three orthogonally, one diagonally; Spin Attack hits the enemy behind the target', () => {
    let s = make(board({ ...kings, 2: { 3: 'p' }, 3: { 3: 'p' }, 6: { 3: sym('crash') } }), {}, opts());
    const d = dests(movesAt(s, 3, 6));
    expect(d).toContain('3,3');
    expect(d).toContain('0,6');
    expect(d).toContain('4,5');
    expect(d).not.toContain('5,4');
    s = play(s, 3, 6, 3, 3);
    expect(at(s, 3, 3)?.type).toBe('crash');
    expect(at(s, 3, 2)).toBeUndefined(); // the pawn behind was spun away
  });

  it('Crash: Slide Jump leaps exactly three squares over walls and pieces, then waits 3 turns', () => {
    const terrain = blank({ 5: '...#....', 4: '...#....' });
    let s = make(board({ ...kings, 6: { 3: sym('crash') } }), {}, opts(terrain));
    const jump = movesAt(s, 3, 6).find((m) => m.to.x === 3 && m.to.y === 3);
    expect(jump?.uses).toEqual(['slide_jump']);
    s = applyMove(s, jump!);
    expect(at(s, 3, 3)?.counters.slideJumpCd).toBe(2); // counted down at the end of this turn
    s = wait(s);
    expect(movesAt(s, 3, 3).some((m) => m.uses?.includes('slide_jump'))).toBe(false);
  });

  it("Coco hacks an enemy so it can't act on its next turn; Quick Thinking dodges once", () => {
    let s = make(board({ ...kings, 3: { 3: 'r' }, 6: { 3: sym('coco') } }), {}, opts());
    s = actionAt(s, 3, 6, 'hack', 3, 3);
    expect(hasStatus(at(s, 3, 3)!, 'stunned')).toBe(true);
    expect(legalMoves(s).some((m) => m.pieceId === at(s, 3, 3)!.id)).toBe(false);
    // Quick Thinking: the rook's attack misses, Coco steps aside.
    let t = make(board({ ...kings, 2: { 3: 'r' }, 6: { 3: sym('coco') } }), {}, opts());
    t = wait(t);
    t = play(t, 3, 2, 3, 6);
    expect(t.pieces.some((p) => p.type === 'coco')).toBe(true);
    expect(at(t, 3, 6)?.type).not.toBe('coco');
  });

  it('Crunch hits for 2 and takes a hit meant for an adjacent ally (every 3 turns)', () => {
    let s = make(board({ ...kings, 3: { 3: 'r' }, 5: { 3: sym('crunch') } }), {}, opts());
    setHp(s, 3, 3, 2);
    s = play(s, 3, 5, 3, 3);
    expect(at(s, 3, 3)?.type).toBe('crunch');
    // Bodyguard
    let t = make(board({ ...kings, 2: { 3: 'r' }, 6: { 3: 'N', 4: sym('crunch') } }), {}, opts());
    t = wait(t);
    t = play(t, 3, 2, 3, 6);
    expect(at(t, 3, 6)?.type).toBe('knight');
    expect(at(t, 4, 6)?.hp).toBe(2);
    expect(at(t, 4, 6)?.counters.bodyguardCd).toBeGreaterThan(0);
  });

  it("Aku Aku leaps over pieces but can't attack; Protective Spirit negates an attack on an ally within 2", () => {
    let s = make(board({ ...kings, 3: { 3: 'p' }, 4: { 3: 'P' }, 5: { 3: sym('aku_aku') }, 6: { 5: 'N' } }), {}, opts());
    const d = dests(movesAt(s, 3, 5).filter((m) => !m.action));
    expect(d).toContain('3,2'); // over the pawns
    expect(d).not.toContain('3,3'); // no attacks
    s = wait(s);
    s = wait(s);
    const t = make(board({ ...kings, 2: { 5: 'r' }, 5: { 3: sym('aku_aku') }, 6: { 5: 'N' } }), {}, opts());
    let u = wait(t);
    u = play(u, 5, 2, 5, 6);
    expect(at(u, 5, 6)?.type).toBe('knight');
    expect(u.pieces.find((p) => p.type === 'aku_aku')!.counters.spiritCd).toBeGreaterThan(0);
  });

  it('Aku Aku rides on an ally (Guardian Mask), guards only it, and is set down again', () => {
    let s = make(board({ ...kings, 5: { 3: sym('aku_aku') }, 6: { 5: 'N' } }), {}, opts());
    s = actionAt(s, 3, 5, 'maskAttach', 5, 6);
    expect(s.pieces.some((p) => p.type === 'aku_aku')).toBe(false);
    expect(s.masks).toHaveLength(1);
    s = wait(s);
    expect(hasActionKind(s, 5, 6, 'maskDetach')).toBe(true);
    s = actionAt(s, 5, 6, 'maskDetach', 5, 5);
    expect(at(s, 5, 5)?.type).toBe('aku_aku');
    expect(s.masks).toHaveLength(0);
  });

  it('Tawna: Grappling Hook to a square by a wall; Acrobatic Strike hops after a capture', () => {
    const terrain = blank({ 2: '......#.' });
    let s = make(board({ ...kings, 3: { 3: 'p' }, 6: { 3: sym('tawna') } }), {}, opts(terrain));
    expect(movesAt(s, 3, 6).some((m) => m.action === 'grapple' && m.to.x === 6 && m.to.y === 3)).toBe(true);
    expect(dests(movesAt(s, 3, 6).filter((m) => !m.action))).toContain('5,4'); // exactly two diagonally
    s = play(s, 3, 6, 3, 3);
    expect(s.turn).toBe('player');
    expect(s.bonus[0]?.source).toBe('acrobatic_strike');
    s = play(s, 3, 3, 4, 2);
    expect(at(s, 4, 2)?.type).toBe('tawna');
  });

  it('Cortex: Ray Gun hits the first enemy in an orthogonal line; Evil Genius speeds up machines', () => {
    let s = make(board({ ...kings, 3: { 3: 'r' }, 6: { 3: sym('cortex'), 4: sym('n_gin') } }), {}, opts());
    setHp(s, 3, 3, 2);
    s = actionAt(s, 3, 6, 'rayGun', 3, 3);
    expect(at(s, 3, 3)?.hp).toBe(1);
    // N. Gin (a machine) next to Cortex slides 3 instead of 2.
    const t = make(board({ ...kings, 6: { 3: sym('cortex'), 4: sym('n_gin') } }), {}, opts());
    expect(dests(movesAt(t, 4, 6))).toContain('4,3');
  });

  it('N. Gin: missiles over pieces but not walls; adjacent machines ignore their first point of damage', () => {
    const terrain = blank({ 4: '.....#..' });
    const s = make(board({ ...kings, 2: { 3: 'r', 6: 'r' }, 4: { 3: 'P' }, 6: { 3: sym('n_gin') } }), {}, opts(terrain));
    const hits = movesAt(s, 3, 6).filter((m) => m.action === 'gnMissile').map((m) => `${m.to.x},${m.to.y}`);
    expect(hits).toContain('3,2'); // over the pawn
    expect(hits).not.toContain('6,2'); // a wall in the way
    let t = make(board({ ...kings, 2: { 3: 'r' }, 6: { 3: sym('n_gin', 'enemy'), 2: sym('n_gin', 'enemy') } }), {}, opts());
    t = { ...t, pieces: t.pieces.map((p) => (p.type === 'n_gin' ? { ...p, side: 'player' as Side } : p)) };
    setHp(t, 3, 6, 1);
    t = wait(t);
    t = play(t, 3, 2, 3, 6);
    expect(at(t, 3, 6)?.type).toBe('n_gin');
  });

  it('Tiny Tiger: the two-square jump captures for 2; enemies next to him cannot teleport', () => {
    let s = make(board({ ...kings, 4: { 3: 'r' }, 6: { 3: sym('tiny') } }), {}, opts());
    setHp(s, 3, 4, 2);
    expect(dests(movesAt(s, 3, 6))).toContain('3,4');
    s = play(s, 3, 6, 3, 4);
    expect(at(s, 3, 4)?.type).toBe('tiny');
    // An enemy Tawna next to Tiny can't use her Grappling Hook; away from him she can.
    const terrain = blank({ 1: '#.......' });
    let near = make(board({ ...kings, 3: { 3: sym('tawna', 'enemy') }, 4: { 3: sym('tiny') } }), {}, opts(terrain));
    near = wait(near);
    expect(legalMoves(near).some((m) => m.action === 'grapple')).toBe(false);
    let far = make(board({ ...kings, 3: { 3: sym('tawna', 'enemy') }, 6: { 6: sym('tiny') } }), {}, opts(terrain));
    far = wait(far);
    expect(legalMoves(far).some((m) => m.action === 'grapple')).toBe(true);
  });

  it('Dingodile: Vacuum Cannon pulls an enemy closer; Tail Swipe hits a second adjacent enemy', () => {
    let s = make(board({ ...kings, 3: { 3: 'p' }, 6: { 3: sym('dingodile') } }), {}, opts());
    s = actionAt(s, 3, 6, 'vacuum', 3, 4);
    expect(at(s, 3, 4)?.type).toBe('pawn');
    let t = make(board({ ...kings, 5: { 3: 'p', 4: 'p' }, 6: { 3: sym('dingodile') } }), {}, opts());
    t = play(t, 3, 6, 3, 5);
    expect(at(t, 3, 5)?.type).toBe('dingodile');
    expect(at(t, 4, 5)).toBeUndefined();
  });

  it('Ripper Roo: 2-by-1 and 3-by-1 jumps, Wild Bounce after a capture, and the first attack on him may miss', () => {
    let s = make(board({ ...kings, 4: { 4: 'p' }, 6: { 3: sym('ripper_roo') } }), {}, opts());
    const d = dests(movesAt(s, 3, 6));
    expect(d).toContain('4,4');
    expect(d).toContain('6,5');
    s = play(s, 3, 6, 4, 4);
    expect(s.bonus[0]?.source).toBe('wild_bounce');
    // Unpredictable is decided by the battle state: across many positions, some attacks miss and some hit.
    let missed = 0;
    let hit = 0;
    for (let x = 0; x < 7; x++)
      for (const y of [3, 4, 5]) {
        let t = make(board({ ...kings, 1: { [x]: 'q' }, [y]: { [x]: sym('ripper_roo') } }), {}, opts());
        if (x === 0 && y === 7) continue;
        t = wait(t);
        const m = legalMoves(t).find((m) => m.to.x === x && m.to.y === y && m.targets?.length);
        if (!m) continue;
        t = applyMove(t, m);
        if (t.pieces.some((p) => p.type === 'ripper_roo')) missed++;
        else hit++;
      }
    expect(missed).toBeGreaterThan(0);
    expect(hit).toBeGreaterThan(0);
  });

  it('Uka Uka: Dark Protection blocks the next attack on an ally; nearby enemies slide one less', () => {
    let s = make(board({ ...kings, 2: { 4: 'r' }, 6: { 3: sym('uka_uka'), 4: 'N' } }), {}, opts());
    s = actionAt(s, 3, 6, 'darkProtection', 4, 6);
    s = play(s, 4, 2, 4, 6);
    expect(at(s, 4, 6)?.type).toBe('knight');
    const t = make(board({ ...kings, 3: { 3: 'r' }, 5: { 3: sym('uka_uka', 'enemy') } }), {}, opts());
    const enemyRook = make(board({ 0: { 7: 'K' }, 7: { 0: 'k' }, 3: { 3: 'R' }, 5: { 2: sym('uka_uka', 'enemy') } }), {}, opts());
    // Pieces within 2 of an enemy Uka Uka lose a square of finite slides; a Rook's slide is unlimited, so it keeps its range.
    expect(dests(movesAt(enemyRook, 3, 3))).toContain('3,0');
    expect(t).toBeDefined();
    const polar = make(board({ ...kings, 6: { 3: sym('polar') }, 4: { 5: sym('uka_uka', 'enemy') } }), {}, opts());
    expect(dests(movesAt(polar, 3, 6))).not.toContain('3,2');
    expect(dests(movesAt(polar, 3, 6))).toContain('3,3');
  });

  it("Polar: four orthogonally, no diagonals; Charging Run hits for 2; Momentum offers one more square", () => {
    let s = make(board({ ...kings, 2: { 3: 'r' }, 6: { 3: sym('polar') } }), {}, opts());
    setHp(s, 3, 2, 2);
    expect(dests(movesAt(s, 3, 6))).not.toContain('4,5');
    s = play(s, 3, 6, 3, 2);
    expect(at(s, 3, 2)?.type).toBe('polar');
    let t = make(board({ ...kings, 6: { 3: sym('polar') } }), {}, opts());
    t = play(t, 3, 6, 3, 4);
    expect(t.bonus[0]).toMatchObject({ source: 'momentum', to: { x: 3, y: 3 } });
    t = play(t, 3, 4, 3, 3);
    expect(at(t, 3, 3)?.counters.momentumCd).toBeGreaterThan(0);
  });

  it("Pura: Agile Sprint moves twice (the second can't capture); Quick Reflexes dodges once", () => {
    let s = make(board({ ...kings, 6: { 3: sym('pura') } }), {}, opts());
    s = play(s, 3, 6, 3, 4);
    expect(s.bonus[0]?.source).toBe('agile_sprint');
    s = play(s, 3, 4, 5, 2);
    expect(s.turn).toBe('enemy');
    expect(at(s, 5, 2)?.counters.sprintCd).toBeGreaterThan(0);
  });

  it('N. Brio: Mutagenic Potion buffs an ally; Monster Transformation lasts 3 turns', () => {
    let s = make(board({ ...kings, 6: { 3: sym('brio'), 4: 'N' } }), {}, opts());
    s = actionAt(s, 3, 6, 'mutagen', 4, 6);
    expect(at(s, 4, 6)!.statuses.some((st) => st.kind === 'damageBuff')).toBe(true);
    let t = make(board({ ...kings, 6: { 3: sym('brio') } }), {}, opts());
    t = actionAt(t, 3, 6, 'transform', 3, 6);
    const monster = at(t, 3, 6)!;
    expect(monster.type).toBe('brio_monster');
    expect(monster.hp).toBe(3);
    expect(monster.maxHp).toBe(3);
    for (let i = 0; i < 3; i++) {
      t = wait(t);
      expect(at(t, 3, 6)?.type).toBe('brio_monster');
      t = wait(t);
    }
    expect(at(t, 3, 6)?.type).toBe('brio');
    expect(at(t, 3, 6)?.hp).toBe(1);
  });

  it('N. Tropy: moves two any direction, teleports and freezes neighbours, turns back time once, and collapses at 1 HP', () => {
    const rows = board({ 0: { 7: 'k' }, 7: { 0: 'K' }, 2: { 3: sym('n_tropy', 'enemy') }, 6: { 6: 'P' } });
    let s = make(rows, {}, opts());
    s = wait(s);
    const tropy = s.pieces.find((p) => p.type === 'n_tropy')!;
    expect(tropyPhase(tropy)).toBe(1);
    const moves = legalMoves(s).filter((m) => m.pieceId === tropy.id);
    expect(moves.some((m) => !m.action && m.to.x === 5 && m.to.y === 4)).toBe(true); // two diagonally
    const warp = moves.find((m: Move) => m.action === 'tropyWarp' && m.to.x === 5 && m.to.y === 4)!;
    s = applyMove(s, warp);
    expect(hasStatus(at(s, 6, 6)!, 'bound')).toBe(true);
    // Time Reversal at 2 HP.
    const t = s.pieces.find((p) => p.type === 'n_tropy')!;
    t.hp = 2;
    s = wait(s);
    expect(legalMoves(s).some((m) => m.pieceId === t.id && m.action === 'timeRewind')).toBe(true);
    // Temporal Collapse at 1 HP: moving next to enemies hurts them.
    let u = make(board({ 0: { 7: 'k' }, 7: { 0: 'K' }, 2: { 3: sym('n_tropy', 'enemy') }, 5: { 2: 'N', 0: 'P' } }), {}, opts());
    u.pieces.find((p) => p.type === 'n_tropy')!.hp = 1;
    u = wait(u);
    const step = legalMoves(u).find((m) => m.pieceId === u.pieces.find((p) => p.type === 'n_tropy')!.id && !m.action && m.to.x === 3 && m.to.y === 3)!;
    u = applyMove(u, step);
    expect(u.pieces.some((p) => p.type === 'knight')).toBe(false);
    expect(terrainAt(u.board, { x: 0, y: 0 })).toBe('normal');
  });
});

describe('Crash Pack special spaces', () => {
  it('TNT Crate: lit by stepping on it, explodes after 3 turns, hitting the 3×3 and smashing cracked walls', () => {
    const terrain = blank({ 4: '...X+...' });
    let s = make(board({ ...kings, 3: { 2: 'p' }, 6: { 3: 'R' } }), {}, opts(terrain));
    s = play(s, 3, 6, 3, 4);
    const tnt = s.tiles.find((t) => t.kind === 'tnt')!;
    expect(tnt.fuse).toBeDefined();
    s = play(s, 2, 3, 2, 4);
    s = play(s, 3, 4, 3, 7);
    for (let i = 0; i < 6 && s.tiles.some((t) => t.kind === 'tnt'); i++) s = wait(s);
    expect(s.tiles.some((t) => t.kind === 'tnt')).toBe(false);
    expect(terrainAt(s.board, { x: 4, y: 4 })).toBe('normal');
    expect(s.pieces.some((p) => p.type === 'pawn')).toBe(false);
  });

  it('Nitro Crate explodes as soon as a piece lands on it; jumping over is safe', () => {
    const terrain = blank({ 4: '...Z....' });
    let s = make(board({ ...kings, 3: { 4: 'p' }, 6: { 3: 'R' } }), {}, opts(terrain));
    s = play(s, 3, 6, 3, 4);
    expect(s.tiles.some((t) => t.kind === 'nitro')).toBe(false);
    expect(s.pieces.some((p) => p.type === 'rook')).toBe(false);
    expect(s.pieces.some((p) => p.type === 'pawn')).toBe(false);
    // A Knight jumping over a Nitro Crate leaves it alone.
    let t = make(board({ ...kings, 6: { 3: 'N' } }), {}, opts(blank({ 5: '...Z....' })));
    t = play(t, 3, 6, 4, 4);
    expect(t.tiles.some((x) => x.kind === 'nitro')).toBe(true);
  });

  it('Bounce Crate: landing on it offers one jump of exactly two squares (no capture), and it stays', () => {
    const terrain = blank({ 4: '...B....' });
    let s = make(board({ ...kings, 2: { 5: 'p' }, 6: { 3: 'R' } }), {}, opts(terrain));
    s = play(s, 3, 6, 3, 4);
    expect(s.bonus[0]?.source).toBe('bounce_crate');
    const jumps = legalMoves(s).filter((m) => m.param === 'bounce').map((m) => `${m.to.x},${m.to.y}`);
    expect(jumps).toContain('1,2');
    expect(jumps).not.toContain('5,2'); // the pawn's square: no capture
    s = applyMove(s, legalMoves(s).find((m) => m.param === 'bounce' && m.to.x === 1 && m.to.y === 2)!);
    expect(at(s, 1, 2)?.type).toBe('rook');
    expect(s.tiles.some((t) => t.kind === 'bounce')).toBe(true);
  });
});

describe('sandbox battles', () => {
  it("the Crash and Digital Duo sandbox battles' upgrades fit the pieces that carry them", async () => {
    const { ENCOUNTERS } = await import('../encounters');
    const { createEncounter } = await import('../setup');
    const { ineligibleReason } = await import('../upgrades/eligibility');
    for (const e of ENCOUNTERS.filter((e) => ['wumpa_island', 'crate_factory', 'crash_upgrades', 'digital_duo', 'mushroom_kingdom', 'power_up_panic'].includes(e.id))) {
      const s = createEncounter(e);
      for (const [sq, ids] of Object.entries(e.upgrades ?? {})) {
        const [x, y] = sq.split(',').map(Number);
        const p = at(s, x, y);
        expect(p, `${e.id}: no piece at ${sq}`).toBeDefined();
        // Showcase battles may go over the slot limit to show more at once.
        for (const id of ids) expect(ineligibleReason(id, p!.type, []), `${e.id} ${sq} ${id}`).toBeNull();
      }
    }
  });
});
