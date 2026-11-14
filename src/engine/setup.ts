import { parseBoard } from './board';
import { evaluateResult, positionKey } from './moves';
import { Board, EncounterRules, GameState, Piece, PieceType, Side } from './types';

export interface Placement {
  type: PieceType;
  side: Side;
  x: number;
  y: number;
}

let nextId = 0;

export function createGame(board: Board, placements: Placement[], rules: EncounterRules): GameState {
  const pieces: Piece[] = placements.map((p) => ({
    id: `${p.side[0]}${p.type}${nextId++}`,
    type: p.type,
    side: p.side,
    pos: { x: p.x, y: p.y },
    hasMoved: false,
  }));
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
 * Uppercase = player, lowercase = enemy: K Q R B N P. Anything else is empty.
 */
export function parsePlacements(rows: string[]): Placement[] {
  const types: Record<string, PieceType> = {
    k: 'king',
    q: 'queen',
    r: 'rook',
    b: 'bishop',
    n: 'knight',
    p: 'pawn',
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
