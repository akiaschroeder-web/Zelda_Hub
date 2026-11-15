import { describe, expect, it } from 'vitest';
import { parseBoard, terrainAt } from '../board';
import { addStatus } from '../core';
import { applyMove, legalMoves } from '../moves';
import { createGame, parsePlacements } from '../setup';
import { GameState, Move, PieceType, Side } from '../types';

const EMPTY8 = Array(8).fill('........');

/** Zelda pieces: lower-case letters below are enemy, upper-case player. */
const Z: Record<string, PieceType> = {
  l: 'link', z: 'zelda', m: 'midna', g: 'goron', o: 'zora', r: 'redead', k: 'like_like', d: 'darknut', s: 'skulltula',
};
const LEGEND: Record<string, [PieceType, Side]> = { K: ['king', 'player'], Q: ['king', 'enemy'], P: ['pawn', 'player'], p: ['pawn', 'enemy'], R: ['rook', 'player'], N: ['knight', 'player'], B: ['bishop', 'enemy'] };
// Zelda pieces use digits for the player and symbols for the enemy so they don't clash with chess letters.
const DIGITS = '123456789';
const SYMBOLS = '!$%^*()+=';
Object.values(Z).forEach((t, i) => {
  LEGEND[DIGITS[i]] = [t, 'player'];
  LEGEND[SYMBOLS[i]] = [t, 'enemy'];
});
const code = (t: PieceType, side: Side) => (side === 'player' ? DIGITS : SYMBOLS)[Object.values(Z).indexOf(t)];

function game(rows: string[], terrain: string[] = EMPTY8, turn: Side = 'player'): GameState {
  const s = createGame(parseBoard(terrain), parsePlacements(rows, LEGEND), { checkRules: false });
  s.turn = turn;
  s.ply = turn === 'player' ? 0 : 1;
  return s;
}

const piece = (s: GameState, t: PieceType, side: Side = 'player') => s.pieces.find((p) => p.type === t && p.side === side)!;
const targets = (s: GameState, id: string) =>
  legalMoves(s)
    .filter((m) => m.pieceId === id && !m.action)
    .map((m) => `${m.to.x},${m.to.y}`)
    .sort();
const move = (s: GameState, id: string, x: number, y: number, extra: Partial<Move> = {}) => {
  const m = legalMoves(s).find((m) => m.pieceId === id && m.to.x === x && m.to.y === y && (extra.action ? m.action === extra.action : !m.action));
  if (!m) throw new Error(`no move for ${id} to ${x},${y}`);
  return applyMove(s, m);
};
/** Let the side to move pass with its King shuffling between two squares. */
const kingShuffle = (s: GameState) => {
  const k = s.pieces.find((p) => p.type === 'king' && p.side === s.turn)!;
  const m = legalMoves(s).find((m) => m.pieceId === k.id && !m.action && !m.targets)!;
  return applyMove(s, m);
};
const row = (cells: Record<number, string>, width = 8) => Array.from({ length: width }, (_, x) => cells[x] ?? '.').join('');

describe('Zelda Pack pieces', () => {
  it("Link moves two squares, three at 1 HP (Hero's Courage)", () => {
    const rows = [row({ 7: 'Q' }), ...Array(3).fill('........'), row({ 3: code('link', 'player') }), '........', '........', row({ 0: 'K' })];
    const s = game(rows);
    const link = piece(s, 'link');
    expect(targets(s, link.id)).not.toContain('3,1');
    link.hp = 1;
    expect(targets(s, link.id)).toContain('3,1');
    expect(targets(s, link.id)).toContain('6,7');
  });

  it('Zelda heals an ally within two squares instead of moving, then waits', () => {
    const rows = [row({ 7: 'Q' }), '........', '........', row({ 1: code('goron', 'player') }), '........', row({ 3: code('zelda', 'player') }), '........', row({ 0: 'K' })];
    let s = game(rows);
    const goron = piece(s, 'goron');
    goron.hp = 1;
    s = move(s, piece(s, 'zelda').id, goron.pos.x, goron.pos.y, { action: 'sacredLight' });
    expect(piece(s, 'goron').hp).toBe(2);
    s = kingShuffle(s);
    expect(legalMoves(s).some((m) => m.action === 'sacredLight')).toBe(false);
  });

  it('Midna jumps like a Knight or steps sideways, and every third move passes through a piece', () => {
    const rows = [row({ 7: 'Q' }), '........', '........', '........', row({ 3: 'P', 4: code('midna', 'player') }), '........', '........', row({ 0: 'K' })];
    let s = game(rows);
    const id = piece(s, 'midna').id;
    expect(targets(s, id)).toEqual(['2,3', '2,5', '3,2', '3,6', '5,2', '5,4', '5,6', '6,3', '6,5'].sort());
    s = move(s, id, 5, 4);
    s = kingShuffle(s);
    s = move(s, id, 4, 4);
    s = kingShuffle(s);
    // Third move: the sideways step can pass through the Pawn on 3,4 to 2,4.
    expect(targets(s, id)).toContain('2,4');
  });

  it('a Goron rolling exactly three squares smashes cracked walls on the way', () => {
    const terrain = ['........', '........', '........', '........', '...+....', '........', '........', '........'];
    const rows = [row({ 7: 'Q' }), '........', '........', '........', '........', row({ 3: code('goron', 'player') }), '........', row({ 0: 'K' })];
    let s = game(rows, terrain);
    const id = piece(s, 'goron').id;
    expect(targets(s, id)).toContain('3,2');
    expect(targets(s, id)).not.toContain('3,3'); // only an exact three-square roll breaks through
    s = move(s, id, 3, 2);
    expect(terrainAt(s.board, { x: 3, y: 4 })).toBe('normal');
  });

  it('a Zora dodges its first hit to an adjacent square', () => {
    const rows = [row({ 7: 'Q' }), '........', '........', row({ 3: code('zora', 'enemy') }), '........', '........', row({ 3: 'R' }), row({ 0: 'K' })];
    let s = game(rows);
    const rook = piece(s, 'rook');
    s = move(s, rook.id, 3, 3);
    const zora = piece(s, 'zora', 'enemy');
    expect(zora).toBeTruthy();
    expect(zora.hp).toBe(1);
    expect(zora.pos).not.toEqual({ x: 3, y: 3 });
    expect(piece(s, 'rook').pos).not.toEqual({ x: 3, y: 3 }); // the rook bounced back
  });

  it("a Zora's evasion recharges after it captures", () => {
    const rows = [row({ 7: 'Q' }), '........', '........', '........', row({ 5: 'p' }), '........', row({ 3: code('zora', 'player') }), row({ 0: 'K' })];
    let s = game(rows);
    const zora = piece(s, 'zora');
    zora.counters.evadeSpent = 1;
    s = move(s, zora.id, 5, 4);
    expect(piece(s, 'zora').counters.evadeSpent).toBe(0);
  });

  it("a ReDead's scream paralyzes an enemy that moves next to it", () => {
    const rows = [row({ 7: 'Q' }), '........', row({ 3: code('redead', 'enemy') }), '........', '........', row({ 3: 'R' }), '........', row({ 0: 'K' })];
    let s = game(rows);
    const rook = piece(s, 'rook');
    s = move(s, rook.id, 3, 3);
    expect(piece(s, 'rook').statuses.some((st) => st.kind === 'bound')).toBe(true);
    s = kingShuffle(s); // enemy
    expect(targets(s, rook.id)).toEqual([]);
    s = kingShuffle(s); // player (rook stuck)
    s = kingShuffle(s); // enemy
    expect(targets(s, rook.id).length).toBeGreaterThan(0);
  });

  it('a Like Like swallows its capture, digesting it after two turns', () => {
    const rows = [row({ 7: 'Q' }), '........', '........', row({ 3: 'p' }), '........', row({ 3: code('like_like', 'player') }), '........', row({ 0: 'K' })];
    let s = game(rows);
    const ll = piece(s, 'like_like');
    s = move(s, ll.id, 3, 3);
    expect(s.engulfed).toHaveLength(1);
    expect(s.captured.some((p) => p.type === 'pawn')).toBe(false);
    for (let i = 0; i < 4; i++) s = kingShuffle(s);
    expect(s.engulfed).toHaveLength(0);
    expect(s.captured.some((p) => p.type === 'pawn')).toBe(true);
  });

  it('a fallen Like Like releases its victim', () => {
    const rows = [row({ 7: 'Q' }), row({ 1: 'B' }), '........', row({ 3: 'p' }), '........', row({ 3: code('like_like', 'player') }), '........', row({ 0: 'K' })];
    let s = game(rows);
    const ll = piece(s, 'like_like');
    ll.hp = 1;
    s = move(s, ll.id, 3, 3);
    expect(s.engulfed).toHaveLength(1);
    // The enemy Bishop on 1,1 takes the Like Like on 3,3.
    const bishop = piece(s, 'bishop', 'enemy');
    const take = legalMoves(s).find((m) => m.pieceId === bishop.id && m.targets?.includes(ll.id));
    expect(take).toBeTruthy();
    s = applyMove(s, take!);
    expect(s.engulfed).toHaveLength(0);
    expect(s.pieces.some((p) => p.type === 'pawn' && p.side === 'enemy')).toBe(true);
  });

  it("a Darknut's first hit only breaks its armor, then it reaches three squares", () => {
    const rows = [row({ 7: 'Q' }), '........', '........', row({ 3: code('darknut', 'enemy') }), '........', '........', row({ 3: 'R' }), row({ 0: 'K' })];
    let s = game(rows);
    s = move(s, piece(s, 'rook').id, 3, 3);
    const dk = piece(s, 'darknut', 'enemy');
    expect(dk.hp).toBe(3);
    expect(dk.counters.armorBroken).toBe(1);
    const reach = legalMoves(s).filter((m) => m.pieceId === dk.id && !m.action).map((m) => Math.max(Math.abs(m.to.x - dk.pos.x), Math.abs(m.to.y - dk.pos.y)));
    expect(Math.max(...reach)).toBe(3);
  });

  it('a Skulltula walks onto and through walls but not gaps', () => {
    const terrain = ['........', '........', '........', '.....#..', '........', '....._..', '........', '........'];
    const rows = [row({ 7: 'Q' }), '........', '........', '........', row({ 4: code('skulltula', 'player') }), '........', '........', row({ 0: 'K' })];
    let s = game(rows, terrain);
    const id = piece(s, 'skulltula').id;
    expect(targets(s, id)).toContain('5,3'); // the wall
    expect(targets(s, id)).toContain('6,2'); // and beyond it
    expect(targets(s, id)).not.toContain('5,5'); // the gap
    expect(targets(s, id)).not.toContain('6,6'); // nor past it
    s = move(s, id, 5, 3);
    expect(piece(s, 'skulltula').pos).toEqual({ x: 5, y: 3 });
  });
});

describe('Ganondorf', () => {
  const ganonRows = (extra: Record<number, string> = {}) => [
    row({ 0: 'Q' }),
    row({ 3: 'G' }),
    '........',
    '........',
    row(extra),
    '........',
    '........',
    row({ 7: 'K' }),
  ];
  const ganonGame = (extra?: Record<number, string>) => {
    const legend = { ...LEGEND, G: ['ganondorf', 'enemy'] as [PieceType, Side] };
    const s = createGame(parseBoard(EMPTY8), parsePlacements(ganonRows(extra), legend), { checkRules: false });
    s.turn = 'enemy';
    s.ply = 1;
    return s;
  };

  it('moves up to two squares in any direction and shrugs off paralysis', () => {
    const s = ganonGame();
    const g = piece(s, 'ganondorf', 'enemy');
    const dests = legalMoves(s).filter((m) => m.pieceId === g.id && !m.action).map((m) => `${m.to.x},${m.to.y}`);
    expect(dests).toContain('3,3');
    expect(dests).toContain('5,3');
    expect(dests).toContain('1,1');
    addStatus(g, { kind: 'bound', until: null });
    expect(g.statuses).toHaveLength(0);
  });

  it("Gerudo King: his attack also hits enemies beside his leading edge", () => {
    // Ganondorf (3..4 x 1..2) steps down onto the pawn at 3,3; the pawn at 5,4 is on the front corner of his new footprint.
    const base = ganonGame();
    const extra = createGame(parseBoard(EMPTY8), parsePlacements([...Array(3).fill('........'), row({ 3: 'P' }), row({ 5: 'P' })], LEGEND), { checkRules: false }).pieces;
    let s: GameState = { ...base, pieces: [...base.pieces, ...extra] };
    const g = piece(s, 'ganondorf', 'enemy');
    const atk = legalMoves(s).find((m) => m.pieceId === g.id && m.to.x === 3 && m.to.y === 2 && m.targets?.length)!;
    expect(atk).toBeTruthy();
    s = applyMove(s, atk);
    expect(s.pieces.filter((p) => p.type === 'pawn' && p.side === 'player')).toHaveLength(0);
  });

  it('teleports and blasts adjacent enemies in Phase 2', () => {
    let s = ganonGame({ 3: 'P' });
    const g = piece(s, 'ganondorf', 'enemy');
    g.hp = 2;
    expect(legalMoves(s).some((m) => m.pieceId === g.id && m.action === 'darkWarp')).toBe(true);
    // Step next to the pawn on 3,4 (footprint 3..4, 2..3) and blast it at the end of the turn.
    s = applyMove(s, legalMoves(s).find((m) => m.pieceId === g.id && !m.action && m.to.x === 3 && m.to.y === 2)!);
    expect(s.pieces.some((p) => p.type === 'pawn' && p.side === 'player')).toBe(false);
  });

  it('becomes the 3x3 Demon King at 1 HP when there is room', () => {
    let s = ganonGame();
    const g = piece(s, 'ganondorf', 'enemy');
    g.hp = 1;
    s = applyMove(s, legalMoves(s).find((m) => m.pieceId === g.id && !m.action && m.to.x === 3 && m.to.y === 2)!);
    const ganon = s.pieces.find((p) => p.type === 'ganon')!;
    expect(ganon).toBeTruthy();
  });
});
