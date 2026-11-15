import { isStandable, parseBoard } from '../engine/board';
import { inCheck } from '../engine/moves';
import { PIECE_STATS, footprint } from '../engine/pieces';
import { createGame, Placement } from '../engine/setup';
import { Coord, GameResult, GameState, Piece, PieceType, coordKey } from '../engine/types';
import { canTake, upgradeCost } from '../engine/upgrades/eligibility';
import { BOSS_POOLS, RunBattle, bossBattle, generateBattle } from './battlegen';
import { enabledPacks } from '../content/packs';
import { RUN_CONFIG } from './config';
import { EVENTS, EventDef } from './events';
import { ActMap, MapNode, findNode, generateAct } from './map';
import { PendingReward, RewardOption, ShopItem, battleReward, generateShop, recruitReward, treasureReward } from './rewards';
import { Rng, randomSeed } from './rng';

/** One piece the player owns. Its uid is also its id on the battlefield. */
export interface RosterPiece {
  uid: string;
  type: PieceType;
  /** Battles this piece has fought in and survived. */
  battles: number;
  /** Upgrade ids attached to this piece. */
  upgrades: string[];
  /** Harvester: Souls carried between battles (max 5). */
  souls?: number;
  /** Harvester: Death's Reward (+1 max HP) already earned this run. */
  deathReward?: boolean;
}

export interface FallenPiece extends RosterPiece {
  /** Name of the battle it was lost in. */
  lostIn: string;
}

export interface DeployedPiece {
  uid: string;
  x: number;
  y: number;
}

/** Which screen the run is on. */
export type RunPhase = 'map' | 'deploy' | 'battle' | 'reward' | 'shop' | 'event';

export interface RunState {
  version: 3;
  seed: number;
  /** Current random generator state (saved so the run is reproducible). */
  rng: number;
  /** Runs are endless: they only end when the King falls (older saves may say 'won'). */
  status: 'active' | 'won' | 'lost';
  phase: RunPhase;
  roster: RosterPiece[];
  fallen: FallenPiece[];
  armyPoints: number;
  gold: number;
  /** 0-based act index. */
  act: number;
  maps: ActMap[];
  /** The node the player is at or last cleared in the current act (null = start of act). */
  nodeId: string | null;
  /** Every node entered so far. */
  visited: string[];
  /** The battle for the current node, once generated. */
  battle: RunBattle | null;
  /** The battle being fought right now, saved so closing the app can't undo it. */
  activeBattle: GameState | null;
  reward: PendingReward | null;
  shop: ShopItem[] | null;
  event: { id: string; outcome: string | null } | null;
  /** Result of the most recent battle, for summaries. */
  lastResult: { battle: string; result: GameResult; lost: RosterPiece[]; saved?: RosterPiece[] } | null;
  /** Once-per-run effects already spent (Royal Resilience, Royal Resurrection). */
  runFlags: string[];
  /** Boss Pieces defeated this run: they can now be recruited and appear in elite fights. */
  unlockedBosses: PieceType[];
  /** Content packs that were on when the run started. */
  packs: string[];
}

/** Acts with their own boss tier; from the fourth act on, any boss can appear. */
export const BOSS_TIERS = 3;

let uidCounter = 0;
const newUid = (type: PieceType) => `r-${type}-${Date.now().toString(36)}-${(uidCounter++).toString(36)}`;
export const makeRosterPiece = (type: PieceType): RosterPiece => ({ uid: newUid(type), type, battles: 0, upgrades: [] });

/** Living Fortress: +1 max HP per three battles survived, up to +3. */
export const livingFortressBonus = (r: RosterPiece) =>
  r.upgrades.includes('living_fortress') ? Math.min(3, Math.floor(r.battles / 3)) : 0;

/** Run `fn` with the run's random generator and store the advanced state back. */
function withRng<T>(run: RunState, fn: (rng: Rng) => T): [T, number] {
  const rng = new Rng(run.rng);
  const out = fn(rng);
  return [out, rng.state];
}

/**
 * Each act's boss pool with the bosses of enabled content packs added. Acts
 * 1-3 have their own tiers; from act 4 on, any boss can wait at the end.
 */
export const bossPoolFor = (act: number, packs: readonly string[]): PieceType[] => {
  const packBosses = enabledPacks(packs).flatMap((p) => p.bosses);
  if (act >= BOSS_TIERS) return [...BOSS_POOLS.flat(), ...packBosses.map((b) => b.type)];
  return [...BOSS_POOLS[act], ...packBosses.filter((b) => b.act === act).map((b) => b.type)];
};

export function newRun(seed = randomSeed(), packs: readonly string[] = []): RunState {
  const rng = new Rng(seed);
  // Acts are generated one at a time as the run reaches them: there is no last act.
  const maps = [generateAct(rng, 0, bossPoolFor(0, packs))];
  return {
    version: 3,
    seed,
    rng: rng.state,
    status: 'active',
    phase: 'map',
    roster: RUN_CONFIG.startingRoster.map(makeRosterPiece),
    fallen: [],
    armyPoints: RUN_CONFIG.armyPoints,
    gold: RUN_CONFIG.startingGold,
    act: 0,
    maps,
    nodeId: null,
    visited: [],
    battle: null,
    activeBattle: null,
    reward: null,
    shop: null,
    event: null,
    lastResult: null,
    runFlags: [],
    unlockedBosses: [],
    packs: [...packs],
  };
}

/** The route each phase lives on. */
export const ROUTES: Record<RunPhase, '/map' | '/deploy' | '/battle' | '/reward' | '/shop' | '/event'> = {
  map: '/map',
  deploy: '/deploy',
  battle: '/battle',
  reward: '/reward',
  shop: '/shop',
  event: '/event',
};

export const currentMap = (run: RunState): ActMap => run.maps[run.act];

/** Nodes the player may enter next. */
export function availableNodes(run: RunState): MapNode[] {
  const map = currentMap(run);
  if (!run.nodeId) return map.floors[0];
  const here = findNode(map, run.nodeId);
  return here ? here.next.map((id) => findNode(map, id)!).filter(Boolean) : [];
}

export const currentNode = (run: RunState): MapNode | undefined =>
  run.nodeId ? findNode(currentMap(run), run.nodeId) : undefined;

/** Step onto a map node and set up whatever happens there. */
export function enterNode(run: RunState, nodeId: string): RunState {
  if (run.phase !== 'map' || run.status !== 'active') throw new Error('Not on the map');
  const node = availableNodes(run).find((n) => n.id === nodeId);
  if (!node) throw new Error('That node is not reachable');
  const base = { ...run, nodeId, visited: [...run.visited, nodeId] };
  const [patch, rngState] = withRng(run, (rng): Partial<RunState> => {
    switch (node.type) {
      case 'battle':
      case 'elite':
        return { phase: 'deploy', battle: generateBattle(rng, run.act, node.floor, node.type, node.id, run.unlockedBosses, run.packs) };
      case 'boss':
        return { phase: 'deploy', battle: bossBattle(run.act, node.id, rng, node.boss, run.packs) };
      case 'shop':
        return { phase: 'shop', shop: generateShop(rng, run.act, run.roster, run.packs) };
      case 'treasure':
        return { phase: 'reward', reward: treasureReward(rng, run.act, run.roster, run.packs) };
      case 'recruit':
        return { phase: 'reward', reward: recruitReward(rng, run.act, run.packs) };
      case 'event': {
        const usable = EVENTS.filter((e) => !e.available || e.available(run));
        return { phase: 'event', event: { id: rng.pick(usable).id, outcome: null } };
      }
    }
  });
  return { ...base, ...patch, rng: rngState };
}

/** Back to the map; clearing a boss moves on to the next act (or wins the run). */
function leaveNode(run: RunState): RunState {
  const node = currentNode(run);
  const cleared = { ...run, phase: 'map' as const, battle: null, reward: null, shop: null, event: null };
  if (node?.type !== 'boss') return cleared;
  // Beating a boss opens the next act, forever.
  const act = run.act + 1;
  if (run.maps[act]) return { ...cleared, act, nodeId: null };
  const [map, rng] = withRng(run, (r) => generateAct(r, act, bossPoolFor(act, run.packs)));
  return { ...cleared, act, nodeId: null, maps: [...run.maps, map], rng };
}

/** Roster pieces that can take this upgrade. */
export const upgradeTargets = (run: RunState, id: string) => run.roster.filter((r) => canTake(id, r.type, r.upgrades));

function grant(run: RunState, o: RewardOption, targetUid?: string): RunState {
  switch (o.kind) {
    case 'piece':
      return { ...run, roster: [...run.roster, makeRosterPiece(o.type)] };
    case 'upgrade': {
      const target = run.roster.find((r) => r.uid === targetUid);
      if (!target || !canTake(o.id, target.type, target.upgrades)) throw new Error('That piece cannot take this upgrade');
      const roster = run.roster.map((r) => (r.uid === targetUid ? { ...r, upgrades: [...r.upgrades, o.id] } : r));
      return { ...run, roster };
    }
    case 'armyPoints':
      return { ...run, armyPoints: run.armyPoints + o.amount };
    case 'gold':
      return { ...run, gold: run.gold + o.amount };
  }
}

/**
 * Collect a pending reward: gold and Army Points automatically, plus the
 * chosen option (or none). Upgrades need the roster piece that receives them.
 */
export function claimReward(run: RunState, choice: number | null, targetUid?: string): RunState {
  const r = run.reward;
  if (run.phase !== 'reward' || !r) throw new Error('No reward to claim');
  let next: RunState = { ...run, gold: run.gold + r.gold, armyPoints: run.armyPoints + r.armyPoints };
  if (choice !== null && r.options[choice]) next = grant(next, r.options[choice], targetUid);
  return leaveNode(next);
}

export function buy(run: RunState, index: number, targetUid?: string): RunState {
  const item = run.shop?.[index];
  if (run.phase !== 'shop' || !item || item.sold || item.price > run.gold) throw new Error('Cannot buy that');
  const next = grant({ ...run, gold: run.gold - item.price }, item.option, targetUid);
  return { ...next, shop: run.shop!.map((it, i) => (i === index ? { ...it, sold: true } : it)) };
}

export const leaveShop = (run: RunState): RunState => leaveNode(run);

export const currentEvent = (run: RunState): EventDef | undefined => EVENTS.find((e) => e.id === run.event?.id);

export function chooseEventOption(run: RunState, index: number): RunState {
  const ev = currentEvent(run);
  const choice = ev?.choices[index];
  if (run.phase !== 'event' || !ev || !choice || run.event?.outcome) throw new Error('No such choice');
  if (choice.available && !choice.available(run)) throw new Error('Choice not available');
  const [result, rngState] = withRng(run, (rng) => choice.apply(run, rng));
  return { ...result.run, rng: rngState, event: { id: ev.id, outcome: result.message } };
}

export const leaveEvent = (run: RunState): RunState => leaveNode(run);

// ---------------------------------------------------------------------------
// Deployment
// ---------------------------------------------------------------------------

/** Army Points to deploy a roster piece: its base cost plus its upgrades' costs. */
export const costOf = (r: { type: PieceType; upgrades?: string[] }) => PIECE_STATS[r.type].cost + upgradeCost(r.upgrades ?? []);

export function deploymentCost(run: RunState, deployed: DeployedPiece[]): number {
  return deployed.reduce((sum, d) => {
    const piece = run.roster.find((r) => r.uid === d.uid);
    return sum + (piece ? costOf(piece) : 0);
  }, 0);
}

export function deployZone(battle: RunBattle): Coord[] {
  return parseBoard(battle.terrain).deployZone ?? [];
}

/** Every square a deployed piece would cover. */
function cellsOf(run: RunState, d: DeployedPiece): Coord[] {
  const piece = run.roster.find((r) => r.uid === d.uid)!;
  return footprint({ type: piece.type } as Piece, { x: d.x, y: d.y });
}

/** Can this roster piece be placed with its top-left corner at (x, y)? */
export function canPlace(run: RunState, battle: RunBattle, deployed: DeployedPiece[], uid: string, at: Coord): boolean {
  const zone = new Set(deployZone(battle).map(coordKey));
  const board = parseBoard(battle.terrain);
  const taken = new Set(deployed.filter((d) => d.uid !== uid).flatMap((d) => cellsOf(run, d).map(coordKey)));
  return cellsOf(run, { uid, ...at }).every(
    (c) => zone.has(coordKey(c)) && isStandable(board, c) && !taken.has(coordKey(c)),
  );
}

function buildBattle(run: RunState, battle: RunBattle, deployed: DeployedPiece[]): GameState {
  const placements: Placement[] = [
    ...deployed.map((d) => {
      const piece = run.roster.find((r) => r.uid === d.uid)!;
      return {
        id: piece.uid,
        type: piece.type,
        side: 'player' as const,
        x: d.x,
        y: d.y,
        upgrades: piece.upgrades,
        bonusMaxHp: livingFortressBonus(piece) + (piece.deathReward ? 1 : 0),
        counters: {
          ...(piece.souls !== undefined ? { souls: piece.souls } : {}),
          ...(piece.deathReward ? { deathReward: 1 } : {}),
        },
      };
    }),
    ...battle.enemies.map((e) => ({ ...e, side: 'enemy' as const })),
  ];
  return createGame(parseBoard(battle.terrain), placements, battle.rules, run.runFlags);
}

/** Problems that stop the battle from starting; empty when the deployment is valid. */
export function deploymentErrors(run: RunState, battle: RunBattle, deployed: DeployedPiece[]): string[] {
  const errors: string[] = [];
  const king = run.roster.find((r) => r.type === 'king');
  if (king && !deployed.some((d) => d.uid === king.uid)) errors.push('Your King must take the field.');
  const cost = deploymentCost(run, deployed);
  if (cost > run.armyPoints) errors.push(`Over budget: ${cost}/${run.armyPoints} Army Points.`);
  for (const d of deployed) {
    if (!run.roster.some((r) => r.uid === d.uid)) errors.push('A deployed piece is not in your roster.');
    else if (!canPlace(run, battle, deployed, d.uid, d)) errors.push('A piece is outside the deployment zone or overlapping.');
  }
  if (errors.length === 0 && battle.rules.checkRules && inCheck(buildBattle(run, battle, deployed), 'enemy')) {
    errors.push('That setup attacks the enemy King before the battle starts. Move a piece.');
  }
  return errors;
}

/** A reasonable default deployment: King first, then the most valuable pieces that fit. */
export function autoDeploy(run: RunState, battle: RunBattle): DeployedPiece[] {
  const width = battle.terrain[0].length;
  const mid = (width - 1) / 2;
  const zone = deployZone(battle).sort((a, b) => b.y - a.y || Math.abs(a.x - mid) - Math.abs(b.x - mid));
  const deployed: DeployedPiece[] = [];
  let points = 0;
  const order = [...run.roster].sort((a, b) =>
    a.type === 'king' ? -1 : b.type === 'king' ? 1 : PIECE_STATS[b.type].value - PIECE_STATS[a.type].value,
  );
  for (const piece of order) {
    const cost = costOf(piece);
    if (points + cost > run.armyPoints) continue;
    // Pawns go in front (the zone row furthest forward).
    const candidates = piece.type === 'pawn' ? [...zone].sort((a, b) => a.y - b.y) : zone;
    // Under check rules, skip squares that would attack the enemy King before the battle starts.
    const safe = (c: Coord) =>
      !battle.rules.checkRules || !inCheck(buildBattle(run, battle, [...deployed, { uid: piece.uid, x: c.x, y: c.y }]), 'enemy');
    const spot = candidates.find((c) => canPlace(run, battle, deployed, piece.uid, c) && safe(c));
    if (!spot) continue;
    deployed.push({ uid: piece.uid, x: spot.x, y: spot.y });
    points += cost;
  }
  return deployed;
}

/** Lock in a deployment and start the current battle. */
export function startBattle(run: RunState, deployed: DeployedPiece[]): RunState {
  const battle = run.battle;
  if (run.phase !== 'deploy' || !battle) throw new Error('No battle to start');
  const errors = deploymentErrors(run, battle, deployed);
  if (errors.length) throw new Error(errors.join(' '));
  return { ...run, phase: 'battle', activeBattle: buildBattle(run, battle, deployed) };
}

export const isVictory = (r: GameResult) => r.kind !== 'ongoing' && r.kind !== 'draw' && r.winner === 'player';
export const isDefeat = (r: GameResult) => r.kind !== 'ongoing' && r.kind !== 'draw' && r.winner === 'enemy';

/**
 * Apply a finished battle to the run: captured pieces are permanently lost,
 * survivors gain experience, promotions stick, and a reward is offered.
 * Losing the King ends the run. A draw counts as surviving, with a small reward.
 */
export function finishBattle(run: RunState, final: GameState): RunState {
  const battle = run.battle!;
  // A deployed roster piece is lost if it isn't standing on our side at the end: captured,
  // fallen into a gap, or converted by an enemy Converter. A Phoenix awaiting rebirth survives.
  const onField = new Map(final.pieces.filter((p) => p.side === 'player').map((p) => [p.id, p]));
  for (const p of final.reborn.filter((p) => p.side === 'player')) onField.set(p.id, p);
  // A Stalfos lying in bones when the battle ends gets back up afterwards.
  for (const b of (final.bones ?? []).filter((b) => b.piece.side === 'player')) onField.set(b.piece.id, b.piece);
  // A piece still inside a Like Like when the battle ends is lost.
  const deployedIds = new Set(
    [...final.pieces, ...final.captured, ...final.reborn, ...(final.engulfed ?? []).map((e) => e.victim), ...(final.bones ?? []).map((b) => b.piece)].map(
      (p) => p.id,
    ),
  );
  const missing = run.roster.filter((r) => deployedIds.has(r.uid) && !onField.has(r.uid)).map((r) => r.uid);
  // Second Life: the first time a piece would be lost, it comes back (and the upgrade is spent).
  const savedIds = new Set(final.saved.filter((id) => missing.includes(id)));
  const lostIds = new Set(missing.filter((id) => !savedIds.has(id)));
  const lost = run.roster.filter((r) => lostIds.has(r.uid));
  const saved = run.roster.filter((r) => savedIds.has(r.uid));
  const roster = run.roster
    .filter((r) => !lostIds.has(r.uid))
    .map((r) => {
      if (savedIds.has(r.uid)) return { ...r, upgrades: r.upgrades.filter((u) => u !== 'second_life') };
      const fielded = onField.get(r.uid);
      if (!fielded) return r;
      // Only promoted Pawns keep a new type (a Clone's copy ends with the battle).
      const type = RUN_CONFIG.promotionsArePermanent && r.type === 'pawn' ? fielded.type : r.type;
      const souls = fielded.counters.souls;
      return {
        ...r,
        type,
        battles: r.battles + 1,
        ...(souls !== undefined ? { souls } : {}),
        ...(fielded.counters.deathReward ? { deathReward: true } : {}),
      };
    });
  const after: RunState = {
    ...run,
    roster,
    fallen: [...run.fallen, ...lost.map((r) => ({ ...r, lostIn: battle.name }))],
    activeBattle: null,
    lastResult: { battle: battle.name, result: final.result, lost, saved },
    runFlags: [...new Set([...run.runFlags, ...final.runFlags])],
  };
  if (isDefeat(final.result) || !roster.some((r) => r.type === 'king')) {
    return { ...after, status: 'lost', phase: 'map' };
  }
  const source = final.result.kind === 'draw' ? 'draw' : battle.kind;
  const unlockedBosses = battle.boss && !run.unlockedBosses.includes(battle.boss) ? [...run.unlockedBosses, battle.boss] : run.unlockedBosses;
  const [reward, rngState] = withRng(run, (rng) => {
    const r = battleReward(rng, source, run.act, battle.name, roster, run.packs);
    // Boss Pieces are rare finds: a defeated boss sometimes offers itself, and
    // later elites occasionally offer any boss already beaten.
    const offer =
      battle.boss && rng.chance(0.3) ? battle.boss : source === 'elite' && unlockedBosses.length && rng.chance(0.1) ? rng.pick(unlockedBosses) : null;
    if (offer) r.options.push({ kind: 'piece', type: offer });
    return r;
  });
  return { ...after, unlockedBosses, rng: rngState, phase: 'reward', reward };
}
