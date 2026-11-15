/**
 * Core data types for the battle engine.
 *
 * Coordinates: x = column (0 = left), y = row (0 = top of the screen).
 * The player sits at the bottom and moves toward y = 0; the enemy sits at the
 * top and moves toward y = height - 1. Forward never changes during a battle.
 */

export type Side = 'player' | 'enemy';

export type Terrain = 'normal' | 'gap' | 'wall' | 'cracked';

export type PieceType =
  | 'pawn'
  | 'knight'
  | 'bishop'
  | 'rook'
  | 'queen'
  | 'king'
  | 'juggernaut'
  | 'archer'
  | 'guardian'
  | 'lancer'
  | 'siege'
  | 'mage'
  | 'switcher'
  | 'chancellor'
  | 'medic'
  | 'hopper'
  | 'magnet'
  | 'pusher'
  | 'mimic'
  | 'anchor'
  | 'reaper'
  | 'bastion'
  | 'pathfinder'
  | 'sentinel'
  | 'splitter'
  | 'jailer'
  | 'phoenix'
  | 'engineer'
  | 'assassin'
  | 'illusionist'
  | 'summoner'
  | 'converter'
  | 'displacer'
  | 'oracle'
  | 'clone'
  | 'bomber'
  | 'slayer'
  | 'warden'
  | 'harvester'
  // Boss Pieces
  | 'colossus'
  | 'empress'
  | 'necromancer'
  | 'stormbringer'
  | 'watcher'
  | 'worldbreaker'
  | 'phantom_king'
  | 'doppelganger'
  | 'hive_mother'
  | 'chronarch'
  // Zelda Content Pack
  | 'link'
  | 'zelda'
  | 'midna'
  | 'goron'
  | 'zora'
  | 'redead'
  | 'like_like'
  | 'darknut'
  | 'skulltula'
  | 'ganondorf'
  /** Ganondorf's Phase 3 form (3x3). */
  | 'ganon'
  /** Temporary 1 HP summon that cannot attack. */
  | 'decoy'
  /** The Illusionist's 1 HP illusion: moves one square, cannot capture. */
  | 'illusion';

/** Once-per-battle abilities, recorded on the piece when spent. Upgrade ids are also recorded here. */
export type AbilityId = 'intercept' | 'teleport' | 'swap' | (string & {});

/**
 * Actions other than an ordinary move. Ordinary moves leave this unset.
 * `upgrade` actions name the upgrade in `Move.upgrade`; `pass` skips an
 * optional bonus move.
 */
export type ActionKind =
  | 'shoot'
  | 'demolish'
  | 'teleport'
  | 'swap'
  | 'heal'
  | 'pull' // Magnet: Attraction
  | 'shove' // Pusher: Shove
  | 'overwatch' // Sentinel: Overwatch
  | 'bridge' // Pathfinder: Bridge
  | 'divide' // Splitter: Division
  | 'bind' // Jailer: Bind
  | 'construct' // Engineer: place a cracked wall
  | 'repair' // Engineer: heal a multi-HP ally
  | 'shadowStep' // Assassin
  | 'mirage' // Illusionist: create an illusion
  | 'misdirection' // Illusionist: swap with an illusion
  | 'summonPawn' // Summoner
  | 'summonKnight' // Summoner
  | 'convert' // Converter
  | 'displace' // Displacer: swap with an enemy
  | 'repulse' // Displacer: push all adjacent enemies
  | 'prophecy' // Oracle
  | 'replicate' // Clone
  | 'detonate' // Bomber
  | 'soulHeal' // Harvester: 2 souls -> heal 1
  | 'soulPower' // Harvester: 3 souls -> +1 damage
  | 'royalCommand' // Empress
  | 'chainLightning' // Stormbringer
  | 'earthquake' // Worldbreaker
  | 'rupture' // Worldbreaker
  | 'rewind' // Chronarch
  | 'accelerate' // Chronarch: Temporal Acceleration
  | 'sacredLight' // Zelda: heal an ally within 2
  | 'darkWarp' // Ganondorf (Phase 2): teleport up to 3
  | 'upgrade'
  | 'pass';

/** A shield absorbs `strength` damage. Temporary shields vanish at the end of ply `expires`. */
export interface Shield {
  strength: number;
  expires: number | null;
}

export type StatusKind =
  | 'bound' // cannot move
  | 'stunned' // cannot act at all
  | 'silenced' // cannot use special abilities
  | 'slowed' // -1 movement range
  | 'disarmed' // cannot attack
  | 'pacified' // cannot attack
  | 'blinded' // -2 ranged distance
  | 'crippled' // no jumping movement
  | 'rooted' // immune to forced movement
  | 'confused' // ranges limited to 1
  | 'cursed' // max HP reduced (amount)
  | 'marked' // +1 damage from the next attack
  | 'permMarked' // +1 damage from every attack
  | 'vulnerable' // +1 damage from the next `count` attacks
  | 'prey' // Marked Prey target of `source` side
  | 'weakened' // -1 damage on its next attack
  | 'rangeBuff' // +amount movement range
  | 'damageBuff' // +amount damage on next attack
  | 'immune' // takes no damage
  | 'springLoaded' // bonus non-capturing move at the start of next turn
  | 'fortified' // Fortified Position bonus HP applied
  | 'prophecy'; // the next direct attack against this piece is negated

export interface Status {
  kind: StatusKind;
  /** Removed at the end of this ply. null = rest of the battle. */
  until: number | null;
  amount?: number;
  count?: number;
  source?: string;
}

/** Bookkeeping for summoned pieces. Temporary pieces never join the roster. */
export interface TempInfo {
  summonerId: string;
  /** Removed at the end of this ply (null = until the battle ends). */
  expires: number | null;
  /** Upgrade or ability that created it. */
  kind: string;
}

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
  /** Shields absorb damage before HP is lost. */
  shields: Shield[];
  /** Once-per-battle abilities and upgrades already spent. */
  used: AbilityId[];
  /** Upgrade ids this piece carries. */
  upgrades: string[];
  statuses: Status[];
  /** Present on summoned (temporary) pieces. */
  temp?: TempInfo;
  /** Square the piece started the battle on. */
  startPos: Coord;
  /** Square at the start of its owner's previous turn (Retreat). */
  prevPos?: Coord;
  /** Square at the start of its owner's current turn. */
  turnPos?: Coord;
  /** Direction of its last move and how many moves in a row went that way. */
  lastDir?: Coord;
  streak: number;
  /** Consecutive owner turns without moving. */
  stillTurns: number;
  /** Attacks made / hits taken this battle. */
  attacks: number;
  hitsTaken: number;
  lastAttackerId?: string;
  /** Ply on which this piece last acted. */
  actedPly?: number;
  /** Turn counters for periodic or cooldown effects. Keys ending in `Cd` count down each owner turn. */
  counters: Record<string, number>;
  /** A Clone that has copied another piece keeps its own identity here. */
  clonedFrom?: PieceType;
}

export interface Board {
  width: number;
  height: number;
  /** terrain[y][x] */
  terrain: Terrain[][];
  /** Extra promotion squares beyond each side's far back row. */
  promotionSquares?: { side: Side; pos: Coord }[];
  /** Squares where the player may place pieces before a battle. */
  deployZone?: Coord[];
  /** Squares where generated enemy armies are placed. */
  enemyZone?: Coord[];
}

/** A terrain change that reverts later (bridges over gaps, barricades). */
export interface TimedTerrain {
  pos: Coord;
  revertTo: Terrain;
  /** Reverts at the end of this ply. */
  expires: number;
  kind: 'bridge' | 'barricade';
  side: Side;
}

/** A protective area: pieces of `side` inside take no damage until `until`. */
export interface Zone {
  cells: Coord[];
  side: Side;
  until: number;
}

/** An extra move the side to play gets before its turn ends. */
export interface Bonus {
  /** Only this piece may make the bonus move (any piece if absent). */
  pieceId?: string;
  filter: 'any' | 'nonCapturing' | 'captureOnly';
  /** Optional bonuses can be skipped with a `pass` move. */
  optional: boolean;
  source: string;
  /** Limit on how far the bonus move may go (King-style distance). */
  maxDistance?: number;
}

export interface CastleInfo {
  rookId: string;
  rookFrom: Coord;
  rookTo: Coord;
}

export interface Move {
  pieceId: string;
  from: Coord;
  /**
   * Destination for ordinary moves and teleports. For other actions, the
   * square the action targets (the shot enemy, the wall, the ally).
   */
  to: Coord;
  action?: ActionKind;
  /** Ally involved in a swap or heal. */
  allyId?: string;
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
  /** Upgrade used by an `upgrade` action. */
  upgrade?: string;
  /** Extra parameter for some actions (summon type, conversion target...). */
  param?: string;
  /** Once-per-battle upgrades this move spends (e.g. Corner Turn). */
  uses?: string[];
  /** Ordinary-move bonuses this move relies on (e.g. Quick March range). */
  via?: Coord;
  /** Royal Escort: the King steps with this piece. */
  escort?: { kingId: string; to: Coord };
  /** The move crossed a gap (Gap Assault / Leap Assault). */
  crossedGap?: boolean;
  /** The move was a jump (leapers bounce back to their start square). */
  leap?: boolean;
  /** Multi-Target Precision: this target takes +1 damage. */
  focusId?: string;
}

export interface EncounterRules {
  /** Boss battles: defeating every enemy Boss Piece also wins. */
  bossKill?: boolean;
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
  | { kind: 'bossDefeated'; winner: Side }
  /** The player gave up the battle from the menu. */
  | { kind: 'forfeit'; winner: Side }
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
  /** Pieces removed this battle, in capture order (summons included). */
  captured: Piece[];
  result: GameResult;
  /** Turn counter: increases by one each time the turn passes. Even = player's turn. */
  ply: number;
  timed: TimedTerrain[];
  /** Cracked walls destroyed this battle (Wall Repair can restore them). */
  destroyedWalls: Coord[];
  /** Pending bonus moves for the side to play. */
  bonus: Bonus[];
  /** State before each side's most recent turn (Time Reversal). Never nested. */
  snapshot: { player?: GameState; enemy?: GameState };
  zones: Zone[];
  /** Once-per-run effects already spent (e.g. 'royal_resilience'). */
  runFlags: string[];
  /** Roster pieces saved from permanent loss this battle (Second Life). */
  saved: string[];
  /** Human-readable notes about effects triggered by the last move. */
  log: string[];
  /** Sentinel Overwatch lines: the first enemy to end a move on one takes 1 damage. */
  overwatch: { sentinelId: string; side: Side; cells: Coord[] }[];
  /** Phoenixes waiting to be reborn at the start of their owner's next turn. */
  reborn: Piece[];
  /** Pieces swallowed by a Like Like (Engulf). */
  engulfed: Engulfed[];
}

/** A piece held inside a Like Like until `release` (then it's captured) or the Like Like falls (then it returns). */
export interface Engulfed {
  victim: Piece;
  holderId: string;
  /** Captured for good at the end of this ply if the Like Like still stands. */
  release: number;
  /** The square it was swallowed on. */
  at: Coord;
  /** The Like Like fell: put the victim back as soon as the move finishes. */
  freed?: boolean;
}

export const opponent = (side: Side): Side => (side === 'player' ? 'enemy' : 'player');

export const forward = (side: Side): number => (side === 'player' ? -1 : 1);

export const sameCoord = (a: Coord, b: Coord): boolean => a.x === b.x && a.y === b.y;

export const coordKey = (c: Coord): string => `${c.x},${c.y}`;

/** Owner of a ply: the player moves on even plies. */
export const sideOfPly = (ply: number): Side => (ply % 2 === 0 ? 'player' : 'enemy');

/** The last ply of `side`'s next turn after `ply` (strictly later), `n` turns ahead. */
export function endOfTurn(ply: number, side: Side, n = 1): number {
  let q = ply + 1;
  while (sideOfPly(q) !== side) q++;
  return q + 2 * (n - 1);
}

/** Total shield strength. */
export const shieldTotal = (p: Piece): number => p.shields.reduce((s, sh) => s + sh.strength, 0);
