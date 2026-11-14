import { inBounds, isStandable, isWall, occupancy } from './board';
import { PIECE_STATS, footprint, sizeOf } from './pieces';
import {
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

type Occ = Map<string, Piece>;

const add = (a: Coord, b: Coord): Coord => ({ x: a.x + b.x, y: a.y + b.y });
const at = (occ: Occ, c: Coord) => occ.get(coordKey(c));

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

/** Squares a piece attacks (could hit on its next move), ignoring check legality. */
function attackSquares(state: GameState, occ: Occ, p: Piece): Coord[] {
  const out: Coord[] = [];
  const slide = (dirs: Coord[]) => {
    for (const d of dirs) {
      let c = add(p.pos, d);
      while (inBounds(state.board, c) && isStandable(state.board, c)) {
        out.push(c);
        if (at(occ, c)) break;
        c = add(c, d);
      }
    }
  };
  switch (p.type) {
    case 'pawn': {
      const f = forward(p.side);
      for (const dx of [-1, 1]) {
        const c = { x: p.pos.x + dx, y: p.pos.y + f };
        if (isStandable(state.board, c)) out.push(c);
      }
      break;
    }
    case 'knight':
      for (const j of KNIGHT_JUMPS) {
        const c = add(p.pos, j);
        if (isStandable(state.board, c) && knightPathClear(state, p.pos, c)) out.push(c);
      }
      break;
    case 'bishop':
      slide(DIAG);
      break;
    case 'rook':
      slide(ORTHO);
      break;
    case 'queen':
      slide(ALL_DIRS);
      break;
    case 'king':
      for (const d of ALL_DIRS) {
        const c = add(p.pos, d);
        if (isStandable(state.board, c)) out.push(c);
      }
      break;
    case 'juggernaut': {
      const own = footprint(p);
      for (const step of heavySteps(state, occ, p)) {
        for (const c of footprint(p, step.to)) if (!own.some((o) => sameCoord(o, c))) out.push(c);
      }
      break;
    }
  }
  return out;
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

/** All moves for one piece, before filtering out moves that leave the King in check. */
function pseudoMovesFor(state: GameState, occ: Occ, p: Piece): Move[] {
  const moves: Move[] = [];
  const leaper = p.type === 'knight';
  const toward = (to: Coord): Move => {
    const target = at(occ, to);
    if (!target) return { pieceId: p.id, from: p.pos, to };
    return { pieceId: p.id, from: p.pos, to, targets: [target.id], bounceTo: bounceSquare(p.pos, to, leaper) };
  };

  if (sizeOf(p) > 1) {
    for (const step of heavySteps(state, occ, p)) {
      const m: Move = { pieceId: p.id, from: p.pos, to: step.to };
      if (step.targets.length) {
        m.targets = step.targets;
        m.bounceTo = p.pos;
      }
      moves.push(m);
    }
    return moves;
  }

  if (p.type === 'pawn') {
    const f = forward(p.side);
    const one = { x: p.pos.x, y: p.pos.y + f };
    if (isStandable(state.board, one) && !at(occ, one)) {
      pushPawnMove(state, moves, toward(one), p.side);
      const two = { x: p.pos.x, y: p.pos.y + 2 * f };
      if (!p.hasMoved && isStandable(state.board, two) && !at(occ, two)) {
        moves.push({ ...toward(two), doubleStep: one });
      }
    }
    for (const dx of [-1, 1]) {
      const c = { x: p.pos.x + dx, y: p.pos.y + f };
      if (!isStandable(state.board, c)) continue;
      const target = at(occ, c);
      if (target && target.side !== p.side) pushPawnMove(state, moves, toward(c), p.side);
      else if (!target && state.enPassant && sameCoord(state.enPassant.target, c)) {
        moves.push({
          pieceId: p.id,
          from: p.pos,
          to: c,
          targets: [state.enPassant.pawnId],
          bounceTo: p.pos,
          enPassant: true,
        });
      }
    }
    return moves;
  }

  for (const c of attackSquares(state, occ, p)) {
    const target = at(occ, c);
    if (!target || target.side !== p.side) moves.push(toward(c));
  }

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

/** Shields absorb damage first, then HP is lost. */
export function takeDamage(p: Piece, amount: number): Piece {
  const absorbed = Math.min(p.shields, amount);
  return { ...p, shields: p.shields - absorbed, hp: p.hp - (amount - absorbed) };
}

/** What happens to each target of a move, and where the attacker ends up. */
export function resolveAttack(state: GameState, m: Move): { damaged: Piece[]; captured: Piece[]; finalPos: Coord } {
  const damaged: Piece[] = [];
  const captured: Piece[] = [];
  const attacker = state.pieces.find((p) => p.id === m.pieceId)!;
  const dmg = PIECE_STATS[attacker.type].damage;
  for (const id of m.targets ?? []) {
    const target = state.pieces.find((p) => p.id === id);
    if (!target) continue;
    const after = takeDamage(target, dmg);
    if (after.hp <= 0) captured.push(target);
    else damaged.push(after);
  }
  const finalPos = damaged.length > 0 && m.bounceTo ? m.bounceTo : m.to;
  return { damaged, captured, finalPos };
}

/** Apply a move without recomputing the result (used for look-ahead). */
function applyMoveRaw(state: GameState, m: Move): GameState {
  const { damaged, captured, finalPos } = resolveAttack(state, m);
  const bounced = !sameCoord(finalPos, m.to);
  const pieces: Piece[] = [];
  for (const p of state.pieces) {
    if (captured.some((c) => c.id === p.id)) continue;
    const hit = damaged.find((d) => d.id === p.id);
    if (hit) pieces.push(hit);
    else if (p.id === m.pieceId) {
      const type = !bounced && m.promotion ? m.promotion : p.type;
      pieces.push({ ...p, pos: finalPos, hasMoved: true, type });
    } else if (m.castle && p.id === m.castle.rookId) {
      pieces.push({ ...p, pos: m.castle.rookTo, hasMoved: true });
    } else pieces.push(p);
  }
  const mover = state.pieces.find((p) => p.id === m.pieceId)!;
  const resetClock = mover.type === 'pawn' || (m.targets?.length ?? 0) > 0;
  return {
    ...state,
    pieces,
    turn: opponent(state.turn),
    enPassant: m.doubleStep ? { target: m.doubleStep, pawnId: m.pieceId } : null,
    halfmoveClock: resetClock ? 0 : state.halfmoveClock + 1,
    captured: captured.length ? [...state.captured, ...captured] : state.captured,
  };
}

export function positionKey(state: GameState): string {
  const parts = state.pieces
    .map((p) => {
      const rights = (p.type === 'king' || p.type === 'rook') && !p.hasMoved ? '!' : '';
      const hp = p.maxHp > 1 || p.shields ? `:${p.hp}/${p.shields}` : '';
      return `${p.side[0]}${p.type}${p.pos.x},${p.pos.y}${rights}${hp}`;
    })
    .sort();
  const ep = state.enPassant ? coordKey(state.enPassant.target) : '-';
  return `${state.turn}|${ep}|${parts.join(';')}`;
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
