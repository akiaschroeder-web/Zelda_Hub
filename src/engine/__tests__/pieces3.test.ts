import { describe, expect, it } from 'vitest';
import { applyMove, legalMoves } from '../moves';
import { GameState, Move } from '../types';
import { at, dests, make, movesAt, play, shields, wait } from './upgradeHelpers';

const B = (rows: Record<number, string>) =>
  Array.from({ length: 8 }, (_, y) => rows[y] ?? (y === 0 ? '.......k' : y === 7 ? 'K.......' : '........'));
const T = (rows: Record<number, string>) => Array.from({ length: 8 }, (_, y) => rows[y] ?? '........');
const doAction = (s: GameState, x: number, y: number, action: Move['action'], tx?: number, ty?: number) => {
  const m = movesAt(s, x, y).find((m) => m.action === action && (tx === undefined || (m.to.x === tx && m.to.y === ty)));
  expect(m, `no ${action} from ${x},${y}`).toBeDefined();
  return applyMove(s, m!);
};
const hasMove = (s: GameState, x: number, y: number, action: Move['action']) => movesAt(s, x, y).some((m) => m.action === action);
const hurt = (s: GameState, x: number, y: number, hp: number): GameState => ({
  ...s,
  pieces: s.pieces.map((p) => (p.pos.x === x && p.pos.y === y ? { ...p, hp } : p)),
});
const alive = (s: GameState, type: string, side = 'enemy') => s.pieces.some((p) => p.type === type && p.side === side);

describe('Engineer', () => {
  it('builds a cracked wall on a cooldown, demolishes, and repairs once', () => {
    let s = doAction(make(B({ 4: '...1....' })), 3, 4, 'construct', 3, 3);
    expect(s.board.terrain[3][3]).toBe('cracked');
    s = wait(s);
    expect(hasMove(s, 3, 4, 'construct')).toBe(false);
    s = doAction(s, 3, 4, 'demolish', 3, 3);
    expect(s.board.terrain[3][3]).toBe('normal');
    const r = doAction(hurt(make(B({ 4: '...1J...' })), 4, 4, 1), 3, 4, 'repair', 4, 4);
    expect(at(r, 4, 4)?.hp).toBe(2);
    expect(hasMove(wait(r), 3, 4, 'repair')).toBe(false);
    expect(at(make(B({ 4: '...1....' })), 3, 4)?.maxHp).toBe(2);
  });
});

describe('Assassin', () => {
  it('Backstab deals 2 to an enemy that has not moved', () => {
    const s = play(make(B({ 2: '...g....', 5: '2.......' })), 0, 5, 3, 2);
    expect(alive(s, 'guardian')).toBe(false);
  });

  it('Shadow Step teleports behind an enemy within three squares', () => {
    const s = doAction(make(B({ 3: '.....r..', 5: '...2....' })), 3, 5, 'shadowStep', 5, 2);
    expect(at(s, 5, 2)?.type).toBe('assassin');
  });

  it('Execution grants a short non-capturing move after a capture', () => {
    let s = play(make(B({ 3: '.....p..', 5: '...2....' })), 3, 5, 5, 3);
    expect(s.turn).toBe('player');
    const bonus = legalMoves(s).filter((m) => m.action !== 'pass');
    expect(bonus.every((m) => Math.max(Math.abs(m.to.x - 5), Math.abs(m.to.y - 3)) <= 2 && !m.targets)).toBe(true);
    s = play(s, 5, 3, 3, 5);
    expect(s.turn).toBe('enemy');
  });
});

describe('Illusionist', () => {
  it('creates illusions that cannot capture, and swaps with one once', () => {
    let s = doAction(make(B({ 4: '...3....' })), 3, 4, 'mirage', 3, 3);
    const ill = at(s, 3, 3)!;
    expect(ill.type).toBe('illusion');
    expect(ill.temp).toBeDefined();
    s = wait(s);
    expect(hasMove(s, 3, 4, 'mirage')).toBe(false);
    s = doAction(s, 3, 4, 'misdirection', 3, 3);
    expect(at(s, 3, 3)?.type).toBe('illusionist');
    const cap = make(B({ 4: '...3....', 2: '...p....' }));
    const withIll = wait(doAction(cap, 3, 4, 'mirage', 3, 3));
    expect(movesAt(withIll, 3, 3).some((m) => m.targets?.length)).toBe(false);
  });
});

describe('Summoner', () => {
  it('summons Pawns on a cooldown, a Knight once, and at most three at a time', () => {
    let s = doAction(make(B({ 4: '...4....' })), 3, 4, 'summonPawn', 3, 3);
    expect(at(s, 3, 3)?.temp).toBeDefined();
    s = wait(s);
    expect(hasMove(s, 3, 4, 'summonPawn')).toBe(false);
    s = wait(doAction(s, 3, 4, 'summonKnight', 2, 3));
    expect(hasMove(s, 3, 4, 'summonKnight')).toBe(false);
    expect(at(make(B({ 4: '...4....' })), 3, 4)?.maxHp).toBe(2);
  });
});

describe('Converter', () => {
  it('converts an adjacent 1 HP enemy for the battle', () => {
    const s = doAction(make(B({ 4: '...5r...' })), 3, 4, 'convert', 4, 4);
    const r = at(s, 4, 4)!;
    expect(r.side).toBe('player');
    expect(r.temp?.kind).toBe('converted');
  });

  it('cannot convert Kings or multi-HP pieces', () => {
    expect(hasMove(make(B({ 0: '........', 4: '...5k...' })), 3, 4, 'convert')).toBe(false);
    expect(hasMove(make(B({ 4: '...5g...' })), 3, 4, 'convert')).toBe(false);
  });
});

describe('Displacer', () => {
  it('leaps exactly two squares orthogonally over pieces and gaps, not walls', () => {
    const s = make(B({ 3: '...P....', 4: '...6....' }), {}, { terrain: T({ 4: '...._...' }) });
    expect(dests(movesAt(s, 3, 4).filter((m) => !m.action))).toEqual(['1,4', '3,2', '3,6', '5,4']);
    const walled = make(B({ 4: '...6....' }), {}, { terrain: T({ 3: '...#....' }) });
    expect(dests(movesAt(walled, 3, 4).filter((m) => !m.action))).not.toContain('3,2');
  });

  it('swaps with an enemy within two squares, and Repulsion pushes neighbours away', () => {
    const s = doAction(make(B({ 2: '...r....', 4: '...6....' })), 3, 4, 'displace', 3, 2);
    expect(at(s, 3, 2)?.type).toBe('displacer');
    expect(at(s, 3, 4)?.type).toBe('rook');
    const r = doAction(make(B({ 3: '..rr....', 4: '...6....' })), 3, 4, 'repulse');
    expect(at(r, 3, 2)?.type).toBe('rook');
    expect(at(r, 1, 2)?.type).toBe('rook');
  });

  it('cannot be displaced by an enemy Displacer', () => {
    expect(hasMove(make(B({ 2: '...~....', 4: '...6....' })), 3, 4, 'displace')).toBe(false);
  });
});

describe('Oracle', () => {
  it('Prophecy negates the next attack on an ally', () => {
    let s = doAction(make(B({ 6: '...R....', 2: '...r....', 5: '.7......' })), 1, 5, 'prophecy', 3, 6);
    s = play(s, 3, 2, 3, 6);
    expect(s.pieces.some((p) => p.type === 'rook' && p.side === 'player')).toBe(true);
    expect(s.pieces.find((p) => p.type === 'rook' && p.side === 'player')!.statuses).toHaveLength(0);
    expect(s.pieces.find((p) => p.type === 'rook' && p.side === 'enemy')!.pos).not.toEqual({ x: 3, y: 6 });
  });
});

describe('Clone', () => {
  it('copies an adjacent ally’s movement and abilities but keeps 1 HP', () => {
    const s = doAction(make(B({ 4: '...8A...' })), 3, 4, 'replicate', 4, 4);
    const c = at(s, 3, 4)!;
    expect(c.type).toBe('archer');
    expect(c.maxHp).toBe(1);
    expect(c.clonedFrom).toBe('clone');
    const g = doAction(make(B({ 4: '...8G...' })), 3, 4, 'replicate', 4, 4);
    expect(at(g, 3, 4)?.maxHp).toBe(1);
  });
});

describe('Bomber', () => {
  it('Detonate deals 2 to every surrounding piece, including allies, and destroys the Bomber', () => {
    const s = doAction(make(B({ 3: '..gs....', 4: '...9G...' })), 3, 4, 'detonate');
    expect(s.pieces.some((p) => p.type === 'bomber')).toBe(false);
    expect(alive(s, 'guardian')).toBe(false);
    expect(alive(s, 'siege')).toBe(false);
    expect(alive(s, 'guardian', 'player')).toBe(false);
  });

  it('never hurts a King', () => {
    const s = doAction(make(B({ 7: '...K....', 6: '...9....' })), 3, 6, 'detonate');
    expect(s.pieces.some((p) => p.type === 'king' && p.side === 'player')).toBe(true);
  });

  it('Volatile: when captured it deals 1 to adjacent pieces', () => {
    const s = play(make(B({ 3: '...(s...', 6: '...R....' })), 3, 6, 3, 3);
    expect(at(s, 4, 3)?.hp).toBe(1);
  });
});

describe('Slayer', () => {
  it('Giant Killer deals 2 to multi-HP pieces; Bloodlust heals after felling one', () => {
    let s = hurt(make(B({ 3: '...g....', 6: '...0....' })), 3, 6, 1);
    s = play(s, 3, 6, 3, 3);
    expect(alive(s, 'guardian')).toBe(false);
    expect(at(s, 3, 3)?.hp).toBe(2);
  });

  it('Relentless: bounces only one square off a survivor', () => {
    // Juggernaut covers (3,2)-(4,3); the Slayer travels 3 to hit (3,3) and lands right next to it.
    const s = play(make(B({ 2: '...j....', 6: '...0....' })), 3, 6, 3, 3);
    expect(s.pieces.find((p) => p.type === 'juggernaut')?.hp).toBe(1);
    expect(at(s, 3, 4)?.type).toBe('slayer');
  });
});

describe('Warden', () => {
  it('Defensive Aura reduces big hits on adjacent allies', () => {
    // The Warden's one Intercept is already spent, so the aura is what helps.
    let s = make(B({ 4: '...s^...', 6: '...R....' }), { '3,6': ['heavy_strike'] });
    s = { ...s, pieces: s.pieces.map((p) => (p.type === 'warden' ? { ...p, used: ['warden_intercept'] } : p)) };
    s = play(s, 3, 6, 3, 4);
    expect(s.pieces.find((p) => p.type === 'siege')?.hp).toBe(1);
  });

  it('Intercept takes a hit for an adjacent ally once', () => {
    const s = play(make(B({ 4: '...r^...', 6: '...R....' })), 3, 6, 3, 4);
    expect(alive(s, 'rook')).toBe(true);
    expect(s.pieces.find((p) => p.type === 'warden')?.hp).toBe(2);
  });

  it('Immovable: cannot be shoved', () => {
    expect(hasMove(make(B({ 3: '...^....', 4: '...U....' })), 3, 4, 'shove')).toBe(false);
    expect(at(make(B({ 4: '...%....' })), 3, 4)?.maxHp).toBe(3);
  });
});

describe('Harvester', () => {
  it('gains Souls by capturing and spends them', () => {
    let s = play(make(B({ 3: '.....p..', 5: '...$....' })), 3, 5, 5, 3);
    expect(at(s, 5, 3)?.counters.souls).toBe(1);
    s = { ...s, pieces: s.pieces.map((p) => (p.type === 'harvester' ? { ...p, hp: 1, counters: { ...p.counters, souls: 3 } } : p)) };
    s = wait(s);
    s = doAction(s, 5, 3, 'soulHeal');
    expect(at(s, 5, 3)?.hp).toBe(2);
    expect(at(s, 5, 3)?.counters.souls).toBe(1);
  });

  it("Death's Reward: reaching five Souls gives +1 max HP once", () => {
    let s = make(B({ 3: '.....p..', 5: '...$....' }));
    s = { ...s, pieces: s.pieces.map((p) => (p.type === 'harvester' ? { ...p, counters: { souls: 4 } } : p)) };
    s = play(s, 3, 5, 5, 3);
    expect(at(s, 5, 3)?.maxHp).toBe(3);
    expect(at(s, 5, 3)?.counters.deathReward).toBe(1);
  });

  it('spending three Souls adds damage to the next attack', () => {
    let s = make(B({ 3: '.....g..', 5: '...$....' }));
    s = { ...s, pieces: s.pieces.map((p) => (p.type === 'harvester' ? { ...p, counters: { souls: 3 } } : p)) };
    s = wait(doAction(s, 3, 5, 'soulPower'));
    s = play(s, 3, 5, 5, 3);
    expect(s.pieces.some((p) => p.type === 'guardian')).toBe(false);
    expect(shields(at(s, 5, 3))).toBe(0);
  });
});
