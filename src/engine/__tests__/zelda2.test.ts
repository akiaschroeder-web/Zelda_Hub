import { describe, expect, it } from 'vitest';
import { ZELDA_LEGEND } from '../../content/packs';
import { applyMove, legalMoves } from '../moves';
import { at, dests, make, movesAt, play, wait } from './upgradeHelpers';

const opts = (terrain?: string[]) => ({ legend: ZELDA_LEGEND, terrain });
const blank = (rows: Record<number, string>) => Array.from({ length: 8 }, (_, y) => rows[y] ?? '........');

describe('Zelda Pack pieces 11-15', () => {
  it('Malon moves two diagonally or one orthogonally, and heals allies next to her each 3 turns', () => {
    let s = make(['k.......', '........', '........', '........', '...Λ....', '...Μ....', '........', '.......K'], {}, opts());
    expect(dests(movesAt(s, 3, 5))).toEqual(['1,3', '1,7', '2,4', '2,5', '2,6', '3,6', '4,4', '4,5', '4,6', '5,3', '5,7'].sort());
    at(s, 3, 4)!.hp = 1;
    s = wait(s);
    s = wait(s); // the player's next turn starts beside Malon
    expect(at(s, 3, 4)!.hp).toBe(2);
  });

  it('Epona jumps 2x1 and 3x1 over walls and gaps; next to Malon she can also jump 3x2', () => {
    const terrain = blank({ 3: '..###...', 4: '..#.#...', 5: '..###...', 2: '._______' });
    let s = make(['k.......', '........', '........', '........', '...Ε....', '........', '........', '.......K'], {}, opts(terrain));
    const d = dests(movesAt(s, 3, 4));
    expect(d).toContain('1,3'); // 2x1 over walls
    expect(d).toContain('0,5'); // 3x1
    expect(d).not.toContain('0,2'); // 3x2 needs Malon
    let m = make(['k.......', '........', '........', '........', '...Ε....', '...Μ....', '........', '.......K'], {}, opts());
    m = wait(wait(m));
    expect(dests(movesAt(m, 3, 4))).toContain('0,2');
  });

  it('Epona gallops: after a capture, an optional Knight jump to an empty square', () => {
    let s = make(['k.......', '........', '........', '..p.....', '........', '...Ε....', '........', '.......K'], {}, opts());
    s = play(s, 3, 5, 2, 3);
    expect(s.turn).toBe('player');
    const jumps = dests(movesAt(s, 2, 3).filter((m) => !m.action));
    expect(jumps).toContain('0,2');
    expect(jumps).not.toContain('5,2'); // no 3x1 jumps during the gallop
  });

  it('Deku Spit hits the first enemy within 3 in a straight line; pieces block it', () => {
    let s = make(['k.......', '...p....', '........', '........', '...Δ.P.p', '........', '........', '.......K'], {}, opts());
    const spits = movesAt(s, 3, 4).filter((m) => m.action === 'spit');
    expect(spits.map((m) => `${m.to.x},${m.to.y}`)).toEqual(['3,1']); // the pawn on 7,4 is behind a friend
    s = applyMove(s, spits[0]);
    expect(at(s, 3, 1)).toBeUndefined();
  });

  it('a Deku Scrub burrows away once after surviving an attack', () => {
    const s = make(['k.......', '........', '...δ....', '........', '........', '...R....', '........', '.......K'], {}, opts());
    at(s, 3, 2)!.shields.push({ strength: 1, expires: null });
    const after = play(s, 3, 5, 3, 2);
    const scrub = after.pieces.find((p) => p.type === 'deku_scrub')!;
    expect(scrub.pos).not.toEqual({ x: 3, y: 2 });
  });

  it('Lizalfos: Pack Hunter deals 2 next to another Lizalfos; Acrobatic Retreat leaps away when hurt', () => {
    let s = make(['k.......', '........', '........', '...1Λ...', '........', '...Λ....', '........', '.......K'], {}, opts());
    s = play(s, 3, 5, 3, 3);
    expect(s.pieces.some((p) => p.type === 'link')).toBe(false);

    const r = play(make(['k.......', '........', '...λ....', '........', '........', '...R....', '........', '.......K'], {}, opts()), 3, 5, 3, 2);
    const liz = r.pieces.find((p) => p.type === 'lizalfos')!;
    expect(liz.hp).toBe(1);
    expect(Math.abs(liz.pos.x - 3)).toBe(2);
    expect(Math.abs(liz.pos.y - 2)).toBe(2);
  });

  it('a Stalfos collapses into bones and reassembles after 2 of its turns', () => {
    let s = make(['k.......', '........', '...σ....', '........', '........', '...R....', '........', '.......K'], {}, opts());
    at(s, 3, 2)!.hp = 1;
    s = play(s, 3, 5, 3, 2);
    expect(s.bones).toHaveLength(1);
    expect(at(s, 3, 2)).toBeUndefined();
    expect(s.pieces.find((p) => p.type === 'rook')!.pos).not.toEqual({ x: 3, y: 2 }); // the bones block it
    for (let i = 0; i < 4 && s.bones.length; i++) s = wait(s);
    expect(at(s, 3, 2)?.type).toBe('stalfos');
    expect(at(s, 3, 2)?.hp).toBe(1);
  });

  it('stepping on Stalfos bones destroys it for good, and Reassembly works only once', () => {
    let s = make(['k.......', '........', '...σ....', '........', '........', '...R....', '........', '.......K'], {}, opts());
    at(s, 3, 2)!.hp = 1;
    s = play(s, 3, 5, 3, 2);
    s = wait(s);
    const step = legalMoves(s).find((m) => m.pieceId === s.pieces.find((p) => p.type === 'rook')!.id && m.to.x === 3 && m.to.y === 2)!;
    s = applyMove(s, step);
    expect(s.bones).toHaveLength(0);
    expect(s.captured.some((p) => p.type === 'stalfos')).toBe(true);
  });
});
