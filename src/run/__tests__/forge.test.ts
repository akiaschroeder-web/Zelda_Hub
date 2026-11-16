import { describe, expect, it } from 'vitest';
import { UPGRADE_BY_ID } from '../../engine/upgrades/catalog';
import { equipFromStash, extractUpgrade, forgePieces, forgeUpgrades, pickForgeOffer } from '../forge';
import { buyPotion, drinkBattlePotion, usePrebattlePotion } from '../potions';
import { rarityOf } from '../rewards';
import { RunState, autoDeploy, deployZone, deploymentCost, makeRosterPiece, newRun, rerollReward, startBattle } from '../run';
import { generateBattle } from '../battlegen';
import { Rng } from '../rng';
import { PieceType } from '../../engine/types';

const withRoster = (types: PieceType[], packs: string[] = []) => {
  const run = newRun(4, packs);
  return { ...run, roster: [...run.roster, ...types.map(makeRosterPiece)] };
};

describe('the Forge', () => {
  it('turns three common pieces into one uncommon piece', () => {
    const run = withRoster(['archer', 'archer', 'lancer']);
    const uids = run.roster.filter((r) => ['archer', 'lancer'].includes(r.type)).map((r) => r.uid);
    const after = forgePieces(run, uids);
    expect(after.roster.length).toBe(run.roster.length - 2);
    const made = after.roster[after.roster.length - 1];
    expect(rarityOf(made.type)).toBe('uncommon');
  });

  it('turns four epic pieces into a Boss Piece, and destroys their upgrades', () => {
    const run = withRoster(['juggernaut', 'juggernaut', 'phoenix', 'converter']);
    const epics = run.roster.filter((r) => rarityOf(r.type) === 'epic');
    epics[0].upgrades = ['thick_armor'];
    const after = forgePieces(run, epics.map((r) => r.uid));
    expect(rarityOf(after.roster[after.roster.length - 1].type)).toBe('boss');
    expect(after.roster.some((r) => r.upgrades.includes('thick_armor'))).toBe(false);
  });

  it('refuses mixed rarities, the wrong count, or the King', () => {
    const run = withRoster(['archer', 'archer', 'rook']);
    const bad = run.roster.filter((r) => ['archer', 'rook'].includes(r.type)).map((r) => r.uid);
    expect(() => forgePieces(run, bad)).toThrow();
    expect(() => forgePieces(run, bad.slice(0, 2))).toThrow();
    expect(() => forgePieces(run, [run.roster.find((r) => r.type === 'king')!.uid, ...bad.slice(0, 2)])).toThrow();
  });

  it('can pay gold to choose one of three results', () => {
    const run = { ...withRoster(['archer', 'archer', 'lancer']), gold: 100 };
    const uids = run.roster.filter((r) => ['archer', 'lancer'].includes(r.type)).map((r) => r.uid);
    const offered = forgePieces(run, uids, true);
    expect(offered.gold).toBeLessThan(100);
    expect(offered.forgeOffer!.options).toHaveLength(3);
    const picked = pickForgeOffer(offered, 1);
    expect(picked.roster[picked.roster.length - 1].type).toBe(offered.forgeOffer!.options[1]);
  });

  it('extracts upgrades to the stash, forges them, and equips the result', () => {
    let run = withRoster([]);
    const rook = run.roster.find((r) => r.type === 'rook')!;
    run = { ...run, roster: run.roster.map((r) => (r.uid === rook.uid ? { ...r, upgrades: ['extended_stride'] } : r)) };
    run = extractUpgrade(run, rook.uid, 'extended_stride');
    expect(run.stash).toEqual(['extended_stride']);
    const commons = Object.values(UPGRADE_BY_ID).filter((u) => u.rarity === 'common' && !u.pack && !u.excluded).map((u) => u.id);
    run = { ...run, stash: [commons[0], commons[1], commons[2]] };
    run = forgeUpgrades(run, [0, 1, 2]);
    expect(run.stash).toHaveLength(1);
    expect(UPGRADE_BY_ID[run.stash[0]].rarity).toBe('uncommon');
    // A stashed upgrade goes onto a piece that can take it.
    const ready = { ...run, stash: ['thick_armor'] };
    const equipped = equipFromStash(ready, 0, rook.uid);
    expect(equipped.roster.find((r) => r.uid === rook.uid)!.upgrades).toContain('thick_armor');
    expect(equipped.stash).toHaveLength(0);
  });
});

describe('the Potion Shop', () => {
  it('potions go to the inventory; elixirs apply at once', () => {
    let run: RunState = { ...newRun(2), gold: 999, potionShop: [
      { id: 'expansion', kind: 'potion' as const, price: 35, sold: false },
      { id: 'elixir_ap4', kind: 'elixir' as const, price: 120, sold: false },
    ] };
    run = buyPotion(run, 0);
    run = buyPotion(run, 1);
    expect(run.potions).toEqual(['expansion']);
    expect(run.elixirs).toEqual(['elixir_ap4']);
    expect(run.armyPoints).toBe(36);
  });

  it('pre-battle potions change that battle: Free Deployment, Reinforcement, Fortification', () => {
    const battle = generateBattle(new Rng(1), 0, 1, 'battle', 'b', [], []);
    let run: RunState = { ...newRun(3), phase: 'deploy', battle, potions: ['free_deployment', 'reinforcement', 'fortification'] };
    const zone = deployZone(battle, run).length;
    run = usePrebattlePotion(run, 'free_deployment');
    run = usePrebattlePotion(run, 'reinforcement');
    run = usePrebattlePotion(run, 'fortification');
    expect(run.potions).toEqual([]);
    expect(deployZone(battle, run).length).toBeGreaterThan(zone);
    const deployed = autoDeploy(run, battle);
    expect(deploymentCost(run, deployed)).toBe(0);
    const started = startBattle(run, deployed);
    expect(started.activeBattle!.pieces.filter((p) => p.side === 'player').every((p) => p.shields.length === 1)).toBe(true);
  });

  it('Second Chances rerolls a reward once', () => {
    const run = {
      ...newRun(5),
      phase: 'reward' as const,
      potions: ['second_chances'],
      reward: { title: 'x', gold: 10, armyPoints: 0, options: [{ kind: 'armyPoints' as const, amount: 2 }], source: 'treasure' as const },
    };
    const after = rerollReward(run);
    expect(after.potions).toEqual([]);
    expect(after.reward!.gold).toBe(10);
    expect(after.reward!.rerolled).toBe(true);
    expect(() => rerollReward({ ...after, potions: ['second_chances'] })).toThrow();
  });

  it('Recovery and Restoration heal mid-battle', () => {
    const battle = generateBattle(new Rng(1), 0, 1, 'battle', 'b', [], []);
    let run: RunState = { ...newRun(3), phase: 'deploy', battle, potions: ['recovery', 'restoration'] };
    run = startBattle(run, autoDeploy(run, battle));
    const s = run.activeBattle!;
    const mine = s.pieces.filter((p) => p.side === 'player').slice(0, 2);
    mine.forEach((p) => (p.maxHp = 3));
    mine.forEach((p) => (p.hp = 1));
    expect(() => drinkBattlePotion({ ...run, activeBattle: s }, 'restoration', 'nobody')).toThrow();
    const healed = drinkBattlePotion({ ...run, activeBattle: s }, 'recovery');
    expect(healed.potions).toEqual(['restoration']);
    for (const p of mine) expect(healed.activeBattle!.pieces.find((q) => q.id === p.id)!.hp).toBe(Math.min(2, p.maxHp));
    const target = mine[0];
    const restored = drinkBattlePotion(healed, 'restoration', target.id);
    expect(restored.potions).toEqual([]);
    expect(restored.activeBattle!.pieces.find((q) => q.id === target.id)!.hp).toBe(target.maxHp);
  });
});
