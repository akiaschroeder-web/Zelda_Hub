import { describe, expect, it } from 'vitest';
import { DEFAULT_PACKS } from '../../content/packs';
import { GameState, Piece } from '../../engine/types';
import { generateBattle } from '../battlegen';
import { bountyCaptured, generateBountyBoard, leaveBountyBoard, makeBounty, pickBounty } from '../bounty';
import { Rng } from '../rng';
import { RunState, autoDeploy, claimReward, finishBattle, newRun, startBattle } from '../run';

/** A run standing at a Bounty Board. */
function atBoard(seed = 7): RunState {
  const run = newRun(seed, DEFAULT_PACKS);
  return { ...run, phase: 'bounty', bountyBoard: generateBountyBoard(new Rng(seed), run) };
}

/** Win the current battle, capturing `captured`. */
function win(run: RunState, captured: Piece[]): RunState {
  const s = run.activeBattle!;
  const final: GameState = {
    ...s,
    pieces: s.pieces.filter((p) => !captured.some((c) => c.id === p.id)),
    captured,
    result: { kind: 'checkmate', winner: 'player' },
  };
  return finishBattle(run, final);
}

describe('Bounty Board', () => {
  it('offers three different wanted pieces, never Kings or Pawns', () => {
    for (let seed = 1; seed < 30; seed++) {
      const board = atBoard(seed).bountyBoard!;
      expect(board).toHaveLength(3);
      expect(new Set(board.map((b) => b.target)).size).toBe(3);
      for (const b of board) {
        expect(['king', 'pawn']).not.toContain(b.target);
        expect(b.gold).toBeGreaterThan(0);
      }
    }
  });

  it('choosing a bounty keeps it; leaving keeps the old one', () => {
    const run = atBoard();
    const picked = pickBounty(run, 1);
    expect(picked.bounty).toEqual(run.bountyBoard![1]);
    expect(picked.phase).toBe('map');
    const kept = leaveBountyBoard({ ...picked, phase: 'bounty', bountyBoard: run.bountyBoard });
    expect(kept.bounty).toEqual(run.bountyBoard![1]);
  });

  it('capturing the wanted piece pays the bounty and ends it', () => {
    let run = newRun(21, DEFAULT_PACKS);
    const battle = generateBattle(new Rng(3), 0, 1, 'battle', 'b', [], run.packs);
    const target = battle.enemies.find((e) => e.type !== 'king' && e.type !== 'pawn')!.type;
    const bounty = { ...makeBounty(new Rng(1), run, target), upgrade: 'thick_armor' };
    run = { ...run, phase: 'deploy', battle, bounty };
    run = startBattle(run, autoDeploy(run, battle));
    const victim = run.activeBattle!.pieces.find((p) => p.side === 'enemy' && p.type === target)!;
    const goldBefore = run.gold;
    const after = win(run, [victim]);
    expect(after.bounty).toBeNull();
    expect(after.reward!.bounty).toEqual(bounty);
    expect(after.stash).toContain('thick_armor');
    const paid = claimReward(after, null);
    expect(paid.gold).toBeGreaterThanOrEqual(goldBefore + bounty.gold);
  });

  it('a battle without the wanted piece captured leaves the bounty open', () => {
    let run = newRun(22, DEFAULT_PACKS);
    const battle = generateBattle(new Rng(4), 0, 1, 'battle', 'b', [], run.packs);
    run = { ...run, phase: 'deploy', battle, bounty: makeBounty(new Rng(1), run, 'phoenix') };
    run = startBattle(run, autoDeploy(run, battle));
    const pawn = run.activeBattle!.pieces.find((p) => p.side === 'enemy' && p.type === 'pawn');
    const after = win(run, pawn ? [pawn] : []);
    expect(bountyCaptured(run, { ...run.activeBattle!, captured: pawn ? [pawn] : [] })).toBe(false);
    expect(after.bounty?.target).toBe('phoenix');
    expect(after.reward!.bounty).toBeUndefined();
  });

  it('wanted pieces turn up in enemy armies more often', () => {
    let withBounty = 0;
    let without = 0;
    for (let seed = 1; seed <= 60; seed++) {
      if (generateBattle(new Rng(seed), 0, 2, 'battle', 'b', [], [], 'chancellor').enemies.some((e) => e.type === 'chancellor')) withBounty++;
      if (generateBattle(new Rng(seed), 0, 2, 'battle', 'b', [], []).enemies.some((e) => e.type === 'chancellor')) without++;
    }
    expect(withBounty).toBeGreaterThan(without + 10);
  });
});
