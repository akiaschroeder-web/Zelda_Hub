import { Coord, Piece, PieceType } from './types';

export interface PieceStats {
  /** Footprint is size x size squares; pos is the top-left square. */
  size: number;
  maxHp: number;
  /** Damage dealt per successful hit. */
  damage: number;
  /** Army Point deployment cost (King is special: 0). */
  cost: number;
  /** AI evaluation weight (centipawns at full HP). */
  value: number;
  /** Display name. */
  name: string;
}

export const PIECE_STATS: Record<PieceType, PieceStats> = {
  pawn: { size: 1, maxHp: 1, damage: 1, cost: 1, value: 100, name: 'Pawn' },
  knight: { size: 1, maxHp: 1, damage: 1, cost: 3, value: 300, name: 'Knight' },
  bishop: { size: 1, maxHp: 1, damage: 1, cost: 3, value: 310, name: 'Bishop' },
  rook: { size: 1, maxHp: 1, damage: 1, cost: 5, value: 500, name: 'Rook' },
  queen: { size: 1, maxHp: 1, damage: 1, cost: 9, value: 900, name: 'Queen' },
  king: { size: 1, maxHp: 1, damage: 1, cost: 0, value: 20000, name: 'King' },
  juggernaut: { size: 2, maxHp: 3, damage: 1, cost: 12, value: 1100, name: 'Juggernaut' },
};

export const sizeOf = (p: Piece): number => PIECE_STATS[p.type].size;

/** Every square a piece occupies. */
export function footprint(p: Piece, at: Coord = p.pos): Coord[] {
  const s = sizeOf(p);
  if (s === 1) return [at];
  const out: Coord[] = [];
  for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) out.push({ x: at.x + dx, y: at.y + dy });
  return out;
}
