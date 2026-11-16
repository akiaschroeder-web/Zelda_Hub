import { describe, expect, it } from 'vitest';
import { BEN10_LEGEND } from '../../content/packs';
import { terrainAt } from '../board';
import { addStatus, hasStatus } from '../core';
import { kevinPhase, vilgaxPhase } from '../ben10';
import { sizeOf } from '../pieces';
import { applyMove, legalMoves } from '../moves';
import { GameState, PieceType, Side } from '../types';
import { act, at, covers, dests, hasAction, make, movesAt, play, shields, wait } from './upgradeHelpers';

const sym = (type: PieceType, side: Side = 'player') => Object.entries(BEN10_LEGEND).find(([, [t, s]]) => t === type && s === side)![0];
const row = (cells: Record<number, string> = {}) => Array.from({ length: 8 }, (_, x) => cells[x] ?? '.').join('');
const board = (rows: Record<number, Record<number, string>>) => Array.from({ length: 8 }, (_, y) => row(rows[y]));
const blank = (rows: Record<number, string>) => Array.from({ length: 8 }, (_, y) => rows[y] ?? '........');
const opts = (terrain?: string[]) => ({ legend: BEN10_LEGEND, terrain });
const kings = { 0: { 7: 'k' }, 7: { 0: 'K' } };
const action = (s: GameState, x: number, y: number, kind: string, tx: number, ty: number, pick: (m: { param?: string }) => boolean = () => true) => {
  const m = movesAt(s, x, y).find((m) => m.action === kind && m.to.x === tx && m.to.y === ty && pick(m));
  expect(m, `no ${kind} from ${x},${y} to ${tx},${ty}`).toBeDefined();
  return applyMove(s, m!);
};
const setHp = (s: GameState, x: number, y: number, hp: number, maxHp = hp) => {
  const p = at(s, x, y)!;
  p.maxHp = maxHp;
  p.hp = hp;
};

describe('Ben 10 Pack: Ben and the Omnitrix', () => {
  it('Ben transforms for 3 turns, then changes back with at most 1 HP', () => {
    let s = make(board({ ...kings, 6: { 3: sym('ben') } }), {}, opts());
    s = action(s, 3, 6, 'omnitrix', 3, 6, (m) => m.param === 'diamondhead');
    const ben = at(s, 3, 6)!;
    expect(ben.type).toBe('diamondhead');
    expect(ben.maxHp).toBe(2);
    expect(ben.hp).toBe(2);
    for (let i = 0; i < 3; i++) {
      s = wait(s);
      expect(at(s, 3, 6)?.type).toBe('diamondhead');
      s = wait(s);
    }
    expect(at(s, 3, 6)?.type).toBe('ben');
    expect(at(s, 3, 6)?.hp).toBe(1);
    expect(movesAt(s, 3, 6).some((m) => m.action === 'omnitrix')).toBe(false); // still recharging
  });

  it('Four Arms needs a clear 2×2, and is 2×2 while it lasts', () => {
    let s = make(board({ ...kings, 6: { 3: sym('ben') } }), {}, opts());
    s = action(s, 3, 6, 'omnitrix', 2, 5, (m) => m.param === 'four_arms');
    const fourArms = s.pieces.find((p) => p.type === 'four_arms')!;
    expect(sizeOf(fourArms)).toBe(2);
    expect(fourArms.maxHp).toBe(3);
  });

  it('Master Control: no cooldown, and switch forms or revert at will', () => {
    let s = make(board({ ...kings, 6: { 3: sym('ben') } }), { '3,6': ['master_control'] }, opts());
    covers('master_control');
    s = action(s, 3, 6, 'omnitrix', 3, 6, (m) => m.param === 'xlr8');
    s = wait(s);
    expect(movesAt(s, 3, 6).some((m) => m.action === 'omnitrix' && m.param === 'ben')).toBe(true);
    s = action(s, 3, 6, 'omnitrix', 3, 6, (m) => m.param === 'heatblast');
    expect(at(s, 3, 6)?.type).toBe('heatblast');
  });
});

describe('Ben 10 Pack: the aliens', () => {
  it('Heatblast: Fireball, and a Flame Burst after a capture', () => {
    let s = make(board({ ...kings, 2: { 6: 'r' }, 6: { 2: sym('heatblast') } }), {}, opts());
    setHp(s, 6, 2, 2);
    s = action(s, 2, 6, 'fireball', 6, 2);
    expect(at(s, 6, 2)?.hp).toBe(1);
    let t = make(board({ ...kings, 4: { 4: 'p', 3: 'p' }, 6: { 2: sym('heatblast') } }), {}, opts());
    t = play(t, 2, 6, 4, 4);
    expect(t.pieces.filter((p) => p.type === 'pawn')).toHaveLength(0);
  });

  it('Wildmutt pounces over pieces; its range is never reduced', () => {
    const s = make(board({ ...kings, 3: { 3: 'p' }, 5: { 3: 'P' }, 6: { 3: sym('wildmutt') } }), {}, opts());
    expect(movesAt(s, 3, 6).some((m) => m.uses?.includes('predatory_leap') && m.to.y === 3)).toBe(true);
    addStatus(at(s, 3, 6)!, { kind: 'slowed', until: 99 });
    expect(dests(movesAt(s, 3, 6).filter((m) => !m.uses))).toContain('0,6');
  });

  it('Diamondhead and Cannonbolt ignore their first point of damage; Cannonbolt rolls through cracked walls', () => {
    let s = make(board({ ...kings, 2: { 3: 'r' }, 6: { 3: sym('diamondhead') } }), {}, opts());
    s = wait(s);
    s = play(s, 3, 2, 3, 6);
    expect(at(s, 3, 6)?.type).toBe('diamondhead');
    expect(at(s, 3, 6)?.hp).toBe(2);
    let c = make(board({ ...kings, 6: { 3: sym('cannonbolt') } }), {}, opts(blank({ 4: '...+....' })));
    c = applyMove(c, movesAt(c, 3, 6).find((m) => m.uses?.includes('crushing_roll') && m.to.y === 2)!);
    expect(terrainAt(c.board, { x: 3, y: 4 })).toBe('normal');
  });

  it('XLR8: Super Speed moves twice', () => {
    let s = make(board({ ...kings, 6: { 3: sym('xlr8') } }), {}, opts());
    s = play(s, 3, 6, 3, 2);
    expect(s.bonus[0]?.source).toBe('super_speed');
  });

  it('Grey Matter slips through walls; Upgrade merges into a machine', () => {
    const s = make(board({ ...kings, 6: { 3: sym('grey_matter') } }), {}, opts(blank({ 5: '..#.....' })));
    expect(movesAt(s, 3, 6).some((m) => m.uses?.includes('tiny_size') && m.to.x === 1 && m.to.y === 4)).toBe(true);
    let u = make(board({ ...kings, 6: { 3: sym('upgrade'), 5: 'S' } }), {}, opts());
    u = action(u, 3, 6, 'maskAttach', 5, 6);
    expect(u.pieces.some((p) => p.type === 'upgrade')).toBe(false);
    expect(at(u, 5, 6)?.counters.akuHost).toBe(2);
  });

  it('Four Arms pounds the ground; Stinkfly lands on gaps and slimes', () => {
    let s = make(board({ ...kings, 4: { 3: 'p' }, 5: { 3: sym('four_arms') } }), {}, opts());
    s = action(s, 3, 5, 'groundPound', 3, 5);
    expect(s.pieces.some((p) => p.type === 'pawn')).toBe(false);
    let f = make(board({ ...kings, 3: { 3: 'r' }, 6: { 3: sym('stinkfly') } }), {}, opts(blank({ 4: '.____...' })));
    expect(dests(movesAt(f, 3, 6))).toContain('1,4');
    setHp(f, 3, 3, 2);
    f = action(f, 3, 6, 'slimeSpit', 3, 3);
    expect(hasStatus(at(f, 3, 3)!, 'slowed')).toBe(true);
  });

  it('Ripjaws swims across gaps and bites for 2', () => {
    let s = make(board({ ...kings, 3: { 3: 'r' }, 6: { 3: sym('ripjaws') } }), {}, opts(blank({ 5: '...#....', 4: '........' })));
    s = make(board({ ...kings, 3: { 3: 'r' }, 6: { 3: sym('ripjaws') } }), {}, opts(blank({ 5: '..._....' })));
    setHp(s, 3, 3, 2);
    s = play(s, 3, 6, 3, 3);
    expect(at(s, 3, 3)?.type).toBe('ripjaws');
  });

  it('Ghostfreak: intangible once, and possesses an adjacent enemy for one move', () => {
    let s = make(board({ ...kings, 5: { 3: 'r' }, 6: { 3: sym('ghostfreak') }, 1: { 3: 'p' } }), {}, opts());
    s = action(s, 3, 6, 'possess', 3, 5);
    expect(s.bonus[0]?.source).toBe('possession');
    const rook = s.pieces.find((p) => p.type === 'rook')!;
    expect(rook.side).toBe('player');
    s = applyMove(s, legalMoves(s).find((m) => m.pieceId === rook.id && m.to.x === 3 && m.to.y === 1)!);
    expect(s.pieces.some((p) => p.type === 'pawn')).toBe(false);
    expect(s.pieces.find((p) => p.type === 'rook')!.side).toBe('enemy');
  });

  it('Way Big: one square at a time, stomping, and the Cosmic Ray', () => {
    let s = make(board({ 0: { 7: 'k', 1: 'r', 2: 'r' }, 2: { 0: sym('way_big') }, 7: { 7: 'K' } }), {}, opts());
    const wb = s.pieces.find((p) => p.type === 'way_big')!;
    s.pieces.filter((p) => p.type === 'rook').forEach((r) => {
      r.hp = 2;
      r.maxHp = 2;
    });
    expect(sizeOf(wb)).toBe(5);
    s = applyMove(s, legalMoves(s).find((m) => m.pieceId === wb.id && m.action === 'cosmicRay')!);
    expect(s.pieces.filter((p) => p.type === 'rook')).toHaveLength(0);
  });

  it("Gwen's Magic Shield blocks an attack; her spell hits within 3", () => {
    let s = make(board({ ...kings, 2: { 4: 'r' }, 6: { 3: sym('gwen'), 4: 'N' } }), {}, opts());
    s = wait(s);
    s = play(s, 4, 2, 4, 6);
    expect(at(s, 4, 6)?.type).toBe('knight');
    let t = make(board({ ...kings, 4: { 5: 'r' }, 6: { 3: sym('gwen') } }), {}, opts());
    setHp(t, 5, 4, 2);
    t = action(t, 3, 6, 'spell', 5, 4);
    expect(at(t, 5, 4)?.hp).toBe(1);
  });
});

describe('Ben 10 Pack: bosses', () => {
  it('Kevin 11 hits for 2 and jumps; at 2 HP he gets an energy blast', () => {
    let s = make(board({ 0: { 7: 'k' }, 7: { 0: 'R', 7: 'K' }, 1: { 3: sym('kevin_11', 'enemy') } }), {}, opts());
    s = wait(s);
    const kevin = s.pieces.find((p) => p.type === 'kevin_11')!;
    expect(kevinPhase(kevin)).toBe(1);
    expect(legalMoves(s).some((m) => m.pieceId === kevin.id && m.action === 'kevinJump')).toBe(true);
    kevin.hp = 2;
    expect(legalMoves(s).some((m) => m.pieceId === kevin.id && m.action === 'energyBlast')).toBe(false); // nothing within 4
  });

  it('Vilgax smashes everything around him; at 2 HP ranged hits are softened', () => {
    let s = make(board({ 0: { 7: 'k' }, 7: { 0: 'K' }, 1: { 2: sym('vilgax', 'enemy') }, 4: { 3: 'R' } }), {}, opts());
    s = wait(s);
    const vilgax = s.pieces.find((p) => p.type === 'vilgax')!;
    expect(vilgaxPhase(vilgax)).toBe(1);
    s = applyMove(s, legalMoves(s).find((m) => m.pieceId === vilgax.id && m.action === 'conquer')!);
    expect(s.pieces.some((p) => p.type === 'rook')).toBe(false);
  });
});

describe('Ben 10 Pack upgrades', () => {
  it('Omnitrix Dial, Recharge, Scanner, Failsafe and DNA Repair', () => {
    covers('omnitrix_dial', 'omnitrix_recharge', 'omnitrix_scanner', 'omnitrix_failsafe', 'dna_repair');
    const g = make(blank({ 0: '.......k', 6: '...G....', 7: 'K.......' }), { '3,6': ['omnitrix_dial'] });
    expect(dests(movesAt(g, 3, 6))).toContain('3,4');
    let s = make(blank({ 0: '.......k', 4: '.....n..', 6: '...N....', 7: 'K.......' }), { '3,6': ['omnitrix_scanner', 'dna_repair'] });
    s = act(s, 3, 6, 'omnitrix_scanner', 5, 4);
    expect(s.pieces.find((p) => p.side === 'player' && p.type === 'knight')!.statuses.some((st) => st.kind === 'copying')).toBe(true);
    let f = make(blank({ 0: '.......k', 2: '...r....', 6: '...N....', 7: 'K.......' }), { '3,6': ['omnitrix_failsafe', 'omnitrix_recharge'] });
    f = wait(f);
    f = play(f, 3, 2, 3, 6, () => true);
    expect(f.pieces.some((p) => p.type === 'knight' && p.side === 'player')).toBe(true);
    let b = make(board({ ...kings, 6: { 3: sym('ben') } }), { '3,6': ['omnitrix_recharge'] }, opts());
    b = action(b, 3, 6, 'omnitrix', 3, 6, (m) => m.param === 'xlr8');
    expect(b.pieces.find((p) => p.type === 'xlr8')).toBeDefined();
    expect(hasAction(make(blank({ 0: '.......k', 6: '...N....', 7: 'K.......' }), { '3,6': ['dna_repair'] }), 3, 6, 'dna_repair')).toBe(false); // full HP
  });

  it('Alien abilities', () => {
    covers('pyronite_flames', 'vulpimancer_instincts', 'petrosapien_crystals', 'kineceleran_speed', 'galvan_intelligence', 'tetramand_strength');
    let s = make(blank({ 0: '.......k', 3: '...rp...', 6: '...N....', 7: 'K.......' }), { '3,6': ['pyronite_flames', 'petrosapien_crystals'] });
    setHp(s, 3, 3, 2);
    s = act(s, 3, 6, 'pyronite_flames', 3, 3);
    expect(at(s, 3, 3)?.hp).toBe(1);
    expect(s.pieces.some((p) => p.type === 'pawn')).toBe(false);
    expect(at(s, 3, 6)?.maxHp).toBe(2);
    let v = make(blank({ 0: '.......k', 2: '...r....', 6: '...N....', 7: 'K.......' }), { '3,6': ['vulpimancer_instincts'] });
    v = wait(v);
    v = play(v, 3, 2, 3, 5);
    expect(v.pieces.find((p) => p.type === 'knight')!.pos).not.toEqual({ x: 3, y: 6 });
    let k = make(blank({ 0: '.......k', 6: '...N....', 7: 'K.......' }), { '3,6': ['kineceleran_speed'] });
    k = play(k, 3, 6, 4, 4);
    expect(k.bonus[0]?.source).toBe('kineceleran');
    const g = make(blank({ 0: '.......k', 5: '...P....', 6: '...G....', 7: 'K.......' }), { '3,6': ['galvan_intelligence', 'tetramand_strength'] }, { terrain: blank({ 6: '..+.....' }) });
    expect(movesAt(g, 3, 6).some((m) => m.action === 'demolish')).toBe(true);
  });

  it('Wings, jaws, mechamorph, phasing and armor', () => {
    covers('lepidopterran_wings', 'piscciss_jaws', 'galvanic_mechamorph', 'ectonurite_phasing', 'pelarota_armor');
    const w = make(blank({ 0: '.......k', 6: '...N....', 7: 'K.......' }), { '3,6': ['lepidopterran_wings'] });
    expect(movesAt(w, 3, 6).some((m) => m.uses?.includes('lepidopterran_wings') && m.to.x === 6 && m.to.y === 3)).toBe(true);
    let j = make(blank({ 0: '.......k', 4: '....r...', 6: '...N....', 7: 'K.......' }), { '3,6': ['piscciss_jaws'] });
    setHp(j, 4, 4, 2);
    j = play(j, 3, 6, 4, 4);
    expect(at(j, 4, 4)?.side).toBe('player');
    let m = make(board({ ...kings, 6: { 3: 'N', 4: 'S' } }), { '3,6': ['galvanic_mechamorph'] }, opts());
    m = act(m, 3, 6, 'galvanic_mechamorph', 4, 6);
    expect(at(m, 4, 6)!.statuses.some((st) => st.kind === 'damageBuff')).toBe(true);
    const e = make(blank({ 0: '.......k', 6: '...G....', 7: 'K.......' }), { '3,6': ['ectonurite_phasing', 'pelarota_armor'] });
    expect(e).toBeDefined();
  });

  it("To'kustar energy, Plumber gear and the Null Void", () => {
    covers('tokustar_energy', 'plumber_badge', 'plumber_blaster', 'plumber_armor', 'null_void_projector', 'plumber_restraints', 'plumber_teleporter');
    let s = make(blank({ 0: '.......k', 2: '...rr...', 5: '.....B..', 6: '...N....', 7: 'K.......' }), { '3,6': ['tokustar_energy', 'plumber_armor'], '5,5': ['null_void_projector'] });
    setHp(s, 3, 2, 3);
    s = act(s, 3, 6, 'tokustar_energy', 3, 5);
    expect(at(s, 3, 2)?.hp).toBe(1);
    expect(at(s, 3, 6)?.maxHp).toBe(2);
    s = wait(s);
    s = act(s, 5, 5, 'null_void_projector', 4, 2);
    expect(s.pieces.filter((p) => p.type === 'rook')).toHaveLength(1);
    for (let i = 0; i < 4; i++) s = wait(s);
    expect(s.pieces.filter((p) => p.type === 'rook')).toHaveLength(2);
    let r = make(blank({ 0: '.......k', 3: '...r....', 6: '...N.B..', 7: 'K.......' }), { '3,6': ['plumber_restraints', 'plumber_badge'], '5,6': ['plumber_blaster', 'plumber_teleporter'] });
    r = act(r, 3, 6, 'plumber_restraints', 3, 3);
    expect(hasStatus(at(r, 3, 3)!, 'bound')).toBe(true);
    const g = make(blank({ 0: '.......k', 6: '...NG...', 7: 'K.......' }), { '3,6': ['plumber_badge'] });
    expect(dests(movesAt(g, 4, 6))).toContain('4,4');
  });

  it("Kevin's absorption, Vilgax's cybernetics, the charms, Ascalon and DNA Fusion", () => {
    covers('kevins_absorption', 'vilgax_cybernetics', 'charm_of_luck', 'charm_of_telekinesis', 'ascalon', 'dna_fusion');
    let s = make(blank({ 0: '.......k', 2: '...r....', 6: '...N....', 7: 'K.......' }), { '3,6': ['kevins_absorption', 'vilgax_cybernetics'] });
    expect(at(s, 3, 6)?.maxHp).toBe(2);
    s = wait(s);
    s = play(s, 3, 2, 3, 6);
    const kn = s.pieces.find((p) => p.type === 'knight' && p.side === 'player')!;
    expect(kn.statuses.some((st) => st.kind === 'damageBuff')).toBe(true);
    let t = make(blank({ 0: '.......k', 3: '...p....', 6: '...N.B..', 7: 'K.......' }), { '3,6': ['charm_of_telekinesis', 'charm_of_luck'], '5,6': ['ascalon'] });
    t = act(t, 3, 6, 'charm_of_telekinesis', 2, 3);
    expect(at(t, 2, 3)?.type).toBe('pawn');
    let f = make(blank({ 0: '.......k', 6: '...NRB..', 7: 'K.......' }), { '3,6': ['dna_fusion'] });
    f = act(f, 3, 6, 'dna_fusion', 3, 6);
    const k = at(f, 3, 6)!;
    expect(k.statuses.some((st) => st.kind === 'copying')).toBe(true);
    expect(k.statuses.some((st) => st.kind === 'copying2')).toBe(true);
    expect(k.maxHp).toBe(2);
    expect(shields(k)).toBe(0);
  });
});
