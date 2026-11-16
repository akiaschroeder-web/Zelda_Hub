/**
 * Potion Shop: consumable potions kept in an inventory and used when the
 * player chooses, plus permanent elixirs that apply the moment they're bought.
 */
import type { RunState } from './run';
import { Rng } from './rng';
import { cloneState, heal } from '../engine/core';

/** When a potion can be drunk. */
export type PotionUse = 'deploy' | 'reward' | 'battle';

export interface PotionInfo {
  id: string;
  name: string;
  icon: string;
  text: string;
  use: PotionUse;
  price: number;
}

export const POTIONS: PotionInfo[] = [
  { id: 'free_deployment', name: 'Free Deployment', icon: '🧭', use: 'deploy', price: 60, text: 'Before a battle: deployment costs nothing this battle.' },
  { id: 'expansion', name: 'Expansion', icon: '📜', use: 'deploy', price: 35, text: 'Before a battle: +4 Army Points this battle.' },
  { id: 'reinforcement', name: 'Reinforcement', icon: '🏳️', use: 'deploy', price: 35, text: 'Before a battle: one extra row of deployment squares this battle.' },
  { id: 'fortification', name: 'Fortification', icon: '🛡️', use: 'deploy', price: 40, text: 'Before a battle: every deployed piece blocks the first point of damage it takes.' },
  { id: 'strength', name: 'Strength', icon: '💪', use: 'deploy', price: 40, text: "Before a battle: every deployed piece's first attack deals +1 damage." },
  { id: 'swiftness', name: 'Swiftness', icon: '🪶', use: 'deploy', price: 40, text: 'Before a battle: every deployed piece slides one square further this battle.' },
  { id: 'fortune', name: 'Fortune', icon: '🪙', use: 'deploy', price: 30, text: 'Before a battle: double the gold that battle pays.' },
  { id: 'second_chances', name: 'Second Chances', icon: '🎲', use: 'reward', price: 30, text: 'At a reward screen: reroll the choices once.' },
  { id: 'recovery', name: 'Recovery', icon: '💚', use: 'battle', price: 35, text: 'During a battle (from the ☰ menu, free): heal every one of your pieces by 1.' },
  { id: 'restoration', name: 'Restoration', icon: '💖', use: 'battle', price: 30, text: 'During a battle (from the ☰ menu, free): fully heal one of your pieces.' },
];
export const POTION_BY_ID: Record<string, PotionInfo> = Object.fromEntries(POTIONS.map((p) => [p.id, p]));

export interface ElixirInfo {
  id: string;
  name: string;
  icon: string;
  text: string;
  price: number;
}

/** Permanent upgrades for the whole run; each can be bought once. */
export const ELIXIRS: ElixirInfo[] = [
  { id: 'elixir_ap4', name: 'Elixir of Command', icon: '⚑', price: 120, text: '+4 Army Points for the rest of the run.' },
  { id: 'elixir_ap6', name: 'Grand Elixir of Command', icon: '⚑', price: 170, text: '+6 Army Points for the rest of the run.' },
  { id: 'elixir_rows', name: 'Elixir of Ranks', icon: '🏰', price: 150, text: 'One extra row of deployment squares in every battle.' },
  { id: 'elixir_gold', name: 'Elixir of Plenty', icon: '💰', price: 110, text: 'Battles pay 25% more gold.' },
  { id: 'elixir_bargain', name: "Merchant's Elixir", icon: '🏷️', price: 120, text: 'Shops, potion shops and the Forge cost 15% less.' },
  { id: 'elixir_insight', name: 'Elixir of Insight', icon: '🔮', price: 140, text: 'Rewards from battles and treasure offer one more upgrade to choose from.' },
];
export const ELIXIR_BY_ID: Record<string, ElixirInfo> = Object.fromEntries(ELIXIRS.map((e) => [e.id, e]));

export interface PotionShopItem {
  id: string;
  kind: 'potion' | 'elixir';
  price: number;
  sold: boolean;
}

/** Price after the Merchant's Elixir. */
export const discounted = (run: Pick<RunState, 'elixirs'>, price: number) =>
  Math.round(price * ((run.elixirs ?? []).includes('elixir_bargain') ? 0.85 : 1));

/** Four potions and two elixirs the player doesn't own yet. */
export function generatePotionShop(rng: Rng, run: RunState): PotionShopItem[] {
  const potions = rng.shuffle(POTIONS).slice(0, 4);
  const elixirs = rng.shuffle(ELIXIRS.filter((e) => !(run.elixirs ?? []).includes(e.id))).slice(0, 2);
  return [
    ...potions.map((p) => ({ id: p.id, kind: 'potion' as const, price: discounted(run, p.price), sold: false })),
    ...elixirs.map((e) => ({ id: e.id, kind: 'elixir' as const, price: discounted(run, e.price), sold: false })),
  ];
}

/** Buy item `i`: potions go to the inventory; elixirs apply at once. */
export function buyPotion(run: RunState, i: number): RunState {
  const item = run.potionShop?.[i];
  if (!item || item.sold || item.price > run.gold) throw new Error('Cannot buy that');
  const potionShop = run.potionShop!.map((o, j) => (j === i ? { ...o, sold: true } : o));
  const next: RunState = { ...run, gold: run.gold - item.price, potionShop };
  if (item.kind === 'potion') return { ...next, potions: [...(run.potions ?? []), item.id] };
  const elixirs = [...(run.elixirs ?? []), item.id];
  const ap = item.id === 'elixir_ap4' ? 4 : item.id === 'elixir_ap6' ? 6 : 0;
  return { ...next, elixirs, armyPoints: run.armyPoints + ap };
}

/** Drink a pre-battle potion on the deployment screen: it works for this battle. */
export function usePrebattlePotion(run: RunState, id: string): RunState {
  const i = (run.potions ?? []).indexOf(id);
  if (i < 0 || POTION_BY_ID[id]?.use !== 'deploy' || run.phase !== 'deploy') throw new Error('Cannot use that now');
  if ((run.boosts ?? []).includes(id)) throw new Error('Already active');
  return { ...run, potions: run.potions.filter((_, j) => j !== i), boosts: [...(run.boosts ?? []), id] };
}

/** Take one potion out of the inventory (in-battle and reward potions apply their own effect). */
export function spendPotion(run: RunState, id: string): RunState {
  const i = (run.potions ?? []).indexOf(id);
  if (i < 0) throw new Error('No such potion');
  return { ...run, potions: run.potions.filter((_, j) => j !== i) };
}

/** Extra deployment rows from Reinforcement and the Elixir of Ranks. */
export const extraDeployRows = (run: Pick<RunState, 'boosts' | 'elixirs'>) =>
  ((run.boosts ?? []).includes('reinforcement') ? 1 : 0) + ((run.elixirs ?? []).includes('elixir_rows') ? 1 : 0);

/** Army Points available for the coming battle. */
export const battleArmyPoints = (run: Pick<RunState, 'armyPoints' | 'boosts'>) =>
  run.armyPoints + ((run.boosts ?? []).includes('expansion') ? 4 : 0);

/** Gold multiplier for the battle just fought. */
export const goldMultiplier = (run: Pick<RunState, 'boosts' | 'elixirs'>) =>
  ((run.boosts ?? []).includes('fortune') ? 2 : 1) * ((run.elixirs ?? []).includes('elixir_gold') ? 1.25 : 1);

/**
 * Drink Recovery (heal every player piece by 1) or Restoration (fully heal
 * `pieceId`) in the middle of the current battle. Costs no move.
 */
export function drinkBattlePotion(run: RunState, id: 'recovery' | 'restoration', pieceId?: string): RunState {
  if (run.phase !== 'battle' || !run.activeBattle) throw new Error('Not in a battle');
  const s = cloneState(run.activeBattle);
  const mine = s.pieces.filter((p) => p.side === 'player' && p.hp < p.maxHp);
  if (id === 'recovery') {
    if (!mine.length) throw new Error('Nobody is hurt');
    mine.forEach((p) => heal(s, p, 1));
  } else {
    const p = mine.find((q) => q.id === pieceId);
    if (!p) throw new Error('That piece is not hurt');
    heal(s, p, p.maxHp);
  }
  return { ...spendPotion(run, id), activeBattle: s };
}
