import { describe, expect, it } from 'vitest';
import { terrainAt } from '../board';
import { applyMove, legalMoves } from '../moves';
import { PieceType, Side } from '../types';
import { at, dests, make, movesAt, play, wait } from './upgradeHelpers';

const L: Record<string, [PieceType, Side]> = { Λ: ['link', 'player'] };
const blank = (rows: Record<number, string>, n = 8) => Array.from({ length: n }, (_, y) => rows[y] ?? '.'.repeat(n));

describe('Zelda Pack special spaces', () => {
  it('a Small Key opens a Locked Door, which blocks until then', () => {
    const terrain = blank({ 3: 'KL......' });
    let s = make(['.......k', '........', '........', '........', '........', '........', 'R.......', '.......K'], {}, { terrain });
    // The door blocks: no Unlock without a key, and nothing passes through it.
    expect(movesAt(s, 0, 6).some((m) => m.action === 'unlock')).toBe(false);
    s = play(s, 0, 6, 0, 3);
    expect(s.keys.player).toBe(1);
    expect(s.tiles.some((t) => t.kind === 'key')).toBe(false);
    s = wait(s);
    expect(dests(movesAt(s, 0, 3).filter((m) => !m.action))).not.toContain('1,3');
    const unlock = movesAt(s, 0, 3).find((m) => m.action === 'unlock')!;
    expect(unlock).toBeTruthy();
    s = applyMove(s, unlock);
    expect(terrainAt(s.board, { x: 1, y: 3 })).toBe('normal');
    expect(at(s, 1, 3)?.type).toBe('rook');
    expect(s.keys.player).toBe(0);
  });

  it('Knights cannot jump past a Locked Door on both sides of the L', () => {
    const terrain = blank({ 4: 'LL......' });
    const s = make(['.......k', '........', '........', '........', '........', 'N.......', '........', '.......K'], {}, { terrain });
    expect(dests(movesAt(s, 0, 5))).not.toContain('1,3');
  });

  it('a Rotation Switch turns the terrain 90° clockwise; pieces stay put', () => {
    const terrain = blank({ 0: '.#......', 3: 'S.......' });
    let s = make(['.......k', '........', '........', '........', '........', '........', 'R.......', '.......K'], {}, { terrain });
    s = play(s, 0, 6, 0, 3);
    expect(s.rotations).toBe(1);
    expect(at(s, 0, 3)?.type).toBe('rook');
    // (x, y) -> (7 - y, x): the wall at (1,0) moves to (7,1); the switch at (0,3) to (4,0).
    expect(terrainAt(s.board, { x: 7, y: 1 })).toBe('wall');
    expect(terrainAt(s.board, { x: 1, y: 0 })).toBe('normal');
    expect(s.tiles.find((t) => t.kind === 'switch')!.pos).toEqual({ x: 4, y: 0 });
  });

  it('a piece left on a wall after a rotation can still move off it', () => {
    // After the turn, the wall at (3,4) lands on (3,3) — right under the Rook.
    const terrain = blank({ 4: '...#....', 6: 'S.......' });
    let s = make(['.......k', '........', '........', '...R....', '........', '........', 'N.......', '.......K'], {}, { terrain });
    s = play(s, 0, 6, 1, 4); // not the switch
    s = wait(s);
    const knight = legalMoves(s).find((m) => m.pieceId === at(s, 1, 4)!.id && m.to.x === 0 && m.to.y === 6)!;
    s = applyMove(s, knight);
    expect(terrainAt(s.board, { x: 3, y: 3 })).toBe('wall');
    s = wait(s);
    expect(movesAt(s, 3, 3).filter((m) => !m.action).length).toBeGreaterThan(0);
  });

  it('a Floor Master drags a piece back to its starting square, then rests', () => {
    const terrain = blank({ 3: 'F.......' });
    let s = make(['.......k', '........', '........', '........', '........', '........', 'R.......', 'R......K'], {}, { terrain });
    s = play(s, 0, 6, 0, 3);
    expect(at(s, 0, 6)?.type).toBe('rook');
    expect(at(s, 0, 3)).toBeUndefined();
    s = wait(s);
    s = play(s, 0, 6, 0, 3); // still resting: this time the rook stays
    expect(at(s, 0, 3)?.type).toBe('rook');
  });

  it('Iron Boots resist the Floor Master', () => {
    const terrain = blank({ 3: 'F.......' });
    let s = make(['.......k', '........', '........', '........', '........', '........', 'R.......', '.......K'], { '0,6': ['iron_boots'] }, { terrain });
    s = play(s, 0, 6, 0, 3);
    expect(at(s, 0, 3)?.type).toBe('rook');
  });

  it('a Recovery Heart heals the first damaged piece and is used up', () => {
    const terrain = blank({ 4: '...H....' });
    let s = make(['.......k', '........', '........', '........', '........', '........', '...Λ....', '.......K'], {}, { terrain, legend: L });
    const link = s.pieces.find((p) => p.type === 'link')!;
    link.hp = 1;
    s = play(s, 3, 6, 3, 4);
    expect(s.pieces.find((p) => p.type === 'link')!.hp).toBe(2);
    expect(s.tiles).toHaveLength(0);
  });

  it('a healthy piece leaves the heart for later', () => {
    const terrain = blank({ 4: '...H....' });
    let s = make(['.......k', '........', '........', '........', '........', '........', '...Λ....', '.......K'], {}, { terrain, legend: L });
    s = play(s, 3, 6, 3, 4);
    expect(s.tiles).toHaveLength(1);
  });

  it('Triforce Warps carry a piece to the linked tile, if it is free', () => {
    const terrain = blank({ 1: '......W.', 4: 'W.......' });
    let s = make(['.......k', '........', '........', '........', '........', '........', 'R.......', '.......K'], {}, { terrain });
    s = play(s, 0, 6, 0, 4);
    expect(at(s, 6, 1)?.type).toBe('rook');

    let blocked = make(['.......k', '......p.', '........', '........', '........', '........', 'R.......', '.......K'], {}, { terrain });
    blocked = play(blocked, 0, 6, 0, 4);
    expect(at(blocked, 0, 4)?.type).toBe('rook');
  });
});
