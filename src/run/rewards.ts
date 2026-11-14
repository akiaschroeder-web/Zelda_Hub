import { PIECE_STATS } from '../engine/pieces';
import { PieceType } from '../engine/types';
import { Rng } from './rng';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic';

/** Which pieces can be recruited, by rarity. Kings are never offered. */
export const RECRUIT_POOLS: Record<Rarity, PieceType[]> = {
  common: ['pawn', 'knight', 'bishop', 'lancer', 'archer'],
  uncommon: ['rook', 'guardian', 'medic', 'switcher', 'siege'],
  rare: ['queen', 'mage', 'chancellor'],
  epic: ['juggernaut'],
};

export const rarityOf = (t: PieceType): Rarity =>
  (Object.keys(RECRUIT_POOLS) as Rarity[]).find((r) => RECRUIT_POOLS[r].includes(t)) ?? 'common';

export const RARITY_COLORS: Record<Rarity, string> = {
  common: '#b9b2a6',
  uncommon: '#6fbf73',
  rare: '#5aa0e6',
  epic: '#b57ae0',
};

export type RewardSource = 'battle' | 'elite' | 'boss' | 'treasure' | 'recruit' | 'draw';

const RARITY_ODDS: Record<RewardSource, Partial<Record<Rarity, number>>> = {
  battle: { common: 60, uncommon: 32, rare: 8 },
  draw: { common: 1 },
  elite: { common: 20, uncommon: 45, rare: 28, epic: 7 },
  boss: { uncommon: 30, rare: 50, epic: 20 },
  treasure: { uncommon: 50, rare: 40, epic: 10 },
  recruit: { common: 45, uncommon: 38, rare: 14, epic: 3 },
};

export type RewardOption =
  | { kind: 'piece'; type: PieceType }
  | { kind: 'armyPoints'; amount: number }
  | { kind: 'gold'; amount: number };

export interface PendingReward {
  title: string;
  /** Granted automatically. */
  gold: number;
  armyPoints: number;
  /** Pick one of these (or skip). */
  options: RewardOption[];
}

/** Roll a recruitable piece type. Later acts shift odds upward. */
export function rollPiece(rng: Rng, source: RewardSource, act: number, exclude: PieceType[] = []): PieceType {
  const odds = { ...RARITY_ODDS[source] };
  if (act > 0 && source !== 'draw') {
    odds.common = Math.max(0, (odds.common ?? 0) - 15 * act);
    odds.rare = (odds.rare ?? 0) + 8 * act;
    odds.epic = (odds.epic ?? 0) + 3 * act;
  }
  for (let tries = 0; tries < 20; tries++) {
    const rarity = rng.weighted(odds);
    const t = rng.pick(RECRUIT_POOLS[rarity]);
    if (!exclude.includes(t)) return t;
  }
  return 'pawn';
}

function pieceOptions(rng: Rng, source: RewardSource, act: number, n: number): RewardOption[] {
  const out: PieceType[] = [];
  for (let i = 0; i < n; i++) out.push(rollPiece(rng, source, act, out));
  return out.map((type) => ({ kind: 'piece', type }));
}

export function battleReward(rng: Rng, source: 'battle' | 'elite' | 'boss' | 'draw', act: number, name: string): PendingReward {
  switch (source) {
    case 'draw':
      return { title: `${name}: draw`, gold: 10, armyPoints: 0, options: [] };
    case 'battle': {
      const options = pieceOptions(rng, 'battle', act, 2);
      options.push(rng.chance(0.4) ? { kind: 'armyPoints', amount: 2 } : pieceOptions(rng, 'battle', act, 1)[0]);
      return { title: `${name} defeated`, gold: rng.int(18, 30) + act * 5, armyPoints: 0, options };
    }
    case 'elite':
      return {
        title: `${name} defeated`,
        gold: rng.int(40, 55) + act * 8,
        armyPoints: 0,
        options: [...pieceOptions(rng, 'elite', act, 2), { kind: 'armyPoints', amount: 3 }],
      };
    case 'boss':
      return {
        title: `${name} has fallen!`,
        gold: 90 + act * 20,
        armyPoints: 3,
        options: pieceOptions(rng, 'boss', act, 3),
      };
  }
}

export function treasureReward(rng: Rng, act: number): PendingReward {
  return { title: 'Treasure', gold: rng.int(30, 55) + act * 10, armyPoints: 0, options: pieceOptions(rng, 'treasure', act, 2) };
}

export function recruitReward(rng: Rng, act: number): PendingReward {
  return { title: 'Recruitment', gold: 0, armyPoints: 0, options: pieceOptions(rng, 'recruit', act, 3) };
}

// ---------------------------------------------------------------------------
// Shop
// ---------------------------------------------------------------------------

export interface ShopItem {
  option: RewardOption;
  price: number;
  sold: boolean;
}

const RARITY_PREMIUM: Record<Rarity, number> = { common: 0, uncommon: 10, rare: 25, epic: 45 };

export function piecePrice(t: PieceType): number {
  return 8 + PIECE_STATS[t].cost * 7 + RARITY_PREMIUM[rarityOf(t)];
}

export function generateShop(rng: Rng, act: number): ShopItem[] {
  const pieces: PieceType[] = [];
  for (let i = 0; i < 4; i++) pieces.push(rollPiece(rng, i === 0 ? 'battle' : 'recruit', act, pieces));
  const items: ShopItem[] = pieces.map((type) => ({
    option: { kind: 'piece', type },
    price: Math.round(piecePrice(type) * (0.85 + rng.next() * 0.3)),
    sold: false,
  }));
  items.push({ option: { kind: 'armyPoints', amount: 2 }, price: 55 + act * 15, sold: false });
  return items;
}

export function describeOption(o: RewardOption): string {
  switch (o.kind) {
    case 'piece':
      return PIECE_STATS[o.type].name;
    case 'armyPoints':
      return `+${o.amount} Army Points`;
    case 'gold':
      return `${o.amount} gold`;
  }
}
