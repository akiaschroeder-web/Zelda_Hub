import { describe, expect, it } from 'vitest';
import { chooseMove } from '../../engine/ai';
import { applyMove, legalMoves } from '../../engine/moves';
import { GameState } from '../../engine/types';
import { RUN_BATTLES } from '../battles';
import { RUN_CONFIG } from '../config';
import {
  autoDeploy,
  canPlace,
  currentBattle,
  deploymentCost,
  deploymentErrors,
  finishBattle,
  newRun,
  startBattle,
} from '../run';

describe('a new run', () => {
  it('starts with the configured roster and Army Points', () => {
    const run = newRun();
    expect(run.roster.map((r) => r.type)).toEqual(RUN_CONFIG.startingRoster);
    expect(run.armyPoints).toBe(RUN_CONFIG.armyPoints);
    expect(new Set(run.roster.map((r) => r.uid)).size).toBe(run.roster.length);
  });
});

describe('deployment', () => {
  it('auto-deploys a valid army within budget for every battle', () => {
    const run = newRun();
    for (const battle of RUN_BATTLES) {
      const d = autoDeploy(run, battle);
      expect(deploymentErrors(run, battle, d)).toEqual([]);
      expect(deploymentCost(run, d)).toBeLessThanOrEqual(run.armyPoints);
      expect(() => startBattle(run, battle, d)).not.toThrow();
    }
  });

  it('requires the King', () => {
    const run = newRun();
    const battle = RUN_BATTLES[0];
    const d = autoDeploy(run, battle).filter((p) => run.roster.find((r) => r.uid === p.uid)!.type !== 'king');
    expect(deploymentErrors(run, battle, d)).toContain('Your King must take the field.');
  });

  it('rejects going over the Army Point budget', () => {
    const run = { ...newRun(), armyPoints: 5 };
    const battle = RUN_BATTLES[0];
    const king = run.roster.find((r) => r.type === 'king')!;
    const queen = run.roster.find((r) => r.type === 'queen')!;
    const d = [
      { uid: king.uid, x: 3, y: 7 },
      { uid: queen.uid, x: 4, y: 7 },
    ];
    expect(deploymentErrors(run, battle, d).some((e) => e.startsWith('Over budget'))).toBe(true);
  });

  it('only allows squares inside the deployment zone, without overlap', () => {
    const run = newRun();
    const battle = RUN_BATTLES[0]; // zone: row 6 x1-6, row 7 x2-5
    const king = run.roster.find((r) => r.type === 'king')!;
    expect(canPlace(run, battle, [], king.uid, { x: 3, y: 7 })).toBe(true);
    expect(canPlace(run, battle, [], king.uid, { x: 0, y: 7 })).toBe(false);
    expect(canPlace(run, battle, [], king.uid, { x: 3, y: 2 })).toBe(false);
    const rook = run.roster.find((r) => r.type === 'rook')!;
    expect(canPlace(run, battle, [{ uid: king.uid, x: 3, y: 7 }], rook.uid, { x: 3, y: 7 })).toBe(false);
  });

  it('needs a full 2x2 inside the zone for a Juggernaut', () => {
    const run = newRun();
    run.roster.push({ uid: 'jug', type: 'juggernaut', battles: 0 });
    const battle = RUN_BATTLES[0];
    expect(canPlace(run, battle, [], 'jug', { x: 2, y: 6 })).toBe(true); // (2..3, 6..7) all in zone
    expect(canPlace(run, battle, [], 'jug', { x: 1, y: 6 })).toBe(false); // (1,7) not in zone
  });
});

function playOut(state: GameState, maxPlies = 200): GameState {
  let s = state;
  for (let i = 0; i < maxPlies && s.result.kind === 'ongoing'; i++) s = applyMove(s, chooseMove(s, 1, () => 0.5)!);
  return s;
}

describe('after a battle', () => {
  it('permanently removes captured pieces and credits survivors', () => {
    const run = newRun();
    const battle = currentBattle(run)!;
    const deployed = autoDeploy(run, battle);
    let s = startBattle(run, battle, deployed);
    // Fake a finished battle: one deployed pawn was captured, enemy King gone.
    const victim = s.pieces.find((p) => p.side === 'player' && p.type === 'pawn')!;
    s = {
      ...s,
      pieces: s.pieces.filter((p) => p.id !== victim.id && !(p.side === 'enemy' && p.type === 'king')),
      captured: [victim],
      result: { kind: 'checkmate', winner: 'player' },
    };
    const after = finishBattle(run, s);
    expect(after.roster.some((r) => r.uid === victim.id)).toBe(false);
    expect(after.fallen.map((f) => f.uid)).toEqual([victim.id]);
    expect(after.fallen[0].lostIn).toBe(battle.name);
    expect(after.battleIndex).toBe(1);
    expect(after.status).toBe('active');
    const fielded = after.roster.filter((r) => deployed.some((d) => d.uid === r.uid));
    expect(fielded.every((r) => r.battles === 1)).toBe(true);
    const reserve = after.roster.filter((r) => !deployed.some((d) => d.uid === r.uid));
    expect(reserve.length).toBeGreaterThan(0);
    expect(reserve.every((r) => r.battles === 0)).toBe(true);
  });

  it('keeps promotions', () => {
    const run = newRun();
    const battle = currentBattle(run)!;
    let s = startBattle(run, battle, autoDeploy(run, battle));
    const pawn = s.pieces.find((p) => p.side === 'player' && p.type === 'pawn')!;
    s = {
      ...s,
      pieces: s.pieces.map((p) => (p.id === pawn.id ? { ...p, type: 'queen' } : p)),
      result: { kind: 'checkmate', winner: 'player' },
    };
    expect(finishBattle(run, s).roster.find((r) => r.uid === pawn.id)!.type).toBe('queen');
  });

  it('ends the run when the King falls', () => {
    const run = newRun();
    const battle = currentBattle(run)!;
    const s = startBattle(run, battle, autoDeploy(run, battle));
    const after = finishBattle(run, { ...s, result: { kind: 'checkmate', winner: 'enemy' } });
    expect(after.status).toBe('lost');
  });

  it('wins the run after the last battle', () => {
    const run = { ...newRun(), battleIndex: RUN_BATTLES.length - 1 };
    const battle = currentBattle(run)!;
    const s = startBattle(run, battle, autoDeploy(run, battle));
    expect(finishBattle(run, { ...s, result: { kind: 'checkmate', winner: 'player' } }).status).toBe('won');
  });

  it('survives a real AI-vs-AI battle and stays consistent', () => {
    const run = newRun();
    const battle = currentBattle(run)!;
    const final = playOut(startBattle(run, battle, autoDeploy(run, battle)));
    const after = finishBattle(run, final);
    expect(after.roster.length + after.fallen.length).toBe(run.roster.length);
    expect(legalMoves).toBeDefined();
  });
});
