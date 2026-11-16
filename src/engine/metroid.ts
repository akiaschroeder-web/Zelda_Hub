/**
 * Metroid Content Pack: Samus Aran, Zero Suit Samus, Metroids, Space Pirates,
 * Chozo Soldiers, E.M.M.I., Ridley (2×2) and the Mother Brain boss (3×3),
 * plus the pack's 15 upgrades. Base movement patterns live in movement.ts.
 */
import { inBounds, isStandable, isWall, terrainAt } from './board';
import {
  ALL_DIRS,
  ORTHO,
  add,
  addStatus,
  cannotAttack,
  dealDamage,
  destroyCracked,
  getPiece,
  has,
  hasStatus,
  hasUsed,
  heal,
  isBoss,
  isEmpty,
  log,
  markUsed,
  pieceAt,
  pieceDistance,
  scale,
  sign,
  sub,
} from './core';
import type { DamageKind } from './core';
import { grappleSquares } from './crash';
import { PIECE_STATS, footprint, sizeOf } from './pieces';
import { Bonus, Coord, GameState, Move, Piece, Side, endOfTurn, sameCoord } from './types';

const ready = (p: Piece, cd: string) => (p.counters[cd] ?? 0) <= 0;
const friendsOf = (s: GameState, p: Piece) => s.pieces.filter((a) => a.side === p.side && a.id !== p.id);
const enemiesOf = (s: GameState, p: Piece) => s.pieces.filter((e) => e.side !== p.side);
/** A solid wall or locked door (cracked walls don't count). */
const solid = (s: GameState, c: Coord) => terrainAt(s.board, c) === 'wall' || terrainAt(s.board, c) === 'door';
const blocked = (s: GameState, c: Coord) => !inBounds(s.board, c) || isWall(s.board, c) || terrainAt(s.board, c) === 'cracked';

/** Mother Brain's phase by HP (3 = Defense Systems, 2 = Automated Defenses, 1 = Hyper Beam); 0 for anything else. */
export const brainPhase = (p: Piece) => (p.type !== 'mother_brain' ? 0 : p.hp >= 3 ? 1 : p.hp === 2 ? 2 : 3);

/** The first piece within `reach` along a direction; walls and cracked walls stop the line. */
function firstInLine(s: GameState, from: Coord, d: Coord, reach: number): Piece | undefined {
  for (let k = 1; k <= reach; k++) {
    const c = add(from, scale(d, k));
    if (blocked(s, c)) return undefined;
    const o = pieceAt(s, c);
    if (o) return o;
  }
  return undefined;
}

/** Every enemy along a line up to `reach`, passing through pieces; walls (and cracked walls) stop it. */
function enemiesInLine(s: GameState, p: Piece, from: Coord, d: Coord, reach: number): Piece[] {
  const out: Piece[] = [];
  for (let k = 1; k <= reach; k++) {
    const c = add(from, scale(d, k));
    if (blocked(s, c)) break;
    const o = pieceAt(s, c);
    if (o && o.side !== p.side && !out.includes(o)) out.push(o);
  }
  return out;
}

/** Mother Brain's beam: the 3-wide band in front of her (one lane from a corner diagonally), nearest first. */
function brainBeam(s: GameState, p: Piece, d: Coord): Piece[] {
  const size = sizeOf(p);
  const hit = new Map<string, { piece: Piece; dist: number }>();
  const starts: Coord[] = [];
  if (d.x !== 0 && d.y !== 0) starts.push({ x: d.x > 0 ? p.pos.x + size - 1 : p.pos.x, y: d.y > 0 ? p.pos.y + size - 1 : p.pos.y });
  else
    for (let lane = 0; lane < size; lane++)
      starts.push({
        x: d.x > 0 ? p.pos.x + size - 1 : d.x < 0 ? p.pos.x : p.pos.x + lane,
        y: d.y > 0 ? p.pos.y + size - 1 : d.y < 0 ? p.pos.y : p.pos.y + lane,
      });
  for (const start of starts)
    for (let k = 1; k <= 5; k++) {
      const c = add(start, scale(d, k));
      if (blocked(s, c)) break;
      const o = pieceAt(s, c);
      if (o && o.side !== p.side && (!hit.has(o.id) || hit.get(o.id)!.dist > k)) hit.set(o.id, { piece: o, dist: k });
    }
  return [...hit.values()].sort((a, b) => a.dist - b.dist).map((h) => h.piece);
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

export interface MetroidStep {
  to: Coord;
  capture: boolean;
  quiet: boolean;
  leap: boolean;
  uses: string[];
}

/** Morph Ball (Samus's and the upgrade's) and Shinespark. `slides` are the piece's slides. */
export function metroidSteps(s: GameState, p: Piece, slides: { dir: Coord; max: number }[]): MetroidStep[] {
  if (sizeOf(p) !== 1 || hasStatus(p, 'bound')) return [];
  const out: MetroidStep[] = [];
  const morph = (use: string) => {
    for (const { dir, max } of slides) {
      let through = false;
      for (let k = 1; k <= max; k++) {
        const c = add(p.pos, scale(dir, k));
        if (!inBounds(s.board, c) || terrainAt(s.board, c) === 'void') break;
        if (isStandable(s.board, c) && isEmpty(s, c)) {
          if (through) out.push({ to: c, capture: false, quiet: true, leap: false, uses: [use] });
        } else if (terrainAt(s.board, c) === 'gap') break;
        else through = true;
      }
    }
  };
  if (p.type === 'samus' && ready(p, 'morphCd')) morph('samus_morph');
  if (has(p, 'morph_ball') && ready(p, 'morph_ballCd')) morph('morph_ball');
  // Shinespark: up to 6 in a line over pieces and gaps; walls stop it, cracked walls shatter.
  if (has(p, 'shinespark') && ready(p, 'shinesparkCd'))
    for (const d of ALL_DIRS)
      for (let k = 1; k <= 6; k++) {
        const c = add(p.pos, scale(d, k));
        if (!inBounds(s.board, c) || solid(s, c)) break;
        if (!isStandable(s.board, c)) continue;
        const o = pieceAt(s, c);
        if (o && o.side === p.side) continue;
        if (k >= 2) out.push({ to: c, capture: !!o, quiet: !o, leap: true, uses: ['shinespark'] });
      }
  return out;
}

/** A heavy step (structurally the same as movement.ts's HeavyStep). */
export interface RidleyStep {
  to: Coord;
  targets: string[];
}

/** Ridley: up to 3 diagonally or 2 orthogonally, flying over gaps (not ending on them). */
export function ridleySteps(s: GameState, p: Piece): RidleyStep[] {
  const out: RidleyStep[] = [];
  if (hasStatus(p, 'bound')) return out;
  for (const d of ALL_DIRS) {
    const reach = d.x !== 0 && d.y !== 0 ? 3 : 2;
    for (let k = 1; k <= reach; k++) {
      const to = add(p.pos, scale(d, k));
      const cells = footprint(p, to);
      if (cells.some((c) => !inBounds(s.board, c) || isWall(s.board, c) || terrainAt(s.board, c) === 'cracked' || terrainAt(s.board, c) === 'void')) break;
      const others = cells.map((c) => pieceAt(s, c)).filter((o): o is Piece => !!o && o.id !== p.id);
      if (others.some((o) => o.side === p.side)) break;
      const overGap = cells.some((c) => !isStandable(s.board, c));
      if (!overGap) out.push({ to, targets: [...new Set(others.map((o) => o.id))] });
      if (others.length) break;
    }
  }
  return out;
}

/** Extra sliding range: Speed Booster +2 (orthogonal slides), Metroid Suit +1, E.M.M.I.'s Pursuit +1. */
export function metroidRangeBonus(s: GameState, p: Piece, dir: Coord): number {
  let b = 0;
  if (has(p, 'speed_booster') && (dir.x === 0 || dir.y === 0)) b += 2;
  if (has(p, 'metroid_suit')) b += 1;
  if (p.type === 'emmi' && s.pieces.some((e) => e.side !== p.side && pieceDistance(e, p) <= 3)) b += 1;
  return b;
}

// ---------------------------------------------------------------------------
// Piece actions
// ---------------------------------------------------------------------------

export function metroidMoves(s: GameState, p: Piece): Move[] {
  const out: Move[] = [];
  const base = { pieceId: p.id, from: p.pos };
  const foes = enemiesOf(s, p);
  switch (p.type) {
    case 'samus':
      if (ready(p, 'cannonCd'))
        for (const d of ORTHO) {
          const hit = firstInLine(s, p.pos, d, 4);
          if (hit && hit.side !== p.side) out.push({ ...base, to: hit.pos, action: 'armCannon', allyId: hit.id });
        }
      break;
    case 'zero_suit':
      if (ready(p, 'paralyzerCd'))
        for (const e of foes.filter((e) => !isBoss(e) && pieceDistance(e, p) <= 3)) out.push({ ...base, to: e.pos, action: 'paralyzer', allyId: e.id });
      break;
    case 'metroid':
      if (ready(p, 'latchCd') && !p.counters.latchOn)
        for (const e of foes.filter((e) => sizeOf(e) === 1 && !isBoss(e) && pieceDistance(e, p) === 1)) out.push({ ...base, to: e.pos, action: 'latch', allyId: e.id });
      break;
    case 'space_pirate': {
      if (!ready(p, 'blasterCd')) break;
      const reach = friendsOf(s, p).some((o) => o.type === 'space_pirate' && pieceDistance(o, p) <= 2) ? 5 : 3;
      for (const d of ORTHO) {
        const hit = firstInLine(s, p.pos, d, reach);
        if (hit && hit.side !== p.side) out.push({ ...base, to: hit.pos, action: 'pirateBlaster', allyId: hit.id });
      }
      break;
    }
    case 'chozo_soldier':
      // Spear Strike: an enemy exactly 2 away orthogonally, with an empty square between.
      if (!cannotAttack(p))
        for (const d of ORTHO) {
          const mid = add(p.pos, d);
          const c = add(p.pos, scale(d, 2));
          const o = pieceAt(s, c);
          if (o && o.side !== p.side && isStandable(s.board, mid) && isEmpty(s, mid)) out.push({ ...base, to: c, action: 'spear', allyId: o.id });
        }
      break;
    case 'ridley':
      if (ready(p, 'tailCd') && foes.some((e) => pieceDistance(e, p) === 1)) out.push({ ...base, to: p.pos, action: 'tailStrike' });
      break;
    case 'mother_brain': {
      if (!ready(p, 'beamCd')) break;
      for (const d of brainPhase(p) >= 2 ? ALL_DIRS : ORTHO)
        if (brainBeam(s, p, d).length) out.push({ ...base, to: add(p.pos, d), action: 'brainBeam', param: `${d.x},${d.y}` });
      break;
    }
  }
  return out;
}

export function resolveMetroid(s: GameState, m: Move): boolean {
  const p = getPiece(s, m.pieceId);
  if (!p) return false;
  const target = getPiece(s, m.allyId);
  switch (m.action) {
    case 'armCannon':
      p.counters.cannonCd = 3;
      if (target) dealDamage(s, target.id, 1, { sourceId: p.id, kind: 'ranged' });
      return true;
    case 'paralyzer':
      p.counters.paralyzerCd = 3;
      if (target) addStatus(target, { kind: 'stunned', until: endOfTurn(s.ply, target.side), source: 'paralyzer' });
      return true;
    case 'latch':
      p.counters.latchCd = 3;
      if (target) {
        p.counters.latchOn = 1;
        p.counters.latchX = target.pos.x;
        p.counters.latchY = target.pos.y;
        addStatus(target, { kind: 'bound', until: null, source: `latch:${p.id}` });
        log(s, `The Metroid latches onto the ${PIECE_STATS[target.type].name}!`);
      }
      return true;
    case 'pirateBlaster':
      p.counters.blasterCd = 3;
      if (target) dealDamage(s, target.id, 1, { sourceId: p.id, kind: 'ranged' });
      return true;
    case 'spear':
      if (target) dealDamage(s, target.id, PIECE_STATS[p.type].damage, { sourceId: p.id, kind: 'ranged' });
      return true;
    case 'tailStrike':
      p.counters.tailCd = 3;
      log(s, 'Ridley lashes his tail!');
      for (const e of enemiesOf(s, p).filter((e) => pieceDistance(e, p) === 1)) dealDamage(s, e.id, 1, { sourceId: p.id, kind: 'ability' });
      return true;
    case 'brainBeam': {
      const phase = brainPhase(p);
      p.counters.beamCd = phase === 3 ? 2 : 3;
      const [dx, dy] = (m.param ?? '0,1').split(',').map(Number);
      log(s, phase === 3 ? 'Mother Brain fires the Hyper Beam!' : 'Mother Brain fires a beam!');
      brainBeam(s, p, { x: dx, y: dy }).forEach((e, i) => dealDamage(s, e.id, phase === 3 && i === 0 ? 2 : 1, { sourceId: p.id, kind: 'ability' }));
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Upgrades
// ---------------------------------------------------------------------------

export const METROID_UPGRADE_COOLDOWNS: Record<string, number> = {
  missile_expansion: 3,
  super_missile: 4,
  ice_beam: 3,
  wave_beam: 3,
  plasma_beam: 3,
  morph_ball_bomb: 3,
  grapple_beam: 3,
  metroid_suit: 0, // Hyper Beam, once per battle
};
const STEP_COOLDOWNS: Record<string, number> = { morph_ball: 3, shinespark: 4, samus_morph: 3 };
export const isMetroidAction = (id: string) => id in METROID_UPGRADE_COOLDOWNS;
const charged = (p: Piece, id: string) => {
  if (!has(p, id)) return false;
  const cd = METROID_UPGRADE_COOLDOWNS[id];
  return cd === 0 ? !hasUsed(p, id) : (p.counters[`${id}Cd`] ?? 0) <= 0;
};

/** The square a Super Missile reaches (its first piece), and the cracked walls it shatters on the way. */
function superMissile(s: GameState, p: Piece, d: Coord): { target?: Piece; cracked: Coord[] } {
  const cracked: Coord[] = [];
  for (let k = 1; k <= 5; k++) {
    const c = add(p.pos, scale(d, k));
    if (!inBounds(s.board, c) || solid(s, c)) break;
    if (terrainAt(s.board, c) === 'cracked') {
      cracked.push(c);
      continue;
    }
    const o = pieceAt(s, c);
    if (o) return o.side !== p.side ? { target: o, cracked } : { cracked: [] };
  }
  return { cracked: [] };
}

/** Wave Beam: the enemies within 4 orthogonally, through pieces and cracked walls (not walls). */
function waveTargets(s: GameState, p: Piece): Piece[] {
  const out: Piece[] = [];
  for (const d of ORTHO)
    for (let k = 1; k <= 4; k++) {
      const c = add(p.pos, scale(d, k));
      if (!inBounds(s.board, c) || solid(s, c)) break;
      const o = pieceAt(s, c);
      if (o && o.side !== p.side && !out.includes(o)) out.push(o);
    }
  return out;
}

export function metroidUpgradeActions(s: GameState, p: Piece): Move[] {
  const out: Move[] = [];
  const act = (upgrade: string, to: Coord, extra: Partial<Move> = {}) => out.push({ pieceId: p.id, from: p.pos, action: 'upgrade', upgrade, to, ...extra });
  const harmless = cannotAttack(p);
  const foes = enemiesOf(s, p);
  if (!harmless) {
    if (charged(p, 'missile_expansion'))
      for (const d of ORTHO) {
        const hit = firstInLine(s, p.pos, d, 4);
        if (hit && hit.side !== p.side) act('missile_expansion', hit.pos, { allyId: hit.id });
      }
    if (charged(p, 'super_missile'))
      for (const d of ORTHO) {
        const { target } = superMissile(s, p, d);
        if (target) act('super_missile', target.pos, { allyId: target.id, param: `${d.x},${d.y}` });
      }
    if (charged(p, 'ice_beam'))
      for (const d of ALL_DIRS) {
        const hit = firstInLine(s, p.pos, d, 3);
        if (hit && hit.side !== p.side) act('ice_beam', hit.pos, { allyId: hit.id });
      }
    if (charged(p, 'wave_beam')) for (const e of waveTargets(s, p)) act('wave_beam', e.pos, { allyId: e.id });
    if (charged(p, 'plasma_beam'))
      for (const d of ALL_DIRS) if (enemiesInLine(s, p, p.pos, d, 5).length) act('plasma_beam', add(p.pos, d), { param: `${d.x},${d.y}` });
    if (charged(p, 'metroid_suit'))
      for (const d of ALL_DIRS) if (enemiesInLine(s, p, p.pos, d, 5).length) act('metroid_suit', add(p.pos, d), { param: `${d.x},${d.y}` });
    if (charged(p, 'morph_ball_bomb') && (foes.some((e) => pieceDistance(e, p) === 1) || ALL_DIRS.some((d) => terrainAt(s.board, add(p.pos, d)) === 'cracked')))
      act('morph_ball_bomb', p.pos);
  }
  if (charged(p, 'grapple_beam') && sizeOf(p) === 1 && !hasStatus(p, 'bound')) for (const c of grappleSquares(s, p, 4)) act('grapple_beam', c);
  return out;
}

export function resolveMetroidUpgrade(s: GameState, m: Move) {
  const p = getPiece(s, m.pieceId)!;
  const id = m.upgrade!;
  if (METROID_UPGRADE_COOLDOWNS[id] === 0) markUsed(p, id);
  else p.counters[`${id}Cd`] = METROID_UPGRADE_COOLDOWNS[id];
  const target = getPiece(s, m.allyId);
  const dir = () => {
    const [dx, dy] = (m.param ?? '0,1').split(',').map(Number);
    return { x: dx, y: dy };
  };
  switch (id) {
    case 'missile_expansion':
    case 'wave_beam':
      if (target) dealDamage(s, target.id, 1, { sourceId: p.id, kind: 'ranged' });
      break;
    case 'super_missile': {
      const { cracked } = superMissile(s, p, dir());
      for (const c of cracked) destroyCracked(s, c, p);
      if (target) dealDamage(s, target.id, 2, { sourceId: p.id, kind: 'ranged' });
      break;
    }
    case 'ice_beam':
      if (target) {
        const outcome = dealDamage(s, target.id, 1, { sourceId: p.id, kind: 'ranged' });
        const still = getPiece(s, target.id);
        if (still && outcome.kind !== 'captured') addStatus(still, { kind: 'bound', until: endOfTurn(s.ply, still.side), source: 'ice_beam' });
      }
      break;
    case 'plasma_beam':
    case 'metroid_suit':
      if (id === 'metroid_suit') log(s, 'Hyper Beam!');
      for (const e of enemiesInLine(s, p, p.pos, dir(), 5)) dealDamage(s, e.id, id === 'metroid_suit' ? 2 : 1, { sourceId: p.id, kind: 'ranged' });
      break;
    case 'morph_ball_bomb':
      for (const e of enemiesOf(s, p).filter((e) => pieceDistance(e, p) === 1)) dealDamage(s, e.id, 1, { sourceId: p.id, kind: 'ability' });
      for (const d of ALL_DIRS) {
        const c = add(p.pos, d);
        if (terrainAt(s.board, c) === 'cracked') destroyCracked(s, c, p);
      }
      break;
    case 'grapple_beam':
      p.pos = { ...m.to };
      break;
  }
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Extra direct-attack damage: Metroid Suit +1, Shinespark +1. */
export function metroidAttackBonus(p: Piece, m: Move): number {
  return (has(p, 'metroid_suit') ? 1 : 0) + (m.uses?.includes('shinespark') ? 1 : 0);
}

/** E.M.M.I.'s Capture Protocol: an attack on an enemy down to 1 HP captures it outright (not bosses). */
export const emmiCaptures = (p: Piece, t: Piece) => p.type === 'emmi' && t.hp === 1 && !isBoss(t);

/** Zero Suit Samus: Acrobatic Escape — once per battle, she flips clear of an attack. */
export function metroidNegates(s: GameState, target: Piece, source: Piece | undefined, amount: number): boolean {
  if (target.type !== 'zero_suit' || amount <= 0 || hasUsed(target, 'acrobatic_escape')) return false;
  const spot = ALL_DIRS.map((d) => add(target.pos, d))
    .filter((c) => isStandable(s.board, c) && isEmpty(s, c))
    .sort((a, b) => (source ? pieceDistanceTo(source, b) - pieceDistanceTo(source, a) : 0))[0];
  if (!spot) return false;
  markUsed(target, 'acrobatic_escape');
  target.pos = { ...spot };
  log(s, 'Zero Suit Samus flips out of the way!');
  return true;
}
const pieceDistanceTo = (p: Piece, c: Coord) => Math.max(Math.abs(p.pos.x - c.x), Math.abs(p.pos.y - c.y));

/** Mother Brain (Phase 2+): her barrier stops the first point of damage each turn. */
export function metroidReduction(s: GameState, target: Piece, dmg: number): number {
  if (target.type !== 'mother_brain' || dmg <= 0 || brainPhase(target) < 2 || target.counters.barrierPly === s.ply) return dmg;
  target.counters.barrierPly = s.ply;
  log(s, "Mother Brain's barrier absorbs a point of damage.");
  return dmg - 1;
}

/** Chozo Soldier: Counterattack (every 3 turns) on a melee attacker it survives. */
export function metroidAfterHit(s: GameState, target: Piece, source: Piece | undefined, kind: DamageKind) {
  if (target.type !== 'chozo_soldier' || kind !== 'attack' || !source || source.side === target.side) return;
  if (!ready(target, 'counterCd') || !getPiece(s, source.id) || !getPiece(s, target.id)) return;
  target.counters.counterCd = 3;
  log(s, 'The Chozo Soldier strikes back!');
  dealDamage(s, source.id, 1, { sourceId: target.id, kind: 'ability' });
}

/** Screw Attack: enemies jumped over in a straight line take 1. Shinespark smashes cracked walls on its path. */
export function metroidBeforeMove(s: GameState, m: Move) {
  const p = getPiece(s, m.pieceId);
  if (!p || m.action) return;
  const d = sign(sub(m.to, m.from));
  const n = Math.max(Math.abs(m.to.x - m.from.x), Math.abs(m.to.y - m.from.y));
  const straight = sameCoord(add(m.from, scale(d, n)), m.to);
  if (!straight) return;
  const between = Array.from({ length: Math.max(0, n - 1) }, (_, i) => add(m.from, scale(d, i + 1)));
  if (m.uses?.includes('shinespark')) for (const c of between) if (terrainAt(s.board, c) === 'cracked') destroyCracked(s, c, p);
  if (has(p, 'screw_attack') && m.leap) {
    const hit = new Set<string>();
    for (const c of between) {
      const o = pieceAt(s, c);
      if (o && o.side !== p.side && !hit.has(o.id)) {
        hit.add(o.id);
        dealDamage(s, o.id, 1, { sourceId: p.id, kind: 'splash' });
      }
    }
  }
}

/** After a move: cooldowns for movement abilities, Energy Drain, Space Jump, Ridley's Aerial Assault, Energy Absorption, and Metroids letting go. */
export function metroidAfterMove(s: GameState, m: Move, from: Coord | undefined, entry: Bonus | undefined, captured: number) {
  const p = getPiece(s, m.pieceId);
  if (!p) return;
  for (const u of m.uses ?? []) {
    if (u === 'samus_morph') p.counters.morphCd = STEP_COOLDOWNS.samus_morph;
    else if (STEP_COOLDOWNS[u]) p.counters[`${u}Cd`] = STEP_COOLDOWNS[u];
  }
  if (entry?.source === 'space_jump') p.counters.space_jumpCd = 3;
  const moved = !!from && !sameCoord(from, p.pos);
  // A Metroid that moves lets go of its host.
  if (p.type === 'metroid' && moved && p.counters.latchOn) releaseLatch(s, p);
  // Metroid: Energy Drain after any attack it lives through.
  if (p.type === 'metroid' && m.targets?.length) heal(s, p, 1);
  if (captured > 0) {
    if (has(p, 'metroid_suit')) heal(s, p, 1);
    if (p.type === 'ridley' && entry?.source !== 'aerial_assault')
      s.bonus.unshift({ pieceId: p.id, filter: 'nonCapturing', optional: true, source: 'aerial_assault', maxDistance: 1 });
  }
  // Space Jump: every 3 turns, a second move (which can't capture).
  if (has(p, 'space_jump') && ready(p, 'space_jumpCd') && moved && !m.action && !entry)
    s.bonus.unshift({ pieceId: p.id, filter: 'nonCapturing', optional: true, source: 'space_jump' });
}

function releaseLatch(s: GameState, metroid: Piece) {
  metroid.counters.latchOn = 0;
  for (const t of s.pieces) removeLatchStatus(t, metroid.id);
}
const removeLatchStatus = (t: Piece, metroidId: string) => {
  t.statuses = t.statuses.filter((st) => !(st.kind === 'bound' && st.source === `latch:${metroidId}`));
};

/** End of a side's turn: latched Metroids feed on their hosts; hosts of lost Metroids are freed. */
export function metroidTurnEnd(s: GameState, side: Side) {
  for (const t of s.pieces) {
    for (const st of t.statuses.filter((st) => st.kind === 'bound' && st.source?.startsWith('latch:'))) {
      const m = getPiece(s, st.source!.slice(6));
      if (!m || !m.counters.latchOn || pieceDistance(m, t) > 1) removeLatchStatus(t, st.source!.slice(6));
      else if (m.side === side) {
        log(s, `The Metroid drains the ${PIECE_STATS[t.type].name}!`);
        dealDamage(s, t.id, 1, { sourceId: m.id, kind: 'ability' });
      }
    }
  }
}

/** Display names for movement abilities tagged on moves. */
export const METROID_USE_NAMES: Record<string, string> = { samus_morph: 'Morph Ball' };

