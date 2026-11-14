import { footprint } from './pieces';
import { Board, Coord, Piece, Side, Terrain } from './types';

export const inBounds = (board: Board, c: Coord): boolean =>
  c.x >= 0 && c.y >= 0 && c.x < board.width && c.y < board.height;

export const terrainAt = (board: Board, c: Coord): Terrain =>
  inBounds(board, c) ? board.terrain[c.y][c.x] : 'gap';

/** A square a piece can stand on (ignoring other pieces). */
export const isStandable = (board: Board, c: Coord): boolean => terrainAt(board, c) === 'normal';

export const isWall = (board: Board, c: Coord): boolean => {
  const t = terrainAt(board, c);
  return t === 'wall' || t === 'cracked';
};

/** Index pieces by every square they occupy, for fast lookups. */
export function occupancy(pieces: Piece[]): Map<string, Piece> {
  const map = new Map<string, Piece>();
  for (const p of pieces) for (const c of footprint(p)) map.set(`${c.x},${c.y}`, p);
  return map;
}

/**
 * Build a board from rows of characters (top row first):
 *   .  normal     #  solid wall     +  cracked wall     (space) or _  gap
 *   *  normal square that promotes pawns of either side
 *   d  normal square in the player's deployment zone
 */
export function parseBoard(rows: string[]): Board {
  const height = rows.length;
  const width = Math.max(...rows.map((r) => r.length));
  const terrain: Terrain[][] = [];
  const promotionSquares: { side: Side; pos: Coord }[] = [];
  const deployZone: Coord[] = [];
  for (let y = 0; y < height; y++) {
    const row: Terrain[] = [];
    for (let x = 0; x < width; x++) {
      const ch = rows[y][x] ?? ' ';
      if (ch === '#') row.push('wall');
      else if (ch === '+') row.push('cracked');
      else if (ch === ' ' || ch === '_') row.push('gap');
      else {
        row.push('normal');
        if (ch === 'd') deployZone.push({ x, y });
        if (ch === '*') {
          promotionSquares.push({ side: 'player', pos: { x, y } });
          promotionSquares.push({ side: 'enemy', pos: { x, y } });
        }
      }
    }
    terrain.push(row);
  }
  return { width, height, terrain, promotionSquares, deployZone };
}
