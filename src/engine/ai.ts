import { applyMoveRaw, findKing, inCheck, legalMoves, quickApply } from './moves';
import { PIECE_STATS } from './pieces';
import { GameState, Move, Side, shieldTotal } from './types';

const MATE = 1_000_000;

/** Positions the search may visit per decision before falling back to a shallower search. */
const NODE_BUDGET = 25_000;
/** Wall-clock limit for the deeper search (the 1-ply fallback always completes). */
const TIME_BUDGET_MS = 250;
let nodes = 0;
let budget = Infinity;
let deadline = Infinity;
class OutOfBudget extends Error {}

/** How many bonus moves (same side moving again) are explored at each node. */
const BONUS_WIDTH = 3;

/** Static evaluation from `side`'s point of view. */
function evaluate(state: GameState, side: Side): number {
  const { width, height } = state.board;
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  let score = 0;
  for (const p of state.pieces) {
    const base = PIECE_STATS[p.type].value;
    // Wounded multi-HP pieces are worth proportionally less; shields add a little.
    const shields = shieldTotal(p) * 40;
    let v = p.maxHp > 1 ? base * (0.4 + (0.6 * p.hp) / p.maxHp) + shields : base + shields;
    // Temporary summons are worth less than permanent pieces.
    if (p.temp) v *= 0.6;
    // Each unspent once-per-battle upgrade is worth keeping in reserve.
    v += p.upgrades.length * 15;
    if (p.type !== 'king') {
      // mild pull toward the centre
      v += 6 - (Math.abs(p.pos.x - cx) + Math.abs(p.pos.y - cy));
    }
    if (p.type === 'pawn') {
      const advanced = p.side === 'player' ? height - 1 - p.pos.y : p.pos.y;
      v += advanced * 4;
    }
    score += p.side === side ? v : -v;
  }
  return score;
}

function orderMoves(moves: Move[]): Move[] {
  const hits = (m: Move) => m.targets?.length ?? 0;
  return [...moves].sort((a, b) => hits(b) - hits(a) || Number(!!b.promotion) - Number(!!a.promotion));
}

/** A King has been captured (only possible without check rules). */
function kingLost(state: GameState, side: Side): boolean {
  return !findKing(state, side);
}

function negamax(state: GameState, depth: number, alpha: number, beta: number, ply: number): number {
  if (++nodes > budget || ((nodes & 31) === 0 && Date.now() > deadline)) throw new OutOfBudget();
  const side = state.turn;
  // The player's King is always required; the enemy's only under check rules
  // (in Extermination the enemy fights on without it).
  if (kingLost(state, side) && (side === 'player' || state.rules.checkRules)) return -MATE + ply;
  if (depth === 0) return evaluate(state, side);
  let moves = legalMoves(state);
  if (moves.length === 0) {
    return state.rules.checkRules && inCheck(state, side) ? -MATE + ply : 0;
  }
  // During a bonus move only the most promising few continuations (and skipping) are searched.
  if (state.bonus.length && moves.length > BONUS_WIDTH + 1) {
    const pass = moves.filter((m) => m.action === 'pass');
    const ranked = moves
      .filter((m) => m.action !== 'pass')
      .map((m) => ({ m, v: evaluate(quickApply(state, m) ?? applyMoveRaw(state, m), side) }))
      .sort((a, b) => b.v - a.v)
      .slice(0, BONUS_WIDTH)
      .map((x) => x.m);
    moves = [...ranked, ...pass];
  }
  let best = -Infinity;
  for (const m of orderMoves(moves)) {
    // At the search horizon a cheap position is enough to score the move.
    const child = (depth === 1 && quickApply(state, m)) || applyMoveRaw(state, m);
    const score = scoreChild(child, side, depth, alpha, beta, ply);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

/**
 * Score a child position from `side`'s point of view. Bonus moves keep the
 * turn with the same side, so those are searched without flipping sides.
 */
function scoreChild(child: GameState, side: Side, depth: number, alpha: number, beta: number, ply: number): number {
  if (child.turn === side) {
    if (ply > 10) return evaluate(child, side);
    return negamax(child, depth, alpha, beta, ply + 1);
  }
  return -negamax(child, depth - 1, -beta, -alpha, ply + 1);
}

/**
 * Pick a move for the side to play. Ties are broken randomly for variety.
 * If the search at `depth` would exceed the node budget, it falls back to a
 * shallower search so a decision always comes back quickly.
 */
export function chooseMove(state: GameState, depth = 2, rng: () => number = Math.random): Move | null {
  for (let d = depth; d >= 1; d--) {
    nodes = 0;
    budget = d === 1 ? Infinity : NODE_BUDGET;
    deadline = d === 1 ? Infinity : Date.now() + TIME_BUDGET_MS;
    try {
      return searchRoot(state, d, rng);
    } catch (e) {
      if (!(e instanceof OutOfBudget)) throw e;
    } finally {
      budget = Infinity;
      deadline = Infinity;
    }
  }
  return null;
}

function searchRoot(state: GameState, depth: number, rng: () => number): Move | null {
  const moves = legalMoves(state);
  if (moves.length === 0) return null;
  let bestScore = -Infinity;
  let best: Move[] = [];
  for (const m of orderMoves(moves)) {
    const score = scoreChild(applyMoveRaw(state, m), state.turn, depth, bestScore === -Infinity ? -Infinity : bestScore - 1, Infinity, 1);
    if (score > bestScore) {
      bestScore = score;
      best = [m];
    } else if (score === bestScore) best.push(m);
  }
  return best[Math.floor(rng() * best.length)];
}
