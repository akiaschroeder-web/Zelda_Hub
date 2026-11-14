import { isStandable, parseBoard } from './board';
import { evaluateResult, positionKey } from './moves';
import { PIECE_STATS, footprint } from './pieces';
import { Board, EncounterRules, GameState, Piece, PieceType, Side } from './types';

export interface Placement {
  type: PieceType;
  side: Side;
  x: number;
  y: number;
  /** Starting HP if not full (e.g. a wounded roster piece). */
  hp?: number;
  shields?: number;
}

let nextId = 0;

export function createGame(board: Board, placements: Placement[], rules: EncounterRules): GameState {
  const pieces: Piece[] = placements.map((p) => ({
    id: `${p.side[0]}${p.type}${nextId++}`,
    type: p.type,
    side: p.side,
    pos: { x: p.x, y: p.y },
    hasMoved: false,
    hp: p.hp ?? PIECE_STATS[p.type].maxHp,
    maxHp: PIECE_STATS[p.type].maxHp,
    shields: p.shields ?? 0,
  }));
  // Every square of every footprint must be open terrain and unshared.
  const taken = new Set<string>();
  for (const p of pieces) {
    for (const c of footprint(p)) {
      const k = `${c.x},${c.y}`;
      if (!isStandable(board, c)) throw new Error(`${p.type} placed on blocked square ${k}`);
      if (taken.has(k)) throw new Error(`${p.type} overlaps another piece at ${k}`);
      taken.add(k);
    }
  }
  const state: GameState = {
    board,
    pieces,
    turn: 'player',
    rules,
    enPassant: null,
    halfmoveClock: 0,
    positionHistory: [],
    captured: [],
    result: { kind: 'ongoing' },
  };
  state.positionHistory = [positionKey(state)];
  state.result = evaluateResult(state);
  return state;
}

/**
 * Parse a piece layout drawn as text, one row per string (top row first).
 * Uppercase = player, lowercase = enemy: K Q R B N P, J = Juggernaut (top-left
 * square of its 2x2 footprint; leave the other three squares as '.').
 */
export function parsePlacements(rows: string[]): Placement[] {
  const types: Record<string, PieceType> = {
    k: 'king',
    q: 'queen',
    r: 'rook',
    b: 'bishop',
    n: 'knight',
    p: 'pawn',
    j: 'juggernaut',
  };
  const out: Placement[] = [];
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const type = types[ch.toLowerCase()];
      if (!type) return;
      out.push({ type, side: ch === ch.toUpperCase() ? 'player' : 'enemy', x, y });
    });
  });
  return out;
}

export interface EncounterDef {
  id: string;
  name: string;
  description: string;
  rules: EncounterRules;
  terrain: string[];
  pieces: string[];
}

export function createEncounter(def: EncounterDef): GameState {
  return createGame(parseBoard(def.terrain), parsePlacements(def.pieces), def.rules);
}
