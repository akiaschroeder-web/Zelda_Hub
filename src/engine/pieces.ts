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
  /** One-line rules summary shown in the UI. */
  blurb: string;
}

export const PIECE_STATS: Record<PieceType, PieceStats> = {
  pawn: { size: 1, maxHp: 1, damage: 1, cost: 1, value: 100, name: 'Pawn', blurb: 'Advances forward, captures diagonally.' },
  knight: { size: 1, maxHp: 1, damage: 1, cost: 3, value: 300, name: 'Knight', blurb: 'L-shaped jump. Leaps gaps, blocked by walls.' },
  bishop: { size: 1, maxHp: 1, damage: 1, cost: 3, value: 310, name: 'Bishop', blurb: 'Slides diagonally.' },
  rook: { size: 1, maxHp: 1, damage: 1, cost: 5, value: 500, name: 'Rook', blurb: 'Slides orthogonally.' },
  queen: { size: 1, maxHp: 1, damage: 1, cost: 9, value: 900, name: 'Queen', blurb: 'Slides in any direction.' },
  king: { size: 1, maxHp: 1, damage: 1, cost: 0, value: 20000, name: 'King', blurb: 'One square any direction. Lose it and the run ends.' },
  juggernaut: {
    size: 2, maxHp: 3, damage: 1, cost: 12, value: 1100, name: 'Juggernaut',
    blurb: '2×2. One square orthogonally, hits everything under its new footprint.',
  },
  archer: {
    size: 1, maxHp: 1, damage: 1, cost: 4, value: 380, name: 'Archer',
    blurb: 'Steps one square diagonally (no capture). Shoots an enemy exactly 2 squares away orthogonally.',
  },
  guardian: {
    size: 1, maxHp: 2, damage: 1, cost: 5, value: 480, name: 'Guardian',
    blurb: 'One square any direction. Once per battle, takes a hit meant for an adjacent ally (not the King).',
  },
  lancer: {
    size: 1, maxHp: 1, damage: 1, cost: 4, value: 350, name: 'Lancer',
    blurb: 'Leaps exactly 2 or 3 squares orthogonally over pieces and gaps, not walls.',
  },
  siege: {
    size: 1, maxHp: 2, damage: 1, cost: 6, value: 400, name: 'Siege Engine',
    blurb: 'One square orthogonally. Can demolish an adjacent cracked wall instead of moving.',
  },
  mage: {
    size: 1, maxHp: 1, damage: 1, cost: 6, value: 450, name: 'Mage',
    blurb: 'Up to 2 squares diagonally. Once per battle, teleports up to 3 squares away, ignoring everything.',
  },
  switcher: {
    size: 1, maxHp: 1, damage: 1, cost: 5, value: 300, name: 'Switcher',
    blurb: 'One square any direction. Once per battle, swaps places with an ally within 2 squares.',
  },
  chancellor: {
    size: 1, maxHp: 1, damage: 1, cost: 10, value: 850, name: 'Chancellor',
    blurb: 'Moves like a Rook or a Knight.',
  },
  medic: {
    size: 1, maxHp: 1, damage: 1, cost: 5, value: 300, name: 'Medic',
    blurb: 'One square diagonally or sideways. Can heal an adjacent ally 1 HP instead of moving.',
  },
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
