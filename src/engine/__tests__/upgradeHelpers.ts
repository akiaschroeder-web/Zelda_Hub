import { expect } from 'vitest';
import { parseBoard } from '../board';
import { applyMove, legalMoves } from '../moves';
import { createGame, parsePlacements } from '../setup';
import { GameState, Move, Piece, shieldTotal } from '../types';

/** Upgrades exercised by at least one test (checked for full coverage). */
export const COVERED = new Set<string>();
export const covers = (...ids: string[]) => ids.forEach((id) => COVERED.add(id));

/**
 * Build a battle from a piece layout. `ups` attaches upgrades by square
 * ("x,y"). Extermination rules by default so tests aren't constrained by check.
 */
export function make(
  rows: string[],
  ups: Record<string, string[]> = {},
  opts: { terrain?: string[]; checkRules?: boolean; runFlags?: string[] } = {},
): GameState {
  const w = rows[0].length;
  const terrain = opts.terrain ?? rows.map(() => '.'.repeat(w));
  const placements = parsePlacements(rows).map((p) => ({ ...p, upgrades: ups[`${p.x},${p.y}`] ?? [] }));
  const s = createGame(parseBoard(terrain), placements, { checkRules: opts.checkRules ?? false }, opts.runFlags ?? []);
  // Pawns away from their start rows have already moved.
  return {
    ...s,
    pieces: s.pieces.map((p) =>
      p.type === 'pawn' && p.pos.y !== (p.side === 'player' ? s.board.height - 2 : 1) ? { ...p, hasMoved: true } : p,
    ),
  };
}

export const at = (s: GameState, x: number, y: number): Piece | undefined =>
  s.pieces.find((p) => p.pos.x === x && p.pos.y === y);

export const byId = (s: GameState, id: string) => s.pieces.find((p) => p.id === id);

export const movesAt = (s: GameState, x: number, y: number) => {
  const p = at(s, x, y);
  expect(p, `no piece at ${x},${y}`).toBeDefined();
  return legalMoves(s).filter((m) => m.pieceId === p!.id);
};

export const dests = (ms: Move[]) => ms.map((m) => `${m.to.x},${m.to.y}`).sort();

/** Make the move of the piece at (x,y) to (tx,ty); `pick` narrows among several. */
export function play(s: GameState, x: number, y: number, tx: number, ty: number, pick: (m: Move) => boolean = () => true): GameState {
  const m = movesAt(s, x, y).find((m) => m.to.x === tx && m.to.y === ty && !m.action && pick(m));
  expect(m, `no move ${x},${y} -> ${tx},${ty}`).toBeDefined();
  return applyMove(s, m!);
}

/** Use an upgrade action of the piece at (x,y), optionally targeting (tx,ty). */
export function act(s: GameState, x: number, y: number, upgrade: string, tx?: number, ty?: number, pick: (m: Move) => boolean = () => true) {
  const m = movesAt(s, x, y).find(
    (m) => m.action === 'upgrade' && m.upgrade === upgrade && (tx === undefined || (m.to.x === tx && m.to.y === ty)) && pick(m),
  );
  expect(m, `no ${upgrade} action from ${x},${y}`).toBeDefined();
  return applyMove(s, m!);
}

export const hasAction = (s: GameState, x: number, y: number, upgrade: string) =>
  movesAt(s, x, y).some((m) => m.action === 'upgrade' && m.upgrade === upgrade);

/** The side to move makes a quiet King move (or passes a bonus) so the turn comes back. */
export function wait(s: GameState): GameState {
  const ms = legalMoves(s);
  const pass = ms.find((m) => m.action === 'pass');
  if (pass) return applyMove(s, pass);
  const king = s.pieces.find((p) => p.side === s.turn && p.type === 'king');
  const m = ms.find((m) => m.pieceId === king?.id && !m.targets && !m.action && !m.castle) ?? ms.find((m) => !m.targets && !m.action);
  expect(m, 'no waiting move').toBeDefined();
  return applyMove(s, m!);
}

export const shields = (p: Piece | undefined) => (p ? shieldTotal(p) : 0);
