import { describe, expect, it } from 'vitest';
import { applyMove, legalMoves } from '../moves';
import { GameState, Move, PieceType, Side } from '../types';
import { at, dests, make, movesAt, play, wait } from './upgradeHelpers';

const B = (rows: Record<number, string>) =>
  Array.from({ length: 8 }, (_, y) => rows[y] ?? (y === 0 ? '.......k' : y === 7 ? 'K.......' : '........'));
const T = (rows: Record<number, string>) => Array.from({ length: 8 }, (_, y) => rows[y] ?? '........');
/** `Β` = the player's boss, `β` = the enemy's boss. */
const boss = (type: PieceType): Record<string, [PieceType, Side]> => ({ Β: [type, 'player'], β: [type, 'enemy'] });
const doAction = (s: GameState, x: number, y: number, action: Move['action'], tx?: number, ty?: number) => {
  const m = movesAt(s, x, y).find((m) => m.action === action && (tx === undefined || (m.to.x === tx && m.to.y === ty)));
  expect(m, `no ${action} from ${x},${y}`).toBeDefined();
  return applyMove(s, m!);
};
const find = (s: GameState, type: PieceType, side: Side = 'enemy') => s.pieces.find((p) => p.type === type && p.side === side);

describe('The Colossus', () => {
  it('is 3×3 with 6 HP and crushes everything under its new footprint for 2 damage', () => {
    let s = make(B({ 3: '..pgp...', 4: '..Β.....' }), {}, { legend: boss('colossus') });
    expect(find(s, 'colossus', 'player')?.maxHp).toBe(6);
    s = play(s, 2, 4, 2, 3);
    expect(s.pieces.filter((p) => p.side === 'enemy' && p.type !== 'king')).toHaveLength(0);
    expect(find(s, 'colossus', 'player')?.pos).toEqual({ x: 2, y: 3 });
  });

  it('Siege Breaker smashes cracked walls in its path', () => {
    const s = play(make(B({ 4: '..Β.....' }), {}, { legend: boss('colossus'), terrain: T({ 3: '...+....' }) }), 2, 4, 2, 3);
    expect(s.board.terrain[3][3]).toBe('normal');
  });
});

describe('The Empress', () => {
  it('moves like a Queen and a Knight', () => {
    const d = dests(movesAt(make(B({ 4: '...Β....' }), {}, { legend: boss('empress') }), 3, 4));
    expect(d).toEqual(expect.arrayContaining(['3,0', '0,1', '4,2', '5,3']));
  });

  it('Royal Command gives an ally an extra move', () => {
    let s = doAction(make(B({ 4: '...Β....', 6: '.....R..' }), {}, { legend: boss('empress') }), 3, 4, 'royalCommand', 5, 6);
    expect(s.turn).toBe('player');
    s = play(s, 5, 6, 5, 1);
    expect(s.turn).toBe('player');
  });

  it('Imperial Guard: the first attack on her is absorbed by an adjacent ally', () => {
    const s = play(make(B({ 3: '...βp...', 6: '...R....' }), {}, { legend: boss('empress') }), 3, 6, 3, 3);
    expect(find(s, 'empress')?.hp).toBe(3);
    expect(find(s, 'pawn')).toBeUndefined();
  });
});

describe('The Necromancer', () => {
  it('Raise Fallen returns a lost ally at the start of its turn', () => {
    let t = make(B({ 2: '...β....', 4: '.....p..', 6: '.....R..' }), {}, { legend: boss('necromancer') });
    t = { ...t, pieces: t.pieces.map((p) => (p.type === 'necromancer' ? { ...p, hp: 2 } : p)) };
    t = play(t, 5, 6, 5, 4);
    // The enemy's own loss doesn't heal it (Death Harvest is for enemy captures)...
    expect(find(t, 'necromancer')?.hp).toBe(2);
    // ...and at the start of its turn the Pawn rises again on its back rows.
    const raised = t.pieces.find((p) => p.type === 'pawn' && p.side === 'enemy');
    expect(raised).toBeDefined();
    expect(raised!.pos.y).toBeLessThanOrEqual(1);
  });

  it('heals 1 when it captures an enemy piece', () => {
    let s = make(B({ 2: '...β....', 3: '....P...' }), {}, { legend: boss('necromancer') });
    s = { ...s, pieces: s.pieces.map((p) => (p.type === 'necromancer' ? { ...p, hp: 2 } : p)) };
    s = wait(s);
    s = play(s, 3, 2, 4, 3);
    expect(find(s, 'necromancer')?.hp).toBe(3);
  });
});

describe('The Stormbringer', () => {
  it('Chain Lightning hits a target and arcs to two neighbours', () => {
    const s = doAction(make(B({ 2: '..sss...', 4: '...Β....' }), {}, { legend: boss('stormbringer') }), 3, 4, 'chainLightning', 3, 2);
    expect(s.pieces.filter((p) => p.type === 'siege' && p.hp === 1)).toHaveLength(3);
  });

  it('Charged Ground: the square it leaves hurts the first enemy to stop there', () => {
    let s = make(B({ 4: '...β....', 6: '...R....' }), {}, { legend: boss('stormbringer') });
    s = wait(s);
    s = play(s, 3, 4, 6, 4);
    s = play(s, 3, 6, 3, 4);
    expect(s.pieces.some((p) => p.type === 'rook' && p.side === 'player')).toBe(false);
  });
});

describe('The Watcher', () => {
  it('marks open lines; the first enemy to stop on one takes 1', () => {
    let s = make(B({ 1: '...β....', 6: '.....R..' }), {}, { legend: boss('watcher') });
    s = wait(wait(s)); // the Watcher's turn ends: lines are marked
    s = play(s, 5, 6, 3, 6);
    expect(s.pieces.some((p) => p.type === 'rook' && p.side === 'player')).toBe(false);
  });

  it('moves one square diagonally', () => {
    const s = make(B({ 3: '...Β....' }), {}, { legend: boss('watcher') });
    expect(dests(movesAt(s, 3, 3).filter((m) => !m.action))).toEqual(['2,2', '2,4', '4,2', '4,4']);
  });
});

describe('The Worldbreaker', () => {
  it('Rupture turns an adjacent square into a gap; Earthquake shatters cracked walls', () => {
    const r = doAction(make(B({ 3: '...Β....' }), {}, { legend: boss('worldbreaker') }), 3, 3, 'rupture', 5, 3);
    expect(r.board.terrain[3][5]).toBe('gap');
    const e = doAction(make(B({ 3: '...Β....' }), {}, { legend: boss('worldbreaker'), terrain: T({ 1: '..+..+..' }) }), 3, 3, 'earthquake');
    expect(e.board.terrain[1][2]).toBe('normal');
    expect(e.board.terrain[1][5]).toBe('normal');
  });
});

describe('The Phantom King', () => {
  it('moves up to 3 through walls and pieces, but not across gaps', () => {
    const s = make(B({ 4: '...Β.P..' }), {}, { legend: boss('phantom_king'), terrain: T({ 4: '....#...', 3: '..._....' }) });
    const d = dests(movesAt(s, 3, 4));
    expect(d).toContain('6,4'); // through the wall and the Pawn
    expect(d).not.toContain('3,2'); // the gap at (3,3) blocks
  });

  it('Ethereal Escape dodges the first attack; Haunting Presence silences neighbours', () => {
    const s = play(make(B({ 2: '...β....', 6: '...R....' }), {}, { legend: boss('phantom_king') }), 3, 6, 3, 2);
    expect(find(s, 'phantom_king')?.hp).toBe(3);
    expect(find(s, 'phantom_king')?.used).toContain('escape');
    const h = make(B({ 4: '...βM...' }), {}, { legend: boss('phantom_king') });
    expect(legalMoves(h).some((m) => m.action === 'teleport')).toBe(false);
  });
});

describe('The Doppelganger', () => {
  it('copies the movement of enemy pieces', () => {
    const s = make(B({ 4: '...Β....', 1: 'r.......' }), {}, { legend: boss('doppelganger') });
    expect(dests(movesAt(s, 3, 4))).toContain('3,0');
  });

  it('Stolen Talent borrows an enemy ability once, then cools down', () => {
    let s = make(B({ 2: '...p....', 4: '...Β....', 0: 'a......k' }), {}, { legend: boss('doppelganger') });
    s = doAction(s, 3, 4, 'shoot', 3, 2);
    expect(s.pieces.some((p) => p.type === 'pawn')).toBe(false);
    s = wait(s);
    expect(movesAt(s, 3, 4).some((m) => m.param === 'stolen')).toBe(false);
  });
});

describe('The Hive Mother', () => {
  it('spawns a temporary Pawn at the end of its turn, and pushes adjacent Pawns forward', () => {
    let s = make(B({ 4: '...Β....' }), {}, { legend: boss('hive_mother') });
    s = wait(s);
    expect(s.pieces.filter((p) => p.temp && p.type === 'pawn')).toHaveLength(1);
    const swarm = make(B({ 4: '...Β....', 5: '..P.....' }), {}, { legend: boss('hive_mother') });
    expect(dests(movesAt(swarm, 2, 5))).toContain('2,3');
  });
});

describe('The Chronarch', () => {
  it("Rewind undoes the enemy's last move", () => {
    let s = make(B({ 4: '...Β....', 2: '......r.' }), {}, { legend: boss('chronarch') });
    s = wait(s);
    s = play(s, 6, 2, 6, 6);
    s = doAction(s, 3, 4, 'rewind');
    expect(at(s, 6, 2)?.type).toBe('rook');
    expect(s.turn).toBe('enemy');
    expect(find(s, 'chronarch', 'player')?.used).toContain('rewind');
  });

  it('Temporal Acceleration takes two actions in a row', () => {
    let s = doAction(make(B({ 4: '...Β....' }), {}, { legend: boss('chronarch') }), 3, 4, 'accelerate');
    s = play(s, 3, 4, 3, 2);
    expect(s.turn).toBe('player');
    s = play(s, 3, 2, 3, 0);
    expect(s.turn).toBe('enemy');
  });
});

describe('Boss battles', () => {
  it('defeating the boss wins the battle', () => {
    let s = make(B({ 2: '...β....', 6: '...R....' }), {}, { legend: boss('necromancer'), bossKill: true });
    s = { ...s, pieces: s.pieces.map((p) => (p.type === 'necromancer' ? { ...p, hp: 1 } : p)) };
    s = play(s, 3, 6, 3, 2);
    expect(s.result).toEqual({ kind: 'bossDefeated', winner: 'player' });
  });

  it('bosses resist control: no Bind, no pushes, no conversion', () => {
    const s = make(B({ 3: '...β....', 4: '...E....' }), {}, { legend: boss('empress') });
    expect(movesAt(s, 3, 4).some((m) => m.action === 'bind')).toBe(false);
  });
});
