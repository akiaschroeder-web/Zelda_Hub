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
  hopper: {
    size: 1, maxHp: 1, damage: 1, cost: 3, value: 280, name: 'Hopper',
    blurb: 'Jumps exactly two squares diagonally over the square between. Crosses a single gap; walls block it.',
  },
  magnet: {
    size: 1, maxHp: 1, damage: 1, cost: 5, value: 380, name: 'Magnet',
    blurb: 'One square orthogonally. Instead of moving, pulls an enemy exactly two squares away one square closer (not Kings or large pieces).',
  },
  pusher: {
    size: 1, maxHp: 2, damage: 1, cost: 6, value: 450, name: 'Pusher',
    blurb: 'Up to two squares orthogonally. Instead of capturing, can shove an adjacent enemy one square directly away.',
  },
  mimic: {
    size: 1, maxHp: 1, damage: 1, cost: 7, value: 420, name: 'Mimic',
    blurb: 'Moves like any adjacent friendly 1×1 piece (movement only, not abilities). Alone, it steps one square diagonally.',
  },
  anchor: {
    size: 1, maxHp: 2, damage: 1, cost: 5, value: 380, name: 'Anchor',
    blurb: 'One square diagonally. Adjacent allies cannot be pushed, pulled or forcibly moved by enemy abilities.',
  },
  reaper: {
    size: 1, maxHp: 1, damage: 1, cost: 7, value: 600, name: 'Reaper',
    blurb: 'Up to three squares diagonally. When it captures, enemies next to the captured piece take 1 damage.',
  },
  bastion: {
    size: 1, maxHp: 3, damage: 1, cost: 8, value: 600, name: 'Bastion',
    blurb: 'One square orthogonally. If it neither moves nor acts in your turn, it gains a shield (maximum one).',
  },
  pathfinder: {
    size: 1, maxHp: 1, damage: 1, cost: 5, value: 400, name: 'Pathfinder',
    blurb: 'Up to two squares in any direction. Once per battle, bridges an adjacent gap for three rounds.',
  },
  sentinel: {
    size: 1, maxHp: 1, damage: 1, cost: 6, value: 420, name: 'Sentinel',
    blurb: 'One square orthogonally. Instead of moving, watches a line of up to four squares: the first enemy to stop on it takes 1 damage.',
  },
  splitter: {
    size: 1, maxHp: 1, damage: 1, cost: 6, value: 420, name: 'Splitter',
    blurb: 'Up to two squares diagonally. Once per battle, creates a temporary 1 HP copy of itself on an adjacent square.',
  },
  jailer: {
    size: 1, maxHp: 1, damage: 1, cost: 7, value: 520, name: 'Jailer',
    blurb: 'Up to two squares orthogonally. Instead of moving, binds an adjacent enemy so it cannot move on its next turn.',
  },
  phoenix: {
    size: 1, maxHp: 1, damage: 1, cost: 8, value: 650, name: 'Phoenix',
    blurb: 'Up to three squares orthogonally. The first time it would be captured, it is reborn on a friendly deployment square next turn.',
  },
  decoy: {
    size: 1, maxHp: 1, damage: 0, cost: 0, value: 60, name: 'Decoy',
    blurb: 'A temporary 1 HP decoy. Moves one square; cannot attack.',
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
