/**
 * Sonic Content Pack upgrades: the activated ones (each replaces the piece's
 * move), plus the attack and damage effects shared with ordinary moves.
 * Movement passives (Speed Shoes, Bounce Bracelet, Drill, Spikes, Hover,
 * Frenzy) live in movement.ts; damage passives in core.ts.
 */
import { inBounds, isBarrier, isStandable, terrainAt } from './board';
import {
  ALL_DIRS,
  ORTHO,
  add,
  cannotAttack,
  dealDamage,
  destroyCracked,
  distanceTo,
  getPiece,
  has,
  hasStatus,
  hasUsed,
  isBoss,
  isEmpty,
  log,
  markUsed,
  pieceAt,
  pieceDistance,
  scale,
  setTerrain,
  sign,
  sub,
} from './core';
import { PIECE_STATS, sizeOf } from './pieces';
import { Coord, GameState, Move, Piece, sameCoord } from './types';

/** Cooldowns ("every N turns") in the owner's turns. */
export const SONIC_UPGRADE_COOLDOWNS: Record<string, number> = {
  homing_attack: 3,
  light_speed_dash: 4,
  magic_gloves: 4,
  lightning_shield: 3,
  bubble_shield: 3,
  orange_rocket: 4,
  cyan_laser: 4,
  blue_cube: 4,
  chaos_spear: 3,
  chaos_control: 4,
  super_peel_out: 3,
  master_emerald: 3,
};
const ONCE = new Set(['chaos_blast', 'team_blast']);
/** Actions that move the user (not while Bound). */
const MOVING = new Set(['homing_attack', 'light_speed_dash', 'bubble_shield', 'orange_rocket', 'cyan_laser', 'chaos_control', 'super_peel_out']);
/** Actions that hurt enemies (not while Disarmed / Pacified). */
const HARMFUL = new Set(['homing_attack', 'magic_gloves', 'lightning_shield', 'cyan_laser', 'chaos_spear', 'chaos_blast', 'team_blast', 'master_emerald']);
/** Actions resolved as a real attack (with bounceback) when they end on an enemy. */
export const ATTACK_UPGRADES = new Set(['homing_attack', 'cyan_laser']);

const cdKey = (id: string) => `${id}Cd`;
const charged = (p: Piece, id: string) => has(p, id) && (ONCE.has(id) ? !hasUsed(p, id) : (p.counters[cdKey(id)] ?? 0) <= 0);
export const isSonicAction = (id: string) => id in SONIC_UPGRADE_COOLDOWNS || ONCE.has(id);

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

/**
 * Every Sonic upgrade action for `p`. `peelOut` gives the extra squares Super
 * Peel Out can reach (from movement.ts, which knows the piece's slides).
 */
export function sonicUpgradeActions(s: GameState, p: Piece, peelOut: () => Coord[]): Move[] {
  const out: Move[] = [];
  const base = { pieceId: p.id, from: p.pos, action: 'upgrade' as const };
  const act = (upgrade: string, to: Coord, extra: Partial<Move> = {}) => out.push({ ...base, upgrade, to, ...extra });
  const small = sizeOf(p) === 1;
  const enemies = s.pieces.filter((e) => e.side !== p.side);

  if (small && charged(p, 'homing_attack'))
    for (const e of enemies.filter((e) => pieceDistance(e, p) <= 3 && sizeOf(e) === 1))
      act('homing_attack', e.pos, { targets: [e.id], bounceTo: p.pos, leap: true });
  if (small && charged(p, 'light_speed_dash'))
    for (const c of lineSquares(s, p.pos, ORTHO, 99)) if (isEmpty(s, c) && distanceTo(p, c) >= 2) act('light_speed_dash', c);
  if (charged(p, 'magic_gloves'))
    enemies.filter((e) => e.hp === 1 && !isBoss(e) && pieceDistance(e, p) === 1).forEach((e) => act('magic_gloves', e.pos, { allyId: e.id }));
  if (charged(p, 'lightning_shield'))
    for (const d of ORTHO) {
      const hit = firstInLine(s, p.pos, d, 2);
      if (hit && hit.side !== p.side) act('lightning_shield', hit.pos, { allyId: hit.id });
    }
  if (small && charged(p, 'bubble_shield'))
    for (const d of ALL_DIRS) {
      const c = add(p.pos, scale(d, 2));
      if (isEmpty(s, c)) act('bubble_shield', c);
    }
  if (small && charged(p, 'orange_rocket'))
    for (const c of lineSquares(s, p.pos, ORTHO, 4)) if (isEmpty(s, c) && distanceTo(p, c) >= 2) act('orange_rocket', c);
  if (small && charged(p, 'cyan_laser'))
    for (const d of ALL_DIRS)
      for (let k = 1; k <= 5; k++) {
        const c = add(p.pos, scale(d, k));
        if (!inBounds(s.board, c)) break;
        if (!isStandable(s.board, c)) continue;
        const o = pieceAt(s, c);
        if (!o) act('cyan_laser', c);
        else if (o.side !== p.side && sizeOf(o) === 1) act('cyan_laser', c, { targets: [o.id], bounceTo: p.pos, leap: true });
      }
  if (charged(p, 'blue_cube'))
    for (let y = p.pos.y - 3; y <= p.pos.y + 3; y++)
      for (let x = p.pos.x - 3; x <= p.pos.x + 3; x++) {
        const c = { x, y };
        if (!inBounds(s.board, c) || sameCoord(c, p.pos)) continue;
        const t = terrainAt(s.board, c);
        if (t === 'normal' && !pieceAt(s, c)) act('blue_cube', c, { param: 'build' });
        else if (t === 'wall' || t === 'cracked') act('blue_cube', c, { param: 'remove' });
      }
  if (charged(p, 'chaos_spear'))
    for (const d of ALL_DIRS) {
      const hit = firstInLine(s, p.pos, d, 4);
      if (hit && hit.side !== p.side) act('chaos_spear', hit.pos, { allyId: hit.id });
    }
  if (charged(p, 'chaos_blast') && enemies.some((e) => pieceDistance(e, p) <= 2)) act('chaos_blast', p.pos);
  if (small && charged(p, 'chaos_control'))
    for (let y = p.pos.y - 5; y <= p.pos.y + 5; y++)
      for (let x = p.pos.x - 5; x <= p.pos.x + 5; x++) {
        const c = { x, y };
        if (isEmpty(s, c) && distanceTo(p, c) >= 2) act('chaos_control', c);
      }
  if (charged(p, 'team_blast') && enemies.some((e) => pieceDistance(e, p) === 1)) act('team_blast', p.pos);
  if (small && charged(p, 'super_peel_out')) for (const c of peelOut()) act('super_peel_out', c);
  if (charged(p, 'master_emerald') && enemies.some((e) => pieceDistance(e, p) === 1)) act('master_emerald', p.pos);

  return out.filter((m) => {
    if (hasStatus(p, 'bound') && MOVING.has(m.upgrade!)) return false;
    if (cannotAttack(p) && HARMFUL.has(m.upgrade!)) return false;
    return true;
  });
}

/** Squares along these directions within `reach`, ignoring obstacles (dashes, rockets). */
function lineSquares(s: GameState, from: Coord, dirs: Coord[], reach: number): Coord[] {
  const out: Coord[] = [];
  for (const d of dirs)
    for (let k = 1; k <= reach; k++) {
      const c = add(from, scale(d, k));
      if (!inBounds(s.board, c)) break;
      out.push(c);
    }
  return out;
}

/** Start the cooldown (or spend the once-per-battle use) of an upgrade action. */
export function spendSonicAction(p: Piece, id: string) {
  if (ONCE.has(id)) markUsed(p, id);
  if (SONIC_UPGRADE_COOLDOWNS[id]) p.counters[cdKey(id)] = SONIC_UPGRADE_COOLDOWNS[id];
}

/** Resolve a Sonic upgrade action that isn't an attack (attacks go through resolveAttack). */
export function resolveSonicUpgrade(s: GameState, m: Move) {
  const p = getPiece(s, m.pieceId)!;
  const id = m.upgrade!;
  spendSonicAction(p, id);
  const target = getPiece(s, m.allyId);
  switch (id) {
    case 'homing_attack':
    case 'light_speed_dash':
    case 'bubble_shield':
    case 'orange_rocket':
    case 'cyan_laser':
    case 'chaos_control':
    case 'super_peel_out':
      p.pos = { ...m.to };
      break;
    case 'magic_gloves':
      if (target) dealDamage(s, target.id, target.hp, { sourceId: p.id, kind: 'attack', lethal: true });
      break;
    case 'lightning_shield':
      if (target) dealDamage(s, target.id, 1, { sourceId: p.id, kind: 'ranged' });
      break;
    case 'chaos_spear':
      if (target) dealDamage(s, target.id, 1, { sourceId: p.id, kind: 'ranged' });
      break;
    case 'blue_cube':
      setTerrain(s, m.to, m.param === 'build' ? 'wall' : 'normal');
      break;
    case 'chaos_blast':
      log(s, 'Chaos Blast!');
      for (const e of s.pieces.filter((e) => e.side !== p.side && pieceDistance(e, p) <= 2)) dealDamage(s, e.id, 1, { sourceId: p.id, kind: 'ability' });
      for (let y = p.pos.y - 2; y <= p.pos.y + sizeOf(p) + 1; y++)
        for (let x = p.pos.x - 2; x <= p.pos.x + sizeOf(p) + 1; x++) {
          const c = { x, y };
          if (terrainAt(s.board, c) === 'cracked' && distanceTo(p, c) <= 2) destroyCracked(s, c, p);
        }
      break;
    case 'team_blast': {
      const friends = s.pieces.filter((a) => a.side === p.side && a.id !== p.id && pieceDistance(a, p) === 1).length;
      const dmg = friends >= 2 ? 2 : 1;
      log(s, friends >= 2 ? 'Team Blast — together!' : 'Team Blast!');
      for (const e of s.pieces.filter((e) => e.side !== p.side && pieceDistance(e, p) === 1)) dealDamage(s, e.id, dmg, { sourceId: p.id, kind: 'ability' });
      break;
    }
    case 'master_emerald':
      for (const e of s.pieces.filter((e) => e.side !== p.side && pieceDistance(e, p) === 1)) dealDamage(s, e.id, 1, { sourceId: p.id, kind: 'ability' });
      break;
  }
}

/** Flame Ring: an attack also burns one other enemy next to the target (the most valuable). */
export function flameRing(s: GameState, p: Piece, targetPos: Coord, targetIds: string[]) {
  if (!has(p, 'flame_ring')) return;
  const other = s.pieces
    .filter((e) => e.side !== p.side && !targetIds.includes(e.id) && distanceTo(e, targetPos) === 1)
    .sort((a, b) => PIECE_STATS[b.type].value - PIECE_STATS[a.type].value)[0];
  if (other) dealDamage(s, other.id, 1, { sourceId: p.id, kind: 'splash' });
}

/** Yellow Drill: walls along a straight slide are destroyed as the piece bores through. */
export function drillThrough(s: GameState, m: Move) {
  const p = getPiece(s, m.pieceId);
  if (!p || m.action || !has(p, 'yellow_drill') || m.leap) return;
  const d = sub(m.to, m.from);
  const n = Math.max(Math.abs(d.x), Math.abs(d.y));
  const straight = d.x === 0 || d.y === 0 || Math.abs(d.x) === Math.abs(d.y);
  if (!straight) return;
  for (let k = 1; k < n; k++) {
    const c = add(m.from, scale(sign(d), k));
    const t = terrainAt(s.board, c);
    if (t === 'cracked') destroyCracked(s, c, p);
    else if (t === 'wall') setTerrain(s, c, 'normal');
  }
}
