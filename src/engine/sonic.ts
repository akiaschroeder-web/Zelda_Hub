/**
 * Sonic Content Pack abilities: actions (Tails' carry, Shadow's Chaos
 * Control and Chaos Spear, Silver's Psychokinesis, Buzz Bomber's shot,
 * Knuckles' Wall Breaker, the Death Egg Robot's missiles) and the hooks that
 * run around moves and turns. Damage-time effects (Rouge's Stealth,
 * Crabmeat's shell, Amy and Eggman surviving capture, the Death Egg's armor
 * and final explosion) live in core.ts; movement lives in movement.ts.
 */
import { inBounds, isBarrier, terrainAt } from './board';
import {
  ALL_DIRS,
  ORTHO,
  add,
  dealDamage,
  destroyCracked,
  distanceTo,
  getPiece,
  hasStatus,
  heal,
  immuneToForcedMove,
  isBoss,
  isEmpty,
  log,
  nameOf,
  pieceAt,
  pieceDistance,
  scale,
  setTerrain,
  sign,
  sub,
} from './core';
import { PIECE_STATS, ROBOTS, deathEggPhase, footprint, sizeOf } from './pieces';
import { Bonus, Coord, GameState, Move, Piece, Side, sameCoord } from './types';

export const SONIC_COOLDOWNS = {
  blurCd: 3,
  chaosControlCd: 4,
  chaosSpearCd: 3,
  energyShotCd: 2,
  missilesCd: 3,
  regenCd: 4,
} as const;
const ready = (p: Piece, cd: keyof typeof SONIC_COOLDOWNS) => (p.counters[cd] ?? 0) <= 0;

/** The first piece within `reach` along a line; walls and doors stop it. */
function firstInLine(s: GameState, from: Coord, d: Coord, reach: number): Piece | undefined {
  for (let k = 1; k <= reach; k++) {
    const c = add(from, scale(d, k));
    if (!inBounds(s.board, c) || isBarrier(s.board, c)) return undefined;
    const o = pieceAt(s, c);
    if (o) return o;
  }
  return undefined;
}

/** Diagonal flight destinations (Tails), including gaps. */
function flights(s: GameState, p: Piece): Coord[] {
  const out: Coord[] = [];
  for (const d of [
    { x: 1, y: 1 },
    { x: 1, y: -1 },
    { x: -1, y: 1 },
    { x: -1, y: -1 },
  ])
    for (let k = 1; k <= 3; k++) {
      const c = add(p.pos, scale(d, k));
      const t = terrainAt(s.board, c);
      if (inBounds(s.board, c) && (t === 'normal' || t === 'gap') && !pieceAt(s, c)) out.push(c);
    }
  return out;
}

export function sonicMoves(s: GameState, p: Piece): Move[] {
  const out: Move[] = [];
  const base = { pieceId: p.id, from: p.pos };
  const bound = hasStatus(p, 'bound');
  const enemies = s.pieces.filter((e) => e.side !== p.side);
  switch (p.type) {
    case 'knuckles':
      // Wall Breaker: smash an adjacent cracked wall instead of moving.
      for (const d of ALL_DIRS) {
        const c = add(p.pos, d);
        if (inBounds(s.board, c) && terrainAt(s.board, c) === 'cracked') out.push({ ...base, to: c, action: 'demolish' });
      }
      break;
    case 'tails':
      // Twin-Tail Flight with a passenger: the ally keeps its place beside Tails.
      if (bound) break;
      for (const ally of s.pieces.filter((a) => a.side === p.side && a.id !== p.id && sizeOf(a) === 1 && pieceDistance(a, p) === 1)) {
        if (hasStatus(ally, 'bound') || hasStatus(ally, 'stunned')) continue;
        const offset = sub(ally.pos, p.pos);
        for (const to of flights(s, p)) {
          const drop = add(to, offset);
          if (sameCoord(drop, p.pos) || isEmpty(s, drop)) out.push({ ...base, to, action: 'carry', allyId: ally.id, via: drop });
        }
      }
      break;
    case 'shadow':
      if (ready(p, 'chaosControlCd') && !bound)
        for (let dy = -4; dy <= 4; dy++)
          for (let dx = -4; dx <= 4; dx++) {
            const c = { x: p.pos.x + dx, y: p.pos.y + dy };
            if (Math.max(Math.abs(dx), Math.abs(dy)) >= 2 && isEmpty(s, c)) out.push({ ...base, to: c, action: 'chaosControl' });
          }
      if (ready(p, 'chaosSpearCd'))
        for (const d of ALL_DIRS) {
          const hit = firstInLine(s, p.pos, d, 3);
          if (hit && hit.side !== p.side) out.push({ ...base, to: hit.pos, action: 'chaosSpear', allyId: hit.id });
        }
      break;
    case 'silver':
      // Psychokinesis: an enemy 1×1 piece within 3 is lifted to an empty square next to it.
      for (const e of enemies.filter((e) => sizeOf(e) === 1 && !isBoss(e) && pieceDistance(e, p) <= 3 && !immuneToForcedMove(s, e, p, true)))
        for (const d of ALL_DIRS) {
          const c = add(e.pos, d);
          if (isEmpty(s, c)) out.push({ ...base, to: c, action: 'psychokinesis', allyId: e.id });
        }
      break;
    case 'buzz_bomber':
      if (ready(p, 'energyShotCd'))
        for (const d of ORTHO) {
          const hit = firstInLine(s, p.pos, d, 3);
          if (hit && hit.side !== p.side) out.push({ ...base, to: hit.pos, action: 'energyShot', allyId: hit.id });
        }
      break;
    case 'death_egg':
      if (deathEggPhase(p) >= 2 && ready(p, 'missilesCd') && enemies.some((e) => e.type !== 'king'))
        out.push({ ...base, to: p.pos, action: 'missiles' });
      break;
  }
  return out;
}

/** Resolve one of the actions above. Returns false if the action isn't one of these. */
export function resolveSonic(s: GameState, m: Move): boolean {
  const p = getPiece(s, m.pieceId);
  if (!p) return false;
  const target = getPiece(s, m.allyId);
  switch (m.action) {
    case 'carry':
      p.pos = { ...m.to };
      if (target && m.via) target.pos = { ...m.via };
      log(s, `${nameOf(p)} flies off carrying the ${target ? PIECE_STATS[target.type].name : 'ally'}.`);
      return true;
    case 'chaosControl':
      p.counters.chaosControlCd = SONIC_COOLDOWNS.chaosControlCd;
      p.pos = { ...m.to };
      log(s, 'Chaos Control!');
      return true;
    case 'chaosSpear':
      p.counters.chaosSpearCd = SONIC_COOLDOWNS.chaosSpearCd;
      if (target) dealDamage(s, target.id, 1, { sourceId: p.id, kind: 'ranged' });
      return true;
    case 'energyShot':
      p.counters.energyShotCd = SONIC_COOLDOWNS.energyShotCd;
      if (target) dealDamage(s, target.id, 1, { sourceId: p.id, kind: 'ranged' });
      return true;
    case 'psychokinesis':
      if (target) {
        target.pos = { ...m.to };
        log(s, `${nameOf(p)} lifts ${nameOf(target)} with psychokinesis.`);
      }
      return true;
    case 'missiles': {
      p.counters.missilesCd = SONIC_COOLDOWNS.missilesCd;
      log(s, 'Homing missiles launch!');
      const targets = s.pieces
        .filter((e) => e.side !== p.side && e.type !== 'king')
        .sort((a, b) => PIECE_STATS[b.type].value - PIECE_STATS[a.type].value)
        .slice(0, 3);
      for (const t of targets) dealDamage(s, t.id, 1, { sourceId: p.id, kind: 'ability' });
      return true;
    }
  }
  return false;
}

/** Before a move resolves: Sonic spins through cracked walls; the Death Egg flattens walls it moves into. */
export function sonicBeforeMove(s: GameState, m: Move) {
  const p = getPiece(s, m.pieceId);
  if (!p || m.action) return;
  if (p.type === 'sonic') {
    const d = sub(m.to, m.from);
    const n = Math.max(Math.abs(d.x), Math.abs(d.y));
    const dir = sign(d);
    for (let k = 1; k < n; k++) {
      const c = add(m.from, scale(dir, k));
      if (terrainAt(s.board, c) === 'cracked' && destroyCracked(s, c, p)) log(s, 'Sonic spin-dashes through the wall!');
    }
  }
  if (p.type === 'death_egg' && m.param === 'crush')
    for (const c of footprint(p, m.to)) if (terrainAt(s.board, c) === 'wall') setTerrain(s, c, 'normal');
}

/** After a move resolves (before the turn ends). */
export function sonicAfterMove(s: GameState, m: Move, from: Coord | undefined, entry?: Bonus) {
  const p = getPiece(s, m.pieceId);
  if (p && from && m.action !== 'pass') {
    const moved = !sameCoord(from, p.pos);
    // Blue Blur: every 3 turns Sonic may make a second, non-capturing move.
    if (p.type === 'sonic' && !m.action) {
      if (entry?.source === 'blue_blur') p.counters.blurCd = SONIC_COOLDOWNS.blurCd;
      else if (ready(p, 'blurCd')) s.bonus.unshift({ pieceId: p.id, filter: 'nonCapturing', optional: true, source: 'blue_blur' });
    }
    // Motobug Momentum: after a sideways capture it may roll one square further.
    if (p.type === 'motobug' && m.targets?.length && m.from.y === m.to.y && sameCoord(p.pos, m.to) && entry?.source !== 'momentum') {
      const next = add(p.pos, { x: Math.sign(m.to.x - m.from.x), y: 0 });
      if (isEmpty(s, next)) s.bonus.unshift({ pieceId: p.id, filter: 'nonCapturing', optional: true, source: 'momentum', to: next });
    }
    // Chaos remembers dealing damage this turn (no Fluid Regeneration then).
    if (p.type === 'chaos' && m.targets?.length) p.counters.dealtPly = s.ply;
    // Death Egg Robot: Mechanical Stomp, or the Phase 3 Explosive Impact.
    if (p.type === 'death_egg' && moved) {
      const reach = deathEggPhase(p) === 3 ? 2 : 1;
      for (const e of s.pieces.filter((e) => e.side !== p.side && pieceDistance(e, p) <= reach))
        dealDamage(s, e.id, 1, { sourceId: p.id, kind: 'ability' });
    }
    // Rouge: Treasure Hunter picks up keys within 1 square.
    const rouge = getPiece(s, m.pieceId);
    if (rouge?.type === 'rouge') {
      for (const t of (s.tiles ?? []).filter((t) => t.kind === 'key' && distanceTo(rouge, t.pos) <= 1)) {
        s.tiles = s.tiles.filter((o) => o !== t);
        s.keys = { ...s.keys, [rouge.side]: (s.keys?.[rouge.side] ?? 0) + 1 };
        log(s, 'Rouge snatches a Small Key.');
      }
    }
  }
  auras(s);
}

/** Start of `side`'s turn. */
export function sonicTurnStart(s: GameState) {
  auras(s);
}

/** End of `side`'s turn: Chaos's Fluid Regeneration. */
export function sonicTurnEnd(s: GameState, side: Side) {
  for (const c of s.pieces.filter((c) => c.side === side && c.type === 'chaos')) {
    if (c.hp >= c.maxHp || !ready(c, 'regenCd') || c.counters.dealtPly === s.ply) continue;
    c.counters.regenCd = SONIC_COOLDOWNS.regenCd;
    heal(s, c, 1);
    log(s, 'Chaos reforms itself.');
  }
}

/**
 * Standing effects: Amy's Encouragement (allies next to her shake off stuns and
 * paralysis) and Dr. Eggman's Mechanical Genius (+1 max HP for robots within 3, up to 3).
 */
function auras(s: GameState) {
  const amys = s.pieces.filter((a) => a.type === 'amy');
  const eggmen = s.pieces.filter((e) => e.type === 'eggman');
  if (!amys.length && !eggmen.length && !s.pieces.some((r) => r.counters.genius)) return;
  for (const p of s.pieces) {
    if (amys.some((a) => a.side === p.side && a.id !== p.id && pieceDistance(a, p) === 1) && p.statuses.some((st) => st.kind === 'stunned' || st.kind === 'bound'))
      p.statuses = p.statuses.filter((st) => st.kind !== 'stunned' && st.kind !== 'bound');
    if (!ROBOTS.has(p.type)) continue;
    const near = eggmen.some((e) => e.side === p.side && e.id !== p.id && pieceDistance(e, p) <= 3);
    if (near && !p.counters.genius && p.maxHp < 3) {
      p.counters.genius = 1;
      p.maxHp += 1;
      p.hp += 1;
    } else if (!near && p.counters.genius) {
      p.counters.genius = 0;
      p.maxHp -= 1;
      p.hp = Math.max(1, Math.min(p.hp, p.maxHp));
    }
  }
}

/** Dr. Eggman's Emergency Escape: the safest open square on his own half of the board. */
export function eggmanEscapeSquare(s: GameState, p: Piece): Coord | undefined {
  const half = (y: number) => (p.side === 'player' ? y >= s.board.height / 2 : y < s.board.height / 2);
  let best: Coord | undefined;
  let bestScore = -Infinity;
  for (let y = 0; y < s.board.height; y++)
    for (let x = 0; x < s.board.width; x++) {
      const c = { x, y };
      if (!half(y) || !isEmpty(s, c)) continue;
      const score = Math.min(...s.pieces.filter((e) => e.side !== p.side).map((e) => distanceTo(e, c)), 99);
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
  return best;
}

