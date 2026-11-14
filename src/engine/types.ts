/**
 * Core data types for the battle engine.
 *
 * Coordinates: x = column (0 = left), y = row (0 = top of the screen).
 * The player sits at the bottom and moves toward y = 0; the enemy sits at the
 * top and moves toward y = height - 1. Forward never changes during a battle.
 */

export type Side = 'player' | 'enemy';

export type Terrain = 'normal' | 'gap' | 'wall' | 'cracked';

export type PieceType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king' | 'juggernaut';

export type PromotionType = 'queen' | 'rook' | 'bishop' | 'knight';

export interface Coord {
  x: number;
  y: number;
}

export interface Piece {
  id: string;
  type: PieceType;
  side: Side;
  /** Top-left square of the piece's footprint. */
  pos: Coord;
  hasMoved: boolean;
  hp: number;
  maxHp: number;
  /** Each shield absorbs one point of damage before HP is lost. */
  shields: number;
}

export interface Board {
  width: number;
  height: number;
  /** terrain[y][x] */
  terrain: Terrain[][];
  /** Extra promotion squares beyond each side's far back row. */
  promotionSquares?: { side: Side; pos: Coord }[];
}

export interface CastleInfo {
  rookId: string;
  rookFrom: Coord;
  rookTo: Coord;
}

export interface Move {
  pieceId: string;
  from: Coord;
  to: Coord;
  /**
   * Enemy pieces this move attacks. Each takes the attacker's damage; pieces
   * reduced to 0 HP are captured. Usually one, but a large piece's footprint
   * can hit several at once.
   */
  targets?: string[];
  /**
   * Where the attacker ends up if any target survives the hit (bounceback).
   * Absent for moves that attack nothing.
   */
  bounceTo?: Coord;
  promotion?: PromotionType;
  castle?: CastleInfo;
  enPassant?: boolean;
  /** pawn double step: the square it skipped (en passant target) */
  doubleStep?: Coord;
}

export interface EncounterRules {
  /**
   * true  = Royal Duel style: check and checkmate apply, moves that leave the
   *         King attacked are illegal.
   * false = Extermination style: no check restrictions, Kings can be captured.
   */
  checkRules: boolean;
}

export type GameResult =
  | { kind: 'ongoing' }
  | { kind: 'checkmate'; winner: Side }
  | { kind: 'kingCaptured'; winner: Side }
  | { kind: 'eliminated'; winner: Side }
  | { kind: 'draw'; reason: 'stalemate' | 'fiftyMove' | 'repetition' | 'insufficientMaterial' };

export interface GameState {
  board: Board;
  pieces: Piece[];
  turn: Side;
  rules: EncounterRules;
  /** Square a pawn can capture onto en passant, and the pawn that would be taken. */
  enPassant: { target: Coord; pawnId: string } | null;
  /** Half-moves since the last capture or pawn move (50-move rule). */
  halfmoveClock: number;
  /** Position keys seen so far, for threefold repetition. */
  positionHistory: string[];
  /** Pieces removed this battle, in capture order. */
  captured: Piece[];
  result: GameResult;
}

export const opponent = (side: Side): Side => (side === 'player' ? 'enemy' : 'player');

export const forward = (side: Side): number => (side === 'player' ? -1 : 1);

export const sameCoord = (a: Coord, b: Coord): boolean => a.x === b.x && a.y === b.y;

export const coordKey = (c: Coord): string => `${c.x},${c.y}`;
