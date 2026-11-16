/**
 * Ordinary movement: base patterns per piece plus every movement-related
 * upgrade (extra patterns, range bonuses, gap and wall crossing, once-per-
 * battle special moves).
 */
import { inBounds, isBarrier, isHole, isStandable, isWall, terrainAt } from './board';
import {
  ALL_DIRS,
  DIAG,
  ORTHO,
  add,
  adjacent,
  anyHas,
  enemiesOf,
  has,
  hasStatus,
  isBoss,
  isEmpty,
  kingOf,
  movementType,
  pieceAt,
  ready,
  scale,
  sign,
  silenced,
  statusOf,
  suppressed,
} from './core';
import { crashAuraPresent, crashRangeBonus, tropyPhase } from './crash';
import { crashUpgradeRange, crashUpgradeSteps } from './crashUpgrades';
import { bowserPhase, marioAuraPresent, marioRangeBonus, marioSteps } from './mario';
import { PIECE_STATS, ZELDA_TYPES, deathEggPhase, footprint, ganonPhase, sizeOf } from './pieces';
import { haunted, heavyDirs, phantomSteps } from './bosses';
import { Coord, GameState, Piece, PieceType, forward, sameCoord } from './types';

export const KNIGHT_JUMPS: Coord[] = [
  { x: 1, y: 2 },
  { x: 2, y: 1 },
  { x: -1, y: 2 },
  { x: -2, y: 1 },
  { x: 1, y: -2 },
  { x: 2, y: -1 },
  { x: -1, y: -2 },
  { x: -2, y: -1 },
];
/** Epona's long L (3 by 2), granted next to Malon. */
const WIDE_KNIGHT: Coord[] = [
  { x: 2, y: 3 },
  { x: 3, y: 2 },
  { x: -2, y: 3 },
  { x: -3, y: 2 },
  { x: 2, y: -3 },
  { x: 3, y: -2 },
  { x: -2, y: -3 },
  { x: -3, y: -2 },
];
const LONG_KNIGHT: Coord[] = [
  { x: 1, y: 3 },
  { x: 3, y: 1 },
  { x: -1, y: 3 },
  { x: -3, y: 1 },
  { x: 1, y: -3 },
  { x: 3, y: -1 },
  { x: -1, y: -3 },
  { x: -3, y: -1 },
];
const SIDEWAYS: Coord[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
];

/** A square reachable by ordinary movement. */
export interface Step {
  to: Coord;
  /** May end on an enemy (attack). */
  capture: boolean;
  /** May end on an empty square. */
  quiet: boolean;
  /** Leapers return to their start square when bounced. */
  leap: boolean;
  /** Once-per-battle upgrades this step spends. */
  uses?: string[];
  crossedGap?: boolean;
  /** Intermediate square, for multi-part moves (corner turns, side steps). */
  via?: Coord;
}

type Pattern =
  | { kind: 'slide'; dirs: Coord[]; max: number; capture?: boolean; quiet?: boolean; uses?: string[] }
  | { kind: 'leap'; offsets: Coord[]; rule: 'rect' | 'line' | 'free'; capture?: boolean; uses?: string[] };

function basePatterns(type: PieceType): Pattern[] {
  switch (type) {
    case 'knight':
      return [{ kind: 'leap', offsets: KNIGHT_JUMPS, rule: 'rect' }];
    case 'bishop':
      return [{ kind: 'slide', dirs: DIAG, max: Infinity }];
    case 'rook':
      return [{ kind: 'slide', dirs: ORTHO, max: Infinity }];
    case 'queen':
      return [{ kind: 'slide', dirs: ALL_DIRS, max: Infinity }];
    case 'king':
    case 'guardian':
    case 'switcher':
      return [{ kind: 'slide', dirs: ALL_DIRS, max: 1 }];
    case 'archer':
      return [{ kind: 'slide', dirs: DIAG, max: 1, capture: false }];
    case 'lancer':
      return [
        {
          kind: 'leap',
          offsets: ORTHO.flatMap((d) => [scale(d, 2), scale(d, 3)]),
          rule: 'line',
        },
      ];
    case 'siege':
      return [{ kind: 'slide', dirs: ORTHO, max: 1 }];
    case 'mage':
      return [{ kind: 'slide', dirs: DIAG, max: 2 }];
    case 'chancellor':
      return [
        { kind: 'slide', dirs: ORTHO, max: Infinity },
        { kind: 'leap', offsets: KNIGHT_JUMPS, rule: 'rect' },
      ];
    case 'medic':
      return [{ kind: 'slide', dirs: [...DIAG, ...SIDEWAYS], max: 1 }];
    case 'decoy':
      return [{ kind: 'slide', dirs: ALL_DIRS, max: 1, capture: false }];
    case 'hopper':
      return [{ kind: 'leap', offsets: DIAG.map((d) => scale(d, 2)), rule: 'line' }];
    case 'magnet':
    case 'bastion':
    case 'sentinel':
      return [{ kind: 'slide', dirs: ORTHO, max: 1 }];
    case 'pusher':
    case 'jailer':
      return [{ kind: 'slide', dirs: ORTHO, max: 2 }];
    case 'mimic':
    case 'anchor':
      return [{ kind: 'slide', dirs: DIAG, max: 1 }];
    case 'reaper':
      return [{ kind: 'slide', dirs: DIAG, max: 3 }];
    case 'pathfinder':
      return [{ kind: 'slide', dirs: ALL_DIRS, max: 2 }];
    case 'splitter':
      return [{ kind: 'slide', dirs: DIAG, max: 2 }];
    case 'phoenix':
      return [{ kind: 'slide', dirs: ORTHO, max: 3 }];
    case 'engineer':
    case 'clone':
      return [{ kind: 'slide', dirs: ALL_DIRS, max: 1 }];
    case 'assassin':
    case 'oracle':
      return [{ kind: 'slide', dirs: DIAG, max: 3 }];
    case 'illusionist':
    case 'harvester':
      return [{ kind: 'slide', dirs: ALL_DIRS, max: 2 }];
    case 'summoner':
      return [{ kind: 'slide', dirs: DIAG, max: 1 }];
    case 'converter':
      return [{ kind: 'slide', dirs: ORTHO, max: 2 }];
    case 'displacer':
      return [{ kind: 'leap', offsets: ORTHO.map((d) => scale(d, 2)), rule: 'line' }];
    case 'bomber':
    case 'warden':
      return [{ kind: 'slide', dirs: ORTHO, max: 1 }];
    case 'slayer':
      return [
        { kind: 'slide', dirs: ORTHO, max: 3 },
        { kind: 'slide', dirs: DIAG, max: 1 },
      ];
    case 'illusion':
      return [{ kind: 'slide', dirs: ALL_DIRS, max: 1, capture: false }];
    case 'empress':
      return [
        { kind: 'slide', dirs: ALL_DIRS, max: Infinity },
        { kind: 'leap', offsets: KNIGHT_JUMPS, rule: 'rect' },
      ];
    case 'necromancer':
      return [{ kind: 'slide', dirs: DIAG, max: 2 }];
    case 'stormbringer':
      return [{ kind: 'slide', dirs: ORTHO, max: 3 }];
    case 'chronarch':
      return [{ kind: 'slide', dirs: ALL_DIRS, max: 2 }];
    case 'doppelganger':
      return [{ kind: 'slide', dirs: ALL_DIRS, max: 1 }];
    // Zelda Content Pack
    case 'link':
    case 'darknut':
      return [{ kind: 'slide', dirs: ALL_DIRS, max: 2 }];
    case 'zelda':
      return [{ kind: 'slide', dirs: DIAG, max: Infinity }];
    case 'midna':
      return [
        { kind: 'leap', offsets: KNIGHT_JUMPS, rule: 'rect' },
        { kind: 'slide', dirs: SIDEWAYS, max: 1 },
      ];
    case 'goron':
      return [{ kind: 'slide', dirs: ORTHO, max: 3 }];
    case 'zora':
      return [
        { kind: 'slide', dirs: SIDEWAYS, max: Infinity },
        { kind: 'slide', dirs: DIAG, max: 2 },
      ];
    case 'redead':
      return [{ kind: 'slide', dirs: ALL_DIRS, max: 1 }];
    case 'like_like':
      return [{ kind: 'slide', dirs: ORTHO, max: 2 }];
    case 'skulltula':
      return [{ kind: 'slide', dirs: DIAG, max: 3 }];
    case 'malon':
      return [
        { kind: 'slide', dirs: DIAG, max: 2 },
        { kind: 'slide', dirs: ORTHO, max: 1 },
      ];
    // Super Mario Pack
    case 'mario':
      return [
        { kind: 'slide', dirs: ORTHO, max: 2 },
        { kind: 'leap', offsets: DIAG.map((d) => scale(d, 2)), rule: 'free' },
      ];
    case 'luigi':
    case 'peach':
    case 'toadette':
      return [
        { kind: 'slide', dirs: DIAG, max: 3 },
        { kind: 'slide', dirs: ORTHO, max: 1 },
      ];
    case 'daisy':
      return [
        { kind: 'slide', dirs: ORTHO, max: 3 },
        { kind: 'slide', dirs: DIAG, max: 1 },
      ];
    case 'yoshi':
      return [{ kind: 'slide', dirs: ALL_DIRS, max: 2 }];
    case 'toad':
    case 'wario':
    case 'koopa':
      return [
        { kind: 'slide', dirs: ORTHO, max: 2 },
        { kind: 'slide', dirs: DIAG, max: 1 },
      ];
    case 'waluigi':
      return [
        { kind: 'slide', dirs: DIAG, max: 3 },
        { kind: 'leap', offsets: ORTHO.map((d) => scale(d, 2)), rule: 'free' },
      ];
    case 'rosalina':
      return [{ kind: 'slide', dirs: ALL_DIRS, max: 3 }];
    case 'goomba':
      return [{ kind: 'slide', dirs: ALL_DIRS, max: 1 }];
    case 'boo':
      return [
        { kind: 'slide', dirs: DIAG, max: 3 },
        { kind: 'slide', dirs: ORTHO, max: 2 },
      ];
    case 'hammer_bro':
      return [
        { kind: 'slide', dirs: DIAG, max: 2 },
        { kind: 'slide', dirs: ORTHO, max: 1 },
      ];
    // Crash Bandicoot Pack
    case 'crash':
      return [
        { kind: 'slide', dirs: ORTHO, max: 3 },
        { kind: 'slide', dirs: DIAG, max: 1 },
      ];
    case 'coco':
    case 'pura':
      return [
        { kind: 'slide', dirs: DIAG, max: 3 },
        { kind: 'slide', dirs: ORTHO, max: type === 'pura' ? 2 : 1 },
      ];
    case 'crunch':
    case 'brio_monster':
      return [{ kind: 'slide', dirs: ALL_DIRS, max: 2 }];
    case 'aku_aku':
    case 'uka_uka':
      return [
        {
          kind: 'leap',
          offsets: ALL_DIRS.flatMap((d) => [d, scale(d, 2), scale(d, 3)]),
          rule: 'line',
          ...(type === 'aku_aku' ? { capture: false } : {}),
        },
      ];
    case 'tawna':
      return [
        { kind: 'slide', dirs: ORTHO, max: 3 },
        { kind: 'leap', offsets: DIAG.map((d) => scale(d, 2)), rule: 'line' },
      ];
    case 'cortex':
    case 'brio':
      return [
        { kind: 'slide', dirs: DIAG, max: 2 },
        { kind: 'slide', dirs: ORTHO, max: 1 },
      ];
    case 'n_gin':
      return [{ kind: 'slide', dirs: ORTHO, max: 2 }];
    case 'tiny':
      return [
        { kind: 'leap', offsets: ORTHO.map((d) => scale(d, 2)), rule: 'free' },
        { kind: 'slide', dirs: DIAG, max: 1 },
      ];
    case 'dingodile':
      return [
        { kind: 'slide', dirs: ORTHO, max: 2 },
        { kind: 'slide', dirs: DIAG, max: 1 },
      ];
    case 'ripper_roo':
      return [{ kind: 'leap', offsets: [...KNIGHT_JUMPS, ...LONG_KNIGHT], rule: 'free' }];
    case 'polar':
      return [{ kind: 'slide', dirs: ORTHO, max: 4 }];
    case 'miku':
      return [
        { kind: 'slide', dirs: DIAG, max: 3 },
        { kind: 'slide', dirs: ORTHO, max: 1 },
      ];
    case 'teto':
      return [
        { kind: 'slide', dirs: ORTHO, max: 3 },
        { kind: 'slide', dirs: DIAG, max: 1 },
      ];
    case 'epona':
      // Epona clears anything in her path: walls and gaps too.
      return [
        { kind: 'leap', offsets: KNIGHT_JUMPS, rule: 'free' },
        { kind: 'leap', offsets: LONG_KNIGHT, rule: 'free' },
      ];
    case 'deku_scrub':
      return [{ kind: 'slide', dirs: DIAG, max: 1 }];
    case 'lizalfos':
      return [
        { kind: 'slide', dirs: ORTHO, max: 2 },
        { kind: 'leap', offsets: KNIGHT_JUMPS, rule: 'rect' },
      ];
    case 'stalfos':
      return [{ kind: 'slide', dirs: ALL_DIRS, max: 2 }];
    // Sonic Content Pack (Tails, Rouge and Buzz Bomber move by their own rules in stepsFor).
    case 'sonic':
      return [
        { kind: 'slide', dirs: ORTHO, max: 4 },
        { kind: 'slide', dirs: DIAG, max: 2 },
      ];
    case 'knuckles':
      return [
        { kind: 'slide', dirs: ORTHO, max: 2 },
        { kind: 'leap', offsets: DIAG.map((d) => scale(d, 2)), rule: 'line' },
      ];
    case 'amy':
    case 'silver':
      return [{ kind: 'slide', dirs: ALL_DIRS, max: 2 }];
    case 'shadow':
      return [{ kind: 'slide', dirs: ALL_DIRS, max: 3 }];
    case 'blaze':
      return [
        { kind: 'slide', dirs: DIAG, max: 3 },
        { kind: 'slide', dirs: ORTHO, max: 1 },
      ];
    case 'eggman':
      return [{ kind: 'slide', dirs: ALL_DIRS, max: 1 }];
    case 'metal_sonic':
      return [
        { kind: 'slide', dirs: ORTHO, max: 3 },
        { kind: 'leap', offsets: KNIGHT_JUMPS, rule: 'rect' },
      ];
    case 'motobug':
      return [
        { kind: 'slide', dirs: SIDEWAYS, max: 4 },
        { kind: 'slide', dirs: [{ x: 0, y: 1 }, { x: 0, y: -1 }], max: 1 },
      ];
    case 'super_sonic':
      return [
        { kind: 'slide', dirs: ORTHO, max: 6 },
        { kind: 'slide', dirs: DIAG, max: 4 },
      ];
    case 'super_shadow':
    case 'super_silver':
      return [{ kind: 'slide', dirs: ALL_DIRS, max: 4 }];
    case 'burning_blaze':
      return [
        { kind: 'slide', dirs: DIAG, max: 5 },
        { kind: 'slide', dirs: ORTHO, max: 3 },
      ];
    case 'crabmeat':
      return [
        { kind: 'slide', dirs: SIDEWAYS, max: 2 },
        { kind: 'slide', dirs: [{ x: 0, y: 1 }, { x: 0, y: -1 }], max: 1 },
      ];
    default:
      return []; // pawn and large pieces have their own rules
  }
}

/** Does this piece's movement include a finite slide (so range bonuses matter)? */
export function hasFiniteRange(type: PieceType): boolean {
  return basePatterns(type).some((p) => p.kind === 'slide' && Number.isFinite(p.max)) || type === 'pawn';
}
export const isSlider = (type: PieceType) => basePatterns(type).some((p) => p.kind === 'slide' && p.max === Infinity);
export const isLeaper = (type: PieceType) => basePatterns(type).some((p) => p.kind === 'leap');
export const hasDiagonal = (type: PieceType) =>
  basePatterns(type).some((p) => p.kind === 'slide' && p.dirs.some((d) => d.x !== 0 && d.y !== 0));
export const hasOrthogonal = (type: PieceType) =>
  basePatterns(type).some((p) => p.kind === 'slide' && p.dirs.some((d) => d.x === 0 || d.y === 0));

// ---------------------------------------------------------------------------
// Range modifiers
// ---------------------------------------------------------------------------

const adjacentToGap = (s: GameState, c: Coord) =>
  ALL_DIRS.some((d) => {
    const q = add(c, d);
    return !inBounds(s.board, q) || isHole(s.board, q);
  });

/** Total bonus (or penalty) to finite movement ranges for this piece right now. */
export function rangeBonus(s: GameState, p: Piece, dir: Coord): number {
  const crash = crashAuraPresent(s) ? crashRangeBonus(s, p) : 0;
  const mario = marioAuraPresent(s) ? marioRangeBonus(s, p) : 0;
  return crash + mario + baseRangeBonus(s, p, dir);
}

function baseRangeBonus(s: GameState, p: Piece, dir: Coord): number {
  if (p.upgrades.length === 0 && p.statuses.length === 0 && !anyHas(s, 'royal_rally') && !anyHas(s, 'siege_presence')) return 0;
  let b = 0;
  if (has(p, 'extended_stride')) b += 1;
  if (has(p, 'speed_shoes')) b += 1;
  b += crashUpgradeRange(p);
  if (has(p, 'chaos_emeralds')) b += 1;
  if (has(p, 'purple_frenzy')) b += Math.min(3, p.counters.frenzy ?? 0);
  if (has(p, 'momentum') && p.streak >= 2) b += 1;
  if (has(p, 'long_retreat') && Math.sign(dir.y) === -forward(p.side)) b += 2;
  if (has(p, 'cliff_runner') && adjacentToGap(s, p.pos)) b += 1;
  b += statusOf(p, 'rangeBuff')?.amount ?? 0;
  const king = kingOf(s, p.side);
  if (king && king.id !== p.id && adjacent(king, p) && s.pieces.some((a) => a.side === p.side && has(a, 'royal_rally'))) b += 1;
  if (hasStatus(p, 'slowed')) b -= 1;
  if (enemiesOf(s, p).some((e) => has(e, 'siege_presence') && adjacent(e, p))) b -= 1;
  if (has(p, 'colossal_endurance')) b -= 1;
  return b;
}

// ---------------------------------------------------------------------------
// Walking a line with gap/wall crossing
// ---------------------------------------------------------------------------

interface Crossing {
  gaps: number;
  walls: number;
}

function crossingFor(p: Piece): Crossing {
  return {
    // Silver levitates over any run of gaps.
    gaps: p.type === 'peach' || p.type === 'silver' || p.type === 'super_silver' || p.type === 'burning_blaze' || has(p, 'hover_wisp') ? 99 : has(p, 'long_gap_jump') ? 2 : has(p, 'gap_jumper') || has(p, 'hover_boots') ? 1 : 0,
    walls: has(p, 'yellow_drill') ? 99 : has(p, 'extended_phasing') ? 2 : has(p, 'phasing') ? 1 : 0,
  };
}

/** Squares along a line, crossing up to the allowed runs of gaps/walls (crossed squares don't count toward range). */
function walk(
  s: GameState,
  from: Coord,
  dir: Coord,
  max: number,
  cross: Crossing,
): { to: Coord; crossedGap: boolean; blocked: boolean }[] {
  const out: { to: Coord; crossedGap: boolean; blocked: boolean }[] = [];
  let c = from;
  let crossedGap = false;
  for (let n = 0; n < max; ) {
    let next = add(c, dir);
    if (!inBounds(s.board, next)) break;
    const t = terrainAt(s.board, next);
    if (t !== 'normal') {
      const isGap = t === 'gap';
      const allow = isGap ? cross.gaps : cross.walls;
      let run = 0;
      let q = next;
      while (inBounds(s.board, q) && (isGap ? terrainAt(s.board, q) === 'gap' : isWall(s.board, q))) {
        run++;
        q = add(q, dir);
      }
      if (run === 0 || run > allow || !isStandable(s.board, q)) break;
      if (isGap) crossedGap = true;
      next = q;
    }
    c = next;
    n++;
    const occupied = !!pieceAt(s, c);
    out.push({ to: c, crossedGap, blocked: occupied });
    if (occupied) break;
  }
  return out;
}

/** The squares passed over by the two L-shaped routes from `from` to `to` (ends excluded). */
export function lPaths(from: Coord, to: Coord): Coord[][] {
  const sx = Math.sign(to.x - from.x);
  const sy = Math.sign(to.y - from.y);
  const xFirst: Coord[] = [];
  const yFirst: Coord[] = [];
  for (let x = from.x + sx; x !== to.x + sx; x += sx) xFirst.push({ x, y: from.y });
  for (let y = from.y + sy; y !== to.y; y += sy) xFirst.push({ x: to.x, y });
  for (let y = from.y + sy; y !== to.y + sy; y += sy) yFirst.push({ x: from.x, y });
  for (let x = from.x + sx; x !== to.x; x += sx) yFirst.push({ x, y: to.y });
  return [xFirst, yFirst];
}

/** Skulltula (Wall Crawler): walls and cracked walls are ordinary squares; gaps and pieces stop it. */
function crawl(s: GameState, from: Coord, dir: Coord, max: number): { to: Coord; crossedGap: boolean; blocked: boolean }[] {
  const out: { to: Coord; crossedGap: boolean; blocked: boolean }[] = [];
  let c = from;
  for (let n = 0; n < max; n++) {
    c = add(c, dir);
    if (!inBounds(s.board, c) || isHole(s.board, c) || terrainAt(s.board, c) === 'door') break;
    const occupied = !!pieceAt(s, c);
    out.push({ to: c, crossedGap: false, blocked: occupied });
    if (occupied) break;
  }
  return out;
}

/** Midna: her third, sixth, ninth... move is a Twilight Shift. */
export const twilightCharged = (p: Piece) => ((p.counters.moves ?? 0) + 1) % 3 === 0;

/** Twilight Shift: the sideways step passes through an occupied square to the square beyond. */
function twilightSteps(s: GameState, p: Piece): Step[] {
  const out: Step[] = [];
  for (const d of SIDEWAYS) {
    const mid = add(p.pos, d);
    const to = add(mid, d);
    if (!pieceAt(s, mid) || !isStandable(s.board, to)) continue;
    const o = pieceAt(s, to);
    if (o && o.side === p.side) continue; // can't end on an ally
    out.push({ to, capture: true, quiet: true, leap: true, via: mid });
  }
  return out;
}

/** Goron Rolling Charge: exactly three squares straight, rolling through cracked walls (otherwise clear path). */
function rollingCharge(s: GameState, p: Piece): Step[] {
  if (hasStatus(p, 'bound')) return [];
  const out: Step[] = [];
  for (const d of ORTHO) {
    const path = [add(p.pos, d), add(p.pos, scale(d, 2))];
    const to = add(p.pos, scale(d, 3));
    const cracked = path.filter((c) => inBounds(s.board, c) && terrainAt(s.board, c) === 'cracked').length;
    if (cracked === 0) continue; // an ordinary slide already covers it
    const clear = path.every((c) => inBounds(s.board, c) && ['normal', 'cracked'].includes(terrainAt(s.board, c)) && !pieceAt(s, c));
    if (!clear || !isStandable(s.board, to)) continue;
    const o = pieceAt(s, to);
    if (o && o.side === p.side) continue;
    out.push({ to, capture: true, quiet: true, leap: false });
  }
  return out;
}

/** Tails and Buzz Bomber fly diagonally over anything and may land on a gap. */
function flightSteps(s: GameState, p: Piece, reach: number): Step[] {
  if (hasStatus(p, 'bound')) return [];
  const out: Step[] = [];
  for (const d of DIAG)
    for (let k = 1; k <= reach; k++) {
      const c = add(p.pos, scale(d, k));
      const t = terrainAt(s.board, c);
      if (!inBounds(s.board, c) || (t !== 'normal' && t !== 'gap')) continue;
      out.push({ to: c, capture: true, quiet: true, leap: true });
    }
  return out;
}

/** Rouge: up to four squares diagonally, hopping over one obstacle (a piece or a wall) on the way. */
function rougeSteps(s: GameState, p: Piece): Step[] {
  if (hasStatus(p, 'bound')) return [];
  const out: Step[] = [];
  for (const d of DIAG) {
    let hopped = false;
    for (let k = 1; k <= 4; k++) {
      const c = add(p.pos, scale(d, k));
      // Off the board's shape ends the line; a gap or wall is just one more obstacle to hop.
      if (!inBounds(s.board, c) || terrainAt(s.board, c) === 'void') break;
      const o = pieceAt(s, c);
      const blocked = !isStandable(s.board, c) || !!o;
      if (!blocked) {
        out.push({ to: c, capture: true, quiet: true, leap: hopped });
        continue;
      }
      if (o && o.side !== p.side && isStandable(s.board, c)) out.push({ to: c, capture: true, quiet: false, leap: hopped });
      if (hopped) break;
      hopped = true;
    }
  }
  return out;
}

/** Hyper Sonic: up to seven squares in any direction, leaping over everything in the way. */
function hyperSteps(s: GameState, p: Piece, reach: number): Step[] {
  if (hasStatus(p, 'bound')) return [];
  const out: Step[] = [];
  for (const d of ALL_DIRS)
    for (let k = 1; k <= reach; k++) {
      const c = add(p.pos, scale(d, k));
      if (!inBounds(s.board, c)) break;
      if (isStandable(s.board, c)) out.push({ to: c, capture: true, quiet: true, leap: true });
    }
  return out;
}

/**
 * Spin Attack: Sonic's slide may break through one cracked wall and keep going;
 * Super Sonic smashes through every cracked wall in his path.
 */
function spinSteps(s: GameState, p: Piece): Step[] {
  if (hasStatus(p, 'bound')) return [];
  const out: Step[] = [];
  const breaks = p.type === 'super_sonic' ? Infinity : 1;
  for (const pat of basePatterns(p.type))
    if (pat.kind === 'slide')
      for (const d of pat.dirs) {
        let broke = 0;
        for (let k = 1; k <= pat.max; k++) {
          const c = add(p.pos, scale(d, k));
          const t = terrainAt(s.board, c);
          if (t === 'cracked' && broke < breaks) {
            broke++;
            continue;
          }
          if (!isStandable(s.board, c)) break;
          const o = pieceAt(s, c);
          // Only squares past the broken wall are new; the ordinary slide covers the rest.
          if (broke) out.push({ to: c, capture: true, quiet: !o, leap: false });
          if (o) break;
        }
      }
  return out;
}

function leapClear(s: GameState, from: Coord, off: Coord, rule: 'rect' | 'line' | 'free', wallsAllowed: number) {
  const to = add(from, off);
  if (!isStandable(s.board, to)) return null;
  if (rule === 'free') return { to, gap: false };
  let walls = 0;
  let gap = false;
  if (rule === 'rect') {
    // An L-shaped jump can go either way round the corner: along x first, or along y first.
    // It's blocked only if every route has more walls than the piece may pass through.
    let best = Infinity;
    for (const path of lPaths(from, to)) {
      const w = path.filter((c) => isBarrier(s.board, c)).length;
      if (w > wallsAllowed) continue;
      best = Math.min(best, w);
      if (path.some((c) => terrainAt(s.board, c) === 'gap')) gap = true;
    }
    walls = best;
  } else {
    const d = sign(off);
    const n = Math.max(Math.abs(off.x), Math.abs(off.y));
    for (let i = 1; i < n; i++) {
      const q = add(from, scale(d, i));
      if (isWall(s.board, q)) walls++;
      if (terrainAt(s.board, q) === 'gap') gap = true;
    }
  }
  return walls <= wallsAllowed ? { to, gap } : null;
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

/** Can this piece use once-per-battle movement abilities right now? */
export const canUseMoveAbilities = (s: GameState, p: Piece) => !silenced(p) && !suppressed(s, p) && !haunted(s, p);

/**
 * Mimic: the movement of every adjacent friendly 1x1 piece (movement only;
 * a copied Pawn just steps forward and captures diagonally forward). With no
 * eligible neighbour it steps one square diagonally.
 */
function mimicPatterns(s: GameState, p: Piece): Pattern[] {
  const f = forward(p.side);
  const copied = new Set(
    s.pieces
      .filter((a) => a.side === p.side && a.id !== p.id && a.type !== 'mimic' && sizeOf(a) === 1 && adjacent(a, p))
      .map((a) => movementType(s, a)),
  );
  if (copied.size === 0) return basePatterns('mimic');
  const out: Pattern[] = [];
  for (const t of copied) {
    if (t === 'pawn') {
      out.push({ kind: 'slide', dirs: [{ x: 0, y: f }], max: 1, capture: false });
      out.push({ kind: 'slide', dirs: [{ x: -1, y: f }, { x: 1, y: f }], max: 1, quiet: false });
    } else out.push(...basePatterns(t));
  }
  return out;
}

/** Doppelganger: its own step plus the movement of every enemy 1x1 (non-boss) piece type. */
function doppelgangerPatterns(s: GameState, p: Piece): Pattern[] {
  const f = forward(p.side);
  const out: Pattern[] = basePatterns('doppelganger');
  const types = new Set(s.pieces.filter((e) => e.side !== p.side && sizeOf(e) === 1 && !isBoss(e)).map((e) => movementType(s, e)));
  for (const t of types) {
    if (t === 'pawn') {
      out.push({ kind: 'slide', dirs: [{ x: 0, y: f }], max: 1, capture: false });
      out.push({ kind: 'slide', dirs: [{ x: -1, y: f }, { x: 1, y: f }], max: 1, quiet: false });
    } else if (t !== 'mimic' && t !== 'decoy' && t !== 'illusion') out.push(...basePatterns(t));
  }
  return out;
}

function patternsFor(s: GameState, p: Piece): Pattern[] {
  const type = movementType(s, p);
  let pats = type === 'mimic' ? mimicPatterns(s, p) : type === 'doppelganger' ? doppelgangerPatterns(s, p) : basePatterns(type);
  // Hero's Courage (Link at 1 HP) and a Darknut whose armor is broken reach one square further.
  if ((p.type === 'link' && p.hp === 1) || (p.type === 'darknut' && p.counters.armorBroken))
    pats = pats.map((pt) => (pt.kind === 'slide' && pt.max === 2 ? { ...pt, max: 3 } : pt));
  // Metal Sonic: Overdrive at 1 HP (+1 range) and Copycat (also moves like the last enemy that hurt him).
  if (p.type === 'metal_sonic') {
    if (p.hp === 1) pats = pats.map((pt) => (pt.kind === 'slide' && Number.isFinite(pt.max) ? { ...pt, max: pt.max + 1 } : pt));
    const copied = statusOf(p, 'copying')?.source as PieceType | undefined;
    if (copied && copied !== 'pawn' && PIECE_STATS[copied]?.size === 1) pats = [...pats, ...basePatterns(copied)];
  }
  // Crash: Slide Jump, every 3 turns — exactly three squares orthogonally over anything (no capture).
  if (p.type === 'crash' && (p.counters.slideJumpCd ?? 0) <= 0 && canUseMoveAbilities(s, p))
    pats = [...pats, { kind: 'leap', offsets: ORTHO.map((d) => scale(d, 3)), rule: 'free', capture: false, uses: ['slide_jump'] }];
  // Epona started her turn next to Malon: the 3-by-2 jump too.
  if (p.type === 'epona' && p.counters.malonBoost) pats = [...pats, { kind: 'leap', offsets: WIDE_KNIGHT, rule: 'free' }];
  if (p.upgrades.length === 0) return p.type === 'decoy' ? pats.map((pt) => ({ ...pt, capture: false })) : pats;
  const abilities = canUseMoveAbilities(s, p);
  if (has(p, 'diagonal_step')) pats.push({ kind: 'slide', dirs: DIAG, max: 1 });
  if (has(p, 'orthogonal_step')) pats.push({ kind: 'slide', dirs: ORTHO, max: 1 });
  if (has(p, 'flanking_step') && enemiesOf(s, p).some((e) => adjacent(e, p))) pats.push({ kind: 'slide', dirs: DIAG, max: 1 });
  if (has(p, 'backward_advance') && type === 'pawn')
    pats.push({ kind: 'slide', dirs: [{ x: 0, y: -forward(p.side) }], max: 1, capture: false });
  if (has(p, 'short_hop')) pats.push({ kind: 'leap', offsets: ORTHO.map((d) => scale(d, 2)), rule: 'line' });
  if (has(p, 'bounce_bracelet')) pats.push({ kind: 'leap', offsets: ORTHO.map((d) => scale(d, 2)), rule: 'free' });
  if (has(p, 'long_leap')) {
    if (type === 'knight' || type === 'chancellor') pats.push({ kind: 'leap', offsets: LONG_KNIGHT, rule: 'rect' });
    if (type === 'lancer') pats.push({ kind: 'leap', offsets: ORTHO.map((d) => scale(d, 4)), rule: 'line' });
  }
  if (abilities && ready(p, 'knights_training'))
    pats.push({ kind: 'leap', offsets: KNIGHT_JUMPS, rule: 'rect', uses: ['knights_training'] });
  if (abilities && ready(p, 'royal_pace')) pats.push({ kind: 'slide', dirs: ALL_DIRS, max: 1, uses: ['royal_pace'] });
  if (p.type === 'decoy') return pats.map((pt) => ({ ...pt, capture: false }));
  return pats;
}

/** Every ordinary step for a 1x1 piece other than a Pawn's forward moves. */
export function stepsFor(s: GameState, p: Piece): Step[] {
  const out: Step[] = [];
  const confused = hasStatus(p, 'confused');
  const crippled = hasStatus(p, 'crippled');
  const cross = crossingFor(p);
  const abilities = canUseMoveAbilities(s, p);

  for (const pat of patternsFor(s, p)) {
    const capture = pat.capture !== false;
    if (pat.kind === 'leap') {
      if (crippled) continue;
      for (const off of pat.offsets) {
        const r = leapClear(s, p.pos, off, pat.rule, cross.walls);
        if (r) out.push({ to: r.to, capture, quiet: true, leap: true, uses: pat.uses, crossedGap: r.gap });
      }
      continue;
    }
    for (const dir of pat.dirs) {
      const finite = Number.isFinite(pat.max);
      const bonus = finite ? rangeBonus(s, p, dir) : 0;
      let max = finite ? Math.max(1, pat.max + bonus) : Infinity;
      if (confused) max = 1;
      // Skulltulas and Pink Spikes walk over walls as if they were floor.
      const squares = p.type === 'skulltula' || has(p, 'pink_spikes') ? crawl(s, p.pos, dir, max) : walk(s, p.pos, dir, max, cross);
      const quiet = pat.quiet !== false;
      for (const q of squares) out.push({ to: q.to, capture, quiet, leap: false, uses: pat.uses, crossedGap: q.crossedGap });
      // Wall Climber / Master of the Void: once per battle, cross obstacles further.
      if (abilities && !pat.uses && (ready(p, 'wall_climber') || ready(p, 'master_of_the_void'))) {
        const extra = walk(s, p.pos, dir, max, {
          walls: ready(p, 'wall_climber') ? Math.max(cross.walls, 1) : cross.walls,
          gaps: ready(p, 'master_of_the_void') ? 99 : cross.gaps,
        });
        for (const q of extra) {
          if (squares.some((o) => sameCoord(o.to, q.to))) continue;
          const usesWall = ready(p, 'wall_climber');
          out.push({
            to: q.to,
            capture: usesWall ? false : capture,
            quiet: true,
            leap: false,
            uses: [usesWall ? 'wall_climber' : 'master_of_the_void'],
            crossedGap: q.crossedGap,
          });
        }
      }
      if (!finite || confused || pat.uses) continue;
      // Quick March: the first quiet move each battle may go one square further.
      const last = squares[squares.length - 1];
      if (abilities && ready(p, 'quick_march') && squares.length === max && last && !last.blocked) {
        const extra = walk(s, last.to, dir, 1, cross)[0];
        if (extra && !extra.blocked) out.push({ to: extra.to, capture: false, quiet: true, leap: false, uses: ['quick_march'] });
      }
      // Edge Walker: one more square while every square of the path hugs a gap.
      if (has(p, 'edge_walker') && last && !last.blocked && squares.every((q) => adjacentToGap(s, q.to))) {
        const extra = walk(s, last.to, dir, 1, cross)[0];
        if (extra && adjacentToGap(s, extra.to)) out.push({ to: extra.to, capture, quiet: true, leap: false });
      }
    }
  }

  if (!crippled) out.push(...marioSteps(s, p));
  if (p.upgrades.length && !crippled) {
    // Finite slides (with range bonuses); unlimited ones reach across the board (Lani-Loli only).
    const across = Math.max(s.board.width, s.board.height);
    const slides = patternsFor(s, p).flatMap((pat) =>
      pat.kind === 'slide' && !pat.uses
        ? pat.dirs.map((dir) => ({ dir, max: Number.isFinite(pat.max) ? Math.max(1, pat.max + rangeBonus(s, p, dir)) : across, unlimited: !Number.isFinite(pat.max) }))
        : [],
    );
    out.push(...crashUpgradeSteps(s, p, slides));
  }
  if (p.type === 'phantom_king' && !crippled) out.push(...phantomSteps(s, p));
  if (p.type === 'midna' && twilightCharged(p)) out.push(...twilightSteps(s, p));
  if (p.type === 'goron' && !confused) out.push(...rollingCharge(s, p));
  if ((p.type === 'tails' || p.type === 'buzz_bomber') && !crippled) out.push(...flightSteps(s, p, confused ? 1 : 3));
  if (p.type === 'rouge' && !confused) out.push(...rougeSteps(s, p));
  if ((p.type === 'sonic' || p.type === 'super_sonic') && !confused) out.push(...spinSteps(s, p));
  if (p.type === 'hyper_sonic' && !crippled) out.push(...hyperSteps(s, p, confused ? 1 : 7));
  if (abilities && p.upgrades.length) out.push(...specialMoves(s, p));
  return p.upgrades.length ? dedupe(out) : out;
}

/** Once-per-battle and conditional multi-part moves. */
function specialMoves(s: GameState, p: Piece): Step[] {
  const out: Step[] = [];
  const type = movementType(s, p);
  const empty = (c: Coord) => isEmpty(s, c);
  const enemyAt = (c: Coord) => {
    const o = pieceAt(s, c);
    return !!o && o.side !== p.side;
  };

  if (has(p, 'crossing_step')) {
    for (const d of ALL_DIRS) {
      const mid = pieceAt(s, add(p.pos, d));
      const to = add(p.pos, scale(d, 2));
      if (mid && mid.side === p.side && empty(to)) out.push({ to, capture: false, quiet: true, leap: true, via: add(p.pos, d) });
    }
  }
  if (ready(p, 'zigzag')) {
    for (const a of ORTHO)
      for (const b of ORTHO) {
        if (a.x === b.x || a.y === b.y) continue; // must be different (perpendicular) directions
        const mid = add(p.pos, a);
        const to = add(mid, b);
        if (empty(mid) && (empty(to) || enemyAt(to)))
          out.push({ to, capture: true, quiet: true, leap: false, uses: ['zigzag'], via: mid });
      }
  }
  if (ready(p, 'retreat') && p.prevPos && !sameCoord(p.prevPos, p.pos) && empty(p.prevPos)) {
    out.push({ to: p.prevPos, capture: false, quiet: true, leap: true, uses: ['retreat'] });
  }
  const slideDirs = basePatterns(type)
    .filter((pt) => pt.kind === 'slide' && pt.max > 1)
    .flatMap((pt) => (pt.kind === 'slide' ? pt.dirs : []));
  const corner = (dirs: Coord[], turns: (d: Coord) => Coord[], id: string) => {
    for (const d of dirs) {
      let c = p.pos;
      for (;;) {
        c = add(c, d);
        if (!empty(c)) break;
        for (const t of turns(d)) {
          let e = c;
          for (;;) {
            e = add(e, t);
            if (!isStandable(s.board, e)) break;
            if (empty(e)) out.push({ to: e, capture: true, quiet: true, leap: false, uses: [id], via: c });
            else {
              if (enemyAt(e)) out.push({ to: e, capture: true, quiet: true, leap: false, uses: [id], via: c });
              break;
            }
          }
        }
      }
    }
  };
  if (ready(p, 'corner_turn') && slideDirs.length) {
    corner(slideDirs, (d) => (d.x === 0 || d.y === 0 ? [{ x: d.y, y: d.x }, { x: -d.y, y: -d.x }] : [{ x: d.x, y: -d.y }, { x: -d.x, y: d.y }]), 'corner_turn');
  }
  if (ready(p, 'diagonal_pivot')) {
    const diag = slideDirs.filter((d) => d.x !== 0 && d.y !== 0);
    corner(diag, (d) => [{ x: d.x, y: 0 }, { x: 0, y: d.y }], 'diagonal_pivot');
  }
  return out;
}

/** Side Step: after a quiet move, shift one square sideways (once per battle). */
export function sideStepVariants(s: GameState, p: Piece, to: Coord): Coord[] {
  if (!ready(p, 'side_step') || !canUseMoveAbilities(s, p)) return [];
  return SIDEWAYS.map((d) => add(to, d)).filter((c) => isEmpty(s, c) || sameCoord(c, p.pos));
}

function dedupe(steps: Step[]): Step[] {
  // Prefer the version of a destination that spends nothing.
  const best = new Map<string, Step>();
  for (const st of steps) {
    const k = `${st.to.x},${st.to.y},${st.via ? `${st.via.x},${st.via.y}` : ''}`;
    const prev = best.get(k);
    if (!prev || (prev.uses?.length ?? 0) > (st.uses?.length ?? 0) || (!prev.capture && st.capture)) best.set(k, st);
  }
  return [...best.values()];
}

// ---------------------------------------------------------------------------
// Large pieces
// ---------------------------------------------------------------------------

export interface HeavyStep {
  to: Coord;
  targets: string[];
  /** Friendly piece pushed aside by Iron Advance. */
  shove?: string;
  /** Cracked walls flattened by Crushing Entry. */
  walls?: Coord[];
  uses?: string[];
  /** Living Avalanche: the footprint passes through this intermediate position. */
  via?: Coord;
}

/** Destinations a multi-square piece can step to (orthogonal, one square; two with Living Avalanche). */
export function heavySteps(s: GameState, p: Piece): HeavyStep[] {
  if (p.type === 'chaos') return chaosSteps(s, p);
  const out: HeavyStep[] = [];
  const egg = deathEggPhase(p);
  const check = (to: Coord): Omit<HeavyStep, 'to'> | null => {
    const targets = new Set<string>();
    const walls: Coord[] = [];
    let shove: string | undefined;
    for (const c of footprint(p, to)) {
      const t = terrainAt(s.board, c);
      // The Colossus (Siege Breaker) and Crushing Entry flatten cracked walls in the way.
      if (t === 'cracked' && (has(p, 'crushing_entry') || p.type === 'colossus' || p.type === 'death_egg')) walls.push(c);
      // Death Egg Robot (Phase 2+): Crushing Advance flattens solid walls too.
      else if (t === 'wall' && egg >= 2) walls.push(c);
      else if (t !== 'normal') return null;
      const o = pieceAt(s, c);
      if (!o || o.id === p.id) continue;
      if (o.side === p.side) {
        if (has(p, 'iron_advance') && sizeOf(o) === 1 && (!shove || shove === o.id) && o.type !== 'king') shove = o.id;
        else return null;
      } else targets.add(o.id);
    }
    return { targets: [...targets], shove, walls: walls.length ? walls : undefined };
  };
  for (const d of heavyDirs(p) ?? ORTHO) {
    const to = add(p.pos, d);
    const r = check(to);
    if (r) out.push({ to, ...r });
    // Ganondorf (Phases 1-2) and the critical Death Egg Robot move up to two squares, N. Tropy two
    // (three at 1 HP); every step before the last must be clear.
    const diagonal = d.x !== 0 && d.y !== 0;
    const reach =
      p.type === 'n_tropy'
        ? tropyPhase(p) === 3
          ? 3
          : 2
        : p.type === 'bowser'
          ? (diagonal ? 1 : 2) + (bowserPhase(p) === 3 ? 1 : 0)
          : (p.type === 'ganondorf' && ganonPhase(p) < 3) || egg === 3
            ? 2
            : 1;
    let prev = r;
    let at = to;
    for (let k = 2; k <= reach && prev && !prev.targets.length && !prev.shove && !prev.walls; k++) {
      at = add(at, d);
      const rk = check(at);
      if (rk && !rk.shove && !rk.walls) out.push({ to: at, ...rk });
      prev = rk;
    }
    if (ready(p, 'living_avalanche') && r && !r.shove && canUseMoveAbilities(s, p)) {
      const to2 = add(to, d);
      const r2 = check(to2);
      if (r2 && !r2.shove) {
        out.push({
          to: to2,
          targets: [...new Set([...r.targets, ...r2.targets])],
          walls: [...(r.walls ?? []), ...(r2.walls ?? [])],
          uses: ['living_avalanche'],
          via: to,
        });
      }
    }
  }
  return out;
}

/**
 * Chaos (2×2): up to two squares any direction, flowing through walls and
 * pieces on the way. It must end on open ground clear of allies; enemies under
 * its new footprint are attacked.
 */
function chaosSteps(s: GameState, p: Piece): HeavyStep[] {
  if (hasStatus(p, 'bound')) return [];
  const out: HeavyStep[] = [];
  for (const d of ALL_DIRS)
    for (let k = 1; k <= 2; k++) {
      const to = add(p.pos, scale(d, k));
      const targets = new Set<string>();
      let ok = true;
      for (const c of footprint(p, to)) {
        if (!isStandable(s.board, c)) ok = false;
        const o = pieceAt(s, c);
        if (o && o.id !== p.id) {
          if (o.side === p.side) ok = false;
          else targets.add(o.id);
        }
      }
      if (ok) out.push({ to, targets: [...targets] });
    }
  return out;
}

/** Super Peel Out: squares beyond the normal range of each finite slide, up to twice as far (no captures). */
export function peelOutSquares(s: GameState, p: Piece): Coord[] {
  const out: Coord[] = [];
  const cross = crossingFor(p);
  for (const pat of patternsFor(s, p)) {
    if (pat.kind !== 'slide' || !Number.isFinite(pat.max)) continue;
    for (const dir of pat.dirs) {
      const max = Math.max(1, pat.max + rangeBonus(s, p, dir));
      walk(s, p.pos, dir, max * 2, cross).forEach((q, i) => {
        if (i >= max && !q.blocked && !out.some((o) => sameCoord(o, q.to))) out.push(q.to);
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Threats
// ---------------------------------------------------------------------------

/** Archer shot range (Blind reduces it by two, so a blinded Archer can't shoot). */
export function shotSquares(s: GameState, p: Piece): Coord[] {
  if (p.type !== 'archer' || hasStatus(p, 'blinded')) return [];
  const out: Coord[] = [];
  for (const d of ORTHO) {
    const mid = add(p.pos, d);
    const to = add(p.pos, scale(d, 2));
    if (!inBounds(s.board, to) || isWall(s.board, mid) || !isStandable(s.board, to)) continue;
    out.push(to);
  }
  return out;
}

/** Is every square strictly between a and b (on a straight line) empty normal terrain? */
function lineClear(s: GameState, a: Coord, b: Coord): boolean {
  const d = sign({ x: b.x - a.x, y: b.y - a.y });
  let c = add(a, d);
  while (!sameCoord(c, b)) {
    if (!isStandable(s.board, c) || pieceAt(s, c)) return false;
    c = add(c, d);
  }
  return true;
}

/** Upgrades that change which squares a piece can attack. */
const GEOMETRY_UPGRADES = new Set([
  'extended_stride', 'diagonal_step', 'orthogonal_step', 'long_leap', 'quick_march', 'corner_turn', 'diagonal_pivot',
  'knights_training', 'short_hop', 'momentum', 'long_retreat', 'flanking_step', 'zigzag', 'royal_pace', 'crossing_step',
  'gap_jumper', 'long_gap_jump', 'master_of_the_void', 'cliff_runner', 'edge_walker', 'phasing', 'extended_phasing',
  'wall_climber', 'colossal_endurance', 'retreat', 'side_step', 'hover_boots',
  'speed_shoes', 'bounce_bracelet', 'yellow_drill', 'pink_spikes', 'purple_frenzy', 'hover_wisp', 'chaos_emeralds',
]);
/** Statuses that change which squares a piece can attack. */
const GEOMETRY_STATUSES = new Set(['bound', 'stunned', 'disarmed', 'pacified', 'blinded', 'crippled', 'confused', 'slowed', 'rangeBuff']);

/**
 * Does `p` directly threaten square `sq`? Exact fast path for pieces whose
 * upgrades and statuses don't change their attack geometry; everything else
 * falls back to the full move list.
 */
export function attacksSquare(s: GameState, p: Piece, sq: Coord): boolean {
  const rangeAuras = anyHas(s, 'royal_rally') || anyHas(s, 'siege_presence');
  const special =
    p.upgrades.some((u) => GEOMETRY_UPGRADES.has(u)) || p.statuses.some((st) => GEOMETRY_STATUSES.has(st.kind));
  if (special || sizeOf(p) > 1 || p.temp || rangeAuras || p.type === 'mimic' || p.type === 'decoy' || p.type === 'illusion' || ZELDA_TYPES.has(p.type))
    return attackSquares(s, p).some((c) => sameCoord(c, sq));
  if (!isStandable(s.board, sq)) return false;
  const dx = sq.x - p.pos.x;
  const dy = sq.y - p.pos.y;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  const cheb = Math.max(adx, ady);
  if (cheb === 0) return false;
  const diag = adx === ady;
  const ortho = dx === 0 || dy === 0;
  const knight = (adx === 1 && ady === 2) || (adx === 2 && ady === 1);
  const knightOk = () => knight && !!leapClear(s, p.pos, { x: dx, y: dy }, 'rect', 0);
  switch (p.type) {
    case 'pawn':
      return adx === 1 && dy === forward(p.side);
    case 'knight':
      return knightOk();
    case 'bishop':
      return diag && lineClear(s, p.pos, sq);
    case 'rook':
      return ortho && lineClear(s, p.pos, sq);
    case 'queen':
      return (diag || ortho) && lineClear(s, p.pos, sq);
    case 'king':
    case 'guardian':
    case 'switcher':
      return cheb === 1;
    case 'archer':
      return ortho && cheb === 2 && !isWall(s.board, add(p.pos, sign({ x: dx, y: dy })));
    case 'lancer':
      return ortho && (cheb === 2 || cheb === 3) && !!leapClear(s, p.pos, { x: dx, y: dy }, 'line', 0);
    case 'siege':
      return ortho && cheb === 1;
    case 'mage':
      return diag && cheb <= 2 && lineClear(s, p.pos, sq);
    case 'chancellor':
      return (ortho && lineClear(s, p.pos, sq)) || knightOk();
    case 'medic':
      return cheb === 1 && (diag || dy === 0);
    default:
      return attackSquares(s, p).some((c) => sameCoord(c, sq));
  }
}

/** Squares a piece threatens with a direct attack next turn (used for check). */
export function attackSquares(s: GameState, p: Piece): Coord[] {
  if (hasStatus(p, 'stunned') || hasStatus(p, 'disarmed') || hasStatus(p, 'pacified') || p.type === 'decoy') return [];
  if (p.type === 'pawn' && movementType(s, p) === 'pawn') {
    const f = forward(p.side);
    const out = [-1, 1].map((dx) => ({ x: p.pos.x + dx, y: p.pos.y + f })).filter((c) => isStandable(s.board, c));
    if (!hasStatus(p, 'bound')) out.push(...stepsFor(s, p).filter((st) => st.capture).map((st) => st.to));
    return out;
  }
  if (sizeOf(p) > 1) {
    if (hasStatus(p, 'bound')) return [];
    const own = footprint(p);
    return heavySteps(s, p).flatMap((st) => footprint(p, st.to).filter((c) => !own.some((o) => sameCoord(o, c))));
  }
  const moving = hasStatus(p, 'bound') ? [] : stepsFor(s, p).filter((st) => st.capture).map((st) => st.to);
  return [...moving, ...shotSquares(s, p)];
}
