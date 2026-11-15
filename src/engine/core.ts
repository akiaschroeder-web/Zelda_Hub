/**
 * Shared battle mechanics: damage, healing, shields, statuses, forced
 * movement, summons and terrain changes. Upgrade effects hook in here.
 *
 * These functions MUTATE the working state they are given. `applyMove`
 * clones the incoming state once, then resolves the move on the clone.
 */
import { inBounds, isHole, isStandable, terrainAt } from './board';
import { BOSS_TYPES, PIECE_STATS, deathEggPhase, footprint, sizeOf } from './pieces';
import { eggmanEscapeSquare } from './sonic';
import { UPGRADE_BY_ID } from './upgrades/catalog';
import { etherealEscape, haunted } from './bosses';
import {
  Coord,
  GameState,
  Piece,
  PieceType,
  Side,
  Status,
  StatusKind,
  Terrain,
  endOfTurn,
  forward,
  opponent,
  sameCoord,
  shieldTotal,
} from './types';

export const ORTHO: Coord[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];
export const DIAG: Coord[] = [
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
];
export const ALL_DIRS = [...ORTHO, ...DIAG];

export const add = (a: Coord, b: Coord): Coord => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Coord, b: Coord): Coord => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Coord, k: number): Coord => ({ x: a.x * k, y: a.y * k });
export const sign = (c: Coord): Coord => ({ x: Math.sign(c.x), y: Math.sign(c.y) });
/** King-style distance between two squares. */
export const distance = (a: Coord, b: Coord) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** Distance between two pieces' footprints. */
export function pieceDistance(a: Piece, b: Piece): number {
  if (sizeOf(a) === 1 && sizeOf(b) === 1) return distance(a.pos, b.pos);
  let best = Infinity;
  for (const ca of footprint(a)) for (const cb of footprint(b)) best = Math.min(best, distance(ca, cb));
  return best;
}
export const adjacent = (a: Piece, b: Piece) => a.id !== b.id && pieceDistance(a, b) === 1;
/** Distance from a piece's footprint to a square. */
export function distanceTo(p: Piece, c: Coord): number {
  if (sizeOf(p) === 1) return distance(p.pos, c);
  return Math.min(...footprint(p).map((f) => distance(f, c)));
}

/** Which upgrades exist anywhere in this battle (cached; used to skip work). */
const presenceCache = new WeakMap<Piece[], Set<string>>();
export function anyHas(s: GameState, id: string): boolean {
  let set = presenceCache.get(s.pieces);
  if (!set) {
    set = new Set(s.pieces.flatMap((p) => p.upgrades));
    presenceCache.set(s.pieces, set);
  }
  return set.has(id);
}

export const has = (p: Piece | undefined, id: string) => !!p && p.upgrades.includes(id);
export const hasUsed = (p: Piece, id: string) => p.used.includes(id);
/** Has the upgrade and hasn't spent it this battle. */
export const ready = (p: Piece | undefined, id: string) => !!p && has(p, id) && !hasUsed(p, id);
export const markUsed = (p: Piece, id: string) => {
  if (!p.used.includes(id)) p.used.push(id);
};

export const isBoss = (p: Piece) => BOSS_TYPES.has(p.type);

export const getPiece = (s: GameState, id: string | undefined) => (id ? s.pieces.find((p) => p.id === id) : undefined);
/**
 * Piece arrays of finished positions never change, so their square lookups
 * can be cached. Working copies mid-resolution are not frozen and always scan.
 */
const FROZEN = new WeakSet<Piece[]>();
const GRID = new WeakMap<Piece[], Map<number, Piece>>();
export function freeze(s: GameState) {
  FROZEN.add(s.pieces);
}

export function pieceAt(s: GameState, c: Coord): Piece | undefined {
  if (FROZEN.has(s.pieces)) {
    let grid = GRID.get(s.pieces);
    if (!grid) {
      grid = new Map();
      for (const p of s.pieces) {
        const n = PIECE_STATS[p.type].size;
        for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) grid.set((p.pos.y + dy) * 1024 + p.pos.x + dx, p);
      }
      GRID.set(s.pieces, grid);
    }
    return grid.get(c.y * 1024 + c.x);
  }
  for (const p of s.pieces) {
    const n = PIECE_STATS[p.type].size;
    if (c.x >= p.pos.x && c.x < p.pos.x + n && c.y >= p.pos.y && c.y < p.pos.y + n) return p;
  }
  return undefined;
}
export const allies = (s: GameState, p: Piece) => s.pieces.filter((o) => o.side === p.side && o.id !== p.id);
export const enemiesOf = (s: GameState, p: Piece) => s.pieces.filter((o) => o.side !== p.side);
export const kingOf = (s: GameState, side: Side) => s.pieces.find((p) => p.side === side && p.type === 'king');
export const isEmpty = (s: GameState, c: Coord) => isStandable(s.board, c) && !pieceAt(s, c);

export function log(s: GameState, msg: string) {
  s.log.push(msg);
}

export const nameOf = (p: Piece) => `${p.side === 'player' ? 'your' : 'enemy'} ${PIECE_STATS[p.type].name}`;
export const upgradeName = (id: string) => UPGRADE_BY_ID[id]?.name ?? id;

// ---------------------------------------------------------------------------
// Cloning
// ---------------------------------------------------------------------------

export function clonePiece(p: Piece): Piece {
  return {
    ...p,
    pos: { ...p.pos },
    shields: p.shields.map((sh) => ({ ...sh })),
    used: [...p.used],
    upgrades: [...p.upgrades],
    statuses: p.statuses.map((st) => ({ ...st })),
    counters: { ...p.counters },
    temp: p.temp ? { ...p.temp } : undefined,
  };
}

/** Copy everything a move might change. Terrain rows are copied on write. */
export function cloneState(s: GameState): GameState {
  return {
    ...s,
    board: { ...s.board },
    pieces: s.pieces.map(clonePiece),
    captured: [...s.captured],
    timed: s.timed.map((t) => ({ ...t })),
    destroyedWalls: [...s.destroyedWalls],
    bonus: s.bonus.map((b) => ({ ...b })),
    snapshot: { ...s.snapshot },
    zones: s.zones.map((z) => ({ ...z })),
    runFlags: [...s.runFlags],
    saved: [...s.saved],
    log: [],
    overwatch: s.overwatch.map((o) => ({ ...o })),
    reborn: s.reborn.map(clonePiece),
    engulfed: (s.engulfed ?? []).map((e) => ({ ...e, victim: clonePiece(e.victim), at: { ...e.at } })),
    tiles: (s.tiles ?? []).map((t) => ({ ...t, pos: { ...t.pos } })),
    keys: { ...(s.keys ?? { player: 0, enemy: 0 }) },
    rotations: s.rotations ?? 0,
    bones: (s.bones ?? []).map((b) => ({ ...b, piece: clonePiece(b.piece), at: { ...b.at } })),
  };
}

// ---------------------------------------------------------------------------
// Statuses
// ---------------------------------------------------------------------------

export const statusOf = (p: Piece, kind: StatusKind) => p.statuses.find((st) => st.kind === kind);
export const hasStatus = (p: Piece, kind: StatusKind) => p.statuses.some((st) => st.kind === kind);

/** Ganondorf (Gerudo King) shrugs off paralysis and anything that restricts movement. */
const GANON_IMMUNE: StatusKind[] = ['bound', 'stunned', 'slowed', 'crippled', 'confused'];

/** Negative effects Cleansing can't lift, which the Triforce of Courage still shrugs off. */
const COURAGE_ALSO: StatusKind[] = ['cursed', 'permMarked', 'prey'];

export function addStatus(p: Piece, st: Status) {
  if ((p.type === 'ganondorf' || p.type === 'ganon') && GANON_IMMUNE.includes(st.kind)) return;
  // Triforce of Courage: no negative status effect can take hold.
  if (p.upgrades.includes('triforce_courage') && (NEGATIVE.includes(st.kind) || COURAGE_ALSO.includes(st.kind))) return;
  // Blaze: Flame Immunity.
  if ((p.type === 'blaze' || p.type === 'burning_blaze') && st.kind === 'burned') return;
  const existing = statusOf(p, st.kind);
  if (existing && (st.kind === 'rangeBuff' || st.kind === 'damageBuff')) {
    existing.amount = (existing.amount ?? 0) + (st.amount ?? 0);
    existing.until = st.until === null || existing.until === null ? null : Math.max(existing.until, st.until);
    return;
  }
  if (existing) {
    existing.until = st.until === null || existing.until === null ? null : Math.max(existing.until, st.until);
    if (st.count) existing.count = (existing.count ?? 0) + st.count;
    if (st.amount) existing.amount = st.amount;
    return;
  }
  p.statuses.push(st);
}

export function removeStatus(p: Piece, kind: StatusKind) {
  p.statuses = p.statuses.filter((st) => st.kind !== kind);
}

/** Negative statuses Cleansing can remove. */
export const NEGATIVE: StatusKind[] = [
  'bound',
  'stunned',
  'silenced',
  'slowed',
  'disarmed',
  'pacified',
  'blinded',
  'crippled',
  'confused',
  'marked',
  'vulnerable',
  'weakened',
  'burned',
];

/** Can't attack this turn. */
export const cannotAttack = (p: Piece) => hasStatus(p, 'disarmed') || hasStatus(p, 'pacified') || p.type === 'decoy';

/** Abilities of `p` are switched off by Silence or a nearby Suppression (movement abilities only). */
export function silenced(p: Piece) {
  return hasStatus(p, 'silenced');
}
export function suppressed(s: GameState, p: Piece) {
  if (!anyHas(s, 'suppression')) return false;
  return s.pieces.some((e) => e.side !== p.side && has(e, 'suppression') && adjacent(e, p));
}

// ---------------------------------------------------------------------------
// Shields and healing
// ---------------------------------------------------------------------------

const SHIELD_CAP = 2;

/**
 * Give a shield. Temporary shields last until the end of the owner's next
 * turn (Lasting Guard makes them permanent); battle-start shields are lasting.
 */
export function addShield(s: GameState, p: Piece, strength = 1, lasting = false) {
  if (shieldTotal(p) >= SHIELD_CAP && strength === 1) return;
  const expires = lasting || has(p, 'lasting_guard') ? null : endOfTurn(s.ply, p.side);
  p.shields.push({ strength, expires });
}

export function heal(s: GameState, p: Piece, n: number): number {
  const before = p.hp;
  p.hp = Math.min(p.maxHp, p.hp + n);
  return p.hp - before;
}

/** Medic's Reward: the healer gains a shield after healing. */
export function healBy(s: GameState, healer: Piece, target: Piece, n: number) {
  const done = heal(s, target, n);
  if (done > 0 && has(healer, 'medics_reward')) addShield(s, healer);
  return done;
}

// ---------------------------------------------------------------------------
// Damage
// ---------------------------------------------------------------------------

export type DamageKind = 'attack' | 'ranged' | 'splash' | 'ability' | 'collision' | 'reflect' | 'fall';

export interface DamageCtx {
  sourceId?: string;
  kind: DamageKind;
  /** Single-target attacks can be intercepted by Guardians and similar. */
  allowIntercept?: boolean;
  /** Shield points to ignore (Precision). */
  pierce?: number;
  /** Kill outright regardless of HP or shields (Perfect Strike, Absolute Capture). */
  lethal?: boolean;
  /** Light Arrows: ignore shields, damage reduction, armor and temporary invulnerability. */
  pure?: boolean;
  /** Lens of Truth: ignore evasion (Zora, Phantom King). */
  trueSight?: boolean;
  /** Absolute Capture also ignores shields; Perfect Strike does too here (it "defeats" the target). */
}

export type DamageOutcome =
  | { kind: 'immune' }
  | { kind: 'intercepted'; by: string; outcome: DamageOutcome }
  | { kind: 'survived'; dealt: number }
  | { kind: 'captured'; dealt: number; excess: number };

const direct = (k: DamageKind) => k === 'attack' || k === 'ranged';

function protectedByZone(s: GameState, p: Piece) {
  return s.zones.some((z) => z.side === p.side && footprint(p).some((c) => z.cells.some((zc) => sameCoord(zc, c))));
}

function findInterceptor(s: GameState, target: Piece, amount: number, source?: Piece): Piece | undefined {
  const lethal = amount >= target.hp + shieldTotal(target);
  // Haunting Presence also switches off interception for pieces next to a Phantom King.
  const friends = allies(s, target).filter((a) => a.id !== source?.id && !hasStatus(a, 'stunned') && !haunted(s, a));
  if (target.type === 'king') {
    const reach = (a: Piece) => (has(a, 'crowns_reach') ? 2 : 1);
    return (
      (lethal ? friends.find((a) => ready(a, 'royal_sacrifice')) : undefined) ??
      friends.find((a) => ready(a, 'royal_guard') && pieceDistance(a, target) <= reach(a)) ??
      friends.find((a) => ready(a, 'royal_protection') && pieceDistance(a, target) <= reach(a))
    );
  }
  return (
    friends.find((a) => a.type === 'guardian' && !hasUsed(a, 'intercept') && adjacent(a, target)) ??
    friends.find((a) => a.type === 'warden' && !hasUsed(a, 'warden_intercept') && adjacent(a, target)) ??
    (lethal ? friends.find((a) => ready(a, 'sacrificial_guard') && adjacent(a, target)) : undefined) ??
    friends.find(
      (a) =>
        a.temp && !hasUsed(a, 'intercept') && has(getPiece(s, a.temp.summonerId), 'summoned_guard') && adjacent(a, target),
    )
  );
}

/** Which once-per-battle id an interceptor spends. */
function interceptId(a: Piece, target: Piece): string {
  if (target.type === 'king') {
    if (ready(a, 'royal_sacrifice')) return 'royal_sacrifice';
    if (ready(a, 'royal_guard')) return 'royal_guard';
    return 'royal_protection';
  }
  if (a.type === 'guardian' && !hasUsed(a, 'intercept')) return 'intercept';
  if (a.type === 'warden' && !hasUsed(a, 'warden_intercept')) return 'warden_intercept';
  if (ready(a, 'sacrificial_guard')) return 'sacrificial_guard';
  return 'intercept';
}

/**
 * Deal damage to a piece, applying immunity, interception, reductions,
 * shields, death prevention, capture and every on-hit trigger.
 */
export function dealDamage(s: GameState, targetId: string, amount: number, ctx: DamageCtx): DamageOutcome {
  const target = getPiece(s, targetId);
  if (!target) return { kind: 'immune' };
  const source = getPiece(s, ctx.sourceId);

  // Kings are only ever hurt by direct attacks, so check stays the one thing to watch.
  if (target.type === 'king' && !direct(ctx.kind)) return { kind: 'immune' };
  if (!ctx.pure && (hasStatus(target, 'immune') || protectedByZone(s, target))) {
    log(s, `${nameOf(target)} is protected.`);
    return { kind: 'immune' };
  }

  // Phantom King: Ethereal Escape dodges the first attack by teleporting away.
  if (direct(ctx.kind) && !ctx.lethal && !ctx.trueSight && etherealEscape(s, target, source)) return { kind: 'survived', dealt: 0 };

  // Death Egg Robot (Phase 1, Heavy Armor): ranged attacks can't hurt it.
  if (ctx.kind === 'ranged' && deathEggPhase(target) === 1) {
    log(s, 'The Death Egg Robot shrugs off the shot.');
    return { kind: 'immune' };
  }
  // Super Silver: Psychic Defense negates an attack on himself or an adjacent ally (every 3 turns).
  if (direct(ctx.kind) && amount > 0 && !ctx.pure) {
    const psy = s.pieces.find((o) => o.side === target.side && o.type === 'super_silver' && (o.counters.psyDefCd ?? 0) <= 0 && (o.id === target.id || adjacent(o, target)));
    if (psy) {
      psy.counters.psyDefCd = 3;
      log(s, "Super Silver's psychic barrier stops the attack!");
      return { kind: 'survived', dealt: 0 };
    }
  }
  // Rouge: Stealth — the first attack on her misses, as long as she hasn't captured anything.
  if (direct(ctx.kind) && target.type === 'rouge' && !hasUsed(target, 'stealth') && !target.counters.captures && !ctx.trueSight && amount > 0) {
    markUsed(target, 'stealth');
    log(s, 'Rouge slips out of the way!');
    return { kind: 'survived', dealt: 0 };
  }

  // Mirror Shield: once per battle, a ranged or magical attack is reflected back at its source.
  if ((ctx.kind === 'ranged' || ctx.kind === 'ability') && source && source.side !== target.side && ready(target, 'mirror_shield')) {
    markUsed(target, 'mirror_shield');
    log(s, `${nameOf(target)}'s Mirror Shield reflects the attack!`);
    dealDamage(s, source.id, amount, { kind: 'reflect' });
    return { kind: 'survived', dealt: 0 };
  }

  // Invincibility Monitor: the first damage of any kind is ignored.
  if (amount > 0 && ctx.kind !== 'fall' && !ctx.pure && ready(target, 'invincibility')) {
    markUsed(target, 'invincibility');
    log(s, `${nameOf(target)} is invincible!`);
    return { kind: 'survived', dealt: 0 };
  }

  // Hylian Shield: the first attack each battle is negated outright.
  if (direct(ctx.kind) && ready(target, 'hylian_shield') && amount > 0) {
    markUsed(target, 'hylian_shield');
    log(s, `${nameOf(target)}'s Hylian Shield blocks the blow.`);
    return { kind: 'survived', dealt: 0 };
  }

  // Zora: Graceful Evasion slips to an empty adjacent square the first time it would take damage.
  if (target.type === 'zora' && !target.counters.evadeSpent && amount > 0 && ctx.kind !== 'fall' && !ctx.trueSight) {
    const enemies = s.pieces.filter((e) => e.side !== target.side);
    const score = (c: Coord) => (source ? distanceTo(source, c) * 10 : 0) - enemies.filter((e) => distanceTo(e, c) <= 1).length;
    const spot = ALL_DIRS.map((d) => add(target.pos, d))
      .filter((c) => isEmpty(s, c))
      .sort((a, b) => score(b) - score(a))[0];
    if (spot) {
      target.counters.evadeSpent = 1;
      target.pos = { ...spot };
      log(s, `${nameOf(target)} gracefully evades!`);
      return { kind: 'survived', dealt: 0 };
    }
  }

  // Empress: Imperial Guard — the first attack on her is absorbed by an adjacent ally.
  if (direct(ctx.kind) && target.type === 'empress' && !hasUsed(target, 'imperial_guard')) {
    const guard = allies(s, target).find((a) => a.type !== 'king' && adjacent(a, target));
    if (guard) {
      markUsed(target, 'imperial_guard');
      log(s, `${nameOf(guard)} shields the Empress.`);
      const outcome = dealDamage(s, guard.id, amount, { ...ctx, allowIntercept: false });
      return { kind: 'intercepted', by: guard.id, outcome };
    }
  }

  if (ctx.allowIntercept && direct(ctx.kind) && !ctx.lethal) {
    const guard = findInterceptor(s, target, amount, source);
    if (guard) {
      markUsed(guard, interceptId(guard, target));
      log(s, `${nameOf(guard)} intercepts the hit.`);
      // Royal Protection takes exactly one damage.
      const taken = interceptId(guard, target) === 'royal_protection' ? 1 : amount;
      const outcome = dealDamage(s, guard.id, taken, { ...ctx, allowIntercept: false });
      return { kind: 'intercepted', by: guard.id, outcome };
    }
  }

  // Oracle's Prophecy negates the next direct attack.
  if (direct(ctx.kind) && !ctx.pure && hasStatus(target, 'prophecy')) {
    removeStatus(target, 'prophecy');
    log(s, `The prophecy holds: ${nameOf(target)} is untouched.`);
    return { kind: 'survived', dealt: 0 };
  }

  // Darknut: Armored Shell — the first attack only strips its armor.
  if (direct(ctx.kind) && !ctx.pure && target.type === 'darknut' && !target.counters.armorBroken && amount > 0) {
    target.counters.armorBroken = 1;
    target.hitsTaken += 1;
    if (source) target.lastAttackerId = source.id;
    log(s, `${nameOf(target)}'s armor shatters!`);
    return { kind: 'survived', dealt: 0 };
  }

  const hpBefore = target.hp;
  const shieldBefore = shieldTotal(target);

  if (ctx.lethal) {
    log(s, `${nameOf(target)} is struck down outright.`);
    capture(s, target, ctx);
    return { kind: 'captured', dealt: hpBefore, excess: 0 };
  }

  let dmg = amount;
  if (!ctx.pure) {
  // Warden's Defensive Aura: adjacent allies take one less from hits of 2 or more.
  if (dmg >= 2 && direct(ctx.kind) && allies(s, target).some((a) => a.type === 'warden' && adjacent(a, target))) dmg -= 1;
  // Reductions.
  // Crabmeat: Armored Carapace stops the first point of ranged damage.
  if (dmg > 0 && ctx.kind === 'ranged' && target.type === 'crabmeat' && !hasUsed(target, 'carapace')) {
    markUsed(target, 'carapace');
    dmg -= 1;
  }
  if (dmg > 0 && ready(target, 'iron_shell')) {
    markUsed(target, 'iron_shell');
    dmg -= 1;
  }
  if (dmg > 0 && direct(ctx.kind) && has(target, 'stone_skin') && (target.counters.stoneSkin ?? 0) < 2) {
    target.counters.stoneSkin = (target.counters.stoneSkin ?? 0) + 1;
    dmg -= 1;
  }
  if (dmg >= 2 && has(target, 'shared_armor')) {
    const partner = allies(s, target).find((a) => adjacent(a, target) && a.type !== 'king' && a.hp > 1);
    if (partner) {
      const half = Math.floor(dmg / 2);
      dmg -= half;
      log(s, `Shared Armor splits the blow.`);
      dealDamage(s, partner.id, half, { kind: 'ability' });
    }
  }

  }

  // Shields absorb first (Precision ignores some shield points; Light Arrows ignore them all).
  let pierce = ctx.pure ? Infinity : (ctx.pierce ?? 0);
  target.shields.sort((a, b) => (a.expires ?? Infinity) - (b.expires ?? Infinity));
  for (const sh of target.shields) {
    if (dmg <= 0) break;
    const bypass = Math.min(pierce, sh.strength);
    pierce -= bypass;
    const block = Math.min(sh.strength - bypass, dmg);
    sh.strength -= block + bypass;
    dmg -= block;
  }
  target.shields = target.shields.filter((sh) => sh.strength > 0);

  target.hp -= dmg;
  if (direct(ctx.kind)) {
    target.hitsTaken += 1;
    if (source) target.lastAttackerId = source.id;
  }

  if (target.hp <= 0) {
    const excess = -target.hp;
    if (preventDeath(s, target)) return { kind: 'survived', dealt: hpBefore - target.hp };
    capture(s, target, ctx);
    return { kind: 'captured', dealt: hpBefore, excess };
  }

  if (target.hp < hpBefore || shieldTotal(target) < shieldBefore) onSurvivedHit(s, target, hpBefore, ctx, source);
  escapeAfterHit(s, target, hpBefore, ctx, source);
  return { kind: 'survived', dealt: hpBefore - target.hp };
}

/** Critical Survival, Royal Resilience, Royal Resurrection. Returns true if the piece lives. */
/**
 * Deku Scrub Burrow (once per battle, after surviving an attack) and Lizalfos
 * Acrobatic Retreat (every 3 turns, after being hurt): hop to the safest open square.
 */
function escapeAfterHit(s: GameState, t: Piece, hpBefore: number, ctx: DamageCtx, source?: Piece) {
  // Metal Sonic: Copycat — for 2 turns he also moves like the enemy that hurt him.
  if (t.type === 'metal_sonic' && source && source.side !== t.side && t.hp < hpBefore && getPiece(s, t.id)) {
    removeStatus(t, 'copying');
    addStatus(t, { kind: 'copying', until: endOfTurn(s.ply, t.side, 2), source: source.type });
  }
  // Flame Shield: once per battle, an adjacent enemy that hurts this piece takes 1 back.
  if (source && source.side !== t.side && ready(t, 'flame_shield') && t.hp < hpBefore && adjacent(source, t) && getPiece(s, source.id)) {
    markUsed(t, 'flame_shield');
    log(s, `${nameOf(t)}'s Flame Shield scorches the attacker.`);
    dealDamage(s, source.id, 1, { kind: 'splash' });
  }
  let spots: Coord[] = [];
  let ring = false;
  if (t.type === 'deku_scrub' && direct(ctx.kind) && !hasUsed(t, 'burrow')) spots = ALL_DIRS.map((d) => add(t.pos, d));
  else if (t.type === 'lizalfos' && t.hp < hpBefore && (t.counters.acroCd ?? 0) <= 0) spots = DIAG.map((d) => add(t.pos, scale(d, 2)));
  else if (has(t, 'ring_protection') && t.hp < hpBefore && (t.counters.ringCd ?? 0) <= 0 && sizeOf(t) === 1) {
    spots = ALL_DIRS.map((d) => add(t.pos, d));
    ring = true;
  }
  const enemies = s.pieces.filter((e) => e.side !== t.side);
  const score = (c: Coord) => (source ? distanceTo(source, c) * 10 : 0) - enemies.filter((e) => distanceTo(e, c) <= 1).length;
  const spot = spots.filter((c) => isEmpty(s, c)).sort((a, b) => score(b) - score(a))[0];
  if (!spot) return;
  if (ring) t.counters.ringCd = 3;
  else if (t.type === 'deku_scrub') markUsed(t, 'burrow');
  else t.counters.acroCd = 3;
  t.pos = { ...spot };
  log(s, ring ? `${nameOf(t)} scrambles clear!` : t.type === 'deku_scrub' ? `${nameOf(t)} burrows away!` : `${nameOf(t)} flips away acrobatically!`);
}

function preventDeath(s: GameState, p: Piece): boolean {
  // Hyper Sonic: Last Stand.
  if (p.type === 'hyper_sonic' && !hasUsed(p, 'last_stand')) {
    markUsed(p, 'last_stand');
    p.hp = 1;
    log(s, 'Hyper Sonic refuses to fall!');
    return true;
  }
  // Amy Rose: Unshakable Determination.
  if (p.type === 'amy' && !hasUsed(p, 'determination')) {
    markUsed(p, 'determination');
    p.hp = 1;
    log(s, "Amy won't give up — she survives with 1 HP!");
    return true;
  }
  // Dr. Eggman: Emergency Escape to somewhere safer on his own side.
  if (p.type === 'eggman' && !hasUsed(p, 'escape')) {
    const spot = eggmanEscapeSquare(s, p);
    if (spot) {
      markUsed(p, 'escape');
      p.hp = 1;
      p.pos = spot;
      log(s, 'Dr. Eggman escapes in his Egg Mobile!');
      return true;
    }
  }
  if (ready(p, 'bottled_fairy')) {
    markUsed(p, 'bottled_fairy');
    p.hp = 1;
    log(s, `A fairy flies out of the bottle — ${nameOf(p)} survives at 1 HP!`);
    return true;
  }
  if (ready(p, 'critical_survival')) {
    markUsed(p, 'critical_survival');
    p.hp = 1;
    log(s, `${nameOf(p)} survives at 1 HP (Critical Survival).`);
    return true;
  }
  if (p.type !== 'king') return false;
  const own = s.pieces.filter((o) => o.side === p.side);
  if (own.some((o) => has(o, 'royal_resilience')) && !s.runFlags.includes('royal_resilience')) {
    s.runFlags.push('royal_resilience');
    p.hp = 1;
    log(s, 'The King survives at 1 HP (Royal Resilience).');
    return true;
  }
  if (own.some((o) => has(o, 'royal_resurrection')) && !s.runFlags.includes('royal_resurrection')) {
    s.runFlags.push('royal_resurrection');
    p.hp = p.maxHp;
    const home = isEmpty(s, p.startPos) ? p.startPos : nearestEmpty(s, p.startPos);
    if (home) p.pos = { ...home };
    log(s, 'The King is resurrected on its starting square (Royal Resurrection).');
    return true;
  }
  return false;
}

function onSurvivedHit(s: GameState, t: Piece, hpBefore: number, ctx: DamageCtx, source?: Piece) {
  if (t.hp === 1 && hpBefore > 1 && has(t, 'emergency_barrier')) addShield(s, t);
  if (!direct(ctx.kind)) return;
  if (ready(t, 'second_wind') && t.hp < t.maxHp) {
    markUsed(t, 'second_wind');
    heal(s, t, 1);
  }
  if (has(t, 'protected_retreat')) addShield(s, t);
  const medic = allies(s, t).find(
    (a) => ready(a, 'emergency_treatment') && pieceDistance(a, t) <= 1 + (has(a, 'extended_healing') ? 1 : 0),
  );
  if (medic && t.hp < t.maxHp && (t.type !== 'king' || has(medic, 'royal_physician'))) {
    markUsed(medic, 'emergency_treatment');
    healBy(s, medic, t, 1);
  }
  if (source && has(t, 'reflective_armor') && pieceDistance(t, source) <= 1) {
    log(s, `Reflective Armor strikes back.`);
    dealDamage(s, source.id, 1, { kind: 'reflect' });
  }
  if (ready(t, 'massive_retaliation')) {
    markUsed(t, 'massive_retaliation');
    for (const e of enemiesOf(s, t).filter((e) => adjacent(e, t))) dealDamage(s, e.id, 1, { kind: 'splash' });
  }
}

/** A side's deployment squares (falling back to its two back rows). */
export function zoneFor(s: GameState, side: Side): Coord[] {
  const zone = side === 'player' ? s.board.deployZone : s.board.enemyZone;
  if (zone && zone.length) return zone;
  const rows = side === 'player' ? [s.board.height - 1, s.board.height - 2] : [0, 1];
  const out: Coord[] = [];
  for (const y of rows) for (let x = 0; x < s.board.width; x++) out.push({ x, y });
  return out;
}

/** Empty deployment square nearest the side's back edge. */
export function emptyZoneSquare(s: GameState, side: Side): Coord | undefined {
  return zoneFor(s, side)
    .filter((c) => isEmpty(s, c))
    .sort((a, b) => (side === 'player' ? b.y - a.y : a.y - b.y))[0];
}

/** Remove a piece from the battlefield and fire capture triggers. */
export function capture(s: GameState, p: Piece, ctx: { sourceId?: string; kind: DamageKind }) {
  if (!s.pieces.includes(p)) return;
  s.pieces = s.pieces.filter((o) => o !== p);
  // Like Like: Engulf — a piece it captures is swallowed rather than removed.
  const holder = getPiece(s, ctx.sourceId);
  if (
    holder?.type === 'like_like' &&
    ctx.kind === 'attack' &&
    holder.side !== p.side &&
    p.type !== 'king' &&
    !isBoss(p) &&
    sizeOf(p) === 1 &&
    !p.temp &&
    !(p.type === 'phoenix' && !hasUsed(p, 'rebirth')) &&
    !(s.engulfed ?? []).some((e) => e.holderId === holder.id)
  ) {
    s.engulfed = [...(s.engulfed ?? []), { victim: p, holderId: holder.id, release: endOfTurn(s.ply, holder.side, 2), at: { ...p.pos } }];
    log(s, `${nameOf(holder)} engulfs ${nameOf(p)}!`);
    return;
  }
  // Stalfos: Reassembly — the first time it falls, it collapses into bones instead.
  if (p.type === 'stalfos' && !hasUsed(p, 'reassembly') && ctx.kind !== 'fall' && !p.temp) {
    markUsed(p, 'reassembly');
    p.statuses = [];
    p.shields = [];
    s.bones = [...(s.bones ?? []), { piece: p, at: { ...p.pos }, ready: endOfTurn(s.ply, p.side, 2) }];
    log(s, `${nameOf(p)} collapses into a pile of bones…`);
    return;
  }
  // Death Egg Robot: Final Explosion — 1 damage to everything within 2 of its footprint.
  if (p.type === 'death_egg') {
    log(s, 'The Death Egg Robot explodes!');
    for (const o of s.pieces.filter((o) => pieceDistance(o, p) <= 2)) dealDamage(s, o.id, 1, { kind: 'splash' });
  }
  // A fallen Like Like lets its victim go (placed back once the move finishes).
  if (p.type === 'like_like') for (const e of s.engulfed ?? []) if (e.holderId === p.id) e.freed = true;
  // Phoenix: the first time it would be captured, it is reborn next turn instead.
  if (p.type === 'phoenix' && !hasUsed(p, 'rebirth') && ctx.kind !== 'ability') {
    markUsed(p, 'rebirth');
    p.hp = p.maxHp;
    p.shields = [];
    p.statuses = [];
    s.reborn.push(p);
    log(s, `${nameOf(p)} bursts into flame — it will be reborn.`);
    return;
  }
  s.captured.push(p);
  if ((has(p, 'second_life') || has(p, 'extra_life')) && !p.temp) s.saved.push(p.id);
  // Necromancer: Death Harvest — heals whenever an enemy is captured.
  for (const n of s.pieces.filter((o) => o.side !== p.side && o.type === 'necromancer')) heal(s, n, 1);
  // Bomber Volatile: when captured (not detonated), 1 damage to every adjacent piece.
  if (p.type === 'bomber' && ctx.kind !== 'ability') {
    log(s, 'The Bomber explodes as it falls!');
    for (const o of s.pieces.filter((o) => pieceDistance(o, p) === 1)) dealDamage(s, o.id, 1, { kind: 'splash' });
  }
  log(s, `${nameOf(p)} is ${ctx.kind === 'fall' ? 'lost to the void' : 'captured'}.`);

  if (p.type === 'decoy' && has(getPiece(s, p.temp?.summonerId), 'explosive_decoy')) {
    for (const e of s.pieces.filter((e) => e.side !== p.side && pieceDistance(e, p) === 1))
      dealDamage(s, e.id, 1, { kind: 'splash' });
  }
  for (const a of s.pieces.filter((a) => a.side === p.side && has(a, 'defiant_armor') && pieceDistance(a, p) === 1)) {
    if (shieldTotal(a) < 2) addShield(s, a, 1, true);
  }
  const king = kingOf(s, p.side);
  if (king && pieceDistance(king, p) === 1) {
    for (const a of s.pieces.filter((a) => a.side === p.side && has(a, 'royal_vengeance')))
      addStatus(a, { kind: 'damageBuff', amount: 1, until: null });
  }
  if (p.temp) {
    const summoner = getPiece(s, p.temp.summonerId);
    if (summoner && ready(summoner, 'echo_summon')) {
      markUsed(summoner, 'echo_summon');
      const spot = summonSquares(s, summoner)[0];
      if (spot) summon(s, summoner, p.type, spot, p.temp.kind);
    }
  }
  // Last Royal Stand: only the King and this piece remain.
  for (const side of ['player', 'enemy'] as Side[]) {
    const own = s.pieces.filter((o) => o.side === side);
    if (own.length === 2 && own.some((o) => o.type === 'king')) {
      const last = own.find((o) => o.type !== 'king')!;
      if (ready(last, 'last_royal_stand')) {
        markUsed(last, 'last_royal_stand');
        addStatus(last, { kind: 'damageBuff', amount: 2, until: null, source: 'last_royal_stand' });
        addShield(s, last, 1, true);
        log(s, 'Last Royal Stand!');
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Forced movement
// ---------------------------------------------------------------------------

/** `peek` checks without spending a once-per-battle Brace (used when listing moves). */
export function immuneToForcedMove(s: GameState, p: Piece, source?: Piece, peek = false): boolean {
  if (p.type === 'king' || isBoss(p) || p.type === 'warden') return true;
  if (hasStatus(p, 'rooted') || has(p, 'steadfast') || has(p, 'iron_boots') || has(p, 'triforce_courage')) return true;
  // Super Shadow's Chaos Protection and the Master Emerald.
  if (p.type === 'super_shadow' || has(p, 'master_emerald')) return true;
  if (has(p, 'heavy_stabilizer') && source && sizeOf(source) < sizeOf(p)) return true;
  if (
    allies(s, p).some(
      (a) => (a.type === 'anchor' || has(a, 'anchor_formation') || has(a, 'defensive_formation')) && adjacent(a, p),
    )
  )
    return true;
  if (ready(p, 'brace')) {
    if (peek) return false;
    markUsed(p, 'brace');
    log(s, `${nameOf(p)} braces against the push.`);
    return true;
  }
  return false;
}

/**
 * Push a piece `dist` squares in direction `dir`. Pieces pushed into a gap or
 * off the board fall and are lost (Void Anchor / Void Immunity prevent it).
 */
export function push(s: GameState, targetId: string, dir: Coord, dist: number, sourceId?: string, counter = true): boolean {
  const t = getPiece(s, targetId);
  const source = getPiece(s, sourceId);
  if (!t || immuneToForcedMove(s, t, source)) return false;
  let moved = false;
  for (let i = 0; i < dist; i++) {
    const next = add(t.pos, dir);
    const cells = footprint(t, next);
    const fall = cells.some((c) => !inBounds(s.board, c) || isHole(s.board, c));
    if (fall) {
      if (has(t, 'void_anchor')) break;
      if (ready(t, 'void_immunity')) {
        markUsed(t, 'void_immunity');
        log(s, `${nameOf(t)} catches the edge (Void Immunity).`);
        break;
      }
      capture(s, t, { sourceId, kind: 'fall' });
      return true;
    }
    const wall = cells.some((c) => terrainAt(s.board, c) === 'wall' || terrainAt(s.board, c) === 'cracked');
    if (wall) {
      if (has(source, 'wall_slam') && !has(t, 'shock_absorber')) dealDamage(s, t.id, 1, { kind: 'collision', sourceId });
      break;
    }
    const blocker = cells.map((c) => pieceAt(s, c)).find((o) => o && o.id !== t.id);
    if (blocker) {
      if (has(source, 'collision_damage')) {
        if (!has(t, 'shock_absorber')) dealDamage(s, t.id, 1, { kind: 'collision', sourceId });
        if (!has(blocker, 'shock_absorber')) dealDamage(s, blocker.id, 1, { kind: 'collision', sourceId });
      }
      break;
    }
    t.pos = next;
    moved = true;
  }
  if (counter && source && s.pieces.includes(t) && has(t, 'counterpush') && pieceDistance(t, source) <= 2) {
    // Shove the source back the way the push came from.
    push(s, source.id, { x: -dir.x, y: -dir.y }, 1, t.id, false);
  }
  return moved;
}

/** Push distance for pushes made by `p` (Long Knockback adds one). */
export const pushDistance = (p: Piece) => 1 + (has(p, 'long_knockback') ? 1 : 0);

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------

/** Reality Anchor stops all terrain changes within three squares of it. */
export function terrainLocked(s: GameState, c: Coord) {
  return s.pieces.some((p) => has(p, 'reality_anchor') && distanceTo(p, c) <= 3);
}

export function setTerrain(s: GameState, c: Coord, t: Terrain): boolean {
  if (terrainLocked(s, c)) {
    log(s, 'Reality Anchor holds the ground in place.');
    return false;
  }
  s.board = {
    ...s.board,
    terrain: s.board.terrain.map((row, y) => (y === c.y ? row.map((v, x) => (x === c.x ? t : v)) : row)),
  };
  return true;
}

export function destroyCracked(s: GameState, c: Coord, by?: Piece): boolean {
  if (terrainAt(s.board, c) !== 'cracked') return false;
  if (!setTerrain(s, c, 'normal')) return false;
  s.destroyedWalls.push({ ...c });
  if (by && has(by, 'siege_charge')) addStatus(by, { kind: 'damageBuff', amount: 1, until: null, source: 'siege_charge' });
  return true;
}

/** Make a gap walkable for a while (bridge) or put up a temporary wall. */
export function addTimedTerrain(s: GameState, c: Coord, kind: 'bridge' | 'barricade', rounds: number, side: Side, by?: Piece) {
  const revertTo = terrainAt(s.board, c);
  const extra = kind === 'bridge' && has(by, 'platform_extension') ? 2 : 0;
  if (!setTerrain(s, c, kind === 'bridge' ? 'normal' : 'wall')) return false;
  s.timed.push({ pos: { ...c }, revertTo, expires: s.ply + 2 * (rounds + extra) - 1, kind, side });
  return true;
}

export function nearestEmpty(s: GameState, c: Coord, maxDist = 3): Coord | undefined {
  for (let d = 1; d <= maxDist; d++)
    for (let dy = -d; dy <= d; dy++)
      for (let dx = -d; dx <= d; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
        const q = { x: c.x + dx, y: c.y + dy };
        if (isEmpty(s, q)) return q;
      }
  return undefined;
}

/** A bridge disappears: anyone on it is rescued, steps off, or falls. */
export function collapseBridge(s: GameState, c: Coord) {
  const idx = s.timed.findIndex((t) => t.kind === 'bridge' && sameCoord(t.pos, c));
  if (idx < 0) return;
  const t = s.timed[idx];
  s.timed.splice(idx, 1);
  s.board = {
    ...s.board,
    terrain: s.board.terrain.map((row, y) => (y === c.y ? row.map((v, x) => (x === c.x ? t.revertTo : v)) : row)),
  };
  const victim = pieceAt(s, c);
  if (!victim) return;
  const rescuer = s.pieces.find((a) => a.side === victim.side && ready(a, 'void_rescue') && pieceDistance(a, victim) <= 1);
  if (rescuer) {
    const spot = nearestEmpty(s, rescuer.pos);
    if (spot) {
      markUsed(rescuer, 'void_rescue');
      victim.pos = spot;
      log(s, `${nameOf(rescuer)} pulls the ${PIECE_STATS[victim.type].name} to safety.`);
      return;
    }
  }
  const step = ALL_DIRS.map((d) => add(c, d)).find((q) => isEmpty(s, q));
  if (step) {
    victim.pos = step;
    return;
  }
  capture(s, victim, { kind: 'fall' });
}

// ---------------------------------------------------------------------------
// Summons
// ---------------------------------------------------------------------------

let summonCounter = 0;

/** Empty squares a piece can summon onto (adjacent; Summoner's Range adds one). */
export function summonSquares(s: GameState, p: Piece): Coord[] {
  const range = 1 + (has(p, 'summoners_range') ? 1 : 0);
  const out: Coord[] = [];
  for (let dy = -range; dy <= range; dy++)
    for (let dx = -range; dx <= range; dx++) {
      const c = { x: p.pos.x + dx, y: p.pos.y + dy };
      if (distanceTo(p, c) >= 1 && distanceTo(p, c) <= range && isEmpty(s, c)) out.push(c);
    }
  // Front squares first.
  return out.sort((a, b) => (a.y - b.y) * -forward(p.side) || Math.abs(a.x - p.pos.x) - Math.abs(b.x - p.pos.x));
}

export function newPiece(type: PieceType, side: Side, at: Coord, id: string): Piece {
  const stats = PIECE_STATS[type];
  return {
    id,
    type,
    side,
    pos: { ...at },
    hasMoved: true,
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    shields: [],
    used: [],
    upgrades: [],
    statuses: [],
    startPos: { ...at },
    streak: 0,
    stillTurns: 0,
    attacks: 0,
    hitsTaken: 0,
    counters: {},
  };
}

/**
 * Create a temporary piece for `summoner`. `turns` = lifetime in the
 * summoner's turns (null = until the battle ends).
 */
export function summon(
  s: GameState,
  summoner: Piece,
  type: PieceType,
  at: Coord,
  kind: string,
  opts: { turns?: number | null; copy?: 'weak' | 'full' } = {},
): Piece {
  const id = `${summoner.side[0]}-summon-${type}-${s.ply}-${summonCounter++}`;
  let p: Piece;
  if (opts.copy === 'full') {
    p = { ...clonePiece(summoner), id, pos: { ...at }, startPos: { ...at } };
  } else {
    p = newPiece(type, summoner.side, at, id);
    if (opts.copy === 'weak') {
      p.hp = 1;
      p.maxHp = 1;
    }
  }
  const turns = has(summoner, 'lasting_reinforcements') ? null : opts.turns ?? null;
  const extended = turns !== null && has(summoner, 'summon_extension') ? turns + 2 : turns;
  p.temp = { summonerId: summoner.id, expires: extended === null ? null : endOfTurn(s.ply, summoner.side, extended), kind };
  if (has(summoner, 'copy_movement') && type === 'decoy') p.counters.moveAs = 1;
  if (has(summoner, 'summon_shield')) p.shields.push({ strength: 1, expires: null });
  s.pieces.push(p);
  return p;
}

/** What a decoy with Copy Movement moves like. */
export function movementType(s: GameState, p: Piece): PieceType {
  if (p.type === 'decoy' && p.counters.moveAs) {
    const summoner = getPiece(s, p.temp?.summonerId);
    if (summoner && sizeOf(summoner) === 1) return summoner.type;
  }
  return p.type;
}

export { opponent, shieldTotal };
