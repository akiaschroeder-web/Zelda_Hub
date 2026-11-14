/**
 * Ordinary movement: base patterns per piece plus every movement-related
 * upgrade (extra patterns, range bonuses, gap and wall crossing, once-per-
 * battle special moves).
 */
import { inBounds, isStandable, isWall, terrainAt } from './board';
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
import { footprint, sizeOf } from './pieces';
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
  | { kind: 'leap'; offsets: Coord[]; rule: 'rect' | 'line'; capture?: boolean; uses?: string[] };

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
    return !inBounds(s.board, q) || terrainAt(s.board, q) === 'gap';
  });

/** Total bonus (or penalty) to finite movement ranges for this piece right now. */
export function rangeBonus(s: GameState, p: Piece, dir: Coord): number {
  if (p.upgrades.length === 0 && p.statuses.length === 0 && !anyHas(s, 'royal_rally') && !anyHas(s, 'siege_presence')) return 0;
  let b = 0;
  if (has(p, 'extended_stride')) b += 1;
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
    gaps: has(p, 'long_gap_jump') ? 2 : has(p, 'gap_jumper') ? 1 : 0,
    walls: has(p, 'extended_phasing') ? 2 : has(p, 'phasing') ? 1 : 0,
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

function leapClear(s: GameState, from: Coord, off: Coord, rule: 'rect' | 'line', wallsAllowed: number) {
  const to = add(from, off);
  if (!isStandable(s.board, to)) return null;
  let walls = 0;
  let gap = false;
  if (rule === 'rect') {
    const x0 = Math.min(from.x, to.x);
    const x1 = Math.max(from.x, to.x);
    const y0 = Math.min(from.y, to.y);
    const y1 = Math.max(from.y, to.y);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        if (isWall(s.board, { x, y })) walls++;
        if (terrainAt(s.board, { x, y }) === 'gap') gap = true;
      }
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
export const canUseMoveAbilities = (s: GameState, p: Piece) => !silenced(p) && !suppressed(s, p);

function patternsFor(s: GameState, p: Piece): Pattern[] {
  const type = movementType(s, p);
  const pats = basePatterns(type);
  if (p.upgrades.length === 0) return p.type === 'decoy' ? pats.map((pt) => ({ ...pt, capture: false })) : pats;
  const abilities = canUseMoveAbilities(s, p);
  if (has(p, 'diagonal_step')) pats.push({ kind: 'slide', dirs: DIAG, max: 1 });
  if (has(p, 'orthogonal_step')) pats.push({ kind: 'slide', dirs: ORTHO, max: 1 });
  if (has(p, 'flanking_step') && enemiesOf(s, p).some((e) => adjacent(e, p))) pats.push({ kind: 'slide', dirs: DIAG, max: 1 });
  if (has(p, 'backward_advance') && type === 'pawn')
    pats.push({ kind: 'slide', dirs: [{ x: 0, y: -forward(p.side) }], max: 1, capture: false });
  if (has(p, 'short_hop')) pats.push({ kind: 'leap', offsets: ORTHO.map((d) => scale(d, 2)), rule: 'line' });
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
      const squares = walk(s, p.pos, dir, max, cross);
      for (const q of squares) out.push({ to: q.to, capture, quiet: true, leap: false, uses: pat.uses, crossedGap: q.crossedGap });
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
  const out: HeavyStep[] = [];
  const check = (to: Coord): Omit<HeavyStep, 'to'> | null => {
    const targets = new Set<string>();
    const walls: Coord[] = [];
    let shove: string | undefined;
    for (const c of footprint(p, to)) {
      const t = terrainAt(s.board, c);
      if (t === 'cracked' && has(p, 'crushing_entry')) walls.push(c);
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
  for (const d of ORTHO) {
    const to = add(p.pos, d);
    const r = check(to);
    if (r) out.push({ to, ...r });
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

/**
 * Does `p` directly threaten square `sq`? Exact fast path for pieces without
 * upgrades or statuses; everything else falls back to the full move list.
 */
export function attacksSquare(s: GameState, p: Piece, sq: Coord): boolean {
  const rangeAuras = anyHas(s, 'royal_rally') || anyHas(s, 'siege_presence');
  if (p.upgrades.length || p.statuses.length || sizeOf(p) > 1 || p.temp || rangeAuras)
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
      return false;
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
