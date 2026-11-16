import { inBounds, isBarrier, isHole, isStandable, isWall, terrainAt } from './board';
import { FREE_ACTIONS, resolveUpgradeAction, upgradeActions } from './actions';
import {
  ALL_DIRS,
  ORTHO,
  add,
  addShield,
  addStatus,
  adjacent,
  allies,
  cannotAttack,
  cloneState,
  dealDamage,
  destroyCracked,
  distance,
  enemiesOf,
  getPiece,
  has,
  hasStatus,
  heal,
  isBoss,
  isEmpty,
  kingOf,
  log,
  markUsed,
  pieceAt,
  pieceDistance,
  push,
  pushDistance,
  ready,
  removeStatus,
  sign,
  statusOf,
  sub,
  anyHas,
  freeze,
  addTimedTerrain,
  emptyZoneSquare,
  immuneToForcedMove,
  summon,
  nameOf,
  collapseBridge,
  DamageOutcome,
  hasUsed,
  silenced,
  suppressed,
} from './core';
import { attacksSquare, heavySteps, lPaths, shotSquares, sideStepVariants, stepsFor } from './movement';
import { harvestSoul, resolveSpecial, specialMoves } from './specials';
import { zeldaAfterMove, zeldaBeforeMove, zeldaTurnEnd, zeldaTurnStart } from './zelda';
import { arrowEffects, biggoronCleave, kokiriSteps } from './zeldaUpgrades';
import { resolveUnlock, tileMoves, tilesAfterMove } from './tiles';
import { baguetteBonus, duoMoves, resolveDuo, tetoDuetBonus } from './duo';
import { cratesTurnEnd, nitroProximity } from './crates';
import { ben10AfterMove, ben10AttackBonus, ben10BeforeMove, ben10Moves, ben10TurnEnd, resolveBen10 } from './ben10';
import { ben10UpgradeAfterMove, ben10UpgradeAttackBonus, ben10UpgradeBeforeMove, nullVoidReturn } from './ben10Upgrades';
import { emmiCaptures, metroidAfterMove, metroidAttackBonus, metroidBeforeMove, metroidMoves, metroidTurnEnd, resolveMetroid } from './metroid';
import { marioSpaceMoves, marioSpacesTurnEnd, noteMoves, resolveHitBlock } from './marioSpaces';
import { marioDamageCap, marioUpgradeAfterMove, marioUpgradeAttackBonus, marioUpgradeBeforeMove, marioUpgradeTurnEnd } from './marioUpgrades';
import { marioAfterMove, marioAttackBonus, marioFilterMoves, marioMoves, resolveMario } from './mario';
import { crashUpgradeAfterMove, crashUpgradeAttackBonus, crashUpgradeBeforeMove, crashUpgradeTurnEnd, dedupeUpgradeSteps } from './crashUpgrades';
import { crashAfterAttack, crashAfterMove, crashAttackBonus, crashMoves, crashTurnEnd, intimidated, resolveCrash } from './crash';
import { resolveSonic, sonicAfterMove, sonicBeforeMove, sonicMoves, sonicTurnEnd, sonicTurnStart } from './sonic';
import { ATTACK_UPGRADES, drillThrough, flameRing, spendSonicAction } from './sonicUpgrades';
import { UPGRADE_BY_ID } from './upgrades/catalog';
import { FREE_BOSS_ACTIONS, BOSS_COOLDOWNS, bossMoves, bossTurnEnd, bossTurnStart, haunted, resolveBoss, swarmCommanded } from './bosses';
import { PIECE_STATS, ZELDA_TYPES, footprint, sizeOf } from './pieces';
import {
  Bonus,
  Coord,
  GameResult,
  GameState,
  Move,
  Piece,
  PromotionType,
  Side,
  coordKey,
  forward,
  opponent,
  sameCoord,
  shieldTotal,
} from './types';

export const PROMOTION_TYPES: PromotionType[] = ['queen', 'rook', 'bishop', 'knight'];

/** Mage teleport range and Switcher swap range (King-style distance). */
const TELEPORT_RANGE = 3;
const SWAP_RANGE = 2;

export { distance, adjacent };
export const hasUsedAbility = hasUsed;

/**
 * A Knight jump goes around the corner either way (along x first, or along y first)
 * and is blocked only when both routes pass over a wall (solid or cracked). Gaps never block.
 */
export function knightPathClear(state: GameState, from: Coord, to: Coord): boolean {
  return lPaths(from, to).some((path) => !path.some((c) => isBarrier(state.board, c)));
}

/**
 * Half the distance travelled, rounded up, minimum one square, measured back
 * from the attacked square along the approach line. The squares on that line
 * were just crossed, so the landing square is always free.
 */
export function bounceSquare(from: Coord, to: Coord, leaper: boolean, reduce = 0): Coord {
  if (leaper) return from;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.max(Math.abs(dx), Math.abs(dy));
  const back = Math.max(1, Math.ceil(dist / 2) - reduce);
  return { x: to.x - Math.sign(dx) * back, y: to.y - Math.sign(dy) * back };
}

export function isSquareAttacked(state: GameState, sq: Coord, by: Side): boolean {
  for (const p of state.pieces) {
    if (p.side !== by) continue;
    if (attacksSquare(state, p, sq)) return true;
  }
  return false;
}

export const findKing = (state: GameState, side: Side): Piece | undefined =>
  state.pieces.find((p) => p.side === side && p.type === 'king');

export function inCheck(state: GameState, side: Side): boolean {
  const king = findKing(state, side);
  return !!king && isSquareAttacked(state, king.pos, opponent(side));
}

// ---------------------------------------------------------------------------
// Move generation
// ---------------------------------------------------------------------------

function isPromotionSquare(state: GameState, side: Side, c: Coord): boolean {
  // The far end of the pawn's column: nothing but the edge (or squares outside a shaped board) beyond it.
  const f = forward(side);
  let y = c.y + f;
  while (inBounds(state.board, { x: c.x, y }) && terrainAt(state.board, { x: c.x, y }) === 'void') y += f;
  if (!inBounds(state.board, { x: c.x, y })) return true;
  return !!state.board.promotionSquares?.some((s) => s.side === side && sameCoord(s.pos, c));
}

function withPromotions(state: GameState, p: Piece, m: Move): Move[] {
  if (p.type === 'pawn' && isPromotionSquare(state, p.side, m.to))
    return PROMOTION_TYPES.map((t) => ({ ...m, promotion: t }));
  return [m];
}

function pawnMoves(state: GameState, p: Piece): Move[] {
  const moves: Move[] = [];
  const f = forward(p.side);
  const one = { x: p.pos.x, y: p.pos.y + f };
  if (isStandable(state.board, one) && !pieceAt(state, one)) {
    moves.push(...withPromotions(state, p, { pieceId: p.id, from: p.pos, to: one }));
    const two = { x: p.pos.x, y: p.pos.y + 2 * f };
    if (!p.hasMoved && isStandable(state.board, two) && !pieceAt(state, two)) {
      moves.push({ pieceId: p.id, from: p.pos, to: two, doubleStep: one });
    } else if (isStandable(state.board, two) && !pieceAt(state, two) && swarmCommanded(state, p)) {
      // Swarm Command: Pawns next to a friendly Hive Mother may advance an extra square.
      moves.push(...withPromotions(state, p, { pieceId: p.id, from: p.pos, to: two }));
    }
  }
  for (const dx of [-1, 1]) {
    const c = { x: p.pos.x + dx, y: p.pos.y + f };
    if (!isStandable(state.board, c)) continue;
    const target = pieceAt(state, c);
    if (target && target.side !== p.side) {
      moves.push(...withPromotions(state, p, { pieceId: p.id, from: p.pos, to: c, targets: [target.id], bounceTo: p.pos }));
    } else if (!target && state.enPassant && sameCoord(state.enPassant.target, c)) {
      moves.push({ pieceId: p.id, from: p.pos, to: c, targets: [state.enPassant.pawnId], bounceTo: p.pos, enPassant: true });
    }
  }
  return moves;
}

/** Built-in piece abilities (Archer, Siege Engine, Mage, Switcher, Medic). */
function abilityMoves(state: GameState, p: Piece, ordinary: Move[]): Move[] {
  const moves: Move[] = [];
  if (haunted(state, p) && p.type !== 'archer') return moves;
  const base = { pieceId: p.id, from: p.pos };
  const blockedMove = hasStatus(p, 'bound') || suppressed(state, p);
  switch (p.type) {
    case 'archer':
      if (!cannotAttack(p))
        for (const c of shotSquares(state, p)) {
          const target = pieceAt(state, c);
          if (target && target.side !== p.side) moves.push({ ...base, to: c, action: 'shoot', targets: [target.id] });
        }
      break;
    case 'siege':
      if (!silenced(p))
        for (const d of ALL_DIRS) {
          const c = add(p.pos, d);
          if (terrainAt(state.board, c) === 'cracked') moves.push({ ...base, to: c, action: 'demolish' });
        }
      break;
    case 'mage':
      if (hasUsed(p, 'teleport') || silenced(p) || blockedMove) break;
      for (let dy = -TELEPORT_RANGE; dy <= TELEPORT_RANGE; dy++)
        for (let dx = -TELEPORT_RANGE; dx <= TELEPORT_RANGE; dx++) {
          const c = { x: p.pos.x + dx, y: p.pos.y + dy };
          if ((dx === 0 && dy === 0) || !isEmpty(state, c)) continue;
          if (ordinary.some((m) => sameCoord(m.to, c))) continue;
          moves.push({ ...base, to: c, action: 'teleport' });
        }
      break;
    case 'switcher':
      if (hasUsed(p, 'swap') || silenced(p) || blockedMove) break;
      for (const ally of state.pieces) {
        if (ally.side !== p.side || ally.id === p.id || ally.type === 'king' || sizeOf(ally) > 1) continue;
        if (distance(ally.pos, p.pos) <= SWAP_RANGE) moves.push({ ...base, to: ally.pos, action: 'swap', allyId: ally.id });
      }
      break;
    case 'magnet':
      // Attraction: pull an enemy exactly two squares away (in a line) one square closer.
      if (silenced(p)) break;
      for (const d of ALL_DIRS) {
        const mid = add(p.pos, d);
        const far = add(mid, d);
        const target = pieceAt(state, far);
        if (!target || target.side === p.side || target.type === 'king' || sizeOf(target) > 1 || isBoss(target)) continue;
        if (!isEmpty(state, mid) || immuneToForcedMove(state, target, p, true)) continue;
        moves.push({ ...base, to: far, action: 'pull', allyId: target.id });
      }
      break;
    case 'pusher':
      // Shove: push an adjacent enemy one square directly away (fails if blocked by a wall or piece).
      if (silenced(p)) break;
      for (const d of ALL_DIRS) {
        const target = pieceAt(state, add(p.pos, d));
        if (!target || target.side === p.side || target.type === 'king' || sizeOf(target) > 1 || isBoss(target)) continue;
        const dest = add(target.pos, d);
        const blocked = inBounds(state.board, dest) && (isWall(state.board, dest) || !!pieceAt(state, dest));
        if (blocked || immuneToForcedMove(state, target, p, true)) continue;
        moves.push({ ...base, to: target.pos, action: 'shove', allyId: target.id });
      }
      break;
    case 'sentinel':
      // Overwatch: watch a straight line of up to four squares; tap its first square to choose it.
      if (silenced(p)) break;
      for (const d of ALL_DIRS) {
        const first = add(p.pos, d);
        if (isStandable(state.board, first)) moves.push({ ...base, to: first, action: 'overwatch' });
      }
      break;
    case 'pathfinder':
      if (hasUsed(p, 'bridge') || silenced(p)) break;
      for (const d of ALL_DIRS) {
        const c = add(p.pos, d);
        if (inBounds(state.board, c) && terrainAt(state.board, c) === 'gap') moves.push({ ...base, to: c, action: 'bridge' });
      }
      break;
    case 'splitter':
      if (hasUsed(p, 'divide') || silenced(p)) break;
      for (const d of ALL_DIRS) {
        const c = add(p.pos, d);
        if (isEmpty(state, c)) moves.push({ ...base, to: c, action: 'divide' });
      }
      break;
    case 'jailer':
      if (silenced(p)) break;
      for (const d of ALL_DIRS) {
        const target = pieceAt(state, add(p.pos, d));
        if (!target || target.side === p.side || target.type === 'king' || sizeOf(target) > 1 || isBoss(target)) continue;
        if (hasStatus(target, 'bound')) continue;
        moves.push({ ...base, to: target.pos, action: 'bind', allyId: target.id });
      }
      break;
    case 'medic':
      if (silenced(p)) break;
      for (const ally of state.pieces) {
        if (ally.side !== p.side || ally.id === p.id || ally.hp >= ally.maxHp) continue;
        if (ally.type === 'king' && !has(p, 'royal_physician')) continue;
        if (pieceDistance(p, ally) <= 1 + (has(p, 'extended_healing') ? 1 : 0))
          moves.push({ ...base, to: ally.pos, action: 'heal', allyId: ally.id });
      }
      break;
  }
  return moves;
}

/** Ordinary moves for a 1x1 piece, with bounce choices and Side Step / Royal Escort variants. */
function ordinaryMoves(state: GameState, p: Piece): Move[] {
  const moves: Move[] = [];
  const disarmed = cannotAttack(p);
  const king = kingOf(state, p.side);
  const escortKing = has(p, 'royal_escort') && king && king.id !== p.id && adjacent(king, p) && !hasStatus(king, 'bound') ? king : undefined;
  for (const st of stepsFor(state, p)) {
    const target = pieceAt(state, st.to);
    const base: Move = { pieceId: p.id, from: p.pos, to: st.to, uses: st.uses, via: st.via, crossedGap: st.crossedGap, leap: st.leap || undefined };
    if (!target) {
      if (!st.quiet) continue;
      moves.push(...withPromotions(state, p, base));
      for (const c of sideStepVariants(state, p, st.to)) {
        if (sameCoord(c, p.pos)) continue;
        moves.push({ ...base, to: c, via: st.to, uses: [...(st.uses ?? []), 'side_step'] });
      }
      if (escortKing && distance(p.pos, st.to) === 1 && !st.uses) {
        const d = sub(st.to, p.pos);
        const kTo = add(escortKing.pos, d);
        if (isEmpty(state, kTo) || sameCoord(kTo, p.pos)) moves.push({ ...base, escort: { kingId: escortKing.id, to: kTo } });
      }
      continue;
    }
    if (target.side === p.side || !st.capture || disarmed) continue;
    const bounce = bounceSquare(p.pos, st.to, st.leap, has(p, 'reduced_recoil') ? 1 : 0);
    const atk: Move = { ...base, targets: [target.id], bounceTo: bounce };
    moves.push(...withPromotions(state, p, atk));
    // Controlled Bounce: alternatively retreat all the way back.
    if (has(p, 'controlled_bounce') && !sameCoord(bounce, p.pos)) moves.push({ ...atk, bounceTo: p.pos });
    // Ricochet: once per battle, bounce sideways off the target.
    if (ready(p, 'ricochet') && !st.leap) {
      const d = sign(sub(st.to, p.pos));
      const perp = d.x === 0 || d.y === 0 ? [{ x: d.y, y: d.x }, { x: -d.y, y: -d.x }] : [{ x: d.x, y: 0 }, { x: 0, y: d.y }];
      for (const q of perp.map((v) => add(st.to, { x: -v.x, y: -v.y }))) {
        if (isEmpty(state, q) || sameCoord(q, p.pos)) moves.push({ ...atk, bounceTo: q, uses: [...(st.uses ?? []), 'ricochet'] });
      }
    }
  }
  return moves;
}

function heavyMoves(state: GameState, p: Piece): Move[] {
  const moves: Move[] = [];
  for (const st of heavySteps(state, p)) {
    const m: Move = { pieceId: p.id, from: p.pos, to: st.to, uses: st.uses, via: st.via };
    if (st.shove) m.allyId = st.shove;
    if (st.walls) m.param = 'crush';
    if (st.targets.length) {
      if (cannotAttack(p)) continue;
      moves.push({ ...m, targets: st.targets, bounceTo: p.pos });
      if (has(p, 'multi_target_precision') && st.targets.length > 1)
        for (const id of st.targets) moves.push({ ...m, targets: st.targets, bounceTo: p.pos, focusId: id });
    } else moves.push(m);
  }
  return moves;
}

/**
 * Doppelganger: Stolen Talent — every 4 turns it may use one ability of any
 * enemy piece type on the board (not bosses; not self-destroying or self-changing ones).
 */
function stolenTalents(state: GameState, p: Piece): Move[] {
  if (p.type !== 'doppelganger' || (p.counters.stealCd ?? 0) > 0 || silenced(p) || state.bonus.length) return [];
  const out: Move[] = [];
  const seen = new Set<string>();
  for (const e of state.pieces) {
    if (e.side === p.side || isBoss(e) || sizeOf(e) > 1 || seen.has(e.type)) continue;
    seen.add(e.type);
    const fake: Piece = { ...p, type: e.type, used: [], counters: {}, upgrades: [] };
    for (const m of [...abilityMoves(state, fake, []), ...specialMoves(state, fake)]) {
      if (m.action === 'detonate' || m.action === 'replicate') continue;
      out.push({ ...m, param: 'stolen' });
    }
  }
  return out;
}

/** Temporal Echo: repeat this piece's last displacement as a free extra move. */
function temporalEchoMoves(state: GameState, p: Piece, ordinary: Move[]): Move[] {
  if (!ready(p, 'temporal_echo') || p.counters.ldx === undefined || silenced(p) || state.bonus.length) return [];
  const delta = { x: p.counters.ldx, y: p.counters.ldy };
  if (delta.x === 0 && delta.y === 0) return [];
  return ordinary
    .filter((m) => !m.action && !m.uses && !m.via && sameCoord(sub(m.to, p.pos), delta))
    .map((m) => ({ ...m, action: 'upgrade' as const, upgrade: 'temporal_echo' }));
}

/** All moves for one piece, before filtering out moves that leave the King in check. */
function pseudoMovesFor(state: GameState, p: Piece): Move[] {
  if (hasStatus(p, 'stunned')) return [];
  const bound = hasStatus(p, 'bound');
  let ordinary: Move[] = [];
  if (!bound) {
    if (sizeOf(p) > 1) ordinary = heavyMoves(state, p);
    else if (p.type === 'pawn') ordinary = [...pawnMoves(state, p), ...ordinaryMoves(state, p)];
    else ordinary = ordinaryMoves(state, p);
    if (p.type === 'pawn' && cannotAttack(p)) ordinary = ordinary.filter((m) => !m.targets);
  }
  const moves = [
    ...ordinary,
    ...abilityMoves(state, p, ordinary),
    ...specialMoves(state, p),
    ...bossMoves(state, p),
    ...stolenTalents(state, p),
    ...upgradeActions(state, p),
    ...temporalEchoMoves(state, p, ordinary),
    ...(bound ? [] : tileMoves(state, p)),
    ...sonicMoves(state, p),
    ...duoMoves(state, p),
    ...crashMoves(state, p),
    ...marioMoves(state, p),
    ...marioSpaceMoves(state, p),
    ...noteMoves(state, p),
    ...metroidMoves(state, p),
    ...ben10Moves(state, p),
  ];
  // Kokiri Sword: the bonus step may go one square in any direction, whatever the piece's movement.
  if (state.bonus[0]?.source === 'kokiri_sword' && state.bonus[0].pieceId === p.id) moves.push(...kokiriSteps(state, p));
  if (p.type === 'king' && !p.hasMoved && !bound) moves.push(...castleMoves(state, p));
  return marioFilterMoves(state, p, dedupeUpgradeSteps(intimidated(state, p, moves)));
}

/**
 * Castling on any board: an unmoved King and an unmoved Rook on the same row,
 * at least three squares apart, with only open normal squares between them.
 * The King moves two squares toward the Rook; the Rook lands on the square
 * the King crossed. Under check rules the King may not castle out of, through,
 * or into check.
 */
function castleMoves(state: GameState, king: Piece): Move[] {
  const moves: Move[] = [];
  const enemy = opponent(king.side);
  for (const rook of state.pieces) {
    if (rook.side !== king.side || rook.type !== 'rook' || rook.hasMoved || rook.temp) continue;
    if (rook.pos.y !== king.pos.y) continue;
    const dist = rook.pos.x - king.pos.x;
    if (Math.abs(dist) < 3) continue;
    const dir = Math.sign(dist);
    let clear = true;
    for (let x = king.pos.x + dir; x !== rook.pos.x; x += dir) {
      const c = { x, y: king.pos.y };
      if (!isStandable(state.board, c) || pieceAt(state, c)) {
        clear = false;
        break;
      }
    }
    if (!clear) continue;
    const cross = { x: king.pos.x + dir, y: king.pos.y };
    const dest = { x: king.pos.x + 2 * dir, y: king.pos.y };
    if (state.rules.checkRules) {
      if ([king.pos, cross, dest].some((c) => isSquareAttacked(state, c, enemy))) continue;
    }
    moves.push({
      pieceId: king.id,
      from: king.pos,
      to: dest,
      castle: { rookId: rook.id, rookFrom: rook.pos, rookTo: cross },
    });
  }
  return moves;
}

function fitsBonus(m: Move, b: Bonus): boolean {
  if (b.pieceId && m.pieceId !== b.pieceId) return false;
  if (b.maxDistance !== undefined && (m.action || distance(m.from, m.to) > b.maxDistance)) return false;
  if (b.to && (m.action || !sameCoord(m.to, b.to))) return false;
  // Bounce Crate jumps, Tawna's diagonal hop and Time Relic only allow their own move.
  if (b.source === 'bounce_crate' && m.param !== 'bounce') return false;
  if (b.source === 'acrobatic_strike' && m.param !== 'acrobatic') return false;
  if ((b.source === 'stomp' || b.source === 'quick_delivery') && m.param !== b.source) return false;
  if (b.source === 'note_block' && m.param !== 'note') return false;
  if (b.source === 'time_relic') return m.action === 'upgrade' && m.upgrade === 'time_relic';
  // Super Silver's second lift: only another Psychokinesis.
  if (b.source === 'super_pk' && m.action !== 'psychokinesis') return false;
  if (b.filter === 'nonCapturing') return !m.targets?.length && (!m.action || m.action === 'teleport');
  if (b.filter === 'captureOnly') return !!m.targets?.length;
  return true;
}

export const INTERCEPT_UPGRADES = ['sacrificial_guard', 'summoned_guard', 'critical_survival', 'iron_shell', 'stone_skin', 'shared_armor'];

/**
 * Lightweight result of a move whose outcome is certain: a piece without
 * upgrades or statuses making an ordinary move, shot, teleport, swap or heal
 * that can't trigger any special effect. Only piece positions, captures and
 * the turn change. Returns undefined when anything unusual could happen.
 */
export function quickApply(state: GameState, m: Move): GameState | undefined {
  if (m.action && m.action !== 'shoot' && m.action !== 'teleport' && m.action !== 'swap' && m.action !== 'heal') return undefined;
  if (m.castle || state.timed.length || state.bonus.length || state.overwatch.length || state.reborn.length || m.uses) return undefined;
  const mover = getPiece(state, m.pieceId);
  if (!mover || mover.upgrades.length || mover.statuses.length) return undefined;
  if (state.pieces.some((p) => p.type === 'necromancer' || p.type === 'stormbringer' || p.type === 'redead')) return undefined;
  if (ZELDA_TYPES.has(mover.type) || state.engulfed?.length || state.tiles?.length || state.bones?.length) return undefined;
  const removed = new Set<string>();
  let pieces = state.pieces;
  if (m.action === 'heal') {
    pieces = pieces.map((p) => (p.id === m.allyId ? { ...p, hp: Math.min(p.maxHp, p.hp + 1) } : p));
  } else if (m.action === 'swap') {
    const ally = getPiece(state, m.allyId)!;
    pieces = pieces.map((p) =>
      p.id === mover.id ? { ...p, pos: ally.pos, used: [...p.used, 'swap'] } : p.id === ally.id ? { ...p, pos: mover.pos } : p,
    );
  } else {
    if (m.targets?.length) {
      if (m.targets.length !== 1) return undefined;
      const t = getPiece(state, m.targets[0]);
      if (!t || t.upgrades.length || t.shields.length || t.statuses.length || t.hp > PIECE_STATS[mover.type].damage) return undefined;
      if (t.type === 'phoenix' || mover.type === 'reaper' || isBoss(t) || ZELDA_TYPES.has(t.type)) return undefined;
      if (state.zones.length || INTERCEPT_UPGRADES.some((u) => anyHas(state, u))) return undefined;
      if (state.pieces.some((g) => g.side === t.side && g.id !== t.id && (g.type === 'guardian' || g.temp) && adjacent(g, t)))
        return undefined;
      removed.add(t.id);
    }
    pieces = pieces
      .filter((p) => !removed.has(p.id))
      .map((p) =>
        p.id === mover.id && m.action !== 'shoot'
          ? { ...p, pos: m.to, hasMoved: true, type: m.promotion ?? p.type, used: m.action === 'teleport' ? [...p.used, 'teleport'] : p.used }
          : p,
      );
  }
  const captured = removed.size ? [...state.captured, ...state.pieces.filter((p) => removed.has(p.id))] : state.captured;
  const next: GameState = {
    ...state,
    pieces,
    captured,
    turn: opponent(state.turn),
    ply: state.ply + 1,
    enPassant: m.doubleStep ? { target: m.doubleStep, pawnId: m.pieceId } : null,
    log: [],
  };
  freeze(next);
  return next;
}

/** Would this move leave `side`'s King in check? Uses the fast path when it is exact. */
function leavesKingInCheck(state: GameState, m: Move, side: Side): boolean {
  const quick = quickApply(state, m);
  return inCheck(quick ?? applyMoveRaw(state, m), side);
}

export function legalMoves(state: GameState, side: Side = state.turn): Move[] {
  const out: Move[] = [];
  const bonus = side === state.turn ? state.bonus[0] : undefined;
  for (const p of state.pieces) {
    if (p.side !== side) continue;
    if (bonus?.pieceId && bonus.pieceId !== p.id) continue;
    for (const m of pseudoMovesFor(state, p)) {
      if (bonus && !fitsBonus(m, bonus)) continue;
      if (bonus && ((m.upgrade && FREE_ACTIONS.has(m.upgrade)) || (m.action && FREE_BOSS_ACTIONS.has(m.action)))) continue; // no chaining free actions
      if (state.rules.checkRules && m.upgrade !== 'time_reversal' && m.upgrade !== 'time_relic' && m.action !== 'rewind') {
        if (leavesKingInCheck(state, m, side)) continue;
      }
      out.push(m);
    }
  }
  if (bonus?.optional) out.push({ pieceId: bonus.pieceId ?? '', from: { x: -1, y: -1 }, to: { x: -1, y: -1 }, action: 'pass' });
  return out;
}

export function legalMovesForPiece(state: GameState, pieceId: string): Move[] {
  return legalMoves(state).filter((m) => m.pieceId === pieceId);
}

// ---------------------------------------------------------------------------
// Resolving attacks
// ---------------------------------------------------------------------------

/** Is the attacker on the far side of the target from the target's own lines? */
function behind(attackerFrom: Coord, target: Piece) {
  return (attackerFrom.y - target.pos.y) * forward(target.side) < 0;
}

/** Strictly between the King and the target on one straight line. */
function betweenKingAndTarget(s: GameState, p: Piece, from: Coord, target: Piece) {
  const king = kingOf(s, p.side);
  if (!king || king.id === p.id) return false;
  const kt = sub(target.pos, king.pos);
  const kp = sub(from, king.pos);
  const straight = kt.x === 0 || kt.y === 0 || Math.abs(kt.x) === Math.abs(kt.y);
  if (!straight) return false;
  const d = sign(kt);
  const n = Math.max(Math.abs(kp.x), Math.abs(kp.y));
  return n > 0 && sameCoord(kp, { x: d.x * n, y: d.y * n }) && n < Math.max(Math.abs(kt.x), Math.abs(kt.y));
}

/** Gap squares between two squares on a line (or under a jump). */
function gapBetween(s: GameState, a: Coord, b: Coord): boolean {
  const d = sign(sub(b, a));
  const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  const straight = a.x === b.x || a.y === b.y || Math.abs(b.x - a.x) === Math.abs(b.y - a.y);
  if (!straight) return false;
  for (let i = 1; i < n; i++) if (terrainAt(s.board, { x: a.x + d.x * i, y: a.y + d.y * i }) === 'gap') return true;
  return false;
}

/** Damage `p` deals to `t` with this move, consuming one-shot buffs. */
function outgoingDamage(s: GameState, p: Piece, t: Piece, m: Move, nTargets: number): number {
  let dmg = PIECE_STATS[p.type].damage;
  if (dmg === 0) return 0;
  // Assassin Backstab: 2 damage to an enemy that hasn't moved since its last turn began.
  if (p.type === 'assassin' && t.turnPos && sameCoord(t.turnPos, t.pos)) dmg = Math.max(dmg, 2);
  // Slayer Giant Killer: 2 against multi-HP enemies, 3 against Boss Pieces.
  if (p.type === 'slayer') dmg = Math.max(dmg, isBoss(t) ? 3 : t.maxHp > 1 ? 2 : dmg);
  if (ready(p, 'heavy_strike')) {
    markUsed(p, 'heavy_strike');
    dmg += 1;
  }
  if (has(p, 'executioner') && t.hp === 1) dmg += 1;
  if (has(p, 'ambush') && p.attacks === 0) dmg += 1;
  if (has(p, 'opening_assault') && p.attacks < 3) dmg += 1;
  if (has(p, 'backstab') && behind(m.from, t)) dmg += 1;
  if (has(p, 'royal_hunter') && t.type === 'queen') dmg += 1;
  if (has(p, 'siege_damage') && sizeOf(t) > 1) dmg += 1;
  if (t.statuses.some((st) => st.kind === 'prey' && st.source === p.side)) dmg += 1;
  if (has(p, 'revenge_strike') && t.id === p.lastAttackerId) dmg += 1;
  if (has(p, 'kingbreaker') && t.type === 'king') dmg += 1;
  if (has(p, 'master_sword') && isBoss(t)) dmg += 1;
  if (has(p, 'triforce_power')) dmg += 1;
  if (has(p, 'chaos_emeralds')) dmg += 1;
  // Spin Dash: +1 after travelling 3+ squares in a straight line.
  if (has(p, 'spin_dash') && !m.action && !m.leap) {
    const dx = m.to.x - m.from.x;
    const dy = m.to.y - m.from.y;
    if ((dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy)) && Math.max(Math.abs(dx), Math.abs(dy)) >= 3) dmg += 1;
  }
  // Motobug Full Speed Ahead: +1 after rolling three or more squares sideways.
  if (p.type === 'motobug' && m.from.y === m.to.y && Math.abs(m.to.x - m.from.x) >= 3) dmg += 1;
  if (has(p, 'triforce_courage') && t.maxHp > p.maxHp) dmg += 1;
  // Digital Duo: Teto's duet and the Baguette boost the first attack of the battle.
  dmg += tetoDuetBonus(s, p) + baguetteBonus(p) + crashAttackBonus(s, p, m) + crashUpgradeAttackBonus(p, m) + marioAttackBonus(s, p, t, m) + marioUpgradeAttackBonus(p, m) + metroidAttackBonus(p, m) + ben10AttackBonus(s, p, m) + ben10UpgradeAttackBonus(p, m);
  // Lizalfos Pack Hunter: 2 damage to an enemy standing next to another friendly Lizalfos.
  if (p.type === 'lizalfos' && s.pieces.some((o) => o.side === p.side && o.id !== p.id && o.type === 'lizalfos' && pieceDistance(o, t) === 1))
    dmg += 1;
  if (sizeOf(p) > 1 && !m.action) {
    if (has(p, 'wide_sweep') && nTargets >= 2) dmg += 1;
    if (has(p, 'crushing_weight')) dmg += 1;
    const dir = sign(sub(m.to, m.from));
    if (has(p, 'siege_momentum') && p.streak >= 2 && p.lastDir && sameCoord(p.lastDir, dir)) dmg += 1;
  }
  if (has(p, 'royal_formation') && betweenKingAndTarget(s, p, m.from, t)) dmg += 1;
  const crossed = m.crossedGap || gapBetween(s, m.from, m.to);
  if (has(p, 'gap_assault') && crossed) dmg += 1;
  if (has(p, 'leap_assault') && m.leap && m.crossedGap) dmg += 1;
  if (m.focusId === t.id) dmg += 1;
  const buff = statusOf(p, 'damageBuff');
  if (buff) dmg += buff.amount ?? 0;
  // Target statuses.
  if (statusOf(t, 'marked')) {
    dmg += 1;
    removeStatus(t, 'marked');
  }
  if (statusOf(t, 'permMarked')) dmg += 1;
  const vul = statusOf(t, 'vulnerable');
  if (vul) {
    dmg += 1;
    vul.count = (vul.count ?? 1) - 1;
    if (vul.count <= 0) removeStatus(t, 'vulnerable');
  }
  if (statusOf(p, 'weakened')) dmg -= 1;
  return Math.max(0, marioDamageCap(p, dmg));
}

const alive = (s: GameState, id: string) => s.pieces.some((p) => p.id === id);

/** Apply an attack (movement or ranged) and move/bounce the attacker. */
function resolveAttack(s: GameState, m: Move, entry?: Bonus) {
  const p = getPiece(s, m.pieceId)!;
  const ranged = m.action === 'shoot';
  const targets = (m.targets ?? []).map((id) => getPiece(s, id)).filter(Boolean) as Piece[];
  const dir = sign(sub(m.to, m.from));
  const leap = !!m.leap;
  let captured = 0;
  let bigKills = 0;
  let guardFellAt: Coord | undefined;
  let guardSurvived = false;
  const damages = targets.map((t) => outgoingDamage(s, p, t, m, targets.length));
  // One-shot buffs are spent once the attack is made.
  const buff = statusOf(p, 'damageBuff');
  if (buff && buff.source !== 'last_royal_stand') removeStatus(p, 'damageBuff');
  removeStatus(p, 'weakened');

  targets.forEach((t, i) => {
    if (!alive(s, t.id)) return;
    let dmg = damages[i];
    // E.M.M.I.'s Capture Protocol: a last-HP enemy is taken outright, nothing can stop it.
    const protocol = emmiCaptures(p, t);
    let lethal = protocol;
    const wouldSurvive = dmg < t.hp + shieldTotal(t);
    if (wouldSurvive && !isBoss(t)) {
      if (ready(p, 'perfect_strike')) {
        markUsed(p, 'perfect_strike');
        lethal = true;
      } else if (ready(p, 'absolute_capture')) {
        markUsed(p, 'absolute_capture');
        lethal = true;
      }
    }
    const pos = { ...t.pos };
    const hpBefore = t.hp + shieldTotal(t);
    let out: DamageOutcome = dealDamage(s, t.id, dmg, {
      sourceId: p.id,
      kind: ranged ? 'ranged' : 'attack',
      allowIntercept: targets.length === 1,
      pierce: has(p, 'precision') ? 1 : 0,
      lethal,
      pure: has(p, 'light_arrows') || protocol,
      trueSight: has(p, 'lens_of_truth'),
    });
    biggoronCleave(s, p, pos, dir, m.targets ?? []);
    flameRing(s, p, pos, m.targets ?? []);
    crashAfterAttack(s, p, m, pos, m.targets ?? []);
    if (out.kind === 'intercepted') {
      const guard = out.by;
      const gpos = s.captured.find((c) => c.id === guard)?.pos;
      if (out.outcome.kind === 'captured') guardFellAt = gpos;
      else guardSurvived = true;
      return;
    }
    if (out.kind === 'survived' && alive(s, t.id) && ready(p, 'double_impact')) {
      markUsed(p, 'double_impact');
      log(s, 'Double Impact!');
      out = dealDamage(s, t.id, dmg, { sourceId: p.id, kind: ranged ? 'ranged' : 'attack' });
    }
    const now = getPiece(s, t.id);
    if (now && now.hp === 1 && ready(p, 'finishing_blow') && alive(s, p.id)) {
      markUsed(p, 'finishing_blow');
      out = dealDamage(s, t.id, 1, { sourceId: p.id, kind: ranged ? 'ranged' : 'attack' });
    }
    // Fire / Ice Arrows on an enemy that took damage and is still standing.
    const after = getPiece(s, t.id);
    if (after && after.hp + shieldTotal(after) < hpBefore) arrowEffects(s, p, t.id);
    if (!alive(s, t.id) && !s.reborn.some((r) => r.id === t.id) && t.side !== p.side) {
      if (t.maxHp > 1) bigKills++;
    }
    if (!alive(s, t.id)) {
      captured++;
      dmg = dmg - hpBefore;
      if (has(p, 'overkill') && dmg > 0) {
        const extra = s.pieces.find((e) => e.side === t.side && footprint(e).some((c) => distance(c, pos) === 1));
        if (extra) dealDamage(s, extra.id, dmg, { sourceId: p.id, kind: 'splash' });
      }
    }
  });

  if (!alive(s, p.id)) return;
  // Baguette: a first attack that defeats its target restores 1 HP.
  if (baguetteBonus(p) && captured > 0) heal(s, p, 1);
  p.attacks += 1;

  const survivors = targets.filter((t) => alive(s, t.id));
  // A Stalfos that just collapsed leaves its bones in the way: the attacker bounces back.
  const collapsed = targets.some((t) => s.bones?.some((b) => b.piece.id === t.id));
  const blocked = survivors.length > 0 || guardSurvived || collapsed;

  if (!ranged) {
    if (guardFellAt && sizeOf(p) === 1) {
      p.pos = guardFellAt;
    } else if (blocked) {
      let land = m.bounceTo ?? m.from;
      const adjacentLand = leap ? m.from : sub(m.to, dir);
      if (p.type === 'slayer') {
        land = adjacentLand; // Relentless: only one square of bounceback
      } else if (ready(p, 'unyielding_assault')) {
        markUsed(p, 'unyielding_assault');
        land = adjacentLand;
      } else if (ready(p, 'counterweight')) {
        markUsed(p, 'counterweight');
        land = adjacentLand;
      } else if (has(p, 'full_retreat') && !m.uses?.includes('ricochet')) land = m.from;
      if (!sameCoord(land, m.from) && !isEmpty(s, land)) land = m.from;
      if (sizeOf(p) > 1) land = m.from;
      p.pos = { ...land };
      afterBounce(s, p, distance(land, m.to));
      if (sizeOf(p) > 1 && ready(p, 'unbroken_advance')) {
        markUsed(p, 'unbroken_advance');
        s.bonus.unshift({ pieceId: p.id, filter: 'nonCapturing', optional: true, source: 'unbroken_advance' });
      }
    } else {
      p.pos = { ...m.to };
      if (m.promotion) promote(p, m.promotion);
    }
  }

  // Weakening Strike: survivors deal one less damage with their next attack.
  if (has(p, 'weakening_strike')) for (const t of survivors) {
    const tp = getPiece(s, t.id);
    if (tp) addStatus(tp, { kind: 'weakened', until: null });
  }

  // Pushes on surviving defenders.
  for (const t of survivors) {
    const tp = getPiece(s, t.id)!;
    const away = sign(sub(tp.pos, m.from));
    const d = sizeOf(p) > 1 ? dir : away;
    if (has(p, 'heavy_impact') || has(p, 'forceful_charge')) push(s, tp.id, d, pushDistance(p), p.id);
    else if (ready(p, 'knockback')) {
      markUsed(p, 'knockback');
      push(s, tp.id, d, pushDistance(p), p.id);
    }
  }

  if (captured > 0) {
    for (let i = 0; i < captured; i++) harvestSoul(s, p);
    if (p.type === 'zora') p.counters.evadeSpent = 0; // Graceful Evasion recharges
    if (p.type === 'rouge') p.counters.captures = (p.counters.captures ?? 0) + captured; // Stealth ends
    if (has(p, 'purple_frenzy')) p.counters.frenzy = (p.counters.frenzy ?? 0) + captured;
    // Ancient Light: one more capture right away (once per turn).
    if (has(p, 'ancient_light') && alive(s, p.id) && entry?.source !== 'ancient_light' && (p.counters.lightPly ?? -1) !== s.ply) {
      p.counters.lightPly = s.ply;
      s.bonus.unshift({ pieceId: p.id, filter: 'captureOnly', optional: true, source: 'ancient_light' });
    }
    // Epona Gallop: an optional Knight jump to an empty square after a capture.
    if (p.type === 'epona' && m.action !== 'shoot' && alive(s, p.id) && entry?.source !== 'gallop')
      s.bonus.unshift({ pieceId: p.id, filter: 'nonCapturing', optional: true, source: 'gallop', maxDistance: 2 });
    // Kokiri Sword: an optional one-square step after a capture.
    if (has(p, 'kokiri_sword') && m.action !== 'shoot' && alive(s, p.id) && sizeOf(p) === 1 && entry?.source !== 'kokiri_sword')
      s.bonus.unshift({ pieceId: p.id, filter: 'nonCapturing', optional: true, source: 'kokiri_sword', maxDistance: 1 });
    if (p.type === 'slayer' && bigKills > 0) heal(s, p, 1); // Bloodlust
    // Assassin Execution: an extra non-capturing move of up to two squares.
    if (p.type === 'assassin' && m.action !== 'shoot' && alive(s, p.id) && entry?.source !== 'execution')
      s.bonus.unshift({ pieceId: p.id, filter: 'nonCapturing', optional: true, source: 'execution', maxDistance: 2 });
    afterCapture(s, p, m, dir, entry);
  }
}

function afterBounce(s: GameState, p: Piece, dist: number) {
  if (has(p, 'rebound_shield')) addShield(s, p);
  const neighbour = () => enemiesOf(s, p).find((e) => adjacent(e, p));
  if (ready(p, 'rebound_strike') && neighbour()) {
    markUsed(p, 'rebound_strike');
    dealDamage(s, neighbour()!.id, 1, { sourceId: p.id, kind: 'splash' });
  }
  if (ready(p, 'rebound_capture') && neighbour()) {
    markUsed(p, 'rebound_capture');
    dealDamage(s, neighbour()!.id, PIECE_STATS[p.type].damage, { sourceId: p.id, kind: 'attack', allowIntercept: true });
  }
  if (has(p, 'spring_loaded')) addStatus(p, { kind: 'springLoaded', until: null });
  if (has(p, 'recoil_conversion') && dist > 0) {
    addStatus(p, { kind: 'rangeBuff', amount: dist, until: nextTurnEnd(s, p.side) });
  }
}

const nextTurnEnd = (s: GameState, side: Side) => {
  let q = s.ply + 1;
  while ((q % 2 === 0 ? 'player' : 'enemy') !== side) q++;
  return q;
};

function afterCapture(s: GameState, p: Piece, m: Move, dir: Coord, entry?: Bonus) {
  if (has(p, 'healing_on_capture')) heal(s, p, 1);
  const at = m.action === 'shoot' ? m.to : p.pos;
  if (has(p, 'piercing_capture')) {
    const next = pieceAt(s, add(m.to, dir));
    if (next && next.side !== p.side) dealDamage(s, next.id, 1, { sourceId: p.id, kind: 'attack' });
  }
  const cleave = (dirs: Coord[]) => {
    for (const d of dirs) {
      const e = pieceAt(s, add(m.to, d));
      if (e && e.side !== p.side) dealDamage(s, e.id, 1, { sourceId: p.id, kind: 'splash' });
    }
  };
  if (p.type === 'reaper') cleave(ALL_DIRS);
  if (has(p, 'diagonal_cleave')) cleave(ALL_DIRS.slice(4));
  if (has(p, 'orthogonal_cleave')) cleave(ORTHO);
  if (has(p, 'shockwave') && alive(s, p.id)) {
    for (const e of enemiesOf(s, p).filter((e) => footprint(e).some((c) => distance(c, at) === 1))) {
      push(s, e.id, sign(sub(e.pos, at)), pushDistance(p), p.id);
    }
  }
  if (p.temp) {
    const summoner = getPiece(s, p.temp.summonerId);
    if (summoner && has(summoner, 'summoners_reward')) addShield(s, summoner);
  }
  if (!alive(s, p.id) || m.action === 'shoot') return;
  const chainSource = entry?.source;
  if (has(p, 'infinite_momentum') && (p.counters.momentumChain ?? 0) < 3) {
    p.counters.momentumChain = (p.counters.momentumChain ?? 0) + 1;
    s.bonus.unshift({ pieceId: p.id, filter: 'captureOnly', optional: true, source: 'infinite_momentum' });
  } else if (has(p, 'chain_capture') && chainSource !== 'chain_capture' && chainSource !== 'infinite_momentum') {
    s.bonus.unshift({ pieceId: p.id, filter: 'captureOnly', optional: true, source: 'chain_capture' });
  }
}

function promote(p: Piece, t: PromotionType) {
  p.type = t;
  const max = PIECE_STATS[t].maxHp;
  p.maxHp = Math.max(p.maxHp, max);
}

// ---------------------------------------------------------------------------
// Resolving moves
// ---------------------------------------------------------------------------

function resolveOrdinary(s: GameState, m: Move, entry?: Bonus) {
  const p = getPiece(s, m.pieceId)!;
  for (const u of m.uses ?? []) markUsed(p, u);
  if (entry?.source === 'unstoppable_march') markUsed(p, 'unstoppable_march');

  if (sizeOf(p) > 1) {
    const dir = sign(sub(m.to, m.from));
    if (m.allyId) {
      const shoved = getPiece(s, m.allyId);
      if (shoved && !push(s, shoved.id, dir, 1, p.id)) return; // couldn't clear the way
    }
    if (m.param === 'crush') for (const c of footprint(p, m.to)) destroyCracked(s, c, p);
  }

  if (m.targets?.length) {
    resolveAttack(s, m, entry);
  } else {
    p.pos = { ...m.to };
    if (m.promotion) promote(p, m.promotion);
    if (m.escort) {
      const king = getPiece(s, m.escort.kingId);
      if (king) king.pos = { ...m.escort.to };
    }
    if (ready(p, 'unstoppable_march') && entry?.source !== 'unstoppable_march' && !s.bonus.some((b) => b.source === 'unstoppable_march')) {
      s.bonus.unshift({ pieceId: p.id, filter: 'any', optional: true, source: 'unstoppable_march' });
    }
  }

  // Massive Push: shove enemies directly ahead of a large piece after it advances.
  if (sizeOf(p) > 1 && has(p, 'massive_push') && getPiece(s, p.id)) {
    const dir = sign(sub(m.to, m.from));
    const ahead = footprint(p).map((c) => add(c, dir));
    for (const e of enemiesOf(s, p).filter((e) => footprint(e).some((c) => ahead.some((a) => sameCoord(a, c)))))
      push(s, e.id, dir, pushDistance(p), p.id);
  }
}

function resolve(s: GameState, m: Move, entry?: Bonus) {
  const p = getPiece(s, m.pieceId);
  if (!p) return;
  if (resolveBoss(s, m)) return;
  if (resolveSpecial(s, m)) return;
  if (resolveSonic(s, m, entry)) return;
  if (resolveDuo(s, m)) return;
  if (resolveCrash(s, m)) return;
  if (resolveMario(s, m)) return;
  if (resolveHitBlock(s, m)) return;
  if (resolveMetroid(s, m)) return;
  if (resolveBen10(s, m)) return;
  // Homing Attack / Cyan Laser ending on an enemy: a real attack, with bounceback.
  if (m.action === 'upgrade' && ATTACK_UPGRADES.has(m.upgrade!) && m.targets?.length) {
    spendSonicAction(p, m.upgrade!);
    log(s, `${nameOf(p)} uses ${UPGRADE_BY_ID[m.upgrade!]?.name ?? m.upgrade}.`);
    resolveAttack(s, { ...m, action: undefined, upgrade: undefined }, entry);
    return;
  }
  switch (m.action) {
    case 'pass':
      return;
    case 'unlock':
      resolveUnlock(s, m);
      return;
    case 'shoot':
      resolveAttack(s, m, entry);
      return;
    case 'demolish':
      destroyCracked(s, m.to, p);
      if (has(p, 'chain_demolition')) {
        const next = ALL_DIRS.map((d) => add(m.to, d)).find((q) => terrainAt(s.board, q) === 'cracked');
        if (next) destroyCracked(s, next, p);
      }
      return;
    case 'teleport':
      p.pos = { ...m.to };
      markUsed(p, 'teleport');
      return;
    case 'swap': {
      const ally = getPiece(s, m.allyId)!;
      [p.pos, ally.pos] = [ally.pos, p.pos];
      markUsed(p, 'swap');
      return;
    }
    case 'heal': {
      const ally = getPiece(s, m.allyId)!;
      heal(s, ally, 1);
      if (has(p, 'medics_reward')) addShield(s, p);
      return;
    }
    case 'pull': {
      const target = getPiece(s, m.allyId);
      if (target) push(s, target.id, sign(sub(p.pos, target.pos)), 1, p.id);
      return;
    }
    case 'shove': {
      const target = getPiece(s, m.allyId);
      if (target) push(s, target.id, sign(sub(target.pos, p.pos)), pushDistance(p), p.id);
      return;
    }
    case 'overwatch': {
      const d = sign(sub(m.to, p.pos));
      const cells: Coord[] = [];
      let c = p.pos;
      for (let i = 0; i < 4; i++) {
        c = add(c, d);
        if (!isStandable(s.board, c)) break;
        cells.push(c);
      }
      s.overwatch = s.overwatch.filter((o) => o.sentinelId !== p.id);
      s.overwatch.push({ sentinelId: p.id, side: p.side, cells });
      log(s, `${nameOf(p)} keeps watch.`);
      return;
    }
    case 'bridge':
      markUsed(p, 'bridge');
      addTimedTerrain(s, m.to, 'bridge', 3, p.side, p);
      return;
    case 'divide': {
      markUsed(p, 'divide');
      const copy = summon(s, p, 'splitter', m.to, 'divide', { copy: 'weak' });
      markUsed(copy, 'divide'); // the copy cannot duplicate itself
      return;
    }
    case 'bind': {
      const target = getPiece(s, m.allyId);
      if (target) addStatus(target, { kind: 'bound', until: nextTurnEnd(s, target.side) });
      return;
    }
    case 'upgrade':
      if (m.upgrade === 'temporal_echo') {
        markUsed(p, 'temporal_echo');
        resolveOrdinary(s, { ...m, action: undefined, upgrade: undefined }, entry);
        s.bonus.unshift({ filter: 'any', optional: false, source: 'turn' });
        return;
      }
      resolveUpgradeAction(s, m);
      return;
  }
  if (m.castle) {
    p.pos = { ...m.to };
    const rook = getPiece(s, m.castle.rookId)!;
    rook.pos = { ...m.castle.rookTo };
    rook.hasMoved = true;
    return;
  }
  resolveOrdinary(s, m, entry);
}

/** Copy of a state without its own snapshots (so they never nest). */
function snapshotOf(state: GameState): GameState {
  return { ...state, snapshot: {} };
}

/**
 * Apply a move without recomputing the result or history. Used for legality
 * checks and AI look-ahead, where the full result check would be wasted work.
 */
export function applyMoveRaw(state: GameState, m: Move): GameState {
  const side = state.turn;
  if (m.action === 'rewind') {
    // Chronarch: undo the opponent's most recent move (it becomes their turn again).
    const snap = state.snapshot[opponent(side)];
    if (snap) {
      const restored = cloneState(snap);
      restored.snapshot = {};
      restored.positionHistory = state.positionHistory;
      restored.runFlags = [...state.runFlags];
      const user = getPiece(restored, m.pieceId);
      if (user) markUsed(user, 'rewind');
      restored.log = ['Rewind! The enemy’s last move is undone.'];
      freeze(restored);
      return restored;
    }
  }
  // Time Relic: take back the move just made and choose again.
  if (m.action === 'upgrade' && m.upgrade === 'time_relic') {
    const snap = state.snapshot[side];
    if (snap) {
      const restored = cloneState(snap);
      restored.snapshot = { ...state.snapshot, [side]: undefined };
      restored.positionHistory = state.positionHistory;
      restored.runFlags = [...state.runFlags];
      const user = getPiece(restored, m.pieceId);
      if (user) markUsed(user, 'time_relic');
      restored.log = ['Time Relic! The move is taken back.'];
      freeze(restored);
      return restored;
    }
  }
  if (m.action === 'upgrade' && m.upgrade === 'time_reversal') {
    const snap = state.snapshot[side];
    if (snap) {
      const restored = cloneState(snap);
      restored.snapshot = { ...state.snapshot, [side]: undefined };
      restored.positionHistory = state.positionHistory;
      restored.runFlags = [...state.runFlags];
      const user = getPiece(restored, m.pieceId);
      if (user) markUsed(user, 'time_reversal');
      restored.log = ['Time Reversal! The last turn is undone.'];
      freeze(restored);
      return restored;
    }
  }
  const s = cloneState(state);
  const mainMove = s.bonus.length === 0;
  const rewinder = state.pieces.some((p) => p.side !== side && p.type === 'chronarch' && !hasUsed(p, 'rewind'));
  if (mainMove && (rewinder || state.pieces.some((p) => p.side === side && (ready(p, 'time_reversal') || ready(p, 'time_relic'))))) {
    s.snapshot = { ...s.snapshot, [side]: snapshotOf(state) };
  }
  const entry = s.bonus.shift();
  const mover = getPiece(s, m.pieceId);
  const from = mover ? { ...mover.pos } : undefined;
  zeldaBeforeMove(s, m);
  sonicBeforeMove(s, m);
  drillThrough(s, m);
  crashUpgradeBeforeMove(s, m);
  marioUpgradeBeforeMove(s, m);
  metroidBeforeMove(s, m);
  ben10BeforeMove(s, m);
  ben10UpgradeBeforeMove(s, m);
  resolve(s, m, entry);
  zeldaAfterMove(s, m, from);
  sonicAfterMove(s, m, from, entry);
  crashAfterMove(s, m, from, entry, s.captured.length > state.captured.length);
  crashUpgradeAfterMove(s, m, from, entry, s.captured.length - state.captured.length, mainMove);
  marioAfterMove(s, m, from, entry, s.captured.length - state.captured.length);
  marioUpgradeAfterMove(s, m, entry, s.captured.length - state.captured.length);
  metroidAfterMove(s, m, from, entry, s.captured.length - state.captured.length);
  ben10AfterMove(s, m, from, entry, s.captured.length - state.captured.length);
  ben10UpgradeAfterMove(s, m, from, entry, s.captured.length - state.captured.length);
  nitroProximity(s, m, from);
  tilesAfterMove(s, m, from, state);

  // Doppelganger: a borrowed ability starts the Stolen Talent cooldown.
  if (m.param === 'stolen') {
    const d = getPiece(s, m.pieceId);
    if (d) d.counters.stealCd = BOSS_COOLDOWNS.stealCd;
  }
  // Stormbringer: Charged Ground — the square it leaves stays charged until its next turn.
  const storm = getPiece(s, m.pieceId);
  if (storm?.type === 'stormbringer' && from && !m.action && !sameCoord(from, storm.pos)) {
    s.overwatch.push({ sentinelId: `${storm.id}:charge`, side: storm.side, cells: [from] });
  }

  // Overwatch: the first enemy to end a move on a watched line takes 1 damage.
  const moved = getPiece(s, m.pieceId);
  if (moved && from && !sameCoord(from, moved.pos) && s.overwatch.length) {
    const cells = footprint(moved);
    const watch = s.overwatch.find((o) => o.side !== moved.side && o.cells.some((c) => cells.some((f) => sameCoord(f, c))));
    if (watch) {
      s.overwatch = s.overwatch.filter((o) => o !== watch);
      log(s, 'Overwatch fires!');
      dealDamage(s, moved.id, 1, { sourceId: watch.sentinelId, kind: 'splash' });
    }
  }

  // Bookkeeping on the mover.
  const after = getPiece(s, m.pieceId);
  if (after && m.action !== 'pass') {
    after.actedPly = s.ply;
    if (after.type !== 'pawn' || !m.action) after.hasMoved = true;
    if (from && !sameCoord(from, after.pos) && (!m.action || m.upgrade === 'temporal_echo')) {
      const d = sign(sub(after.pos, from));
      after.streak = after.lastDir && sameCoord(after.lastDir, d) ? after.streak + 1 : 1;
      after.lastDir = d;
      after.counters.ldx = m.to.x - m.from.x;
      after.counters.ldy = m.to.y - m.from.y;
      // Royal Inspiration: when the King moves, inspired allies gain range for their next turn.
      if (after.type === 'king') {
        for (const a of s.pieces.filter((a) => a.side === after.side && has(a, 'royal_inspiration'))) {
          addStatus(a, { kind: 'rangeBuff', amount: 1, until: nextTurnEnd(s, a.side) });
        }
      }
    }
  }
  const mover0 = state.pieces.find((p) => p.id === m.pieceId);
  const resetClock = mover0?.type === 'pawn' || (m.targets?.length ?? 0) > 0 || s.captured.length !== state.captured.length;
  s.halfmoveClock = resetClock ? 0 : state.halfmoveClock + 1;
  s.enPassant = m.doubleStep ? { target: m.doubleStep, pawnId: m.pieceId } : null;

  if (s.bonus.length === 0) endTurn(s);
  freeze(s);
  return s;
}

// ---------------------------------------------------------------------------
// Turn processing
// ---------------------------------------------------------------------------

const orthoGaps = (s: GameState, c: Coord) =>
  ORTHO.filter((d) => {
    const q = add(c, d);
    return !inBounds(s.board, q) || isHole(s.board, q);
  }).length;

const wallsAround = (s: GameState, p: Piece) => {
  const cells = new Set<string>();
  for (const c of footprint(p)) for (const d of ALL_DIRS) {
    const q = add(c, d);
    if (isWall(s.board, q)) cells.add(coordKey(q));
  }
  return cells.size;
};

function endTurn(s: GameState) {
  const side = s.turn;
  for (const p of s.pieces.filter((p) => p.side === side)) {
    const moved = p.turnPos ? !sameCoord(p.turnPos, p.pos) : false;
    p.stillTurns = moved ? 0 : p.stillTurns + 1;
    p.counters.turns = (p.counters.turns ?? 0) + 1;
    p.counters.momentumChain = 0;
    for (const k of Object.keys(p.counters)) if (k.endsWith('Cd') && p.counters[k] > 0) p.counters[k] -= 1;
    const king = kingOf(s, side);
    const nextToKing = !!king && king.id !== p.id && adjacent(king, p);

    if ((p.type === 'bastion' || has(p, 'fortress_stance')) && p.actedPly !== s.ply && shieldTotal(p) === 0) addShield(s, p);
    if (has(p, 'island_defender') && footprint(p).some((c) => orthoGaps(s, c) >= 2)) addShield(s, p);
    if (has(p, 'wall_shield') && wallsAround(s, p) > 0 && shieldTotal(p) === 0) addShield(s, p);
    if (has(p, 'crown_defender') && nextToKing && shieldTotal(p) === 0) addShield(s, p);
    if (has(p, 'kings_blessing') && nextToKing) heal(s, p, 1);
    if (has(p, 'healing_aura') && p.counters.turns % 3 === 0) {
      const target = allies(s, p)
        .filter((a) => adjacent(a, p) && a.hp < a.maxHp && a.type !== 'king')
        .sort((a, b) => a.hp - b.hp)[0];
      if (target) heal(s, target, 1);
    }
    if (has(p, 'regeneration') && p.counters.turns % 4 === 0) heal(s, p, 1);
    if (has(p, 'heavy_recovery') && p.stillTurns >= 2) {
      heal(s, p, 1);
      p.stillTurns = 0;
    }
    if (has(p, 'fortified_position')) {
      const fortified = statusOf(p, 'fortified');
      const walls = wallsAround(s, p) >= 2;
      if (walls && !fortified) {
        p.maxHp += 1;
        addStatus(p, { kind: 'fortified', until: null });
      } else if (!walls && fortified) {
        p.maxHp -= 1;
        p.hp = Math.max(1, Math.min(p.hp, p.maxHp));
        removeStatus(p, 'fortified');
      }
    }
  }

  bossTurnEnd(s, side);
  zeldaTurnEnd(s, side);
  sonicTurnEnd(s, side);
  crashTurnEnd(s, side);
  crashUpgradeTurnEnd(s, side);
  marioUpgradeTurnEnd(s, side);
  cratesTurnEnd(s);
  marioSpacesTurnEnd(s, side);
  metroidTurnEnd(s, side);
  ben10TurnEnd(s, side);
  nullVoidReturn(s);

  // Expiry at the end of this ply.
  const ply = s.ply;
  for (const p of s.pieces) {
    p.statuses = p.statuses.filter((st) => st.until === null || st.until > ply);
    p.shields = p.shields.filter((sh) => sh.expires === null || sh.expires > ply);
  }
  const expiredSummons = s.pieces.filter((p) => p.temp?.expires !== null && p.temp?.expires !== undefined && p.temp.expires <= ply);
  if (expiredSummons.length) {
    s.pieces = s.pieces.filter((p) => !expiredSummons.includes(p));
    log(s, 'Summoned pieces fade away.');
  }
  s.zones = s.zones.filter((z) => z.until > ply);
  for (const t of s.timed.filter((t) => t.expires <= ply)) {
    if (t.kind === 'bridge') collapseBridge(s, t.pos);
    else {
      s.timed = s.timed.filter((o) => o !== t);
      s.board = {
        ...s.board,
        terrain: s.board.terrain.map((row, y) => (y === t.pos.y ? row.map((v, x) => (x === t.pos.x ? t.revertTo : v)) : row)),
      };
    }
  }

  s.ply += 1;
  s.turn = opponent(side);
  startTurn(s);
}

function startTurn(s: GameState) {
  const side = s.turn;
  // A Sentinel's watch ends when its next turn starts.
  s.overwatch = s.overwatch.filter((o) => o.side !== side);
  bossTurnStart(s, side);
  zeldaTurnStart(s, side);
  sonicTurnStart(s);
  // Phoenixes rise again on a free deployment square (or are lost if there is none).
  for (const ph of s.reborn.filter((p) => p.side === side)) {
    s.reborn = s.reborn.filter((p) => p !== ph);
    const spot = emptyZoneSquare(s, side);
    if (spot) {
      ph.pos = { ...spot };
      ph.turnPos = { ...spot };
      s.pieces.push(ph);
      log(s, 'The Phoenix is reborn!');
    } else {
      s.captured.push(ph);
      log(s, 'The Phoenix has nowhere to rise and is lost.');
    }
  }
  const king = kingOf(s, side);
  const guardians = s.pieces.some((p) => p.side === side && has(p, 'throne_guardian'));
  const threatened = guardians && !!king && isSquareAttacked(s, king.pos, opponent(side));
  for (const p of s.pieces.filter((p) => p.side === side)) {
    p.prevPos = p.turnPos ?? p.pos;
    p.turnPos = { ...p.pos };
    // Song of Time remembers HP from the start of the previous turn.
    if (has(p, 'song_of_time')) {
      p.counters.prevHp = p.counters.turnHp ?? p.hp;
      p.counters.turnHp = p.hp;
    }
    if (has(p, 'throne_guardian') && threatened) {
      while (shieldTotal(p) < 2) addShield(s, p);
    }
    if (hasStatus(p, 'springLoaded')) {
      removeStatus(p, 'springLoaded');
      if (s.bonus.length === 0) s.bonus.push({ filter: 'any', optional: false, source: 'turn' });
      s.bonus.push({ pieceId: p.id, filter: 'nonCapturing', optional: true, source: 'spring_loaded' });
    }
  }
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export function positionKey(state: GameState): string {
  const parts = state.pieces
    .map((p) => {
      const rights = (p.type === 'king' || p.type === 'rook') && !p.hasMoved ? '!' : '';
      const hp = p.maxHp > 1 || p.shields.length ? `:${p.hp}/${shieldTotal(p)}` : '';
      const used = p.used.length ? `[${[...p.used].sort().join(',')}]` : '';
      const st = p.statuses.length ? `{${p.statuses.map((x) => x.kind).sort().join(',')}}` : '';
      return `${p.side[0]}${p.type}${p.pos.x},${p.pos.y}${rights}${hp}${used}${st}`;
    })
    .sort();
  const ep = state.enPassant ? coordKey(state.enPassant.target) : '-';
  let terrain = '';
  state.board.terrain.forEach((row, y) => row.forEach((t, x) => t !== 'normal' && (terrain += `${t[0]}${x},${y};`)));
  const tiles = (state.tiles ?? []).map((t) => `${t.kind[0]}${t.pos.x},${t.pos.y}`).join(';');
  const keys = state.keys ? `${state.keys.player}/${state.keys.enemy}` : '';
  return `${state.turn}|${ep}|${state.bonus.length}|${terrain}|${tiles}|${keys}|${parts.join(';')}`;
}

function insufficientMaterial(pieces: Piece[]): boolean {
  const nonKings = pieces.filter((p) => p.type !== 'king');
  if (nonKings.length === 0) return true;
  return nonKings.length === 1 && (nonKings[0].type === 'bishop' || nonKings[0].type === 'knight');
}

export function evaluateResult(state: GameState): GameResult {
  const mover = state.turn;
  const playerKing = findKing(state, 'player');
  const enemyKing = findKing(state, 'enemy');

  // Losing the player's King always ends the run.
  if (!playerKing) return { kind: 'kingCaptured', winner: 'enemy' };

  // Boss battles: felling every enemy Boss Piece wins.
  if (state.rules.bossKill) {
    const bossesLeft = state.pieces.some((p) => p.side === 'enemy' && isBoss(p));
    const hadBoss = state.captured.some((p) => p.side === 'enemy' && isBoss(p));
    if (hadBoss && !bossesLeft) return { kind: 'bossDefeated', winner: 'player' };
  }

  if (!state.rules.checkRules) {
    const enemyLeft =
      state.pieces.some((p) => p.side === 'enemy') ||
      state.reborn.some((p) => p.side === 'enemy') ||
      (state.bones ?? []).some((b) => b.piece.side === 'enemy');
    if (!enemyLeft) return { kind: 'eliminated', winner: 'player' };
  } else if (!enemyKing) {
    return { kind: 'kingCaptured', winner: 'player' };
  }

  const moves = legalMoves(state, mover);
  if (moves.length === 0) {
    if (state.rules.checkRules && inCheck(state, mover)) {
      return { kind: 'checkmate', winner: opponent(mover) };
    }
    return { kind: 'draw', reason: 'stalemate' };
  }
  if (state.halfmoveClock >= 100) return { kind: 'draw', reason: 'fiftyMove' };
  const key = positionKey(state);
  if (state.positionHistory.filter((k) => k === key).length >= 3) {
    return { kind: 'draw', reason: 'repetition' };
  }
  if (state.rules.checkRules && insufficientMaterial(state.pieces)) {
    return { kind: 'draw', reason: 'insufficientMaterial' };
  }
  return { kind: 'ongoing' };
}

/** Apply a legal move and update the game result. */
export function applyMove(state: GameState, m: Move): GameState {
  const next = applyMoveRaw(state, m);
  next.positionHistory = [...state.positionHistory, positionKey(next)];
  next.result = evaluateResult(next);
  return next;
}

export { takeDamageCompat as takeDamage };

/** Legacy helper kept for tests: apply raw damage to a piece copy (shields first). */
function takeDamageCompat(p: Piece, amount: number): Piece {
  const copy = { ...p, shields: p.shields.map((s) => ({ ...s })) };
  let dmg = amount;
  for (const sh of copy.shields) {
    const b = Math.min(sh.strength, dmg);
    sh.strength -= b;
    dmg -= b;
  }
  copy.shields = copy.shields.filter((s) => s.strength > 0);
  copy.hp -= dmg;
  return copy;
}

export { inBounds, enemiesOf, hasStatus, isEmpty };
