/**
 * Zelda Pack special spaces: Locked Doors and Small Keys, Rotation Switches,
 * Floor Masters, Recovery Hearts and Triforce Warps.
 *
 * Tiles sit on normal squares and trigger when a piece ends its own move on
 * one (any square of its footprint). Locked Doors are terrain (`door`).
 */
import { inBounds, isStandable } from './board';
import { ALL_DIRS, add, getPiece, has, heal, immuneToForcedMove, isEmpty, log, nameOf, nearestEmpty, setTerrain } from './core';
import { footprint, sizeOf } from './pieces';
import { Coord, GameState, Move, Piece, Terrain, Tile, sameCoord } from './types';

/** Plies a Floor Master stays inactive after grabbing a piece (3 rounds). */
const FLOOR_MASTER_COOLDOWN = 6;

export const tileAt = (s: GameState, c: Coord): Tile | undefined => (s.tiles ?? []).find((t) => sameCoord(t.pos, c));

/** Unlock: a piece next to a Locked Door steps into it, spending one of its side's Small Keys. */
export function tileMoves(s: GameState, p: Piece): Move[] {
  if (!s.keys?.[p.side] || sizeOf(p) !== 1) return [];
  const out: Move[] = [];
  for (const d of ALL_DIRS) {
    const c = add(p.pos, d);
    if (inBounds(s.board, c) && s.board.terrain[c.y][c.x] === 'door') out.push({ pieceId: p.id, from: p.pos, to: c, action: 'unlock' });
  }
  return out;
}

export function resolveUnlock(s: GameState, m: Move) {
  const p = getPiece(s, m.pieceId);
  if (!p) return;
  if (!setTerrain(s, m.to, 'normal')) return;
  s.keys = { ...s.keys, [p.side]: s.keys[p.side] - 1 };
  p.pos = { ...m.to };
  log(s, `${nameOf(p)} unlocks the door with a Small Key.`);
}

/** After a move: whatever tile the mover landed on takes effect. `from` is where it started. */
export function tilesAfterMove(s: GameState, m: Move, from: Coord | undefined) {
  if (!s.tiles?.length || !from || m.action === 'pass') return;
  const p = getPiece(s, m.pieceId);
  if (!p || sameCoord(p.pos, from)) return;
  const cells = footprint(p);
  const landed = s.tiles.filter((t) => cells.some((c) => sameCoord(c, t.pos)));
  for (const t of landed) {
    if (!s.tiles.includes(t)) continue;
    switch (t.kind) {
      case 'key':
        s.tiles = s.tiles.filter((o) => o !== t);
        s.keys = { ...s.keys, [p.side]: (s.keys?.[p.side] ?? 0) + 1 };
        log(s, `${nameOf(p)} picks up a Small Key.`);
        break;
      case 'heart':
        if (p.hp < p.maxHp) {
          s.tiles = s.tiles.filter((o) => o !== t);
          heal(s, p, 1);
          log(s, `${nameOf(p)} collects a Recovery Heart.`);
        }
        break;
      case 'floorMaster':
        if ((t.readyPly ?? -1) < s.ply && sizeOf(p) === 1 && !immuneToForcedMove(s, p) && !has(p, 'iron_boots')) {
          t.readyPly = s.ply + FLOOR_MASTER_COOLDOWN;
          const home = isEmpty(s, p.startPos) ? p.startPos : nearestEmpty(s, p.startPos, 16);
          if (home) {
            p.pos = { ...home };
            log(s, `A Floor Master drags ${nameOf(p)} back to where it started!`);
          }
        }
        break;
      case 'warp': {
        const other = s.tiles.find((o) => o.kind === 'warp' && o.pair === t.pair && o !== t);
        if (other && sizeOf(p) === 1 && isEmpty(s, other.pos)) {
          p.pos = { ...other.pos };
          log(s, `${nameOf(p)} warps across the board.`);
        }
        break;
      }
      case 'switch':
        rotateTerrain(s);
        break;
    }
    // A warp or Floor Master moved the piece: nothing else on the old square applies.
    if (!footprint(p).some((c) => sameCoord(c, t.pos))) break;
  }
}

/**
 * Rotation Switch: turn the terrain and every special space 90° clockwise
 * around the board's centre. Pieces stay exactly where they are; a piece left
 * on a wall or gap stays put until it moves off. Square boards only.
 */
export function rotateTerrain(s: GameState) {
  const n = s.board.width;
  if (n !== s.board.height) return;
  const turn = (c: Coord): Coord => ({ x: n - 1 - c.y, y: c.x });
  const terrain: Terrain[][] = Array.from({ length: n }, () => Array<Terrain>(n).fill('normal'));
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const to = turn({ x, y });
    terrain[to.y][to.x] = s.board.terrain[y][x];
  }
  s.board = { ...s.board, terrain };
  s.tiles = s.tiles.map((t) => ({ ...t, pos: turn(t.pos) }));
  s.timed = s.timed.map((t) => ({ ...t, pos: turn(t.pos) }));
  s.destroyedWalls = s.destroyedWalls.map(turn);
  s.rotations = (s.rotations ?? 0) + 1;
  log(s, 'The Rotation Switch clicks — the whole board turns!');
}

/** Is a piece stranded on a square it couldn't normally stand on (after a rotation)? */
export const stranded = (s: GameState, p: Piece) => footprint(p).some((c) => !isStandable(s.board, c));
