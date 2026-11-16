/**
 * Ben 10 Content Pack pieces: Ben Tennyson and the Omnitrix, the original ten
 * aliens plus Cannonbolt and Way Big (5×5), Gwen, and the bosses Kevin 11
 * (2×2) and Vilgax (3×3). Base movement patterns live in movement.ts; upgrades
 * live in ben10Upgrades.ts.
 *
 * The Omnitrix: Ben's piece changes type to the alien for 3 turns (same id,
 * square and upgrades), then changes back with at most 1 HP.
 */
import { inBounds, isStandable, isWall, terrainAt } from './board';
import {
  ALL_DIRS,
  ORTHO,
  add,
  addStatus,
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
  nearestEmpty,
  capture,
  pieceAt,
  pieceDistance,
  scale,
  sign,
  sub,
} from './core';
import type { DamageKind } from './core';
import { MECHANICAL, maskOn, wallFreeLine } from './crash';
import { PIECE_STATS, footprint, sizeOf } from './pieces';
import { Bonus, Coord, GameState, Move, Piece, PieceType, Side, endOfTurn, sameCoord } from './types';

const ready = (p: Piece, cd: string) => (p.counters[cd] ?? 0) <= 0;
const friendsOf = (s: GameState, p: Piece) => s.pieces.filter((a) => a.side === p.side && a.id !== p.id);
const enemiesOf = (s: GameState, p: Piece) => s.pieces.filter((e) => e.side !== p.side);
const blocked = (s: GameState, c: Coord) => !inBounds(s.board, c) || isWall(s.board, c);

/** Aliens Ben can turn into with the Omnitrix (not Way Big). */
export const OMNITRIX_ALIENS: PieceType[] = [
  'heatblast', 'wildmutt', 'diamondhead', 'xlr8', 'grey_matter', 'four_arms', 'stinkfly', 'ripjaws', 'upgrade', 'ghostfreak', 'cannonbolt',
];
/** Turns a transformation lasts (counted down at the end of each of Ben's turns, the first one included). */
const OMNITRIX_TURNS = 4;

export const kevinPhase = (p: Piece) => (p.type !== 'kevin_11' ? 0 : p.hp >= 3 ? 1 : p.hp === 2 ? 2 : 3);
export const vilgaxPhase = (p: Piece) => (p.type !== 'vilgax' ? 0 : p.hp >= 3 ? 1 : p.hp === 2 ? 2 : 3);

/** Is this piece Ben (in any form)? */
export const isBen = (p: Piece) => p.type === 'ben' || !!p.counters.benForm;

const isMachine = (p: Piece) => MECHANICAL.has(p.type);

/** The first piece within `reach` along a direction; walls stop the line. */
function firstInLine(s: GameState, from: Coord, d: Coord, reach: number): Piece | undefined {
  for (let k = 1; k <= reach; k++) {
    const c = add(from, scale(d, k));
    if (blocked(s, c)) return undefined;
    const o = pieceAt(s, c);
    if (o) return o;
  }
  return undefined;
}

/** Top-left corners of a clear area of `size` that includes the piece's square. */
export function anchorsFor(s: GameState, p: Piece, size: number): Coord[] {
  if (size === 1) return [p.pos];
  const out: Coord[] = [];
  for (let dy = -(size - 1); dy <= 0; dy++)
    for (let dx = -(size - 1); dx <= 0; dx++) {
      const a = { x: p.pos.x + dx, y: p.pos.y + dy };
      const cells: Coord[] = [];
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) cells.push({ x: a.x + x, y: a.y + y });
      if (cells.every((c) => isStandable(s.board, c) && (sameCoord(c, p.pos) || isEmpty(s, c)))) out.push(a);
    }
  return out;
}

// ---------------------------------------------------------------------------
// The Omnitrix
// ---------------------------------------------------------------------------

/** Ben's transformations (and, with Master Control, changing form or reverting). */
function omnitrixMoves(s: GameState, p: Piece): Move[] {
  const out: Move[] = [];
  if (!isBen(p) || hasStatus(p, 'stunned')) return out;
  const master = has(p, 'master_control');
  const canPick = master ? (p.counters.omniPly ?? -1) !== s.ply : p.type === 'ben' && ready(p, 'omnitrixCd');
  if (!canPick) return out;
  for (const alien of OMNITRIX_ALIENS) {
    if (alien === p.type) continue;
    for (const a of anchorsFor(s, p, PIECE_STATS[alien].size).slice(0, 1))
      out.push({ pieceId: p.id, from: p.pos, to: a, action: 'omnitrix', param: alien });
  }
  if (master && p.type !== 'ben') out.push({ pieceId: p.id, from: p.pos, to: p.pos, action: 'omnitrix', param: 'ben' });
  return out;
}

/** Turn Ben into `alien` (or back into Ben). */
export function transformBen(s: GameState, p: Piece, alien: PieceType, at: Coord, hybridWith?: PieceType) {
  if (alien === 'ben') {
    revertBen(s, p);
    return;
  }
  const fresh = has(p, 'dna_repair');
  const before = p.maxHp;
  p.type = alien;
  p.pos = { ...at };
  p.counters.benForm = 1;
  p.counters.omniPly = s.ply;
  if (!has(p, 'master_control')) p.counters.omniTurns = OMNITRIX_TURNS;
  p.maxHp = Math.max(PIECE_STATS[alien].maxHp, 1);
  p.hp = fresh ? p.maxHp : Math.min(p.maxHp, p.hp + Math.max(0, p.maxHp - before));
  if (!has(p, 'master_control')) p.counters.omnitrixCd = has(p, 'omnitrix_dial') ? 3 : 4;
  p.statuses = p.statuses.filter((st) => st.source !== 'hybrid');
  if (hybridWith) addStatus(p, { kind: 'copying', until: endOfTurn(s.ply, p.side, 3), source: hybridWith });
  log(s, `Ben slaps the Omnitrix — ${PIECE_STATS[alien].name}!${hybridWith ? ` (with ${PIECE_STATS[hybridWith].name}'s moves)` : ''}`);
}

function revertBen(s: GameState, p: Piece) {
  p.type = 'ben';
  delete p.counters.benForm;
  delete p.counters.omniTurns;
  p.maxHp = 1 + (has(p, 'master_control') ? 1 : 0);
  p.hp = Math.min(p.hp, 1);
  log(s, 'The Omnitrix times out — Ben is back.');
  // Changing back over a gap (from Stinkfly): he drops to the nearest open square, or falls.
  if (!isStandable(s.board, p.pos)) {
    const spot = nearestEmpty(s, p.pos, 3);
    if (spot && isStandable(s.board, spot)) p.pos = { ...spot };
    else capture(s, p, { kind: 'fall' });
  }
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

export interface Ben10Step {
  to: Coord;
  capture: boolean;
  quiet: boolean;
  leap: boolean;
  uses?: string[];
}

/** Squares reached by passing through pieces (and walls, if allowed), ending on an empty square. */
function phaseSteps(s: GameState, p: Piece, slides: { dir: Coord; max: number }[], walls: boolean, use: string): Ben10Step[] {
  const out: Ben10Step[] = [];
  for (const { dir, max } of slides) {
    let through = false;
    for (let k = 1; k <= max; k++) {
      const c = add(p.pos, scale(dir, k));
      if (!inBounds(s.board, c) || terrainAt(s.board, c) === 'void') break;
      if (isStandable(s.board, c) && isEmpty(s, c)) {
        if (through) out.push({ to: c, capture: false, quiet: true, leap: false, uses: [use] });
      } else if (terrainAt(s.board, c) === 'gap') break;
      else if (!walls && (isWall(s.board, c) || terrainAt(s.board, c) === 'door')) break;
      else through = true;
    }
  }
  return out;
}

/** State-dependent and unusual movement for Ben 10 pieces. */
export function ben10Steps(s: GameState, p: Piece, slides: { dir: Coord; max: number }[]): Ben10Step[] {
  if (sizeOf(p) !== 1 || hasStatus(p, 'bound')) return [];
  const out: Ben10Step[] = [];
  switch (p.type) {
    case 'grey_matter':
    case 'ghostfreak':
      out.push(...phaseSteps(s, p, slides, true, p.type === 'ghostfreak' ? 'ghost_passage' : 'tiny_size'));
      break;
    case 'wildmutt':
      // Predatory Leap: onto an enemy within 3, over pieces and gaps (walls block).
      if (ready(p, 'pounceCd'))
        for (const e of enemiesOf(s, p).filter((e) => sizeOf(e) === 1 && pieceDistance(e, p) <= 3 && pieceDistance(e, p) >= 2 && wallFreeLine(s, p.pos, e.pos)))
          out.push({ to: e.pos, capture: true, quiet: false, leap: true, uses: ['predatory_leap'] });
      break;
    case 'stinkfly':
      // Flight: may end on gaps.
      for (const { dir, max } of slides)
        for (let k = 1; k <= max; k++) {
          const c = add(p.pos, scale(dir, k));
          if (!inBounds(s.board, c) || terrainAt(s.board, c) !== 'gap') {
            if (!inBounds(s.board, c) || blocked(s, c) || pieceAt(s, c)) break;
            continue;
          }
          const o = pieceAt(s, c);
          if (o) {
            if (o.side !== p.side) out.push({ to: c, capture: true, quiet: false, leap: false });
            break;
          }
          out.push({ to: c, capture: false, quiet: true, leap: false });
        }
      break;
    case 'cannonbolt':
      // Crushing Roll: rolls straight through cracked walls (smashing them).
      for (const d of ORTHO) {
        let broke = false;
        for (let k = 1; k <= 4; k++) {
          const c = add(p.pos, scale(d, k));
          if (!inBounds(s.board, c)) break;
          if (terrainAt(s.board, c) === 'cracked') {
            broke = true;
            continue;
          }
          if (!isStandable(s.board, c)) break;
          const o = pieceAt(s, c);
          if (o && o.side === p.side) break;
          if (broke) out.push({ to: c, capture: !!o, quiet: !o, leap: false, uses: ['crushing_roll'] });
          if (o) break;
        }
      }
      break;
  }
  return out;
}

/** Upgrade riding a machine: +1 range. Plumber Badge: +1 next to it. */
export function ben10RangeBonus(s: GameState, p: Piece): number {
  let b = 0;
  if (maskOn(s, p.id)?.piece.type === 'upgrade') b += 1;
  if (s.pieces.some((o) => o.side === p.side && o.id !== p.id && has(o, 'plumber_badge') && pieceDistance(o, p) === 1)) b += 1;
  return b;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export function ben10Moves(s: GameState, p: Piece): Move[] {
  const out: Move[] = [...omnitrixMoves(s, p)];
  const base = { pieceId: p.id, from: p.pos };
  const foes = enemiesOf(s, p);
  const shoot = (action: Move['action'], reach: number, dirs: Coord[]) => {
    for (const d of dirs) {
      const hit = firstInLine(s, p.pos, d, reach);
      if (hit && hit.side !== p.side) out.push({ ...base, to: hit.pos, action, allyId: hit.id });
    }
  };
  const disable = () => {
    for (const e of foes.filter((e) => isMachine(e) && !isBoss(e) && pieceDistance(e, p) <= 3)) out.push({ ...base, to: e.pos, action: 'overload', allyId: e.id });
  };
  switch (p.type) {
    case 'heatblast':
      if (ready(p, 'fireballCd')) shoot('fireball', 4, ALL_DIRS);
      break;
    case 'diamondhead':
      if (ready(p, 'crystalCd')) shoot('crystalShot', 4, ALL_DIRS);
      break;
    case 'grey_matter':
      if (ready(p, 'overloadCd')) disable();
      break;
    case 'upgrade':
      if (ready(p, 'overloadCd')) disable();
      // Technological Fusion: merge into a friendly machine within 3.
      if (!hasStatus(p, 'bound'))
        for (const a of friendsOf(s, p).filter((a) => isMachine(a) && sizeOf(a) === 1 && !maskOn(s, a.id) && pieceDistance(a, p) <= 3 && wallFreeLine(s, p.pos, a.pos)))
          out.push({ ...base, to: a.pos, action: 'maskAttach', allyId: a.id });
      break;
    case 'four_arms':
      if (ready(p, 'poundCd') && (foes.some((e) => pieceDistance(e, p) === 1) || ringCracked(s, p).length)) out.push({ ...base, to: p.pos, action: 'groundPound' });
      break;
    case 'stinkfly':
      if (ready(p, 'slimeCd'))
        for (const e of foes.filter((e) => pieceDistance(e, p) <= 3 && wallFreeLine(s, p.pos, e.pos))) out.push({ ...base, to: e.pos, action: 'slimeSpit', allyId: e.id });
      break;
    case 'ghostfreak':
      if (ready(p, 'possessCd'))
        for (const e of foes.filter((e) => sizeOf(e) === 1 && !isBoss(e) && e.type !== 'king' && pieceDistance(e, p) === 1)) out.push({ ...base, to: e.pos, action: 'possess', allyId: e.id });
      break;
    case 'way_big':
      if (ready(p, 'rayCd'))
        for (const d of ORTHO) if (bandTargets(s, p, d, 6 + (has(p, 'tokustar_energy') ? 2 : 0)).length) out.push({ ...base, to: add(p.pos, d), action: 'cosmicRay', param: `${d.x},${d.y}` });
      break;
    case 'gwen':
      if (ready(p, 'spellCd'))
        for (const e of foes.filter((e) => pieceDistance(e, p) <= 3 && wallFreeLine(s, p.pos, e.pos))) out.push({ ...base, to: e.pos, action: 'spell', allyId: e.id });
      break;
    case 'kevin_11': {
      if (ready(p, 'kevinJumpCd') && !hasStatus(p, 'bound'))
        for (const d of ORTHO) {
          const to = add(p.pos, scale(d, 3));
          if (footprint(p, to).every((c) => isStandable(s.board, c) && (isEmpty(s, c) || pieceAt(s, c)?.id === p.id))) out.push({ ...base, to, action: 'kevinJump' });
        }
      if (kevinPhase(p) >= 2 && ready(p, 'energyCd'))
        for (const e of foes.filter((e) => pieceDistance(e, p) <= 4 && e.type !== 'king')) out.push({ ...base, to: e.pos, action: 'energyBlast', allyId: e.id });
      break;
    }
    case 'vilgax':
      if (ready(p, 'warlordCd') && foes.some((e) => pieceDistance(e, p) === 1)) out.push({ ...base, to: p.pos, action: 'conquer' });
      break;
  }
  return out;
}

const ringCracked = (s: GameState, p: Piece) =>
  footprint(p)
    .flatMap((f) => ALL_DIRS.map((d) => add(f, d)))
    .filter((c) => terrainAt(s.board, c) === 'cracked' && !footprint(p).some((f) => sameCoord(f, c)));

/** Enemies in the band (as wide as the piece) in front of it, up to `reach`; walls stop each lane. */
function bandTargets(s: GameState, p: Piece, d: Coord, reach: number): Piece[] {
  const size = sizeOf(p);
  const hit = new Set<Piece>();
  for (let lane = 0; lane < size; lane++) {
    const start = {
      x: d.x > 0 ? p.pos.x + size - 1 : d.x < 0 ? p.pos.x : p.pos.x + lane,
      y: d.y > 0 ? p.pos.y + size - 1 : d.y < 0 ? p.pos.y : p.pos.y + lane,
    };
    for (let k = 1; k <= reach; k++) {
      const c = add(start, scale(d, k));
      if (blocked(s, c)) break;
      const o = pieceAt(s, c);
      if (o && o.side !== p.side) hit.add(o);
    }
  }
  return [...hit];
}

export function resolveBen10(s: GameState, m: Move): boolean {
  const p = getPiece(s, m.pieceId);
  if (!p) return false;
  const target = getPiece(s, m.allyId);
  switch (m.action) {
    case 'omnitrix':
      transformBen(s, p, m.param as PieceType, m.to);
      return true;
    case 'fireball':
      p.counters.fireballCd = 2;
      if (target) dealDamage(s, target.id, 1, { sourceId: p.id, kind: 'ranged' });
      return true;
    case 'crystalShot':
      p.counters.crystalCd = 3;
      if (target) dealDamage(s, target.id, 1, { sourceId: p.id, kind: 'ranged' });
      return true;
    case 'overload':
      p.counters.overloadCd = 4;
      if (target) {
        addStatus(target, { kind: 'stunned', until: endOfTurn(s.ply, target.side), source: 'overload' });
        log(s, `The ${PIECE_STATS[target.type].name} short-circuits!`);
      }
      return true;
    case 'groundPound':
      p.counters.poundCd = 3;
      log(s, 'Four Arms pounds the ground!');
      for (const e of enemiesOf(s, p).filter((e) => pieceDistance(e, p) === 1)) dealDamage(s, e.id, 1, { sourceId: p.id, kind: 'ability' });
      for (const c of ringCracked(s, p)) destroyCracked(s, c, p);
      return true;
    case 'slimeSpit':
      p.counters.slimeCd = 3;
      if (target) {
        const out = dealDamage(s, target.id, 1, { sourceId: p.id, kind: 'ranged' });
        const still = getPiece(s, target.id);
        if (still && out.kind !== 'captured') addStatus(still, { kind: 'slowed', until: endOfTurn(s.ply, still.side), source: 'slime' });
      }
      return true;
    case 'possess':
      p.counters.possessCd = 4;
      if (target) {
        target.counters.possessedFrom = target.side === 'player' ? 1 : 2;
        target.side = p.side;
        s.bonus.unshift({ pieceId: target.id, filter: 'any', optional: true, source: 'possession' });
        log(s, `Ghostfreak possesses the ${PIECE_STATS[target.type].name}!`);
      }
      return true;
    case 'cosmicRay': {
      p.counters.rayCd = has(p, 'tokustar_energy') ? 3 : 4;
      const [dx, dy] = (m.param ?? '0,1').split(',').map(Number);
      log(s, 'Way Big fires the Cosmic Ray!');
      for (const e of bandTargets(s, p, { x: dx, y: dy }, 6 + (has(p, 'tokustar_energy') ? 2 : 0))) dealDamage(s, e.id, 2, { sourceId: p.id, kind: 'ranged' });
      return true;
    }
    case 'spell':
      p.counters.spellCd = 4;
      if (target) dealDamage(s, target.id, 1, { sourceId: p.id, kind: 'ranged' });
      return true;
    case 'kevinJump':
      p.counters.kevinJumpCd = 3;
      p.pos = { ...m.to };
      return true;
    case 'energyBlast':
      p.counters.energyCd = 3;
      if (target) dealDamage(s, target.id, 1, { sourceId: p.id, kind: 'ranged' });
      return true;
    case 'conquer': {
      const phase = vilgaxPhase(p);
      p.counters.warlordCd = has(p, 'vilgax_cybernetics') ? 2 : 3;
      log(s, 'Vilgax smashes everything around him!');
      for (const e of enemiesOf(s, p).filter((e) => pieceDistance(e, p) === 1)) dealDamage(s, e.id, phase === 3 ? 2 : 1, { sourceId: p.id, kind: 'ability' });
      if (phase === 3) {
        for (const c of ringCracked(s, p)) destroyCracked(s, c, p);
        // Warlord's Wrath: a move after the area attack.
        s.bonus.unshift({ pieceId: p.id, filter: 'any', optional: true, source: 'warlord' });
      }
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Extra direct-attack damage. */
export function ben10AttackBonus(s: GameState, p: Piece, m: Move): number {
  let dmg = 0;
  // Cannonbolt: Rolling Charge after 3+ squares in a line.
  if (p.type === 'cannonbolt' && !m.action && Math.max(Math.abs(m.to.x - m.from.x), Math.abs(m.to.y - m.from.y)) >= 3) dmg += 1;
  // Upgrade merged into this machine.
  if (maskOn(s, p.id)?.piece.type === 'upgrade') dmg += 1;
  return dmg;
}

/** A deterministic coin flip from the battle state. */
function coin(s: GameState, key: string): boolean {
  let h = (s.ply + 11) | 0;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return ((h >>> 0) & 1) === 1;
}

/**
 * Attacks that are negated: Gwen's Magic Shield, XLR8's Speed Dodge (50%),
 * Ghostfreak's Intangibility.
 */
export function ben10Negates(s: GameState, target: Piece, source: Piece | undefined, amount: number): boolean {
  if (amount <= 0) return false;
  const gwen = s.pieces.find((g) => g.type === 'gwen' && g.side === target.side && ready(g, 'shieldCd') && pieceDistance(g, target) <= 3);
  if (gwen) {
    const ben = s.pieces.some((b) => isBen(b) && b.side === gwen.side && pieceDistance(b, gwen) <= 2);
    gwen.counters.shieldCd = ben ? 2 : 3;
    log(s, `Gwen's magic shield protects the ${PIECE_STATS[target.type].name}!`);
    return true;
  }
  if (target.type === 'xlr8' && !target.counters.speedDodge) {
    target.counters.speedDodge = 1;
    if (coin(s, `${target.id}|${target.pos.x},${target.pos.y}|${source?.id ?? ''}|${source?.pos.x},${source?.pos.y}`)) {
      log(s, 'XLR8 is too fast — the attack misses!');
      return true;
    }
  }
  if (target.type === 'ghostfreak' && !hasUsed(target, 'intangible')) {
    markUsed(target, 'intangible');
    log(s, 'The attack passes straight through Ghostfreak!');
    return true;
  }
  return false;
}

/** Diamondhead's Crystal Armor and Cannonbolt's Armored Shell; Vilgax (Phase 2+) shrugs off a point of every ranged hit. */
export function ben10Reduction(target: Piece, dmg: number, kind: DamageKind): number {
  if (dmg <= 0) return dmg;
  if ((target.type === 'diamondhead' || target.type === 'cannonbolt') && !target.counters.alienArmor) {
    target.counters.alienArmor = 1;
    return dmg - 1;
  }
  if (target.type === 'vilgax' && vilgaxPhase(target) >= 2 && kind === 'ranged') return dmg - 1;
  return dmg;
}

/** Enhanced Senses: Wildmutt's range is never reduced. */
export const ben10RangeFloor = (p: Piece, bonus: number) => (p.type === 'wildmutt' ? Math.max(0, bonus) : bonus);

/** Before a move: Crushing Roll smashes the cracked walls on Cannonbolt's path; Vilgax and Way Big flatten what's under them. */
export function ben10BeforeMove(s: GameState, m: Move) {
  const p = getPiece(s, m.pieceId);
  if (!p || m.action) return;
  if (m.uses?.includes('crushing_roll')) {
    const d = sign(sub(m.to, m.from));
    const n = Math.max(Math.abs(m.to.x - m.from.x), Math.abs(m.to.y - m.from.y));
    for (let k = 1; k < n; k++) {
      const c = add(m.from, scale(d, k));
      if (terrainAt(s.board, c) === 'cracked') destroyCracked(s, c, p);
    }
  }
  if (p.type === 'way_big' || p.type === 'vilgax')
    for (const c of footprint(p, m.to)) {
      if (terrainAt(s.board, c) === 'cracked') destroyCracked(s, c, p);
    }
}

/** After a move: cooldowns, Flame Burst, Super Speed, Titanic Stomp, Kevin and Vilgax's extra moves. */
export function ben10AfterMove(s: GameState, m: Move, from: Coord | undefined, entry: Bonus | undefined, captured: number) {
  const p = getPiece(s, m.pieceId);
  if (!p) return;
  if (m.uses?.includes('predatory_leap')) p.counters.pounceCd = 3;
  if (entry?.source === 'super_speed') p.counters.speedCd = 3;
  if (entry?.source === 'breakdown') p.counters.breakdownCd = 3;
  const moved = !!from && !sameCoord(from, p.pos);
  if (captured > 0) {
    // Heatblast: Flame Burst on every other adjacent enemy.
    if (p.type === 'heatblast')
      for (const e of enemiesOf(s, p).filter((e) => pieceDistance(e, p) === 1)) dealDamage(s, e.id, 1, { sourceId: p.id, kind: 'splash' });
    // Kevin 11 (Phase 2+) feeds on what he captures.
    if (p.type === 'kevin_11' && kevinPhase(p) >= 2) heal(s, p, 1);
    // Vilgax (Phase 3): a second capture once per turn.
    if (p.type === 'vilgax' && vilgaxPhase(p) === 3 && entry?.source !== 'warlord' && p.counters.warlordPly !== s.ply) {
      p.counters.warlordPly = s.ply;
      s.bonus.unshift({ pieceId: p.id, filter: 'any', optional: true, source: 'warlord' });
    }
  }
  if (!moved || m.action) return;
  // Way Big: Titanic Stomp.
  if (p.type === 'way_big')
    for (const e of enemiesOf(s, p).filter((e) => pieceDistance(e, p) === 1)) dealDamage(s, e.id, 1, { sourceId: p.id, kind: 'ability' });
  // XLR8: Super Speed — a second move (which may capture), every 3 turns.
  if (p.type === 'xlr8' && ready(p, 'speedCd') && !entry) s.bonus.unshift({ pieceId: p.id, filter: 'any', optional: true, source: 'super_speed' });
  // Kevin 11 (Phase 3): Total Breakdown — move twice, every 3 turns.
  if (p.type === 'kevin_11' && kevinPhase(p) === 3 && ready(p, 'breakdownCd') && !entry) s.bonus.unshift({ pieceId: p.id, filter: 'any', optional: true, source: 'breakdown' });
}

/** End of a ply: transformations run down, and possessed pieces return to their own side. */
export function ben10TurnEnd(s: GameState, side: Side) {
  for (const p of s.pieces) {
    if (p.counters.possessedFrom) {
      p.side = p.counters.possessedFrom === 1 ? 'player' : 'enemy';
      delete p.counters.possessedFrom;
      log(s, `The ${PIECE_STATS[p.type].name} shakes off the possession.`);
    }
    if (p.side === side && p.counters.benForm && p.counters.omniTurns) {
      p.counters.omniTurns -= 1;
      if (p.counters.omniTurns <= 0) revertBen(s, p);
    }
  }
}

