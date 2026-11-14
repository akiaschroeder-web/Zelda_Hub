import { applyMove, inCheck, legalMoves } from './moves';
import { GameState, Move, PieceType, Side } from './types';

export const PIECE_VALUE: Record<PieceType, number> = {
  pawn: 100,
  knight: 300,
  bishop: 310,
  rook: 500,
  queen: 900,
  king: 20000,
};

const MATE = 1_000_000;

/** Static evaluation from `side`'s point of view. */
function evaluate(state: GameState, side: Side): number {
  const { width, height } = state.board;
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  let score = 0;
  for (const p of state.pieces) {
    let v = PIECE_VALUE[p.type];
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
  return [...moves].sort((a, b) => Number(!!b.captureId) - Number(!!a.captureId) || Number(!!b.promotion) - Number(!!a.promotion));
}

function negamax(state: GameState, depth: number, alpha: number, beta: number, ply: number): number {
  const side = state.turn;
  if (state.result.kind !== 'ongoing') {
    const r = state.result;
    if (r.kind === 'draw') return 0;
    return r.winner === side ? MATE - ply : -MATE + ply;
  }
  if (depth === 0) return evaluate(state, side);
  const moves = legalMoves(state);
  if (moves.length === 0) {
    return state.rules.checkRules && inCheck(state, side) ? -MATE + ply : 0;
  }
  let best = -Infinity;
  for (const m of orderMoves(moves)) {
    const score = -negamax(applyMove(state, m), depth - 1, -beta, -alpha, ply + 1);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

/** Pick a move for the side to play. Ties are broken randomly for variety. */
export function chooseMove(state: GameState, depth = 2, rng: () => number = Math.random): Move | null {
  const moves = legalMoves(state);
  if (moves.length === 0) return null;
  let bestScore = -Infinity;
  let best: Move[] = [];
  for (const m of orderMoves(moves)) {
    const score = -negamax(applyMove(state, m), depth - 1, -Infinity, Infinity, 1);
    if (score > bestScore) {
      bestScore = score;
      best = [m];
    } else if (score === bestScore) best.push(m);
  }
  return best[Math.floor(rng() * best.length)];
}
