/**
 * Bounty Board: choose one of three wanted enemy piece types. The next time
 * you capture a piece of that type in a battle you win, the bounty pays out.
 * One bounty at a time; taking a new one replaces the old.
 */
import { PIECE_STATS } from '../engine/pieces';
import type { GameState, PieceType } from '../engine/types';
import { enemyPieceTypes } from './battlegen';
import { rarityOf, rollUpgrade } from './rewards';
import { Rng } from './rng';
import type { RunState } from './run';

export interface Bounty {
  target: PieceType;
  gold: number;
  armyPoints: number;
  /** An upgrade for the stash (rarer targets). */
  upgrade: string | null;
}

/** Rewards by the target's rarity, before act scaling. */
const PAY: Record<string, { gold: number; armyPoints: number; upgrade: boolean }> = {
  common: { gold: 45, armyPoints: 0, upgrade: false },
  uncommon: { gold: 70, armyPoints: 1, upgrade: false },
  rare: { gold: 95, armyPoints: 1, upgrade: true },
  epic: { gold: 140, armyPoints: 2, upgrade: true },
  boss: { gold: 140, armyPoints: 2, upgrade: true },
};

export function makeBounty(rng: Rng, run: RunState, target: PieceType): Bounty {
  const pay = PAY[rarityOf(target)] ?? PAY.common;
  const upgrade = pay.upgrade ? rollUpgrade(rng, 'elite', run.act, run.roster, [], run.packs) : null;
  return { target, gold: Math.round((pay.gold * (1 + 0.25 * run.act)) / 5) * 5, armyPoints: pay.armyPoints, upgrade: upgrade ?? null };
}

/** Three different wanted pieces, from what enemy armies can field. */
export function generateBountyBoard(rng: Rng, run: RunState): Bounty[] {
  const pool = enemyPieceTypes(run.packs).filter((t) => t !== run.bounty?.target);
  // One cheap, easy-to-find target; the rest anything.
  const cheap = pool.filter((t) => PIECE_STATS[t].cost <= 4);
  const first = rng.pick(cheap.length ? cheap : pool);
  const rest = rng.shuffle(pool.filter((t) => t !== first)).slice(0, 2);
  return [first, ...rest].map((t) => makeBounty(rng, run, t));
}

export function pickBounty(run: RunState, i: number): RunState {
  const b = run.bountyBoard?.[i];
  if (run.phase !== 'bounty' || !b) throw new Error('No such bounty');
  return { ...run, bounty: b, bountyBoard: null, phase: 'map' };
}

export const leaveBountyBoard = (run: RunState): RunState => ({ ...run, bountyBoard: null, phase: 'map' });

/** Did this battle capture the bounty's target? */
export const bountyCaptured = (run: RunState, final: GameState) =>
  !!run.bounty && final.captured.some((p) => p.side === 'enemy' && p.type === run.bounty!.target);

/** A one-line description of what a bounty pays. */
export function bountyPayText(b: Bounty, upgradeName: (id: string) => string): string {
  return [`${b.gold} gold`, b.armyPoints ? `+${b.armyPoints} Army Point${b.armyPoints > 1 ? 's' : ''}` : '', b.upgrade ? upgradeName(b.upgrade) : '']
    .filter(Boolean)
    .join(' · ');
}
