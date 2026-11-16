/**
 * The Forge: sacrifice pieces or upgrades of one rarity for one of the next
 * rarity up, take an upgrade off a piece to keep it, or put a kept upgrade on.
 *
 * Piece rarities: Common → Uncommon → Rare → Epic → Boss. Upgrade rarities:
 * Common → Uncommon → Rare → Epic → Legendary → Mythical.
 */
import { BOSS_TYPES, EMERALD_FORMS, MASTER_EMERALD_FORMS } from '../engine/pieces';
import { PieceType } from '../engine/types';
import { UPGRADES, UPGRADE_BY_ID, UpgradeRarity } from '../engine/upgrades/catalog';
import { canTake } from '../engine/upgrades/eligibility';
import { enabledPacks } from '../content/packs';
import { BOSS_POOLS } from './battlegen';
import { discounted } from './potions';
import { Rarity, rarityOf, recruitPool } from './rewards';
import { Rng } from './rng';
import { RunState, makeRosterPiece } from './run';

/** What each piece rarity forges into, and how many it takes. */
export const PIECE_RECIPES: Partial<Record<Rarity, { into: Rarity; count: number }>> = {
  common: { into: 'uncommon', count: 3 },
  uncommon: { into: 'rare', count: 3 },
  rare: { into: 'epic', count: 3 },
  epic: { into: 'boss', count: 4 },
};
export const UPGRADE_RECIPES: Partial<Record<UpgradeRarity, { into: UpgradeRarity; count: number }>> = {
  common: { into: 'uncommon', count: 3 },
  uncommon: { into: 'rare', count: 3 },
  rare: { into: 'epic', count: 3 },
  epic: { into: 'legendary', count: 3 },
  legendary: { into: 'mythical', count: 4 },
};

/** Gold to see three results and pick one, instead of one random result. */
export const FORGE_CHOICE_COST = 40;
export const forgeChoiceCost = (run: RunState) => discounted(run, FORGE_CHOICE_COST);

/** Pieces the Forge can turn out at a rarity, from the enabled content. */
function piecePool(run: RunState, rarity: Rarity): PieceType[] {
  if (rarity !== 'boss') return recruitPool(rarity, run.packs);
  const bosses = [...BOSS_POOLS.flat(), ...enabledPacks(run.packs).flatMap((p) => p.bosses.map((b) => b.type))];
  return bosses.filter((t) => BOSS_TYPES.has(t));
}

/** Upgrades the Forge can turn out at a rarity (Mythicals only once per run). */
function upgradePool(run: RunState, rarity: UpgradeRarity): string[] {
  const owned = new Set([...run.roster.flatMap((r) => [...r.upgrades, ...(r.consumed ?? [])]), ...(run.stash ?? [])]);
  return UPGRADES.filter((u) => u.rarity === rarity && !u.excluded && (!u.pack || run.packs.includes(u.pack)))
    .filter((u) => u.rarity !== 'mythical' || !owned.has(u.id))
    .map((u) => u.id);
}

function withRng<T>(run: RunState, fn: (rng: Rng) => T): [T, number] {
  const rng = new Rng(run.rng);
  return [fn(rng), rng.state];
}

/** Forge roster pieces (by uid). With `choose`, pay gold to pick one of three. */
export function forgePieces(run: RunState, uids: string[], choose = false): RunState {
  const pieces = uids.map((u) => run.roster.find((r) => r.uid === u));
  if (pieces.some((p) => !p || p.type === 'king')) throw new Error('Those pieces cannot be forged');
  const rarity = rarityOf(pieces[0]!.type);
  const recipe = PIECE_RECIPES[rarity];
  if (!recipe || pieces.length !== recipe.count || pieces.some((p) => rarityOf(p!.type) !== rarity)) throw new Error('Not a recipe');
  const cost = choose ? forgeChoiceCost(run) : 0;
  if (cost > run.gold) throw new Error('Not enough gold');
  const pool = piecePool(run, recipe.into);
  if (!pool.length) throw new Error('Nothing to forge into');
  const [results, rng] = withRng(run, (r) => (choose ? r.shuffle(pool).slice(0, 3) : [r.pick(pool)]));
  // The ingredients (and anything equipped on them) are gone.
  const next: RunState = { ...run, rng, gold: run.gold - cost, roster: run.roster.filter((r) => !uids.includes(r.uid)) };
  if (choose) return { ...next, forgeOffer: { kind: 'piece', options: results } };
  return { ...next, roster: [...next.roster, makeRosterPiece(results[0] as PieceType)], forgeResult: results[0] };
}

/** Forge upgrades from the stash (by index). With `choose`, pay gold to pick one of three. */
export function forgeUpgrades(run: RunState, indices: number[], choose = false): RunState {
  const stash = run.stash ?? [];
  const ids = indices.map((i) => stash[i]);
  if (ids.some((id) => !id) || new Set(indices).size !== indices.length) throw new Error('Not in the stash');
  const rarity = UPGRADE_BY_ID[ids[0]].rarity;
  const recipe = UPGRADE_RECIPES[rarity];
  if (!recipe || ids.length !== recipe.count || ids.some((id) => UPGRADE_BY_ID[id].rarity !== rarity)) throw new Error('Not a recipe');
  const cost = choose ? forgeChoiceCost(run) : 0;
  if (cost > run.gold) throw new Error('Not enough gold');
  const left = stash.filter((_, i) => !indices.includes(i));
  const pool = upgradePool({ ...run, stash: left }, recipe.into);
  if (!pool.length) throw new Error('Nothing to forge into');
  const [results, rng] = withRng(run, (r) => (choose ? r.shuffle(pool).slice(0, 3) : [r.pick(pool)]));
  const next: RunState = { ...run, rng, gold: run.gold - cost, stash: left };
  if (choose) return { ...next, forgeOffer: { kind: 'upgrade', options: results } };
  return { ...next, stash: [...left, results[0]], forgeResult: results[0] };
}

/** Take one of the paid-for choices. */
export function pickForgeOffer(run: RunState, i: number): RunState {
  const offer = run.forgeOffer;
  if (!offer || !offer.options[i]) throw new Error('No such choice');
  const pick = offer.options[i];
  const base = { ...run, forgeOffer: null, forgeResult: pick };
  if (offer.kind === 'piece') return { ...base, roster: [...run.roster, makeRosterPiece(pick as PieceType)] };
  return { ...base, stash: [...(run.stash ?? []), pick] };
}

/** Take an upgrade off a piece and keep it in the stash. */
export function extractUpgrade(run: RunState, uid: string, id: string): RunState {
  const piece = run.roster.find((r) => r.uid === uid);
  if (!piece || !piece.upgrades.includes(id)) throw new Error('No such upgrade');
  const roster = run.roster.map((r) => (r.uid === uid ? { ...r, upgrades: r.upgrades.filter((u) => u !== id) } : r));
  return { ...run, roster, stash: [...(run.stash ?? []), id] };
}

/** Put a stashed upgrade on a piece (Emeralds transform, as from a reward). */
export function equipFromStash(run: RunState, index: number, uid: string): RunState {
  const id = run.stash?.[index];
  const piece = run.roster.find((r) => r.uid === uid);
  if (!id || !piece || !canTake(id, piece.type, piece.upgrades)) throw new Error('That piece cannot take this upgrade');
  const stash = run.stash.filter((_, i) => i !== index);
  const form = id === 'chaos_emeralds' ? EMERALD_FORMS[piece.type] : id === 'master_emerald' ? MASTER_EMERALD_FORMS[piece.type] : undefined;
  const roster = run.roster.map((r) =>
    r.uid !== uid ? r : form ? { ...r, type: form, consumed: [...(r.consumed ?? []), id] } : { ...r, upgrades: [...r.upgrades, id] },
  );
  return { ...run, stash, roster };
}

/** Back to the map. */
export const leaveForge = (run: RunState): RunState => ({ ...run, phase: 'map', forgeOffer: null, forgeResult: null });
