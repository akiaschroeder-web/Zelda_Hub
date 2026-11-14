import { describe, expect, it } from 'vitest';
import { chooseMove } from '../../engine/ai';
import { applyMove } from '../../engine/moves';
import { GameState } from '../../engine/types';
import { covers } from '../../engine/__tests__/upgradeHelpers';
import { bossBattle, enemyUpgradeCount, generateBattle } from '../battlegen';
import { RUN_CONFIG } from '../config';
import { EVENTS } from '../events';
import { FLOORS_PER_ACT, generateAct } from '../map';
import { Rng } from '../rng';
import {
  ACTS,
  RunState,
  autoDeploy,
  availableNodes,
  buy,
  canPlace,
  chooseEventOption,
  claimReward,
  currentEvent,
  deploymentCost,
  deploymentErrors,
  enterNode,
  finishBattle,
  leaveEvent,
  leaveShop,
  newRun,
  startBattle,
  upgradeTargets,
  costOf,
  livingFortressBonus,
} from '../run';

describe('a new run', () => {
  it('starts with the configured roster, Army Points and gold, on the map', () => {
    const run = newRun(1);
    expect(run.roster.map((r) => r.type)).toEqual(RUN_CONFIG.startingRoster);
    expect(run.armyPoints).toBe(RUN_CONFIG.armyPoints);
    expect(run.gold).toBe(RUN_CONFIG.startingGold);
    expect(run.phase).toBe('map');
    expect(run.maps).toHaveLength(ACTS);
    expect(new Set(run.roster.map((r) => r.uid)).size).toBe(run.roster.length);
  });

  it('is reproducible from its seed', () => {
    expect(JSON.stringify(newRun(42).maps)).toBe(JSON.stringify(newRun(42).maps));
    expect(JSON.stringify(newRun(42).maps)).not.toBe(JSON.stringify(newRun(43).maps));
  });
});

describe('map generation', () => {
  it('builds connected acts that always lead to a single boss', () => {
    for (let seed = 0; seed < 50; seed++) {
      const rng = new Rng(seed);
      const act = generateAct(rng, 0);
      expect(act.floors).toHaveLength(FLOORS_PER_ACT + 1);
      expect(act.floors[FLOORS_PER_ACT]).toHaveLength(1);
      expect(act.floors[FLOORS_PER_ACT][0].type).toBe('boss');
      expect(act.floors[0].every((n) => n.type === 'battle')).toBe(true);
      for (let f = 0; f < FLOORS_PER_ACT; f++) {
        const next = new Set(act.floors[f + 1].map((n) => n.id));
        for (const n of act.floors[f]) {
          expect(n.next.length).toBeGreaterThan(0);
          n.next.forEach((id) => expect(next.has(id)).toBe(true));
        }
        // every node on the next floor has a way in
        for (const n of act.floors[f + 1]) expect(act.floors[f].some((p) => p.next.includes(n.id))).toBe(true);
      }
      expect(act.floors[1].some((n) => n.type === 'elite')).toBe(false);
    }
  });
});

describe('battle generation', () => {
  it('produces valid battles that the default deployment can start', () => {
    const run = newRun(5);
    for (let seed = 0; seed < 120; seed++) {
      const rng = new Rng(seed);
      const act = seed % 3;
      const battle = generateBattle(rng, act, seed % FLOORS_PER_ACT, seed % 4 === 0 ? 'elite' : 'battle', `b${seed}`);
      expect(battle.enemies.filter((e) => e.type === 'king')).toHaveLength(1);
      const deployed = autoDeploy(run, battle);
      const errors = deploymentErrors(run, battle, deployed);
      // The only acceptable auto-deploy problem is accidentally attacking the King (rare; the player fixes it).
      expect(errors.filter((e) => !e.includes('attacks the enemy King'))).toEqual([]);
    }
  });

  it('has a valid boss for every act', () => {
    const run = newRun(5);
    for (let act = 0; act < ACTS; act++) {
      const boss = bossBattle(act, 'boss');
      expect(boss.kind).toBe('boss');
      expect(deploymentErrors(run, boss, autoDeploy(run, boss))).toEqual([]);
    }
  });
});

describe('deployment', () => {
  const battleRun = () => {
    const run = newRun(7);
    return enterNode(run, availableNodes(run)[0].id);
  };

  it('requires the King and respects the Army Point budget', () => {
    const run = battleRun();
    const battle = run.battle!;
    const d = autoDeploy(run, battle);
    expect(deploymentCost(run, d)).toBeLessThanOrEqual(run.armyPoints);
    const noKing = d.filter((p) => run.roster.find((r) => r.uid === p.uid)!.type !== 'king');
    expect(deploymentErrors(run, battle, noKing)).toContain('Your King must take the field.');
    const poor = { ...run, armyPoints: 2 };
    expect(deploymentErrors(poor, battle, d).some((e) => e.startsWith('Over budget'))).toBe(true);
  });

  it('only allows squares inside the deployment zone', () => {
    const run = battleRun();
    const king = run.roster.find((r) => r.type === 'king')!;
    expect(canPlace(run, run.battle!, [], king.uid, { x: 0, y: 0 })).toBe(false);
  });
});

describe('nodes and rewards', () => {
  it('only lets you enter reachable nodes', () => {
    const run = newRun(3);
    const far = run.maps[0].floors[3][0];
    expect(() => enterNode(run, far.id)).toThrow();
  });

  it('battle rewards add gold and the chosen piece', () => {
    let run = newRun(11);
    run = enterNode(run, availableNodes(run)[0].id);
    run = startBattle(run, autoDeploy(run, run.battle!));
    const final: GameState = {
      ...run.activeBattle!,
      pieces: run.activeBattle!.pieces.filter((p) => !(p.side === 'enemy' && p.type === 'king')),
      result: { kind: 'checkmate', winner: 'player' },
    };
    run = finishBattle(run, final);
    expect(run.phase).toBe('reward');
    const gold = run.gold + run.reward!.gold;
    const option = run.reward!.options[0];
    const size = run.roster.length;
    run = claimReward(run, 0);
    expect(run.phase).toBe('map');
    expect(run.gold).toBe(gold);
    expect(run.roster.length).toBe(option.kind === 'piece' ? size + 1 : size);
  });

  it('losses are permanent and losing the King ends the run', () => {
    let run = newRun(12);
    run = enterNode(run, availableNodes(run)[0].id);
    run = startBattle(run, autoDeploy(run, run.battle!));
    const pawn = run.activeBattle!.pieces.find((p) => p.side === 'player' && p.type === 'pawn')!;
    const won = finishBattle(run, {
      ...run.activeBattle!,
      pieces: run.activeBattle!.pieces.filter((p) => p.id !== pawn.id),
      captured: [pawn],
      result: { kind: 'checkmate', winner: 'player' },
    });
    expect(won.roster.some((r) => r.uid === pawn.id)).toBe(false);
    expect(won.fallen.map((f) => f.uid)).toEqual([pawn.id]);
    const lost = finishBattle(run, { ...run.activeBattle!, result: { kind: 'checkmate', winner: 'enemy' } });
    expect(lost.status).toBe('lost');
  });

  it('every event choice applies cleanly', () => {
    for (const ev of EVENTS) {
      ev.choices.forEach((c, i) => {
        const run: RunState = { ...newRun(9), gold: 200, phase: 'event', event: { id: ev.id, outcome: null } };
        if (c.available && !c.available(run)) return;
        const after = chooseEventOption(run, i);
        expect(after.event?.outcome).toBeTruthy();
        expect(after.roster.some((r) => r.type === 'king')).toBe(true);
        expect(after.gold).toBeGreaterThanOrEqual(0);
      });
    }
  });
});

/** Play a whole run with simple random decisions and AI-vs-AI battles. */
function simulateRun(seed: number): RunState {
  let run = newRun(seed);
  const rng = new Rng(seed * 7 + 1);
  for (let step = 0; step < 200 && run.status === 'active'; step++) {
    switch (run.phase) {
      case 'map':
        run = enterNode(run, rng.pick(availableNodes(run)).id);
        break;
      case 'deploy': {
        let d = autoDeploy(run, run.battle!);
        // If the default setup attacks the King, drop pieces until it doesn't.
        while (deploymentErrors(run, run.battle!, d).length && d.length > 1) d = d.slice(0, -1);
        run = startBattle(run, d);
        break;
      }
      case 'battle': {
        let s = run.activeBattle!;
        for (let ply = 0; ply < 120 && s.result.kind === 'ongoing'; ply++) s = applyMove(s, chooseMove(s, 1, () => rng.next())!);
        if (s.result.kind === 'ongoing') s = { ...s, result: { kind: 'draw', reason: 'fiftyMove' } };
        run = finishBattle(run, s);
        break;
      }
      case 'reward': {
        // Pick a random reward; upgrades go to a random piece that can take them.
        const opts = run.reward!.options;
        const i = opts.length ? Math.floor(rng.next() * opts.length) : -1;
        const o = opts[i];
        const target = o?.kind === 'upgrade' ? rng.pick(upgradeTargets(run, o.id))?.uid : undefined;
        run = claimReward(run, o && (o.kind !== 'upgrade' || target) ? i : null, target);
        break;
      }
      case 'shop': {
        const affordable = run.shop!.map((it, i) => ({ it, i })).filter(({ it }) => !it.sold && it.price <= run.gold);
        const pick = affordable.length ? rng.pick(affordable) : undefined;
        if (pick) {
          const o = pick.it.option;
          const target = o.kind === 'upgrade' ? upgradeTargets(run, o.id)[0]?.uid : undefined;
          if (o.kind !== 'upgrade' || target) run = buy(run, pick.i, target);
        }
        run = leaveShop(run);
        break;
      }
      case 'event': {
        const ev = currentEvent(run)!;
        const i = ev.choices.findIndex((c) => !c.available || c.available(run));
        run = leaveEvent(chooseEventOption(run, i));
        break;
      }
    }
  }
  return run;
}

describe('upgrades in a run', () => {
  const withReward = (option: { kind: 'upgrade'; id: string }): RunState => ({
    ...newRun(21),
    phase: 'reward',
    reward: { title: 't', gold: 0, armyPoints: 0, options: [option] },
  });

  it('upgrade rewards attach to an eligible roster piece', () => {
    const run = withReward({ kind: 'upgrade', id: 'thick_armor' });
    const rook = run.roster.find((r) => r.type === 'rook')!;
    const after = claimReward(run, 0, rook.uid);
    expect(after.roster.find((r) => r.uid === rook.uid)!.upgrades).toEqual(['thick_armor']);
    const pawn = run.roster.find((r) => r.type === 'pawn')!;
    expect(() => claimReward(withReward({ kind: 'upgrade', id: 'diagonal_pivot' }), 0, pawn.uid)).toThrow();
  });

  it('upgrades raise a piece’s deployment cost by rarity', () => {
    expect(costOf({ type: 'rook', upgrades: [] })).toBe(5);
    expect(costOf({ type: 'rook', upgrades: ['thick_armor', 'perfect_strike'] })).toBe(5 + 1 + 3);
  });

  it('Living Fortress grows with battles survived', () => {
    covers('living_fortress');
    const r = { uid: 'x', type: 'rook' as const, battles: 7, upgrades: ['living_fortress'] };
    expect(livingFortressBonus(r)).toBe(2);
    expect(livingFortressBonus({ ...r, battles: 20 })).toBe(3);
    let run = newRun(31);
    const rook = run.roster.find((p) => p.type === 'rook')!;
    run = { ...run, roster: run.roster.map((p) => (p.uid === rook.uid ? { ...p, battles: 6, upgrades: ['living_fortress'] } : p)) };
    run = enterNode(run, availableNodes(run)[0].id);
    run = startBattle(run, autoDeploy(run, run.battle!));
    const fielded = run.activeBattle!.pieces.find((p) => p.id === rook.uid);
    if (fielded) expect(fielded.maxHp).toBe(3);
  });

  it('Second Life returns a captured piece once, spending the upgrade', () => {
    let run = newRun(41);
    const pawn = run.roster.find((p) => p.type === 'pawn')!;
    run = { ...run, roster: run.roster.map((p) => (p.uid === pawn.uid ? { ...p, upgrades: ['second_life'] } : p)) };
    run = enterNode(run, availableNodes(run)[0].id);
    run = startBattle(run, [{ uid: run.roster.find((r) => r.type === 'king')!.uid, x: 3, y: 7 }, ...autoDeploy(run, run.battle!).filter((d) => d.uid !== run.roster.find((r) => r.type === 'king')!.uid)]);
    const fielded = run.activeBattle!.pieces.find((p) => p.id === pawn.uid);
    if (!fielded) return; // not deployed by the auto setup on this map
    const final: GameState = {
      ...run.activeBattle!,
      pieces: run.activeBattle!.pieces.filter((p) => p.id !== pawn.uid),
      captured: [fielded],
      saved: [pawn.uid],
      result: { kind: 'checkmate', winner: 'player' },
    };
    const after = finishBattle(run, final);
    const back = after.roster.find((r) => r.uid === pawn.uid);
    expect(back).toBeDefined();
    expect(back!.upgrades).not.toContain('second_life');
    expect(after.fallen).toHaveLength(0);
  });

  it('once-per-run flags carry over between battles', () => {
    let run = newRun(51);
    run = enterNode(run, availableNodes(run)[0].id);
    run = startBattle(run, autoDeploy(run, run.battle!));
    const after = finishBattle(run, { ...run.activeBattle!, runFlags: ['royal_resilience'], result: { kind: 'checkmate', winner: 'player' } });
    expect(after.runFlags).toContain('royal_resilience');
  });

  it('enemy armies get more upgrades in later acts and elite fights', () => {
    expect(enemyUpgradeCount(0, 'battle')).toBe(0);
    expect(enemyUpgradeCount(2, 'elite')).toBeGreaterThan(enemyUpgradeCount(0, 'elite'));
    const battle = generateBattle(new Rng(9), 2, 3, 'elite', 'e');
    expect(battle.enemies.flatMap((e) => e.upgrades ?? []).length).toBeGreaterThan(0);
  });
});

describe('special pieces in a run', () => {
  const fight = (types: string[]) => {
    let run = newRun(61);
    run = { ...run, roster: [...run.roster, ...types.map((t, i) => ({ uid: `x${i}`, type: t as never, battles: 0, upgrades: [] }))] };
    run = enterNode(run, availableNodes(run)[0].id);
    const king = run.roster.find((r) => r.type === 'king')!;
    const zone = run.battle!.terrain.flatMap((row, y) => [...row].map((ch, x) => ({ ch, x, y }))).filter((c) => c.ch === 'd');
    const deployed = [{ uid: king.uid, x: zone[0].x, y: zone[0].y }, ...types.map((_, i) => ({ uid: `x${i}`, x: zone[i + 1].x, y: zone[i + 1].y }))];
    return startBattle({ ...run, armyPoints: 99 }, deployed);
  };
  const win = (s: GameState): GameState => ({ ...s, result: { kind: 'checkmate', winner: 'player' } });

  it('a piece converted by the enemy is lost', () => {
    const run = fight(['rook']);
    const final = win({
      ...run.activeBattle!,
      pieces: run.activeBattle!.pieces.map((p) => (p.id === 'x0' ? { ...p, side: 'enemy' as const } : p)),
    });
    const after = finishBattle(run, final);
    expect(after.roster.some((r) => r.uid === 'x0')).toBe(false);
    expect(after.fallen.map((f) => f.uid)).toContain('x0');
  });

  it('Harvester Souls and Death’s Reward carry between battles', () => {
    const run = fight(['harvester']);
    const final = win({
      ...run.activeBattle!,
      pieces: run.activeBattle!.pieces.map((p) => (p.id === 'x0' ? { ...p, counters: { souls: 5, deathReward: 1 } } : p)),
    });
    const after = finishBattle(run, final);
    const h = after.roster.find((r) => r.uid === 'x0')!;
    expect(h.souls).toBe(5);
    expect(h.deathReward).toBe(true);
  });

  it('a Clone returns to being a Clone after battle', () => {
    const run = fight(['clone']);
    const final = win({
      ...run.activeBattle!,
      pieces: run.activeBattle!.pieces.map((p) => (p.id === 'x0' ? { ...p, type: 'archer' as const, clonedFrom: 'clone' as const } : p)),
    });
    expect(finishBattle(run, final).roster.find((r) => r.uid === 'x0')!.type).toBe('clone');
  });
});

describe('full runs', () => {
  it('simulated runs always finish without breaking', () => {
    const outcomes: Record<string, number> = {};
    let maxAct = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const run = simulateRun(seed);
      expect(run.status).not.toBe('active');
      outcomes[run.status] = (outcomes[run.status] ?? 0) + 1;
      maxAct = Math.max(maxAct, run.act);
      expect(run.roster.length + run.fallen.length).toBeGreaterThan(0);
    }
    console.log('simulated run outcomes', JSON.stringify(outcomes), 'furthest act', maxAct + 1);
  }, 120000);
});
