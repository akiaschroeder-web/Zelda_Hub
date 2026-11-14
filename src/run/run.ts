import { isStandable, parseBoard } from '../engine/board';
import { PIECE_STATS, footprint } from '../engine/pieces';
import { createGame, Placement, parsePlacements } from '../engine/setup';
import { Coord, GameResult, GameState, Piece, PieceType, coordKey } from '../engine/types';
import { RUN_CONFIG } from './config';
import { RUN_BATTLES, RunBattle } from './battles';

/** One piece the player owns. Its uid is also its id on the battlefield. */
export interface RosterPiece {
  uid: string;
  type: PieceType;
  /** Battles this piece has fought in and survived. */
  battles: number;
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

export interface RunState {
  version: 1;
  status: 'active' | 'won' | 'lost';
  roster: RosterPiece[];
  fallen: FallenPiece[];
  armyPoints: number;
  /** Index into RUN_BATTLES of the next (or current) battle. */
  battleIndex: number;
  /** The battle being fought right now, saved so closing the app can't undo it. */
  activeBattle: GameState | null;
  /** Result of the most recent battle, for the summary screen. */
  lastResult: { battle: string; result: GameResult; lost: RosterPiece[] } | null;
}

let uidCounter = 0;
const newUid = (type: PieceType) => `r-${type}-${Date.now().toString(36)}-${(uidCounter++).toString(36)}`;

export function newRun(): RunState {
  return {
    version: 1,
    status: 'active',
    roster: RUN_CONFIG.startingRoster.map((type) => ({ uid: newUid(type), type, battles: 0 })),
    fallen: [],
    armyPoints: RUN_CONFIG.armyPoints,
    battleIndex: 0,
    activeBattle: null,
    lastResult: null,
  };
}

export const currentBattle = (run: RunState): RunBattle | undefined => RUN_BATTLES[run.battleIndex];

export const costOf = (type: PieceType) => PIECE_STATS[type].cost;

export function deploymentCost(run: RunState, deployed: DeployedPiece[]): number {
  return deployed.reduce((sum, d) => {
    const piece = run.roster.find((r) => r.uid === d.uid);
    return sum + (piece ? costOf(piece.type) : 0);
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
  return errors;
}

/** A reasonable default deployment: King first, then the most valuable pieces that fit. */
export function autoDeploy(run: RunState, battle: RunBattle): DeployedPiece[] {
  const zone = deployZone(battle).sort((a, b) => b.y - a.y || Math.abs(a.x - 3.5) - Math.abs(b.x - 3.5));
  const deployed: DeployedPiece[] = [];
  let points = 0;
  const order = [...run.roster].sort((a, b) =>
    a.type === 'king' ? -1 : b.type === 'king' ? 1 : PIECE_STATS[b.type].value - PIECE_STATS[a.type].value,
  );
  for (const piece of order) {
    const cost = costOf(piece.type);
    if (points + cost > run.armyPoints) continue;
    // Pawns go in front (lowest row of the zone that is furthest forward).
    const candidates = piece.type === 'pawn' ? [...zone].sort((a, b) => a.y - b.y) : zone;
    const spot = candidates.find((c) => canPlace(run, battle, deployed, piece.uid, c));
    if (!spot) continue;
    deployed.push({ uid: piece.uid, x: spot.x, y: spot.y });
    points += cost;
  }
  return deployed;
}

/** Build the battlefield from the deployment and the battle's enemy layout. */
export function startBattle(run: RunState, battle: RunBattle, deployed: DeployedPiece[]): GameState {
  const errors = deploymentErrors(run, battle, deployed);
  if (errors.length) throw new Error(errors.join(' '));
  const board = parseBoard(battle.terrain);
  const placements: Placement[] = [
    ...deployed.map((d) => {
      const piece = run.roster.find((r) => r.uid === d.uid)!;
      return { id: piece.uid, type: piece.type, side: 'player' as const, x: d.x, y: d.y };
    }),
    ...parsePlacements(battle.enemies).filter((p) => p.side === 'enemy'),
  ];
  return createGame(board, placements, battle.rules);
}

export const isVictory = (r: GameResult) => r.kind !== 'ongoing' && r.kind !== 'draw' && r.winner === 'player';
export const isDefeat = (r: GameResult) => r.kind !== 'ongoing' && r.kind !== 'draw' && r.winner === 'enemy';

/**
 * Apply a finished battle to the run: captured pieces are permanently lost,
 * survivors gain experience, promotions stick, and the run advances or ends.
 * A draw counts as surviving the battle (the run continues).
 */
export function finishBattle(run: RunState, final: GameState): RunState {
  const battle = currentBattle(run)!;
  const lostIds = new Set(final.captured.filter((p) => p.side === 'player').map((p) => p.id));
  const onField = new Map(final.pieces.filter((p) => p.side === 'player').map((p) => [p.id, p]));
  const lost = run.roster.filter((r) => lostIds.has(r.uid));
  const roster = run.roster
    .filter((r) => !lostIds.has(r.uid))
    .map((r) => {
      const fielded = onField.get(r.uid);
      if (!fielded) return r;
      const type = RUN_CONFIG.promotionsArePermanent ? fielded.type : r.type;
      return { ...r, type, battles: r.battles + 1 };
    });
  const defeat = isDefeat(final.result) || !roster.some((r) => r.type === 'king');
  const nextIndex = run.battleIndex + 1;
  return {
    ...run,
    roster,
    fallen: [...run.fallen, ...lost.map((r) => ({ ...r, lostIn: battle.name }))],
    battleIndex: defeat ? run.battleIndex : nextIndex,
    status: defeat ? 'lost' : nextIndex >= RUN_BATTLES.length ? 'won' : 'active',
    activeBattle: null,
    lastResult: { battle: battle.name, result: final.result, lost },
  };
}
