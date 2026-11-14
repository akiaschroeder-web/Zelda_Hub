import { describe, expect, it } from 'vitest';
import { applyMove, legalMoves } from '../moves';
import { GameState, Move } from '../types';
import { at, dests, make, movesAt, play, shields, wait } from './upgradeHelpers';

const B = (rows: Record<number, string>) =>
  Array.from({ length: 8 }, (_, y) => rows[y] ?? (y === 0 ? '.......k' : y === 7 ? 'K.......' : '........'));
const T = (rows: Record<number, string>) => Array.from({ length: 8 }, (_, y) => rows[y] ?? '........');

const doAction = (s: GameState, x: number, y: number, action: Move['action'], tx: number, ty: number) => {
  const m = movesAt(s, x, y).find((m) => m.action === action && m.to.x === tx && m.to.y === ty);
  expect(m, `no ${action} from ${x},${y} to ${tx},${ty}`).toBeDefined();
  return applyMove(s, m!);
};
const hasMove = (s: GameState, x: number, y: number, action: Move['action']) => movesAt(s, x, y).some((m) => m.action === action);

describe('Hopper', () => {
  it('jumps exactly two squares diagonally over pieces and single gaps, not walls', () => {
    const s = make(B({ 3: '....P...', 4: '...O....' }), {}, { terrain: T({ 5: '....._..' }) });
    expect(dests(movesAt(s, 3, 4))).toEqual(['1,2', '1,6', '5,2', '5,6']);
    const walled = make(B({ 4: '...O....' }), {}, { terrain: T({ 3: '....#...' }) });
    expect(dests(movesAt(walled, 3, 4))).not.toContain('5,2');
  });
});

describe('Magnet', () => {
  it('pulls an enemy two squares away one square closer', () => {
    const s = doAction(make(B({ 2: '...r....', 4: '...T....' })), 3, 4, 'pull', 3, 2);
    expect(at(s, 3, 3)?.type).toBe('rook');
  });

  it('cannot pull Kings, large pieces, or anything next to an enemy Anchor', () => {
    expect(hasMove(make(B({ 0: '........', 2: '...k....', 4: '...T....' })), 3, 4, 'pull')).toBe(false);
    expect(hasMove(make(B({ 2: '...rv...', 4: '...T....' })), 3, 4, 'pull')).toBe(false);
  });
});

describe('Pusher', () => {
  it('shoves an adjacent enemy one square away instead of capturing', () => {
    const s = doAction(make(B({ 3: '...r....', 4: '...U....' })), 3, 4, 'shove', 3, 3);
    expect(at(s, 3, 2)?.type).toBe('rook');
    expect(at(s, 3, 4)?.type).toBe('pusher');
  });

  it('fails against a wall, and shoves into a gap make the target fall', () => {
    expect(hasMove(make(B({ 3: '...r....', 4: '...U....' }), {}, { terrain: T({ 2: '...#....' }) }), 3, 4, 'shove')).toBe(false);
    const s = doAction(make(B({ 3: '...r....', 4: '...U....' }), {}, { terrain: T({ 2: '..._....' }) }), 3, 4, 'shove', 3, 3);
    expect(s.pieces.some((p) => p.type === 'rook')).toBe(false);
  });

  it('has 2 HP and moves up to two squares orthogonally', () => {
    const s = make(B({ 4: '...U....' }));
    expect(at(s, 3, 4)?.maxHp).toBe(2);
    expect(dests(movesAt(s, 3, 4).filter((m) => !m.action))).toContain('3,2');
  });
});

describe('Mimic', () => {
  it('moves like an adjacent friendly piece', () => {
    const s = make(B({ 4: '...IR...' }));
    expect(dests(movesAt(s, 3, 4))).toContain('3,0');
  });

  it('steps one square diagonally when alone', () => {
    const s = make(B({ 4: '...I....' }));
    expect(dests(movesAt(s, 3, 4))).toEqual(['2,3', '2,5', '4,3', '4,5']);
  });

  it('copies a Pawn without its double step', () => {
    const s = make(B({ 6: '...IP...' }));
    const d = dests(movesAt(s, 3, 6));
    expect(d).toContain('3,5');
    expect(d).not.toContain('3,4');
  });
});

describe('Anchor', () => {
  it('stops adjacent allies being shoved', () => {
    // The Rook next to the enemy Anchor can't be shoved (the Anchor itself still can).
    const s = make(B({ 3: '...rv...', 4: '...U....' }));
    expect(movesAt(s, 3, 4).some((m) => m.action === 'shove' && m.to.x === 3 && m.to.y === 3)).toBe(false);
    expect(movesAt(make(B({ 3: '...r....', 4: '...U....' })), 3, 4).some((m) => m.action === 'shove')).toBe(true);
    expect(dests(movesAt(make(B({ 4: '...V....' })), 3, 4))).toEqual(['2,3', '2,5', '4,3', '4,5']);
  });
});

describe('Reaper', () => {
  it('damages enemies next to the piece it captures', () => {
    const s = play(make(B({ 4: '...ps...', 6: '.X......' })), 1, 6, 3, 4);
    expect(at(s, 4, 4)?.hp).toBe(1);
  });
});

describe('Bastion', () => {
  it('has 3 HP and gains a shield when it does not act', () => {
    let s = make(B({ 4: '...F....' }));
    expect(at(s, 3, 4)?.maxHp).toBe(3);
    s = wait(s);
    expect(shields(at(s, 3, 4))).toBe(1);
  });
});

describe('Pathfinder', () => {
  it('bridges an adjacent gap once per battle', () => {
    let s = doAction(make(B({ 4: '...Z....' }), {}, { terrain: T({ 4: '...._...', 3: '..._....' }) }), 3, 4, 'bridge', 4, 4);
    expect(s.board.terrain[4][4]).toBe('normal');
    s = wait(s);
    expect(hasMove(s, 3, 4, 'bridge')).toBe(false);
  });
});

describe('Sentinel', () => {
  it('damages the first enemy to stop on its watched line', () => {
    let s = doAction(make(B({ 3: '.......r', 6: '...Y....' })), 3, 6, 'overwatch', 3, 5);
    expect(s.overwatch).toHaveLength(1);
    s = play(s, 7, 3, 3, 3);
    expect(s.pieces.some((p) => p.type === 'rook')).toBe(false);
    expect(s.overwatch).toHaveLength(0);
  });

  it('ends at the start of the Sentinel’s next turn', () => {
    let s = doAction(make(B({ 6: '...Y....' })), 3, 6, 'overwatch', 3, 5);
    s = wait(s);
    expect(s.overwatch).toHaveLength(0);
  });
});

describe('Splitter', () => {
  it('creates a temporary 1 HP copy that cannot split again', () => {
    let s = doAction(make(B({ 4: '...D....' })), 3, 4, 'divide', 4, 3);
    const copy = at(s, 4, 3)!;
    expect(copy.type).toBe('splitter');
    expect(copy.temp).toBeDefined();
    s = wait(s);
    expect(hasMove(s, 4, 3, 'divide')).toBe(false);
    expect(hasMove(s, 3, 4, 'divide')).toBe(false);
  });
});

describe('Jailer', () => {
  it('binds an adjacent enemy so it cannot move next turn', () => {
    const s = doAction(make(B({ 3: '...r....', 4: '...E....' })), 3, 4, 'bind', 3, 3);
    expect(legalMoves(s).some((m) => m.pieceId === at(s, 3, 3)!.id)).toBe(false);
  });

  it('cannot bind a King', () => {
    expect(hasMove(make(B({ 0: '........', 3: '...k....', 4: '...E....' })), 3, 4, 'bind')).toBe(false);
  });
});

describe('Phoenix', () => {
  it('is reborn on a friendly deployment square the first time it is captured', () => {
    let s = make(B({ 3: '...@....', 1: '...r....' }));
    s = wait(s);
    s = play(s, 3, 1, 3, 3);
    expect(s.captured.some((p) => p.type === 'phoenix')).toBe(false);
    expect(s.reborn).toHaveLength(0); // reborn at the start of the player's turn
    const ph = s.pieces.find((p) => p.type === 'phoenix')!;
    expect(ph.pos.y).toBeGreaterThanOrEqual(6);
    expect(ph.used).toContain('rebirth');
  });

  it('is lost for good the second time', () => {
    let s = make(B({ 3: '...@....', 1: '...r....' }));
    s = { ...s, pieces: s.pieces.map((p) => (p.type === 'phoenix' ? { ...p, used: ['rebirth'] } : p)) };
    s = wait(s);
    s = play(s, 3, 1, 3, 3);
    expect(s.captured.some((p) => p.type === 'phoenix')).toBe(true);
  });
});
