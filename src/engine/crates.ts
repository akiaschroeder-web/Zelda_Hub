/**
 * Crash Bandicoot Pack crates. Special spaces: TNT (lit by stepping on it,
 * explodes three turns later), Nitro (explodes when a piece lands on it) and
 * Bounce Crates (an extra two-square jump). Upgrades place TNT and Nitro
 * crates too: those sit on cracked-wall squares, block movement, and go off
 * if the wall is smashed.
 *
 * Every explosion deals 1 to everything in the 3×3 around the crate, smashes
 * cracked walls there, and sets off other TNT and Nitro crates it reaches.
 */
import { inBounds, isStandable, terrainAt } from './board';
import { ALL_DIRS, add, dealDamage, destroyCracked, getPiece, isEmpty, log, scale, setTerrain } from './core';
import { footprint, sizeOf } from './pieces';
import { Coord, GameState, Move, Piece, Tile, endOfTurn, sameCoord } from './types';

const EXPLOSIVE = new Set(['tnt', 'nitro', 'tntCrate', 'nitroCrate']);

const around = (s: GameState, c: Coord): Coord[] => [c, ...ALL_DIRS.map((d) => add(c, d))].filter((q) => inBounds(s.board, q));

export function explode(s: GameState, t: Tile) {
  if (!(s.tiles ?? []).includes(t)) return;
  s.tiles = s.tiles.filter((o) => o !== t);
  const c = t.pos;
  if ((t.kind === 'tntCrate' || t.kind === 'nitroCrate') && terrainAt(s.board, c) === 'cracked') setTerrain(s, c, 'normal');
  log(s, t.kind === 'nitro' || t.kind === 'nitroCrate' ? 'Nitro explodes!' : 'TNT explodes!');
  const area = around(s, c);
  const hit = s.pieces.filter((p) => footprint(p).some((f) => area.some((a) => sameCoord(a, f))));
  for (const p of hit) if (getPiece(s, p.id)) dealDamage(s, p.id, 1, { kind: 'ability' });
  for (const a of area) if (terrainAt(s.board, a) === 'cracked') destroyCracked(s, a);
  // Chain reactions.
  for (const o of (s.tiles ?? []).filter((o) => EXPLOSIVE.has(o.kind) && area.some((a) => sameCoord(a, o.pos)))) explode(s, o);
}

/** A cracked wall that was really a placed crate went down: it goes off. */
export function crateSmashed(s: GameState, c: Coord) {
  const t = (s.tiles ?? []).find((o) => (o.kind === 'tntCrate' || o.kind === 'nitroCrate') && sameCoord(o.pos, c));
  if (t) explode(s, t);
}

/** End of a ply: lit TNT whose fuse has run out explodes. */
export function cratesTurnEnd(s: GameState) {
  for (const t of (s.tiles ?? []).filter((t) => EXPLOSIVE.has(t.kind) && t.fuse !== undefined && t.fuse <= s.ply)) explode(s, t);
}

/** A placed Nitro Crate goes off when a piece moves next to it. */
export function nitroProximity(s: GameState, m: Move, from: Coord | undefined) {
  const p = getPiece(s, m.pieceId);
  if (!p || !from || sameCoord(from, p.pos) || !(s.tiles ?? []).some((t) => t.kind === 'nitroCrate')) return;
  const near = (cells: Coord[], c: Coord) => cells.some((f) => Math.max(Math.abs(f.x - c.x), Math.abs(f.y - c.y)) === 1);
  const before = footprint(p, from);
  for (const t of s.tiles.filter((t) => t.kind === 'nitroCrate')) if (near(footprint(p), t.pos) && !near(before, t.pos)) explode(s, t);
}

/** Landing on a crate special space. */
export function applyCrateTile(s: GameState, p: Piece, t: Tile) {
  switch (t.kind) {
    case 'tnt':
      if (t.fuse === undefined) {
        // Three turns of the side that lit it.
        t.fuse = endOfTurn(s.ply, p.side, 3);
        log(s, 'The TNT starts ticking: 3… 2… 1…');
      }
      break;
    case 'nitro':
      explode(s, t);
      break;
    case 'bounce':
      // One bounce per turn; the jump itself is offered as a bonus move.
      if (sizeOf(p) === 1 && p.counters.bouncePly !== s.ply && bounceSquares(s, p).length) {
        p.counters.bouncePly = s.ply;
        s.bonus.unshift({ pieceId: p.id, filter: 'nonCapturing', optional: true, source: 'bounce_crate' });
      }
      break;
  }
}

/** Bounce Crate jumps: exactly two squares in any direction, over anything, onto an empty square. */
export function bounceSquares(s: GameState, p: Piece): Coord[] {
  return ALL_DIRS.map((d) => add(p.pos, scale(d, 2))).filter((c) => isStandable(s.board, c) && isEmpty(s, c));
}
