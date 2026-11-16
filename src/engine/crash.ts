/**
 * Crash Bandicoot Content Pack pieces: abilities, actions and the hooks that
 * run around attacks, damage, moves and turns. Movement patterns live in
 * movement.ts (basePatterns); this module adds the state-dependent parts.
 */
import { inBounds, isStandable, isWall, terrainAt } from './board';
import {
  ALL_DIRS,
  DIAG,
  ORTHO,
  add,
  addStatus,
  dealDamage,
  distanceTo,
  getPiece,
  hasStatus,
  hasUsed,
  heal,
  immuneToForcedMove,
  isBoss,
  isEmpty,
  log,
  markUsed,
  nameOf,
  nearestEmpty,
  pieceAt,
  pieceDistance,
  scale,
  sign,
  sub,
} from './core';
import { bounceSquares } from './crates';
import { PIECE_STATS, footprint, sizeOf } from './pieces';
import { Bonus, Coord, GameState, Move, Piece, Side, endOfTurn, sameCoord } from './types';

/** "Once every N turns", in the owner's turns. */
export const CRASH_COOLDOWNS = {
  slideJumpCd: 3,
  hackCd: 4,
  bodyguardCd: 3,
  spiritCd: 3,
  grappleCd: 3,
  rayGunCd: 3,
  missileCd: 3,
  vacuumCd: 3,
  darkProtCd: 3,
  momentumCd: 3,
  sprintCd: 3,
  potionCd: 4,
} as const;
const ready = (p: Piece, cd: string) => (p.counters[cd] ?? 0) <= 0;

/** Machines (Cortex's Evil Genius and N. Gin's Mechanical Reinforcement help these). */
export const MECHANICAL = new Set<string>(['n_gin', 'siege', 'metal_sonic', 'motobug', 'buzz_bomber', 'crabmeat', 'death_egg']);

/** N. Tropy's phase by HP (3 = Temporal Distortion, 2 = Time Reversal, 1 = Temporal Collapse); 0 for anything else. */
export const tropyPhase = (p: Piece) => (p.type !== 'n_tropy' ? 0 : p.hp >= 3 ? 1 : p.hp === 2 ? 2 : 3);
const TROPY_WARP_CD = [0, 3, 2, 1];

const friendsOf = (s: GameState, p: Piece) => s.pieces.filter((a) => a.side === p.side && a.id !== p.id);
const enemiesOf = (s: GameState, p: Piece) => s.pieces.filter((e) => e.side !== p.side);

/** Squares along a straight line from `from` to `to` (exclusive of both ends). */
function between(from: Coord, to: Coord): Coord[] {
  const n = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  const out: Coord[] = [];
  for (let i = 1; i < n; i++) {
    const c = { x: Math.round(from.x + ((to.x - from.x) * i) / n), y: Math.round(from.y + ((to.y - from.y) * i) / n) };
    if (!out.some((o) => sameCoord(o, c))) out.push(c);
  }
  return out;
}

/** No wall on the line between two squares (pieces don't matter). */
export const wallFreeLine = (s: GameState, from: Coord, to: Coord) => between(from, to).every((c) => !isWall(s.board, c));

/** The first piece within `reach` along a direction; walls stop the line. */
function firstInLine(s: GameState, from: Coord, d: Coord, reach: number): Piece | undefined {
  for (let k = 1; k <= reach; k++) {
    const c = add(from, scale(d, k));
    if (!inBounds(s.board, c) || isWall(s.board, c) || terrainAt(s.board, c) === 'cracked') return undefined;
    const o = pieceAt(s, c);
    if (o) return o;
  }
  return undefined;
}

const masksOf = (s: GameState) => s.masks ?? [];
/** Aku Aku riding on this piece, if any. */
export const maskOn = (s: GameState, hostId: string) => masksOf(s).find((m) => m.hostId === hostId);

/** Squares for a 2×2 warp: every empty, standable footprint within 4 (not adjacent to where it stands). */
function tropyWarps(s: GameState, p: Piece): Coord[] {
  const out: Coord[] = [];
  for (let dy = -4; dy <= 4; dy++)
    for (let dx = -4; dx <= 4; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 2) continue;
      const to = { x: p.pos.x + dx, y: p.pos.y + dy };
      const clear = footprint(p, to).every((c) => {
        if (!isStandable(s.board, c)) return false;
        const o = pieceAt(s, c);
        return !o || o.id === p.id;
      });
      if (clear) out.push(to);
    }
  return out;
}

/** Abilities and actions of Crash Pack pieces (each replaces the piece's move). */
export function crashMoves(s: GameState, p: Piece): Move[] {
  const out: Move[] = [];
  const base = { pieceId: p.id, from: p.pos };
  const bound = hasStatus(p, 'bound');
  const foes = enemiesOf(s, p);
  switch (p.type) {
    case 'coco':
      // Hacking: an enemy within 3 can't move or use abilities on its next turn.
      if (ready(p, 'hackCd'))
        for (const e of foes.filter((e) => !isBoss(e) && pieceDistance(e, p) <= 3)) out.push({ ...base, to: e.pos, action: 'hack', allyId: e.id });
      break;
    case 'aku_aku':
      // Guardian Mask: settle onto a friendly piece within reach.
      if (!bound)
        for (const a of friendsOf(s, p).filter((a) => sizeOf(a) === 1 && !maskOn(s, a.id) && pieceDistance(a, p) <= 3 && wallFreeLine(s, p.pos, a.pos)))
          out.push({ ...base, to: a.pos, action: 'maskAttach', allyId: a.id });
      break;
    case 'tawna':
      // Grappling Hook: to an empty square next to a wall or cracked wall within 4.
      if (ready(p, 'grappleCd') && !bound) for (const c of grappleSquares(s, p, 4)) out.push({ ...base, to: c, action: 'grapple' });
      break;
    case 'cortex':
      // Ray Gun: the first piece within 4 in a straight orthogonal line, if it's an enemy.
      if (ready(p, 'rayGunCd'))
        for (const d of ORTHO) {
          const hit = firstInLine(s, p.pos, d, 4);
          if (hit && hit.side !== p.side) out.push({ ...base, to: hit.pos, action: 'rayGun', allyId: hit.id });
        }
      break;
    case 'n_gin':
      // Missile Launcher: any enemy within 4, over pieces but not through walls.
      if (ready(p, 'missileCd'))
        for (const e of foes.filter((e) => e.type !== 'king' && pieceDistance(e, p) <= 4 && wallFreeLine(s, p.pos, e.pos)))
          out.push({ ...base, to: e.pos, action: 'gnMissile', allyId: e.id });
      break;
    case 'dingodile':
      // Vacuum Cannon: pull a 1×1 enemy within 3 one square closer.
      if (ready(p, 'vacuumCd'))
        for (const e of foes.filter((e) => sizeOf(e) === 1 && !isBoss(e) && pieceDistance(e, p) <= 3 && pieceDistance(e, p) >= 2)) {
          const to = add(e.pos, sign(sub(p.pos, e.pos)));
          if (isEmpty(s, to) && !immuneToForcedMove(s, e, p, true)) out.push({ ...base, to, action: 'vacuum', allyId: e.id });
        }
      break;
    case 'uka_uka':
      // Dark Protection: an adjacent ally shrugs off its next attack.
      if (ready(p, 'darkProtCd'))
        for (const a of friendsOf(s, p).filter((a) => pieceDistance(a, p) === 1 && !hasStatus(a, 'prophecy')))
          out.push({ ...base, to: a.pos, action: 'darkProtection', allyId: a.id });
      break;
    case 'brio':
      if (!hasUsed(p, 'monster')) out.push({ ...base, to: p.pos, action: 'transform' });
    // falls through: the Mutagenic Potion works in either form
    case 'brio_monster':
      if (ready(p, 'potionCd'))
        for (const a of friendsOf(s, p).filter((a) => pieceDistance(a, p) === 1)) out.push({ ...base, to: a.pos, action: 'mutagen', allyId: a.id });
      break;
    case 'n_tropy': {
      if (ready(p, 'tropyWarpCd') && !bound) for (const to of tropyWarps(s, p)) out.push({ ...base, to, action: 'tropyWarp' });
      if (tropyPhase(p) >= 2 && !hasUsed(p, 'time_rewind') && p.hp < p.maxHp) out.push({ ...base, to: p.pos, action: 'timeRewind' });
      break;
    }
  }
  // Tawna's Acrobatic Strike: the bonus hop goes one square diagonally.
  if (p.type === 'tawna' && s.bonus[0]?.source === 'acrobatic_strike' && s.bonus[0].pieceId === p.id)
    for (const d of DIAG) {
      const c = add(p.pos, d);
      if (isEmpty(s, c)) out.push({ ...base, to: c, param: 'acrobatic' });
    }
  // Bounce Crate: the bonus jump, exactly two squares any direction.
  if (s.bonus[0]?.source === 'bounce_crate' && s.bonus[0].pieceId === p.id)
    for (const c of bounceSquares(s, p)) out.push({ ...base, to: c, param: 'bounce' });
  // A piece wearing Aku Aku may set him down on an empty square next to it instead of moving.
  if (maskOn(s, p.id))
    for (const d of ALL_DIRS) {
      const c = add(p.pos, d);
      if (isEmpty(s, c)) out.push({ ...base, to: c, action: 'maskDetach' });
    }
  return out;
}

/** Empty squares within `reach` that touch a wall or cracked wall. */
export function grappleSquares(s: GameState, p: Piece, reach: number): Coord[] {
  const out: Coord[] = [];
  for (let dy = -reach; dy <= reach; dy++)
    for (let dx = -reach; dx <= reach; dx++) {
      const c = { x: p.pos.x + dx, y: p.pos.y + dy };
      if ((dx === 0 && dy === 0) || !isEmpty(s, c)) continue;
      const touches = ALL_DIRS.some((d) => {
        const q = add(c, d);
        return inBounds(s.board, q) && (terrainAt(s.board, q) === 'wall' || terrainAt(s.board, q) === 'cracked');
      });
      if (touches) out.push(c);
    }
  return out;
}

/** Resolve a Crash Pack action; false if the move isn't one. */
export function resolveCrash(s: GameState, m: Move): boolean {
  const p = getPiece(s, m.pieceId);
  if (!p) return false;
  const target = getPiece(s, m.allyId);
  switch (m.action) {
    case 'hack':
      p.counters.hackCd = CRASH_COOLDOWNS.hackCd;
      if (target) {
        addStatus(target, { kind: 'stunned', until: endOfTurn(s.ply, target.side), source: 'hack' });
        log(s, `Coco hacks the ${PIECE_STATS[target.type].name}!`);
      }
      return true;
    case 'maskAttach':
      if (target) {
        s.pieces = s.pieces.filter((o) => o.id !== p.id);
        s.masks = [...masksOf(s), { hostId: target.id, piece: p }];
        log(s, `Aku Aku settles onto the ${PIECE_STATS[target.type].name}.`);
      }
      return true;
    case 'maskDetach': {
      const mask = maskOn(s, p.id);
      if (mask) {
        s.masks = masksOf(s).filter((x) => x !== mask);
        mask.piece.pos = { ...m.to };
        s.pieces.push(mask.piece);
        log(s, 'Aku Aku floats free.');
      }
      return true;
    }
    case 'grapple':
      p.counters.grappleCd = CRASH_COOLDOWNS.grappleCd;
      p.pos = { ...m.to };
      return true;
    case 'rayGun':
      p.counters.rayGunCd = CRASH_COOLDOWNS.rayGunCd;
      if (target) dealDamage(s, target.id, 1, { sourceId: p.id, kind: 'ranged' });
      return true;
    case 'gnMissile':
      p.counters.missileCd = CRASH_COOLDOWNS.missileCd;
      if (target) dealDamage(s, target.id, 1, { sourceId: p.id, kind: 'ranged' });
      return true;
    case 'vacuum':
      p.counters.vacuumCd = CRASH_COOLDOWNS.vacuumCd;
      if (target && isEmpty(s, m.to)) {
        target.pos = { ...m.to };
        log(s, `Dingodile vacuums the ${PIECE_STATS[target.type].name} closer.`);
      }
      return true;
    case 'darkProtection':
      p.counters.darkProtCd = CRASH_COOLDOWNS.darkProtCd;
      if (target) addStatus(target, { kind: 'prophecy', until: null, source: 'uka_uka' });
      return true;
    case 'mutagen':
      p.counters.potionCd = CRASH_COOLDOWNS.potionCd;
      if (target) addStatus(target, { kind: 'damageBuff', amount: 1, until: null, source: 'mutagen' });
      return true;
    case 'transform':
      markUsed(p, 'monster');
      p.type = 'brio_monster';
      p.maxHp = 3;
      p.hp = Math.min(3, p.hp + 2);
      // Three turns as a monster, counted down at the end of each of his turns (this one included).
      p.counters.monsterTurns = 4;
      log(s, 'Dr. N. Brio drinks the potion and becomes a monster!');
      return true;
    case 'tropyWarp': {
      p.counters.tropyWarpCd = TROPY_WARP_CD[tropyPhase(p)];
      p.pos = { ...m.to };
      log(s, 'N. Tropy bends time and reappears!');
      for (const e of enemiesOf(s, p).filter((e) => pieceDistance(e, p) === 1))
        addStatus(e, { kind: 'bound', until: endOfTurn(s.ply, e.side), source: 'temporal_distortion' });
      return true;
    }
    case 'timeRewind':
      markUsed(p, 'time_rewind');
      heal(s, p, 1);
      log(s, 'N. Tropy reverses time and recovers!');
      return true;
  }
  return false;
}

/** Extra damage from Crash Pack piece abilities. */
export function crashAttackBonus(s: GameState, p: Piece, m: Move): number {
  let dmg = 0;
  // Tiny Tiger: Savage Leap — captures with the 2-square jump hit for 2.
  if (p.type === 'tiny' && m.leap) dmg += 1;
  // Polar: Charging Run — 2 damage after moving at least 3 squares in a line.
  if (p.type === 'polar' && !m.action && Math.max(Math.abs(m.to.x - m.from.x), Math.abs(m.to.y - m.from.y)) >= 3) dmg += 1;
  return dmg;
}

/**
 * After an attack resolves: Crash's Spin Attack (the enemy behind the target)
 * and Dingodile's Tail Swipe (another enemy next to him).
 */
export function crashAfterAttack(s: GameState, p: Piece, m: Move, targetPos: Coord, targetIds: string[]) {
  if (m.action === 'shoot' || !getPiece(s, p.id)) return;
  if (p.type === 'crash') {
    const behind = pieceAt(s, add(targetPos, sign(sub(targetPos, m.from))));
    if (behind && behind.side !== p.side && !targetIds.includes(behind.id)) {
      log(s, 'Spin Attack!');
      dealDamage(s, behind.id, 1, { sourceId: p.id, kind: 'splash' });
    }
  }
  if (p.type === 'dingodile' && pieceDistanceFrom(m.from, targetPos) === 1) {
    const other = enemiesOf(s, p)
      .filter((e) => !targetIds.includes(e.id) && pieceDistance(e, p) === 1)
      .sort((a, b) => PIECE_STATS[b.type].value - PIECE_STATS[a.type].value)[0];
    if (other) {
      log(s, 'Tail Swipe!');
      dealDamage(s, other.id, 1, { sourceId: p.id, kind: 'splash' });
    }
  }
}
const pieceDistanceFrom = (a: Coord, b: Coord) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** A deterministic coin flip from the battle state (so replays and the AI agree). */
function coin(s: GameState, key: string): boolean {
  let h = (s.ply + 1) | 0;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  // Final mix so every input bit reaches the bit we read.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return ((h >>> 0) & 1) === 1;
}

/**
 * Damage-time defenses, before shields and HP: Aku Aku's Protective Spirit,
 * Ripper Roo's Unpredictable, and Coco's Quick Thinking / Pura's Quick
 * Reflexes. Returns true if the attack is negated.
 */
export function crashNegates(s: GameState, target: Piece, source: Piece | undefined, amount: number): boolean {
  if (amount <= 0) return false;
  // Aku Aku: Protective Spirit (a free mask guards only its host; one on a host guards that host).
  const host = maskOn(s, target.id);
  if (host && ready(host.piece, 'spiritCd')) {
    host.piece.counters.spiritCd = CRASH_COOLDOWNS.spiritCd;
    log(s, `Aku Aku protects the ${PIECE_STATS[target.type].name}!`);
    return true;
  }
  const aku = s.pieces.find((a) => a.type === 'aku_aku' && a.side === target.side && ready(a, 'spiritCd') && pieceDistance(a, target) <= 2);
  if (aku) {
    aku.counters.spiritCd = CRASH_COOLDOWNS.spiritCd;
    log(s, `Aku Aku's Protective Spirit shields the ${PIECE_STATS[target.type].name}!`);
    return true;
  }
  // Ripper Roo: Unpredictable — the first attack on him each battle misses half the time.
  if (target.type === 'ripper_roo' && !target.counters.unpredictable) {
    target.counters.unpredictable = 1;
    if (coin(s, `${target.id}|${target.pos.x},${target.pos.y}|${source?.id ?? ''}|${source?.pos.x},${source?.pos.y}`)) {
      log(s, 'Ripper Roo bounces out of the way!');
      return true;
    }
  }
  // Coco (Quick Thinking) and Pura (Quick Reflexes): once per battle, step aside.
  if ((target.type === 'coco' || target.type === 'pura') && !hasUsed(target, 'dodge')) {
    const foes = enemiesOf(s, target);
    const score = (c: Coord) => (source ? distanceTo(source, c) * 10 : 0) - foes.filter((e) => distanceTo(e, c) <= 1).length;
    const spot = ALL_DIRS.map((d) => add(target.pos, d))
      .filter((c) => isEmpty(s, c))
      .sort((a, b) => score(b) - score(a))[0];
    if (spot) {
      markUsed(target, 'dodge');
      target.pos = { ...spot };
      log(s, `${nameOf(target)} dodges!`);
      return true;
    }
  }
  return false;
}

/** N. Gin's Mechanical Reinforcement: an adjacent machine ignores its first point of damage each battle. */
export function crashReduction(s: GameState, target: Piece, dmg: number): number {
  if (dmg <= 0 || !MECHANICAL.has(target.type) || target.counters.ginArmor) return dmg;
  if (!s.pieces.some((g) => g.type === 'n_gin' && g.side === target.side && g.id !== target.id && pieceDistance(g, target) === 1)) return dmg;
  target.counters.ginArmor = 1;
  log(s, `N. Gin's plating absorbs a point of damage.`);
  return dmg - 1;
}

/** Range modifiers: Cortex's Evil Genius (+1 for nearby machines) and Uka Uka's Corrupting Presence (−1). */
export function crashRangeBonus(s: GameState, p: Piece): number {
  let b = 0;
  if (MECHANICAL.has(p.type) && s.pieces.some((c) => c.type === 'cortex' && c.side === p.side && pieceDistance(c, p) <= 2)) b += 1;
  if (s.pieces.some((u) => u.type === 'uka_uka' && u.side !== p.side && pieceDistance(u, p) <= 2)) b -= 1;
  return b;
}
/** Quick check so the range code can skip the scan when no Crash piece could matter. */
export const crashAuraPresent = (s: GameState) => s.pieces.some((c) => c.type === 'cortex' || c.type === 'uka_uka');

/** Tiny Tiger's Intimidation: pieces next to an enemy Tiny can't teleport or reposition themselves. */
const TELEPORT_ACTIONS = new Set(['teleport', 'chaosControl', 'darkWarp', 'swap', 'grapple', 'tropyWarp', 'carry', 'maskAttach']);
const TELEPORT_UPGRADES = new Set([
  'farores_wind', 'chaos_control', 'dimensional_shift', 'royal_swap', 'summon_swap', 'emergency_evacuation', 'army_recall',
  'grappling_hook', 'lani_loli',
]);
export function intimidated(s: GameState, p: Piece, moves: Move[]): Move[] {
  if (!s.pieces.some((t) => t.type === 'tiny' && t.side !== p.side && pieceDistance(t, p) === 1)) return moves;
  return moves.filter((m) => !(m.action && TELEPORT_ACTIONS.has(m.action)) && !(m.action === 'upgrade' && TELEPORT_UPGRADES.has(m.upgrade!)));
}

/**
 * After a move: start cooldowns used by pattern abilities, and offer bonus
 * moves (Tawna's Acrobatic Strike, Ripper Roo's Wild Bounce, Polar's
 * Momentum, Pura's Agile Sprint). N. Tropy's Temporal Collapse hits everything
 * next to him after he moves.
 */
export function crashAfterMove(s: GameState, m: Move, from: Coord | undefined, entry: Bonus | undefined, captured: boolean) {
  const p = getPiece(s, m.pieceId);
  if (!p) return;
  if (m.uses?.includes('slide_jump')) p.counters.slideJumpCd = CRASH_COOLDOWNS.slideJumpCd;
  if (entry?.source === 'momentum') p.counters.momentumCd = CRASH_COOLDOWNS.momentumCd;
  if (entry?.source === 'agile_sprint') p.counters.sprintCd = CRASH_COOLDOWNS.sprintCd;
  const moved = !!from && !sameCoord(from, p.pos);
  const ordinary = !m.action || m.action === 'upgrade';
  if (!moved || !ordinary || m.action === 'upgrade') {
    if (p.type === 'n_tropy' && moved && tropyPhase(p) === 3) collapse(s, p);
    return;
  }
  const bonusFrom = entry?.source;
  if (captured) {
    if (p.type === 'tawna' && bonusFrom !== 'acrobatic_strike') {
      // Acrobatic Strike: one square diagonally to an empty square.
      const spots = DIAG.map((d) => add(p.pos, d)).filter((c) => isEmpty(s, c));
      if (spots.length) s.bonus.unshift({ pieceId: p.id, filter: 'nonCapturing', optional: true, source: 'acrobatic_strike', maxDistance: 1 });
    }
    if (p.type === 'ripper_roo' && bonusFrom !== 'wild_bounce')
      s.bonus.unshift({ pieceId: p.id, filter: 'nonCapturing', optional: true, source: 'wild_bounce' });
  }
  if (p.type === 'polar' && ready(p, 'momentumCd') && bonusFrom !== 'momentum' && from) {
    const d = sign(sub(p.pos, from));
    const next = add(p.pos, d);
    if ((d.x === 0 || d.y === 0) && isEmpty(s, next))
      s.bonus.unshift({ pieceId: p.id, filter: 'nonCapturing', optional: true, source: 'momentum', to: next });
  }
  if (p.type === 'pura' && ready(p, 'sprintCd') && bonusFrom !== 'agile_sprint')
    s.bonus.unshift({ pieceId: p.id, filter: 'nonCapturing', optional: true, source: 'agile_sprint' });
  if (p.type === 'n_tropy' && tropyPhase(p) === 3) collapse(s, p);
}

/** Temporal Collapse: 1 damage to every enemy next to N. Tropy. */
function collapse(s: GameState, p: Piece) {
  for (const e of enemiesOf(s, p).filter((e) => pieceDistance(e, p) === 1)) dealDamage(s, e.id, 1, { sourceId: p.id, kind: 'ability' });
}

/** End of a side's turn: masks' cooldowns tick, and Brio's transformation runs down. */
export function crashTurnEnd(s: GameState, side: Side) {
  for (const mk of masksOf(s)) {
    if (mk.piece.side !== side) continue;
    for (const k of Object.keys(mk.piece.counters)) if (k.endsWith('Cd') && mk.piece.counters[k] > 0) mk.piece.counters[k] -= 1;
  }
  for (const b of s.pieces.filter((b) => b.side === side && b.type === 'brio_monster')) {
    b.counters.monsterTurns = (b.counters.monsterTurns ?? 1) - 1;
    if (b.counters.monsterTurns <= 0) {
      b.type = 'brio';
      b.maxHp = 1;
      b.hp = 1;
      log(s, 'Dr. N. Brio shrinks back to normal.');
    }
  }
}

/** A captured host drops Aku Aku next to where it fell (or he is lost with it). */
export function crashOnCaptured(s: GameState, p: Piece) {
  const mask = maskOn(s, p.id);
  if (!mask) return;
  s.masks = masksOf(s).filter((x) => x !== mask);
  const spot = nearestEmpty(s, p.pos, 2);
  if (spot) {
    mask.piece.pos = { ...spot };
    s.pieces.push(mask.piece);
    log(s, 'Aku Aku slips free of his fallen host.');
  } else s.captured.push(mask.piece);
}
