import { inBounds, isStandable, isWall, occupancy, terrainAt } from './board';
import { PIECE_STATS, footprint, sizeOf } from './pieces';
import {
  AbilityId,
  Coord,
  GameResult,
  GameState,
  Move,
  Piece,
  PromotionType,
  Side,
  Terrain,
  coordKey,
  forward,
  opponent,
  sameCoord,
} from './types';

const ORTHO: Coord[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];
const DIAG: Coord[] = [
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
];
const ALL_DIRS = [...ORTHO, ...DIAG];
const SIDEWAYS: Coord[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
];
const KNIGHT_JUMPS: Coord[] = [
  { x: 1, y: 2 },
  { x: 2, y: 1 },
  { x: -1, y: 2 },
  { x: -2, y: 1 },
  { x: 1, y: -2 },
  { x: 2, y: -1 },
  { x: -1, y: -2 },
  { x: -2, y: -1 },
];

export const PROMOTION_TYPES: PromotionType[] = ['queen', 'rook', 'bishop', 'knight'];

/** Mage teleport range and Switcher swap range (King-style distance). */
const TELEPORT_RANGE = 3;
const SWAP_RANGE = 2;

type Occ = Map<string, Piece>;

const add = (a: Coord, b: Coord): Coord => ({ x: a.x + b.x, y: a.y + b.y });
const scale = (a: Coord, k: number): Coord => ({ x: a.x * k, y: a.y * k });
const at = (occ: Occ, c: Coord) => occ.get(coordKey(c));
/** King-style distance between two squares. */
export const distance = (a: Coord, b: Coord) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export const hasUsed = (p: Piece, a: AbilityId) => p.used.includes(a);

/** Whether two pieces' footprints touch (including diagonally). */
export function adjacent(a: Piece, b: Piece): boolean {
  for (const ca of footprint(a)) for (const cb of footprint(b)) if (distance(ca, cb) === 1) return true;
  return false;
}

/**
 * A Knight jump is blocked when any wall (solid or cracked) lies inside the
 * 2x3 rectangle spanned by its start and landing squares. Gaps never block.
 */
export function knightPathClear(state: GameState, from: Coord, to: Coord): boolean {
  const x0 = Math.min(from.x, to.x);
  const x1 = Math.max(from.x, to.x);
  const y0 = Math.min(from.y, to.y);
  const y1 = Math.max(from.y, to.y);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) if (isWall(state.board, { x, y })) return false;
  return true;
}

/**
 * Half the distance travelled, rounded up, minimum one square, measured back
 * from the attacked square along the approach line. The squares on that line
 * were just crossed, so the landing square is always free.
 */
export function bounceSquare(from: Coord, to: Coord, leaper: boolean): Coord {
  if (leaper) return from;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.max(Math.abs(dx), Math.abs(dy));
  const back = Math.max(1, Math.ceil(dist / 2));
  return { x: to.x - Math.sign(dx) * back, y: to.y - Math.sign(dy) * back };
}

// ---------------------------------------------------------------------------
// Movement patterns
// ---------------------------------------------------------------------------

/** A square a piece's ordinary movement can reach. */
interface Step {
  to: Coord;
  /** false = may only move onto an empty square (e.g. the Archer's step). */
  canCapture: boolean;
  /** Leapers return to their start square when bounced. */
  leap: boolean;
}

function slideSteps(state: GameState, occ: Occ, p: Piece, dirs: Coord[], max = Infinity): Step[] {
  const out: Step[] = [];
  for (const d of dirs) {
    let c = add(p.pos, d);
    for (let n = 1; n <= max && inBounds(state.board, c) && isStandable(state.board, c); n++) {
      out.push({ to: c, canCapture: true, leap: false });
      if (at(occ, c)) break;
      c = add(c, d);
    }
  }
  return out;
}

function adjacentSteps(state: GameState, p: Piece, dirs: Coord[], canCapture = true): Step[] {
  return dirs
    .map((d) => add(p.pos, d))
    .filter((c) => isStandable(state.board, c))
    .map((to) => ({ to, canCapture, leap: false }));
}

function knightSteps(state: GameState, p: Piece): Step[] {
  return KNIGHT_JUMPS.map((j) => add(p.pos, j))
    .filter((c) => isStandable(state.board, c) && knightPathClear(state, p.pos, c))
    .map((to) => ({ to, canCapture: true, leap: true }));
}

/** Lancer: exactly 2 or 3 squares orthogonally, over pieces and gaps but not walls. */
function lancerSteps(state: GameState, p: Piece): Step[] {
  const out: Step[] = [];
  for (const d of ORTHO) {
    for (const n of [2, 3]) {
      const to = add(p.pos, scale(d, n));
      if (!isStandable(state.board, to)) continue;
      let blocked = false;
      for (let i = 1; i < n; i++) if (isWall(state.board, add(p.pos, scale(d, i)))) blocked = true;
      if (!blocked) out.push({ to, canCapture: true, leap: true });
    }
  }
  return out;
}

/** Ordinary movement for every 1x1 piece except the Pawn (which has its own rules). */
function stepsFor(state: GameState, occ: Occ, p: Piece): Step[] {
  switch (p.type) {
    case 'knight':
      return knightSteps(state, p);
    case 'bishop':
      return slideSteps(state, occ, p, DIAG);
    case 'rook':
      return slideSteps(state, occ, p, ORTHO);
    case 'queen':
      return slideSteps(state, occ, p, ALL_DIRS);
    case 'king':
    case 'guardian':
    case 'switcher':
      return adjacentSteps(state, p, ALL_DIRS);
    case 'archer':
      return adjacentSteps(state, p, DIAG, false);
    case 'lancer':
      return lancerSteps(state, p);
    case 'siege':
      return adjacentSteps(state, p, ORTHO);
    case 'mage':
      return slideSteps(state, occ, p, DIAG, 2);
    case 'chancellor':
      return [...slideSteps(state, occ, p, ORTHO), ...knightSteps(state, p)];
    case 'medic':
      return adjacentSteps(state, p, [...DIAG, ...SIDEWAYS]);
    default:
      return [];
  }
}

/** Destinations a multi-square piece can step to (orthogonal, one square). */
function heavySteps(state: GameState, occ: Occ, p: Piece): { to: Coord; targets: string[] }[] {
  const out: { to: Coord; targets: string[] }[] = [];
  for (const d of ORTHO) {
    const to = add(p.pos, d);
    const targets = new Set<string>();
    let ok = true;
    for (const c of footprint(p, to)) {
      if (!isStandable(state.board, c)) {
        ok = false;
        break;
      }
      const occupant = at(occ, c);
      if (!occupant || occupant.id === p.id) continue;
      if (occupant.side === p.side) {
        ok = false;
        break;
      }
      targets.add(occupant.id);
    }
    if (ok) out.push({ to, targets: [...targets] });
  }
  return out;
}

/** Archer: enemies exactly 2 squares away orthogonally; walls between block the shot. */
function shotSquares(state: GameState, p: Piece): Coord[] {
  if (p.type !== 'archer') return [];
  const out: Coord[] = [];
  for (const d of ORTHO) {
    const mid = add(p.pos, d);
    const to = add(p.pos, scale(d, 2));
    if (!inBounds(state.board, to) || isWall(state.board, mid) || !isStandable(state.board, to)) continue;
    out.push(to);
  }
  return out;
}

/** Squares a piece threatens (could hit on its next action), ignoring check legality. */
function attackSquares(state: GameState, occ: Occ, p: Piece): Coord[] {
  if (p.type === 'pawn') {
    const f = forward(p.side);
    return [-1, 1].map((dx) => ({ x: p.pos.x + dx, y: p.pos.y + f })).filter((c) => isStandable(state.board, c));
  }
  if (sizeOf(p) > 1) {
    const own = footprint(p);
    const out: Coord[] = [];
    for (const step of heavySteps(state, occ, p))
      for (const c of footprint(p, step.to)) if (!own.some((o) => sameCoord(o, c))) out.push(c);
    return out;
  }
  return [
    ...stepsFor(state, occ, p)
      .filter((s) => s.canCapture)
      .map((s) => s.to),
    ...shotSquares(state, p),
  ];
}

export function isSquareAttacked(state: GameState, sq: Coord, by: Side, occ?: Occ): boolean {
  const o = occ ?? occupancy(state.pieces);
  for (const p of state.pieces) {
    if (p.side !== by) continue;
    if (attackSquares(state, o, p).some((c) => sameCoord(c, sq))) return true;
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
  const backRow = side === 'player' ? 0 : state.board.height - 1;
  if (c.y === backRow) return true;
  return !!state.board.promotionSquares?.some((s) => s.side === side && sameCoord(s.pos, c));
}

function pushPawnMove(state: GameState, out: Move[], base: Move, side: Side) {
  if (isPromotionSquare(state, side, base.to)) {
    for (const t of PROMOTION_TYPES) out.push({ ...base, promotion: t });
  } else out.push(base);
}

function pawnMoves(state: GameState, occ: Occ, p: Piece): Move[] {
  const moves: Move[] = [];
  const f = forward(p.side);
  const one = { x: p.pos.x, y: p.pos.y + f };
  if (isStandable(state.board, one) && !at(occ, one)) {
    pushPawnMove(state, moves, { pieceId: p.id, from: p.pos, to: one }, p.side);
    const two = { x: p.pos.x, y: p.pos.y + 2 * f };
    if (!p.hasMoved && isStandable(state.board, two) && !at(occ, two)) {
      moves.push({ pieceId: p.id, from: p.pos, to: two, doubleStep: one });
    }
  }
  for (const dx of [-1, 1]) {
    const c = { x: p.pos.x + dx, y: p.pos.y + f };
    if (!isStandable(state.board, c)) continue;
    const target = at(occ, c);
    if (target && target.side !== p.side) {
      pushPawnMove(state, moves, { pieceId: p.id, from: p.pos, to: c, targets: [target.id], bounceTo: p.pos }, p.side);
    } else if (!target && state.enPassant && sameCoord(state.enPassant.target, c)) {
      moves.push({ pieceId: p.id, from: p.pos, to: c, targets: [state.enPassant.pawnId], bounceTo: p.pos, enPassant: true });
    }
  }
  return moves;
}

/** Special actions: shots, demolition, teleport, swap, heal. */
function abilityMoves(state: GameState, occ: Occ, p: Piece, ordinary: Move[]): Move[] {
  const moves: Move[] = [];
  const base = { pieceId: p.id, from: p.pos };
  switch (p.type) {
    case 'archer':
      for (const c of shotSquares(state, p)) {
        const target = at(occ, c);
        if (target && target.side !== p.side) moves.push({ ...base, to: c, action: 'shoot', targets: [target.id] });
      }
      break;
    case 'siege':
      for (const d of ALL_DIRS) {
        const c = add(p.pos, d);
        if (terrainAt(state.board, c) === 'cracked') moves.push({ ...base, to: c, action: 'demolish' });
      }
      break;
    case 'mage':
      if (hasUsed(p, 'teleport')) break;
      for (let dy = -TELEPORT_RANGE; dy <= TELEPORT_RANGE; dy++)
        for (let dx = -TELEPORT_RANGE; dx <= TELEPORT_RANGE; dx++) {
          const c = { x: p.pos.x + dx, y: p.pos.y + dy };
          if ((dx === 0 && dy === 0) || !isStandable(state.board, c) || at(occ, c)) continue;
          // Squares its ordinary move already reaches don't need the teleport.
          if (ordinary.some((m) => sameCoord(m.to, c))) continue;
          moves.push({ ...base, to: c, action: 'teleport' });
        }
      break;
    case 'switcher':
      if (hasUsed(p, 'swap')) break;
      for (const ally of state.pieces) {
        if (ally.side !== p.side || ally.id === p.id || ally.type === 'king' || sizeOf(ally) > 1) continue;
        if (distance(ally.pos, p.pos) <= SWAP_RANGE) moves.push({ ...base, to: ally.pos, action: 'swap', allyId: ally.id });
      }
      break;
    case 'medic':
      for (const ally of state.pieces) {
        if (ally.side !== p.side || ally.id === p.id || ally.type === 'king' || ally.hp >= ally.maxHp) continue;
        if (adjacent(p, ally)) moves.push({ ...base, to: ally.pos, action: 'heal', allyId: ally.id });
      }
      break;
  }
  return moves;
}

/** All moves for one piece, before filtering out moves that leave the King in check. */
function pseudoMovesFor(state: GameState, occ: Occ, p: Piece): Move[] {
  if (sizeOf(p) > 1) {
    return heavySteps(state, occ, p).map((step) =>
      step.targets.length
        ? { pieceId: p.id, from: p.pos, to: step.to, targets: step.targets, bounceTo: p.pos }
        : { pieceId: p.id, from: p.pos, to: step.to },
    );
  }
  if (p.type === 'pawn') return pawnMoves(state, occ, p);

  const moves: Move[] = [];
  for (const s of stepsFor(state, occ, p)) {
    const target = at(occ, s.to);
    if (!target) moves.push({ pieceId: p.id, from: p.pos, to: s.to });
    else if (target.side !== p.side && s.canCapture) {
      moves.push({ pieceId: p.id, from: p.pos, to: s.to, targets: [target.id], bounceTo: bounceSquare(p.pos, s.to, s.leap) });
    }
  }
  moves.push(...abilityMoves(state, occ, p, moves));
  if (p.type === 'king' && !p.hasMoved) moves.push(...castleMoves(state, occ, p));
  return moves;
}

/**
 * Castling on any board: an unmoved King and an unmoved Rook on the same row,
 * at least three squares apart, with only open normal squares between them.
 * The King moves two squares toward the Rook; the Rook lands on the square
 * the King crossed. Under check rules the King may not castle out of, through,
 * or into check.
 */
function castleMoves(state: GameState, occ: Occ, king: Piece): Move[] {
  const moves: Move[] = [];
  const enemy = opponent(king.side);
  for (const rook of state.pieces) {
    if (rook.side !== king.side || rook.type !== 'rook' || rook.hasMoved) continue;
    if (rook.pos.y !== king.pos.y) continue;
    const dist = rook.pos.x - king.pos.x;
    if (Math.abs(dist) < 3) continue;
    const dir = Math.sign(dist);
    let clear = true;
    for (let x = king.pos.x + dir; x !== rook.pos.x; x += dir) {
      const c = { x, y: king.pos.y };
      if (!isStandable(state.board, c) || at(occ, c)) {
        clear = false;
        break;
      }
    }
    if (!clear) continue;
    const cross = { x: king.pos.x + dir, y: king.pos.y };
    const dest = { x: king.pos.x + 2 * dir, y: king.pos.y };
    if (state.rules.checkRules) {
      if ([king.pos, cross, dest].some((c) => isSquareAttacked(state, c, enemy, occ))) continue;
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

export function legalMoves(state: GameState, side: Side = state.turn): Move[] {
  const occ = occupancy(state.pieces);
  const out: Move[] = [];
  for (const p of state.pieces) {
    if (p.side !== side) continue;
    for (const m of pseudoMovesFor(state, occ, p)) {
      if (state.rules.checkRules) {
        const next = applyMoveRaw(state, m);
        if (inCheck(next, side)) continue;
      }
      out.push(m);
    }
  }
  return out;
}

export function legalMovesForPiece(state: GameState, pieceId: string): Move[] {
  return legalMoves(state).filter((m) => m.pieceId === pieceId);
}

// ---------------------------------------------------------------------------
// Resolving moves
// ---------------------------------------------------------------------------

/** Shields absorb damage first, then HP is lost. */
export function takeDamage(p: Piece, amount: number): Piece {
  const absorbed = Math.min(p.shields, amount);
  return { ...p, shields: p.shields - absorbed, hp: p.hp - (amount - absorbed) };
}

/**
 * A Guardian adjacent to the target can take a single-target hit instead,
 * once per battle. It never protects the King (check stays readable) or
 * another Guardian's own hit.
 */
export function findInterceptor(state: GameState, target: Piece, attacker: Piece): Piece | undefined {
  if (target.type === 'king') return undefined;
  return state.pieces.find(
    (g) =>
      g.type === 'guardian' &&
      g.side === target.side &&
      g.id !== target.id &&
      g.id !== attacker.id &&
      !hasUsed(g, 'intercept') &&
      adjacent(g, target),
  );
}

export interface AttackOutcome {
  /** Pieces that took damage and survived, with their new HP/shields. */
  damaged: Piece[];
  captured: Piece[];
  /** Where the attacker ends up (unchanged for ranged attacks). */
  finalPos: Coord;
  /** The Guardian that stepped in, if any. */
  interceptor?: Piece;
}

/** What happens to each target of a move, and where the attacker ends up. */
export function resolveAttack(state: GameState, m: Move): AttackOutcome {
  const attacker = state.pieces.find((p) => p.id === m.pieceId)!;
  const ranged = m.action === 'shoot';
  const dmg = PIECE_STATS[attacker.type].damage;
  const targets = (m.targets ?? []).map((id) => state.pieces.find((p) => p.id === id)).filter(Boolean) as Piece[];

  // Single-target attacks can be intercepted by an adjacent Guardian.
  const interceptor = targets.length === 1 ? findInterceptor(state, targets[0], attacker) : undefined;
  if (interceptor) {
    const after = { ...takeDamage(interceptor, dmg), used: [...interceptor.used, 'intercept' as const] };
    const dead = after.hp <= 0;
    // If the Guardian falls, the attacker takes the Guardian's square; if it holds, the attacker bounces.
    const finalPos = ranged ? attacker.pos : dead ? interceptor.pos : (m.bounceTo ?? m.to);
    return { damaged: dead ? [] : [after], captured: dead ? [interceptor] : [], finalPos, interceptor };
  }

  const damaged: Piece[] = [];
  const captured: Piece[] = [];
  for (const target of targets) {
    const after = takeDamage(target, dmg);
    if (after.hp <= 0) captured.push(target);
    else damaged.push(after);
  }
  const finalPos = ranged ? attacker.pos : damaged.length > 0 && m.bounceTo ? m.bounceTo : m.to;
  return { damaged, captured, finalPos };
}

function withTerrain(state: GameState, c: Coord, t: Terrain) {
  const terrain = state.board.terrain.map((row, y) => (y === c.y ? row.map((v, x) => (x === c.x ? t : v)) : row));
  return { ...state.board, terrain };
}

/**
 * Apply a move without recomputing the result or history. Used for legality
 * checks and AI look-ahead, where the full result check would be wasted work.
 */
export function applyMoveRaw(state: GameState, m: Move): GameState {
  const mover = state.pieces.find((p) => p.id === m.pieceId)!;
  const base = {
    ...state,
    turn: opponent(state.turn),
    enPassant: m.doubleStep ? { target: m.doubleStep, pawnId: m.pieceId } : null,
  };

  // Non-attacking special actions.
  if (m.action === 'demolish') {
    return { ...base, board: withTerrain(state, m.to, 'normal'), halfmoveClock: 0 };
  }
  if (m.action === 'teleport' || m.action === 'swap' || m.action === 'heal') {
    const ally = m.allyId ? state.pieces.find((p) => p.id === m.allyId) : undefined;
    const pieces = state.pieces.map((p) => {
      if (p.id === mover.id) {
        if (m.action === 'teleport') return { ...p, pos: m.to, hasMoved: true, used: [...p.used, 'teleport' as const] };
        if (m.action === 'swap') return { ...p, pos: ally!.pos, hasMoved: true, used: [...p.used, 'swap' as const] };
        return p;
      }
      if (ally && p.id === ally.id) {
        if (m.action === 'swap') return { ...p, pos: mover.pos, hasMoved: true };
        return { ...p, hp: Math.min(p.maxHp, p.hp + 1) };
      }
      return p;
    });
    return { ...base, pieces, halfmoveClock: state.halfmoveClock + 1 };
  }

  const { damaged, captured, finalPos } = resolveAttack(state, m);
  const bounced = !sameCoord(finalPos, m.to);
  const pieces: Piece[] = [];
  for (const p of state.pieces) {
    if (captured.some((c) => c.id === p.id)) continue;
    const hit = damaged.find((d) => d.id === p.id);
    if (hit) pieces.push(hit);
    else if (p.id === m.pieceId) {
      if (m.action === 'shoot') pieces.push(p);
      else {
        const type = !bounced && m.promotion ? m.promotion : p.type;
        const stats = PIECE_STATS[type];
        const promoted = type !== p.type ? { hp: stats.maxHp, maxHp: stats.maxHp } : {};
        pieces.push({ ...p, ...promoted, pos: finalPos, hasMoved: true, type });
      }
    } else if (m.castle && p.id === m.castle.rookId) {
      pieces.push({ ...p, pos: m.castle.rookTo, hasMoved: true });
    } else pieces.push(p);
  }
  const resetClock = mover.type === 'pawn' || (m.targets?.length ?? 0) > 0;
  return {
    ...base,
    pieces,
    halfmoveClock: resetClock ? 0 : state.halfmoveClock + 1,
    captured: captured.length ? [...state.captured, ...captured] : state.captured,
  };
}

export function positionKey(state: GameState): string {
  const parts = state.pieces
    .map((p) => {
      const rights = (p.type === 'king' || p.type === 'rook') && !p.hasMoved ? '!' : '';
      const hp = p.maxHp > 1 || p.shields ? `:${p.hp}/${p.shields}` : '';
      const used = p.used.length ? `[${[...p.used].sort().join(',')}]` : '';
      return `${p.side[0]}${p.type}${p.pos.x},${p.pos.y}${rights}${hp}${used}`;
    })
    .sort();
  const ep = state.enPassant ? coordKey(state.enPassant.target) : '-';
  let cracked = '';
  state.board.terrain.forEach((row, y) => row.forEach((t, x) => t === 'cracked' && (cracked += `${x},${y};`)));
  return `${state.turn}|${ep}|${cracked}|${parts.join(';')}`;
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

  if (!state.rules.checkRules) {
    const enemyLeft = state.pieces.some((p) => p.side === 'enemy');
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
