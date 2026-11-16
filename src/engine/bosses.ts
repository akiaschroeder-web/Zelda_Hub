/**
 * Boss Piece abilities. Bosses are immune to forced movement, status effects,
 * conversion and copying (see isBoss checks elsewhere).
 */
import { inBounds, isHole, isStandable, isWall, terrainAt } from './board';
import {
  ALL_DIRS,
  DIAG,
  add,
  adjacent,
  allies,
  dealDamage,
  destroyCracked,
  distance,
  distanceTo,
  emptyZoneSquare,
  enemiesOf,
  getPiece,
  hasStatus,
  hasUsed,
  isBoss,
  isEmpty,
  log,
  markUsed,
  nameOf,
  pieceAt,
  scale,
  setTerrain,
  summon,
} from './core';
import { PIECE_STATS, footprint, sizeOf } from './pieces';
import { Coord, GameState, Move, Piece, Side, opponent, sameCoord } from './types';
import { darkWarps } from './zelda';

export const BOSS_COOLDOWNS = {
  royalCmdCd: 3,
  lightningCd: 4,
  quakeCd: 4,
  raiseCd: 3,
  spawnCd: 3,
  accelCd: 4,
  stealCd: 4,
} as const;

const ready = (p: Piece, cd: keyof typeof BOSS_COOLDOWNS) => (p.counters[cd] ?? 0) <= 0;

/** Haunting Presence: enemies next to a Phantom King can't use special abilities. */
export function haunted(s: GameState, p: Piece): boolean {
  return s.pieces.some((e) => e.side !== p.side && e.type === 'phantom_king' && adjacent(e, p));
}

/** Free activations that set up extra moves instead of costing the turn. */
export const FREE_BOSS_ACTIONS = new Set(['royalCommand', 'accelerate']);

export function bossMoves(s: GameState, p: Piece): Move[] {
  if (!isBoss(p) || hasStatus(p, 'stunned')) return [];
  const moves: Move[] = [];
  const base = { pieceId: p.id, from: p.pos };
  switch (p.type) {
    case 'empress':
      if (ready(p, 'royalCmdCd') && s.bonus.length === 0)
        allies(s, p)
          .filter((a) => !hasStatus(a, 'stunned') && !hasStatus(a, 'bound'))
          .forEach((a) => moves.push({ ...base, to: a.pos, action: 'royalCommand', allyId: a.id }));
      break;
    case 'stormbringer':
      if (ready(p, 'lightningCd'))
        enemiesOf(s, p)
          .filter((e) => distanceTo(e, p.pos) <= 3)
          .forEach((e) => moves.push({ ...base, to: e.pos, action: 'chainLightning', allyId: e.id }));
      break;
    case 'worldbreaker': {
      const own = footprint(p);
      const ring = new Map<string, Coord>();
      for (const c of own)
        for (const d of ALL_DIRS) {
          const q = add(c, d);
          if (!own.some((o) => sameCoord(o, q))) ring.set(`${q.x},${q.y}`, q);
        }
      for (const c of ring.values()) if (isEmpty(s, c)) moves.push({ ...base, to: c, action: 'rupture' });
      if (ready(p, 'quakeCd') && crackedNear(s, p, 2).length) moves.push({ ...base, to: p.pos, action: 'earthquake' });
      break;
    }
    case 'ganondorf':
      moves.push(...darkWarps(s, p));
      break;
    case 'chronarch':
      if (!hasUsed(p, 'rewind') && s.snapshot[opponent(p.side)] && s.bonus.length === 0)
        moves.push({ ...base, to: p.pos, action: 'rewind' });
      if (ready(p, 'accelCd') && s.bonus.length === 0 && !hasStatus(p, 'bound'))
        moves.push({ ...base, to: p.pos, action: 'accelerate' });
      break;
  }
  return moves;
}

function crackedNear(s: GameState, p: Piece, r: number): Coord[] {
  const out: Coord[] = [];
  for (let y = p.pos.y - r; y <= p.pos.y + sizeOf(p) - 1 + r; y++)
    for (let x = p.pos.x - r; x <= p.pos.x + sizeOf(p) - 1 + r; x++) {
      const c = { x, y };
      if (inBounds(s.board, c) && terrainAt(s.board, c) === 'cracked' && distanceTo(p, c) <= r) out.push(c);
    }
  return out;
}

/** Resolve a boss action. Returns false if it isn't one. */
export function resolveBoss(s: GameState, m: Move): boolean {
  const p = getPiece(s, m.pieceId);
  if (!p) return false;
  const target = getPiece(s, m.allyId);
  switch (m.action) {
    case 'royalCommand':
      p.counters.royalCmdCd = BOSS_COOLDOWNS.royalCmdCd;
      if (target) {
        s.bonus.unshift({ pieceId: target.id, filter: 'any', optional: true, source: 'royal_command' }, { filter: 'any', optional: false, source: 'turn' });
        log(s, `${nameOf(p)} commands the ${PIECE_STATS[target.type].name} to act.`);
      }
      return true;
    case 'chainLightning': {
      p.counters.lightningCd = BOSS_COOLDOWNS.lightningCd;
      if (!target) return true;
      log(s, 'Chain Lightning!');
      const struck: Piece[] = [target];
      dealDamage(s, target.id, 1, { kind: 'ability', sourceId: p.id });
      // Arc to up to two more enemies next to anything already struck.
      for (let i = 0; i < 2; i++) {
        const next = s.pieces
          .filter((e) => e.side !== p.side && !struck.some((x) => x.id === e.id))
          .filter((e) => struck.some((x) => distance(x.pos, e.pos) === 1))
          .sort((a, b) => PIECE_STATS[b.type].value - PIECE_STATS[a.type].value)[0];
        if (!next) break;
        struck.push(next);
        dealDamage(s, next.id, 1, { kind: 'ability', sourceId: p.id });
      }
      return true;
    }
    case 'darkWarp':
      p.pos = { ...m.to };
      log(s, 'Ganondorf vanishes in darkness and reappears!');
      return true;
    case 'rupture':
      setTerrain(s, m.to, 'gap');
      return true;
    case 'earthquake':
      p.counters.quakeCd = BOSS_COOLDOWNS.quakeCd;
      log(s, 'Earthquake!');
      for (const c of crackedNear(s, p, 2)) destroyCracked(s, c);
      return true;
    case 'accelerate':
      p.counters.accelCd = BOSS_COOLDOWNS.accelCd;
      s.bonus.unshift(
        { pieceId: p.id, filter: 'any', optional: false, source: 'accelerate' },
        { pieceId: p.id, filter: 'any', optional: true, source: 'accelerate' },
      );
      log(s, `${nameOf(p)} accelerates time.`);
      return true;
  }
  return false;
}

/** Phantom King movement: up to 3 squares any direction through walls and pieces, never across gaps. */
export function phantomSteps(s: GameState, p: Piece): { to: Coord; capture: boolean; quiet: boolean; leap: boolean }[] {
  const out: { to: Coord; capture: boolean; quiet: boolean; leap: boolean }[] = [];
  for (const d of ALL_DIRS) {
    for (let n = 1; n <= 3; n++) {
      const c = add(p.pos, scale(d, n));
      if (!inBounds(s.board, c) || isHole(s.board, c)) break;
      if (isWall(s.board, c)) continue; // passes through walls but can't stop on one
      const o = pieceAt(s, c);
      if (o && o.side === p.side) continue;
      out.push({ to: c, capture: true, quiet: true, leap: true });
    }
  }
  return out;
}

/**
 * Ethereal Escape: once per battle, when attacked, the Phantom King
 * teleports to an empty square within 3 (as far from the attacker as possible).
 */
export function etherealEscape(s: GameState, t: Piece, source?: Piece): boolean {
  if (t.type !== 'phantom_king' || hasUsed(t, 'escape')) return false;
  let best: Coord | undefined;
  let bestD = -1;
  for (let dy = -3; dy <= 3; dy++)
    for (let dx = -3; dx <= 3; dx++) {
      const c = { x: t.pos.x + dx, y: t.pos.y + dy };
      if (!isEmpty(s, c)) continue;
      const d = source ? distance(c, source.pos) : 0;
      if (d > bestD) {
        bestD = d;
        best = c;
      }
    }
  if (!best) return false;
  markUsed(t, 'escape');
  t.pos = best;
  log(s, 'The Phantom King dissolves and reappears elsewhere!');
  return true;
}

/** Start-of-turn boss effects: the Necromancer raises the fallen. */
export function bossTurnStart(s: GameState, side: Side) {
  for (const n of s.pieces.filter((p) => p.side === side && p.type === 'necromancer')) {
    if (!ready(n, 'raiseCd')) continue;
    const fallen = s.captured
      .filter((c) => c.side === side && !isBoss(c) && !c.temp && c.type !== 'king')
      .sort((a, b) => PIECE_STATS[b.type].value - PIECE_STATS[a.type].value)[0];
    const spot = fallen && emptyZoneSquare(s, side);
    if (!fallen || !spot) continue;
    n.counters.raiseCd = BOSS_COOLDOWNS.raiseCd;
    s.captured = s.captured.filter((c) => c !== fallen);
    s.pieces.push({ ...fallen, pos: { ...spot }, turnPos: { ...spot }, hp: fallen.maxHp, shields: [], statuses: [] });
    log(s, `${nameOf(n)} raises the fallen ${PIECE_STATS[fallen.type].name}!`);
  }
}

/** End-of-turn boss effects: the Watcher's gaze and the Hive Mother's spawn. */
export function bossTurnEnd(s: GameState, side: Side) {
  for (const w of s.pieces.filter((p) => p.side === side && p.type === 'watcher')) {
    const cells: Coord[] = [];
    for (const c of footprint(w))
      for (const d of ALL_DIRS) {
        let q = add(c, d);
        while (isStandable(s.board, q) && !footprint(w).some((f) => sameCoord(f, q))) {
          cells.push(q);
          if (pieceAt(s, q)) break;
          q = add(q, d);
        }
      }
    s.overwatch = s.overwatch.filter((o) => o.sentinelId !== `${w.id}:eye`);
    s.overwatch.push({ sentinelId: `${w.id}:eye`, side, cells });
  }
  for (const h of s.pieces.filter((p) => p.side === side && p.type === 'hive_mother')) {
    if (!ready(h, 'spawnCd')) continue;
    const own = footprint(h);
    const fwd = side === 'player' ? -1 : 1;
    const spots = own
      .flatMap((c) => ALL_DIRS.map((d) => add(c, d)))
      .filter((c) => !own.some((o) => sameCoord(o, c)) && isEmpty(s, c))
      .sort((a, b) => (a.y - b.y) * fwd * -1);
    if (!spots[0]) continue;
    h.counters.spawnCd = BOSS_COOLDOWNS.spawnCd;
    summon(s, h, 'pawn', spots[0], 'spawn');
    log(s, 'The Hive Mother spawns a Pawn.');
  }
}

/** Swarm Command: Pawns next to a friendly Hive Mother may advance an extra square. */
export function swarmCommanded(s: GameState, pawn: Piece): boolean {
  return s.pieces.some((h) => h.side === pawn.side && h.type === 'hive_mother' && adjacent(h, pawn));
}

/** Diagonal steps for the Watcher; everything else large moves orthogonally. */
export const heavyDirs = (p: Piece) =>
  p.type === 'watcher' ? DIAG : p.type === 'ganondorf' || p.type === 'ganon' || p.type === 'n_tropy' || p.type === 'bowser' || p.counters.mega ? ALL_DIRS : undefined;

export { opponent };
