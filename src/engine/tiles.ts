/**
 * Zelda Pack special spaces: Locked Doors and Small Keys, Rotation Switches,
 * Floor Masters, Recovery Hearts and Triforce Warps.
 *
 * Tiles sit on normal squares and trigger when a piece ends its own move on
 * one (any square of its footprint). Locked Doors are terrain (`door`).
 */
import { inBounds, isStandable } from './board';
import {
  ALL_DIRS,
  add,
  addShield,
  addStatus,
  dealDamage,
  getPiece,
  has,
  heal,
  immuneToForcedMove,
  isEmpty,
  log,
  nameOf,
  nearestEmpty,
  pieceAt,
  scale,
  setTerrain,
} from './core';
import { PIECE_STATS, footprint, sizeOf } from './pieces';
import { applyCrateTile } from './crates';
import { applyMarioTile } from './marioSpaces';
import { Coord, GameState, Move, Piece, Terrain, Tile, endOfTurn, sameCoord } from './types';

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

/**
 * After a move: whatever tile the mover landed on takes effect. A Spring or
 * Dash Panel that carries the piece onto another tile sets that one off too
 * (each tile at most once per move). Then any Crumbling Platform left empty
 * since the move began collapses. `before` is the state before the move.
 */
export function tilesAfterMove(s: GameState, m: Move, from: Coord | undefined, before?: GameState) {
  if (!s.tiles?.length || !from || m.action === 'pass') return;
  const p = getPiece(s, m.pieceId);
  if (p && !sameCoord(p.pos, from)) {
    const triggered = new Set<Tile>();
    for (let hop = 0; hop < 6; hop++) {
      const cells = footprint(p);
      const landed = s.tiles.filter((t) => !triggered.has(t) && cells.some((c) => sameCoord(c, t.pos)));
      if (!landed.length) break;
      const at = { ...p.pos };
      let chained = false;
      for (const t of landed) {
        if (!s.tiles.includes(t)) continue;
        triggered.add(t);
        chained = applyTile(s, p, t, triggered);
        if (!getPiece(s, p.id) || !sameCoord(p.pos, at)) break;
      }
      if (!chained || !getPiece(s, p.id) || sameCoord(p.pos, at)) break;
    }
  }
  if (before && before.rotations === s.rotations) collapseVacated(s, before);
}

/** Crumbling Platforms that held a piece before the move and are empty now become gaps. */
function collapseVacated(s: GameState, before: GameState) {
  for (const t of s.tiles.filter((t) => t.kind === 'crumble')) {
    if (!pieceAt(before, t.pos) || pieceAt(s, t.pos)) continue;
    s.tiles = s.tiles.filter((o) => o !== t);
    setTerrain(s, t.pos, 'gap');
    log(s, 'The platform crumbles away!');
  }
}

/** Apply one tile to the piece standing on it. Returns true if a Spring/Dash Panel moved it on. */
function applyTile(s: GameState, p: Piece, t: Tile, triggered: Set<Tile>): boolean {
  switch (t.kind) {
    case 'key':
      s.tiles = s.tiles.filter((o) => o !== t);
      s.keys = { ...s.keys, [p.side]: (s.keys?.[p.side] ?? 0) + 1 };
      log(s, `${nameOf(p)} picks up a Small Key.`);
      return false;
    case 'heart':
      if (p.hp < p.maxHp) {
        s.tiles = s.tiles.filter((o) => o !== t);
        heal(s, p, 1);
        log(s, `${nameOf(p)} collects a Recovery Heart.`);
      }
      return false;
    case 'floorMaster':
      if ((t.readyPly ?? -1) < s.ply && sizeOf(p) === 1 && !immuneToForcedMove(s, p) && !has(p, 'iron_boots')) {
        t.readyPly = s.ply + FLOOR_MASTER_COOLDOWN;
        const home = isEmpty(s, p.startPos) ? p.startPos : nearestEmpty(s, p.startPos, 16);
        if (home) {
          p.pos = { ...home };
          log(s, `A Floor Master drags ${nameOf(p)} back to where it started!`);
        }
      }
      return false;
    case 'warp': {
      const other = s.tiles.find((o) => o.kind === 'warp' && o.pair === t.pair && o !== t);
      if (other && sizeOf(p) === 1 && isEmpty(s, other.pos)) {
        triggered.add(other); // arriving doesn't warp straight back
        p.pos = { ...other.pos };
        log(s, `${nameOf(p)} warps across the board.`);
      }
      return false;
    }
    case 'switch':
      rotateTerrain(s);
      return false;
    case 'tnt':
    case 'nitro':
    case 'bounce':
      applyCrateTile(s, p, t);
      return false;
    case 'note':
    case 'lava':
    case 'donut':
      applyMarioTile(s, p, t);
      return false;
    case 'spring': {
      // Exactly 3 squares, over anything. An enemy there takes 1 and the piece stays put.
      if (sizeOf(p) !== 1 || !t.dir) return false;
      const to = add(p.pos, scale(t.dir, 3));
      if (!isStandable(s.board, to)) return false;
      const o = pieceAt(s, to);
      if (o && o.side === p.side) return false;
      if (o) {
        log(s, `${nameOf(p)} springs into ${nameOf(o)}!`);
        dealDamage(s, o.id, 1, { sourceId: p.id, kind: 'collision' });
        return false;
      }
      p.pos = to;
      log(s, `${nameOf(p)} is launched by a Spring!`);
      return true;
    }
    case 'dash': {
      // Up to 3 squares along the board, stopping at obstacles; an enemy in the way is attacked.
      if (sizeOf(p) !== 1 || !t.dir) return false;
      let last = p.pos;
      for (let k = 1; k <= 3; k++) {
        const c = add(p.pos, scale(t.dir, k));
        if (!isStandable(s.board, c)) break;
        const o = pieceAt(s, c);
        if (o && o.side === p.side) break;
        if (o) {
          const out = dealDamage(s, o.id, PIECE_STATS[p.type].damage, { sourceId: p.id, kind: 'attack' });
          if (out.kind === 'captured') last = c;
          break;
        }
        last = c;
      }
      if (sameCoord(last, p.pos)) return false;
      p.pos = { ...last };
      log(s, `${nameOf(p)} zooms along a Dash Panel!`);
      return true;
    }
    case 'monitor': {
      s.tiles = s.tiles.filter((o) => o !== t);
      // A fixed pseudo-random pick, so replays and the AI agree.
      const roll = Math.abs((s.ply * 31 + t.pos.x * 7 + t.pos.y * 13 + p.id.length * 17) % 4);
      if (roll === 0) {
        addStatus(p, { kind: 'rangeBuff', amount: 1, until: endOfTurn(s.ply, p.side, 3), source: 'monitor' });
        log(s, `${nameOf(p)} breaks a monitor: Speed Shoes!`);
      } else if (roll === 1) {
        addShield(s, p, 1, true);
        log(s, `${nameOf(p)} breaks a monitor: Shield!`);
      } else if (roll === 2) {
        addStatus(p, { kind: 'damageBuff', amount: 1, until: null, source: 'monitor' });
        log(s, `${nameOf(p)} breaks a monitor: Power Boost!`);
      } else {
        heal(s, p, 1);
        log(s, `${nameOf(p)} breaks a monitor: Recovery!`);
      }
      return false;
    }
    case 'starPost':
      if (!t.claimedBy) {
        t.claimedBy = p.id;
        log(s, `${nameOf(p)} touches the Star Post!`);
      }
      return false;
    case 'crumble':
      return false;
  }
  return false;
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
  // Springs and Dash Panels turn with the board: (dx, dy) -> (-dy, dx).
  s.tiles = s.tiles.map((t) => ({ ...t, pos: turn(t.pos), ...(t.dir ? { dir: { x: 0 - t.dir.y + 0, y: t.dir.x + 0 } } : {}) }));
  s.timed = s.timed.map((t) => ({ ...t, pos: turn(t.pos) }));
  s.destroyedWalls = s.destroyedWalls.map(turn);
  s.rotations = (s.rotations ?? 0) + 1;
  log(s, 'The Rotation Switch clicks — the whole board turns!');
}

/** Is a piece stranded on a square it couldn't normally stand on (after a rotation)? */
export const stranded = (s: GameState, p: Piece) => footprint(p).some((c) => !isStandable(s.board, c));
