import type { Bounty } from './bounty';
import { BOSS_TYPES, PIECE_STATS } from '../engine/pieces';
import { PieceType } from '../engine/types';
import { UPGRADES, UPGRADE_BY_ID, UpgradeRarity } from '../engine/upgrades/catalog';
import { canTake } from '../engine/upgrades/eligibility';
import { Rng } from './rng';
import { PACKS, enabledPacks } from '../content/packs';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'boss';

/** Which pieces can be recruited, by rarity. Kings are never offered. */
export const RECRUIT_POOLS: Record<Rarity, PieceType[]> = {
  common: ['pawn', 'knight', 'bishop', 'lancer', 'archer', 'hopper', 'engineer', 'bomber'],
  uncommon: [
    'rook', 'guardian', 'medic', 'switcher', 'siege', 'magnet', 'anchor', 'pathfinder', 'sentinel', 'pusher',
    'illusionist', 'displacer', 'harvester', 'assassin',
  ],
  rare: ['queen', 'mage', 'chancellor', 'mimic', 'reaper', 'splitter', 'jailer', 'bastion', 'summoner', 'oracle', 'clone', 'warden', 'slayer'],
  epic: ['juggernaut', 'phoenix', 'converter'],
  // Boss Pieces are never rolled at random; they're offered only after being defeated.
  boss: [],
};

/** Recruitable pieces of one rarity, including those from enabled content packs. */
export function recruitPool(rarity: Rarity, packs: readonly string[] = []): PieceType[] {
  if (rarity === 'boss') return [];
  return [...RECRUIT_POOLS[rarity], ...enabledPacks(packs).flatMap((p) => p.recruits[rarity] ?? [])];
}

const ALL_PACK_IDS = PACKS.map((p) => p.id);

export const rarityOf = (t: PieceType): Rarity =>
  BOSS_TYPES.has(t) ? 'boss' : ((Object.keys(RECRUIT_POOLS) as Rarity[]).find((r) => recruitPool(r, ALL_PACK_IDS).includes(t)) ?? 'common');

export const RARITY_COLORS: Record<Rarity, string> = {
  common: '#b9b2a6',
  uncommon: '#6fbf73',
  rare: '#5aa0e6',
  epic: '#b57ae0',
  boss: '#f0c040',
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
  | { kind: 'upgrade'; id: string }
  | { kind: 'armyPoints'; amount: number }
  | { kind: 'gold'; amount: number };

/** Roster info needed to offer only upgrades that some piece can take. */
export type RosterView = { type: PieceType; upgrades: string[]; consumed?: string[] }[];

const UPGRADE_ODDS: Record<'battle' | 'elite' | 'boss' | 'treasure' | 'shop' | 'enemy', Partial<Record<UpgradeRarity, number>>> = {
  battle: { common: 40, uncommon: 38, rare: 18, epic: 4 },
  elite: { uncommon: 30, rare: 42, epic: 22, legendary: 6 },
  boss: { rare: 35, epic: 45, legendary: 20, mythical: 4 },
  treasure: { rare: 45, epic: 40, legendary: 15, mythical: 1 },
  shop: { common: 25, uncommon: 35, rare: 28, epic: 10, legendary: 2 },
  enemy: { common: 30, uncommon: 35, rare: 25, epic: 9, legendary: 1 },
};

/** Roll an upgrade that at least one piece in `roster` can take. */
export function rollUpgrade(
  rng: Rng,
  source: keyof typeof UPGRADE_ODDS,
  act: number,
  roster: RosterView,
  exclude: string[] = [],
  packs: readonly string[] = [],
): string | null {
  const odds = { ...UPGRADE_ODDS[source] };
  if (act > 0) {
    odds.common = Math.max(0, (odds.common ?? 0) - 12 * act);
    odds.epic = (odds.epic ?? 0) + 5 * act;
    odds.legendary = (odds.legendary ?? 0) + 2 * act;
  }
  const usable = UPGRADES.filter(
    (u) =>
      !u.excluded &&
      (!u.pack || packs.includes(u.pack)) &&
      !exclude.includes(u.id) &&
      // Each Mythical upgrade exists once per run.
      !(u.rarity === 'mythical' && roster.some((r) => r.upgrades.includes(u.id) || r.consumed?.includes(u.id))) &&
      roster.some((r) => canTake(u.id, r.type, r.upgrades)),
  );
  if (usable.length === 0) return null;
  for (let tries = 0; tries < 12; tries++) {
    const rarity = rng.weighted(odds);
    const pool = usable.filter((u) => u.rarity === rarity);
    if (pool.length) return rng.pick(pool).id;
  }
  return rng.pick(usable).id;
}

function upgradeOptions(
  rng: Rng,
  source: keyof typeof UPGRADE_ODDS,
  act: number,
  roster: RosterView,
  n: number,
  packs: readonly string[] = [],
): RewardOption[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = rollUpgrade(rng, source, act, roster, out, packs);
    if (id) out.push(id);
  }
  return out.map((id) => ({ kind: 'upgrade', id }));
}

export interface PendingReward {
  title: string;
  /** Granted automatically. */
  gold: number;
  armyPoints: number;
  /** Pick one of these (or skip). */
  options: RewardOption[];
  /** What kind of reward this is (for Second Chances rerolls). */
  source?: 'battle' | 'elite' | 'boss' | 'draw' | 'treasure' | 'recruit';
  /** Already rerolled once. */
  rerolled?: boolean;
  /** A bounty this battle paid out (its gold and Army Points are already in the totals above). */
  bounty?: Bounty;
}

/** Roll a recruitable piece type. Later acts shift odds upward. */
export function rollPiece(rng: Rng, source: RewardSource, act: number, exclude: PieceType[] = [], packs: readonly string[] = []): PieceType {
  const odds = { ...RARITY_ODDS[source] };
  if (act > 0 && source !== 'draw') {
    odds.common = Math.max(0, (odds.common ?? 0) - 15 * act);
    odds.rare = (odds.rare ?? 0) + 8 * act;
    odds.epic = (odds.epic ?? 0) + 3 * act;
  }
  for (let tries = 0; tries < 20; tries++) {
    const rarity = rng.weighted(odds);
    const pool = recruitPool(rarity, packs);
    if (!pool.length) continue;
    const t = rng.pick(pool);
    if (!exclude.includes(t)) return t;
  }
  return 'pawn';
}

function pieceOptions(rng: Rng, source: RewardSource, act: number, n: number, packs: readonly string[] = []): RewardOption[] {
  const out: PieceType[] = [];
  for (let i = 0; i < n; i++) out.push(rollPiece(rng, source, act, out, packs));
  return out.map((type) => ({ kind: 'piece', type }));
}

export function battleReward(
  rng: Rng,
  source: 'battle' | 'elite' | 'boss' | 'draw',
  act: number,
  name: string,
  roster: RosterView,
  packs: readonly string[] = [],
): PendingReward {
  switch (source) {
    case 'draw':
      return { title: `${name}: draw`, gold: 10, armyPoints: 0, options: [] };
    case 'battle': {
      const options = pieceOptions(rng, 'battle', act, 1, packs);
      options.push(...upgradeOptions(rng, 'battle', act, roster, 1, packs));
      options.push(rng.chance(0.35) ? { kind: 'armyPoints', amount: 2 } : rng.chance(0.5) ? pieceOptions(rng, 'battle', act, 1, packs)[0] : upgradeOptions(rng, 'battle', act, roster, 1, packs)[0] ?? { kind: 'armyPoints', amount: 2 });
      return { title: `${name} defeated`, gold: rng.int(18, 30) + act * 5, armyPoints: 0, options };
    }
    case 'elite':
      return {
        title: `${name} defeated`,
        gold: rng.int(40, 55) + act * 8,
        armyPoints: 0,
        options: [...pieceOptions(rng, 'elite', act, 1, packs), ...upgradeOptions(rng, 'elite', act, roster, 2, packs), { kind: 'armyPoints', amount: 3 }],
      };
    case 'boss':
      return {
        title: `${name} has fallen!`,
        gold: 90 + act * 20,
        armyPoints: 3,
        options: [...pieceOptions(rng, 'boss', act, 1, packs), ...upgradeOptions(rng, 'boss', act, roster, 2, packs)],
      };
  }
}

export function treasureReward(rng: Rng, act: number, roster: RosterView, packs: readonly string[] = []): PendingReward {
  return {
    title: 'Treasure',
    gold: rng.int(30, 55) + act * 10,
    armyPoints: 0,
    options: [...pieceOptions(rng, 'treasure', act, 1, packs), ...upgradeOptions(rng, 'treasure', act, roster, 2, packs)],
  };
}

export function recruitReward(rng: Rng, act: number, packs: readonly string[] = []): PendingReward {
  return { title: 'Recruitment', gold: 0, armyPoints: 0, options: pieceOptions(rng, 'recruit', act, 3, packs) };
}

// ---------------------------------------------------------------------------
// Shop
// ---------------------------------------------------------------------------

export interface ShopItem {
  option: RewardOption;
  price: number;
  sold: boolean;
}

const RARITY_PREMIUM: Record<Rarity, number> = { common: 0, uncommon: 10, rare: 25, epic: 45, boss: 120 };

export function piecePrice(t: PieceType): number {
  return 8 + PIECE_STATS[t].cost * 7 + RARITY_PREMIUM[rarityOf(t)];
}

const UPGRADE_PRICE: Record<UpgradeRarity, number> = { common: 30, uncommon: 45, rare: 65, epic: 95, legendary: 140, mythical: 250 };

/**
 * Common and uncommon goods are discounted early so a new run can build up:
 * 40% off in act 1, 20% off in act 2, full price in act 3.
 */
export function shopDiscount(rarity: string, act: number): number {
  return rarity === 'common' || rarity === 'uncommon' ? Math.max(0, 0.4 - 0.2 * act) : 0;
}

export function generateShop(rng: Rng, act: number, roster: RosterView = [], packs: readonly string[] = []): ShopItem[] {
  const pieces: PieceType[] = [];
  for (let i = 0; i < 4; i++) pieces.push(rollPiece(rng, i === 0 ? 'battle' : 'recruit', act, pieces, packs));
  const items: ShopItem[] = pieces.map((type) => ({
    option: { kind: 'piece', type },
    price: Math.round(piecePrice(type) * (0.85 + rng.next() * 0.3) * (1 - shopDiscount(rarityOf(type), act))),
    sold: false,
  }));
  for (const o of upgradeOptions(rng, 'shop', act, roster, 2, packs)) {
    if (o.kind !== 'upgrade') continue;
    const rarity = UPGRADE_BY_ID[o.id].rarity;
    const price = UPGRADE_PRICE[rarity] * (1 - shopDiscount(rarity, act));
    items.push({ option: o, price: Math.round(price * (0.9 + rng.next() * 0.2)), sold: false });
  }
  items.push({ option: { kind: 'armyPoints', amount: 2 }, price: 55 + act * 15, sold: false });
  return items;
}

export function describeOption(o: RewardOption): string {
  switch (o.kind) {
    case 'piece':
      return PIECE_STATS[o.type].name;
    case 'upgrade':
      return UPGRADE_BY_ID[o.id]?.name ?? o.id;
    case 'armyPoints':
      return `+${o.amount} Army Points`;
    case 'gold':
      return `${o.amount} gold`;
  }
}
