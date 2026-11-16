/**
 * Super Mario Content Pack pieces: state-dependent movement (Super Jump,
 * High Jump, Flutter Jump, Shell Slide, Boo's Ghostly Passage), abilities and
 * actions, and the hooks around attacks, damage, moves and turns. Base
 * movement patterns live in movement.ts.
 */
import { inBounds, isBarrier, isStandable, isWall, terrainAt } from './board';
import {
  ALL_DIRS,
  DIAG,
  ORTHO,
  add,
  addShield,
  addStatus,
  dealDamage,
  destroyCracked,
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
  pieceAt,
  pieceDistance,
  scale,
} from './core';
import type { DamageKind } from './core';
import { PIECE_STATS, footprint, sizeOf } from './pieces';
import { Bonus, Coord, GameState, Move, Piece, endOfTurn, forward, sameCoord } from './types';

export const MARIO_COOLDOWNS = {
  superJumpCd: 3,
  highJumpCd: 3,
  flutterCd: 3,
  supportCd: 3,
  mushroomCd: 4,
  trickCd: 3,
  lumaCd: 4,
  spinCd: 3,
  shellSlideCd: 3,
  hammerCd: 2,
} as const;
const ready = (p: Piece, cd: string) => (p.counters[cd] ?? 0) <= 0;

/** Gold a Wario earns the player for each capture (paid when the battle is won). */
export const WARIO_GREED_GOLD = 8;

/** Bowser's phase by HP (3 = King of the Koopas, 2 = Spiked Shell, 1 = Bowser's Fury); 0 for anything else. */
export const bowserPhase = (p: Piece) => (p.type !== 'bowser' ? 0 : p.hp >= 3 ? 1 : p.hp === 2 ? 2 : 3);

const friendsOf = (s: GameState, p: Piece) => s.pieces.filter((a) => a.side === p.side && a.id !== p.id);
const enemiesOf = (s: GameState, p: Piece) => s.pieces.filter((e) => e.side !== p.side);

/** A step for stepsFor (structurally the same as movement.ts's Step). */
export interface MarioStep {
  to: Coord;
  capture: boolean;
  quiet: boolean;
  leap: boolean;
  uses: string[];
}

/** Movement that depends on cooldowns or passes through things. */
export function marioSteps(s: GameState, p: Piece): MarioStep[] {
  const out: MarioStep[] = [];
  if (hasStatus(p, 'bound')) return out;
  const land = (c: Coord, uses: string, leap = true, quietOnly = false) => {
    if (!isStandable(s.board, c)) return;
    const o = pieceAt(s, c);
    if (o && (o.side === p.side || quietOnly)) return;
    out.push({ to: c, capture: !!o, quiet: !o, leap, uses: [uses] });
  };
  switch (p.type) {
    case 'mario':
      // Super Jump: exactly 3 in any direction, over anything.
      if (ready(p, 'superJumpCd')) for (const d of ALL_DIRS) land(add(p.pos, scale(d, 3)), 'super_jump');
      break;
    case 'luigi':
      // High Jump: exactly 4 vertically, over anything.
      if (ready(p, 'highJumpCd'))
        for (const dy of [-4, 4]) land({ x: p.pos.x, y: p.pos.y + dy }, 'high_jump');
      break;
    case 'yoshi':
      // Flutter Jump: up to 4 any direction, over gaps and pieces but not walls.
      if (ready(p, 'flutterCd'))
        for (const d of ALL_DIRS)
          for (let k = 3; k <= 4; k++) {
            const c = add(p.pos, scale(d, k));
            let blocked = false;
            for (let i = 1; i < k; i++) if (isWall(s.board, add(p.pos, scale(d, i)))) blocked = true;
            if (!blocked) land(c, 'flutter_jump');
          }
      break;
    case 'koopa':
      // Shell Slide: up to 4 orthogonally; an attack at the end hits for 2.
      if (ready(p, 'shellSlideCd'))
        for (const d of ORTHO)
          for (let k = 1; k <= 4; k++) {
            const c = add(p.pos, scale(d, k));
            if (!isStandable(s.board, c)) break;
            const o = pieceAt(s, c);
            if (o) {
              if (o.side !== p.side) out.push({ to: c, capture: true, quiet: false, leap: false, uses: ['shell_slide'] });
              break;
            }
            if (k >= 3) out.push({ to: c, capture: false, quiet: true, leap: false, uses: ['shell_slide'] });
          }
      break;
    case 'boo':
      // Ghostly Passage: through walls, cracked walls and pieces, ending on an empty square.
      for (const [dirs, max] of [
        [DIAG, 3],
        [ORTHO, 2],
      ] as [Coord[], number][])
        for (const d of dirs) {
          let through = false;
          for (let k = 1; k <= max; k++) {
            const c = add(p.pos, scale(d, k));
            if (!inBounds(s.board, c) || terrainAt(s.board, c) === 'void') break;
            if (isStandable(s.board, c) && isEmpty(s, c)) {
              if (through) out.push({ to: c, capture: false, quiet: true, leap: false, uses: ['ghostly_passage'] });
            } else if (terrainAt(s.board, c) !== 'gap') through = true;
          }
        }
      break;
  }
  return out;
}

/** Abilities that replace a piece's move. */
export function marioMoves(s: GameState, p: Piece): Move[] {
  const out: Move[] = [];
  const base = { pieceId: p.id, from: p.pos };
  const foes = enemiesOf(s, p);
  switch (p.type) {
    case 'peach':
      if (ready(p, 'supportCd'))
        for (const a of friendsOf(s, p).filter((a) => a.hp < a.maxHp && pieceDistance(a, p) <= 2)) out.push({ ...base, to: a.pos, action: 'royalSupport', allyId: a.id });
      break;
    case 'yoshi':
      // Tongue Grab: an enemy down to its last HP within 2 orthogonally, nothing in between.
      for (const d of ORTHO)
        for (let k = 1; k <= 2; k++) {
          const c = add(p.pos, scale(d, k));
          if (!inBounds(s.board, c) || isBarrier(s.board, c)) break;
          const o = pieceAt(s, c);
          if (!o) continue;
          if (o.side !== p.side && o.hp === 1 && o.shields.length === 0 && sizeOf(o) === 1) out.push({ ...base, to: c, action: 'tongue', allyId: o.id });
          break;
        }
      break;
    case 'toad':
      if (ready(p, 'mushroomCd'))
        for (const a of friendsOf(s, p).filter((a) => pieceDistance(a, p) === 1 && (a.maxHp < 3 || a.hp < a.maxHp)))
          out.push({ ...base, to: a.pos, action: 'mushroom', allyId: a.id });
      break;
    case 'waluigi':
      if (ready(p, 'trickCd') && !hasStatus(p, 'bound'))
        for (const e of foes.filter((e) => sizeOf(e) === 1 && !isBoss(e) && pieceDistance(e, p) === 1 && !immuneToForcedMove(s, e, p, true)))
          out.push({ ...base, to: e.pos, action: 'dirtyTrick', allyId: e.id });
      break;
    case 'rosalina':
      if (ready(p, 'lumaCd'))
        for (const a of friendsOf(s, p).filter((a) => pieceDistance(a, p) <= 3)) out.push({ ...base, to: a.pos, action: 'lumaShield', allyId: a.id });
      if (ready(p, 'spinCd') && foes.some((e) => pieceDistance(e, p) === 1)) out.push({ ...base, to: p.pos, action: 'starSpin' });
      break;
    case 'hammer_bro': {
      if (!ready(p, 'hammerCd')) break;
      const targets = hammerTargets(s, p);
      for (const t of targets) out.push({ ...base, to: t.pos, action: 'hammer', allyId: t.id });
      // Double Trouble: with another Hammer Bro within 2, two different enemies at once.
      if (friendsOf(s, p).some((h) => h.type === 'hammer_bro' && pieceDistance(h, p) <= 2))
        for (let i = 0; i < targets.length; i++)
          for (let j = i + 1; j < targets.length; j++) out.push({ ...base, to: targets[i].pos, action: 'hammer', allyId: targets[i].id, param: targets[j].id });
      break;
    }
    case 'bowser': {
      const phase = bowserPhase(p);
      if (ready(p, 'fireCd'))
        for (const d of ORTHO) if (fireLine(s, p, d).length) out.push({ ...base, to: add(p.pos, d), action: 'fireBreath', param: `${d.x},${d.y}` });
      if (phase === 3 && ready(p, 'slamCd') && foes.some((e) => pieceDistance(e, p) === 1)) out.push({ ...base, to: p.pos, action: 'groundSlam' });
      break;
    }
  }
  // Mario's Stomp and Toad's Quick Delivery: the bonus step they're owed.
  const b = s.bonus[0];
  if (b?.pieceId === p.id && (b.source === 'stomp' || b.source === 'quick_delivery'))
    for (const d of b.source === 'stomp' ? ORTHO : ALL_DIRS) {
      const c = add(p.pos, d);
      if (isStandable(s.board, c) && isEmpty(s, c)) out.push({ ...base, to: c, param: b.source });
    }
  return out;
}

/** Enemies a Hammer Bro can hit: up to 3 orthogonally, over at most one piece or wall. */
function hammerTargets(s: GameState, p: Piece): Piece[] {
  const out: Piece[] = [];
  for (const d of ORTHO) {
    let obstacles = 0;
    for (let k = 1; k <= 3; k++) {
      const c = add(p.pos, scale(d, k));
      if (!inBounds(s.board, c)) break;
      const o = pieceAt(s, c);
      if (o && o.side !== p.side && obstacles <= 1) {
        out.push(o);
        break;
      }
      if (o || isBarrier(s.board, c)) obstacles++;
      if (obstacles > 1) break;
    }
  }
  return out;
}

/** Enemies in the 2-wide band in front of Bowser, nearest first; walls block each lane. */
function fireLine(s: GameState, p: Piece, d: Coord): Piece[] {
  const reach = bowserPhase(p) >= 2 ? 4 : 3;
  const size = sizeOf(p);
  const hit = new Map<string, { piece: Piece; dist: number }>();
  for (let lane = 0; lane < size; lane++) {
    // Start from the edge of the footprint facing `d`.
    const start = {
      x: d.x > 0 ? p.pos.x + size - 1 : d.x < 0 ? p.pos.x : p.pos.x + lane,
      y: d.y > 0 ? p.pos.y + size - 1 : d.y < 0 ? p.pos.y : p.pos.y + lane,
    };
    for (let k = 1; k <= reach; k++) {
      const c = add(start, scale(d, k));
      if (!inBounds(s.board, c) || isWall(s.board, c) || terrainAt(s.board, c) === 'cracked') break;
      const o = pieceAt(s, c);
      if (o && o.side !== p.side && (!hit.has(o.id) || hit.get(o.id)!.dist > k)) hit.set(o.id, { piece: o, dist: k });
    }
  }
  return [...hit.values()].sort((a, b) => a.dist - b.dist).map((h) => h.piece);
}

/** Resolve a Mario Pack action; false if the move isn't one. */
export function resolveMario(s: GameState, m: Move): boolean {
  const p = getPiece(s, m.pieceId);
  if (!p) return false;
  const target = getPiece(s, m.allyId);
  switch (m.action) {
    case 'royalSupport':
      p.counters.supportCd = MARIO_COOLDOWNS.supportCd;
      if (target) heal(s, target, 1);
      return true;
    case 'tongue':
      log(s, 'Yoshi gulps it down!');
      if (target) dealDamage(s, target.id, 1, { sourceId: p.id, kind: 'attack' });
      return true;
    case 'mushroom':
      p.counters.mushroomCd = MARIO_COOLDOWNS.mushroomCd;
      if (target) {
        if (target.maxHp < 3) target.maxHp += 1;
        heal(s, target, 1);
        log(s, `Toad hands the ${PIECE_STATS[target.type].name} a Super Mushroom!`);
      }
      // Quick Delivery: then a step to an empty square.
      if (ALL_DIRS.some((d) => isEmpty(s, add(p.pos, d)) && isStandable(s.board, add(p.pos, d))))
        s.bonus.unshift({ pieceId: p.id, filter: 'nonCapturing', optional: true, source: 'quick_delivery', maxDistance: 1 });
      return true;
    case 'dirtyTrick':
      p.counters.trickCd = MARIO_COOLDOWNS.trickCd;
      if (target) {
        [p.pos, target.pos] = [{ ...target.pos }, { ...p.pos }];
        log(s, `Waluigi pulls a dirty trick on the ${PIECE_STATS[target.type].name}!`);
      }
      return true;
    case 'lumaShield':
      p.counters.lumaCd = MARIO_COOLDOWNS.lumaCd;
      if (target) addShield(s, target, 1, true);
      return true;
    case 'starSpin':
      p.counters.spinCd = MARIO_COOLDOWNS.spinCd;
      log(s, 'Star Spin!');
      for (const e of enemiesOf(s, p).filter((e) => pieceDistance(e, p) === 1)) dealDamage(s, e.id, 1, { sourceId: p.id, kind: 'ability' });
      return true;
    case 'hammer': {
      p.counters.hammerCd = MARIO_COOLDOWNS.hammerCd;
      for (const id of [m.allyId, m.param].filter(Boolean) as string[]) if (getPiece(s, id)) dealDamage(s, id, 1, { sourceId: p.id, kind: 'ranged' });
      return true;
    }
    case 'fireBreath': {
      const phase = bowserPhase(p);
      p.counters.fireCd = 3;
      const [dx, dy] = (m.param ?? '0,1').split(',').map(Number);
      log(s, 'Bowser breathes fire!');
      fireLine(s, p, { x: dx, y: dy }).forEach((e, i) => dealDamage(s, e.id, phase === 3 && i === 0 ? 2 : 1, { sourceId: p.id, kind: 'ability' }));
      return true;
    }
    case 'groundSlam':
      p.counters.slamCd = 2;
      log(s, 'Bowser slams the ground!');
      for (const e of enemiesOf(s, p).filter((e) => pieceDistance(e, p) === 1)) dealDamage(s, e.id, 1, { sourceId: p.id, kind: 'ability' });
      for (const c of footprint(p).flatMap((f) => ALL_DIRS.map((d) => add(f, d))))
        if (terrainAt(s.board, c) === 'cracked') destroyCracked(s, c, p);
      return true;
  }
  return false;
}

/** Extra damage from Mario Pack abilities. */
export function marioAttackBonus(s: GameState, p: Piece, t: Piece, m: Move): number {
  let dmg = 0;
  // Daisy: Athletic Kick — her first attack each battle.
  if (p.type === 'daisy' && p.attacks === 0) dmg += 1;
  // Wario: Shoulder Bash — exactly two squares orthogonally.
  if (p.type === 'wario' && !m.action && !m.leap && (m.to.x === m.from.x || m.to.y === m.from.y) && distanceTo(p, m.to) === 2) dmg += 1;
  // Waluigi: Sneaky Strike on an enemy that can't move next turn.
  if (p.type === 'waluigi' && (hasStatus(t, 'stunned') || hasStatus(t, 'bound'))) dmg += 1;
  // Goomba: Swarm — another Goomba next to the target.
  if (p.type === 'goomba' && s.pieces.some((g) => g.type === 'goomba' && g.side === p.side && g.id !== p.id && pieceDistance(g, t) === 1)) dmg += 1;
  // Koopa Troopa: Shell Slide.
  if (m.uses?.includes('shell_slide')) dmg += 1;
  return dmg;
}

/** Boo: Shy Ghost — no capturing while another enemy is next to it. */
export function marioFilterMoves(s: GameState, p: Piece, moves: Move[]): Move[] {
  if (p.type !== 'boo') return moves;
  return moves.filter((m) => {
    if (!m.targets?.length || m.action) return true;
    return !enemiesOf(s, p).some((e) => !m.targets!.includes(e.id) && pieceDistance(e, p) === 1);
  });
}

/**
 * Damage-time defenses before shields: Toadette's Mushroom Rescue (an adjacent
 * ally about to be captured is whisked to her side). True if negated.
 */
export function marioNegates(s: GameState, target: Piece, amount: number, kind: DamageKind): boolean {
  if (amount <= 0 || (kind !== 'attack' && kind !== 'ranged')) return false;
  const lethal = amount >= target.hp + target.shields.reduce((n, sh) => n + sh.strength, 0);
  if (!lethal || sizeOf(target) !== 1) return false;
  const toadette = s.pieces.find((t) => t.type === 'toadette' && t.side === target.side && t.id !== target.id && !hasUsed(t, 'rescue') && pieceDistance(t, target) === 1);
  if (!toadette) return false;
  const spot = ALL_DIRS.map((d) => add(toadette.pos, d)).find((c) => isStandable(s.board, c) && isEmpty(s, c));
  if (!spot) return false;
  markUsed(toadette, 'rescue');
  target.pos = { ...spot };
  log(s, `Toadette pulls the ${PIECE_STATS[target.type].name} to safety!`);
  return true;
}

/** Koopa Troopa: Shell Defense — the first attack on it each battle deals 1 less. */
export function marioReduction(target: Piece, dmg: number, kind: DamageKind): number {
  if (target.type !== 'koopa' || dmg <= 0 || (kind !== 'attack' && kind !== 'ranged') || target.counters.shellUsed) return dmg;
  target.counters.shellUsed = 1;
  return dmg - 1;
}

/** Bowser (Phase 2+): Spiked Shell — the first enemy each turn to hit him in melee takes 1. */
export function marioAfterHit(s: GameState, target: Piece, source: Piece | undefined, kind: DamageKind) {
  if (target.type !== 'bowser' || bowserPhase(target) < 2 || !source || source.side === target.side || kind !== 'attack') return;
  // Any melee attack makes contact (ranged shots and abilities don't count).
  if (target.counters.spikePly === s.ply || !getPiece(s, source.id)) return;
  target.counters.spikePly = s.ply;
  log(s, "Bowser's spiked shell bites back!");
  dealDamage(s, source.id, 1, { sourceId: target.id, kind: 'ability' });
}

/** Toadette's Encouragement: +1 sliding range next to her. */
export function marioRangeBonus(s: GameState, p: Piece): number {
  return s.pieces.some((t) => t.type === 'toadette' && t.side === p.side && t.id !== p.id && pieceDistance(t, p) === 1) ? 1 : 0;
}
export const marioAuraPresent = (s: GameState) => s.pieces.some((t) => t.type === 'toadette');

/**
 * After a move: start cooldowns of jumps that were used, Mario's Stomp, Daisy's
 * Competitive Spirit, Wario's greed, Luigi's Scaredy-Cat and the Goombas'
 * Marching Formation.
 */
export function marioAfterMove(s: GameState, m: Move, from: Coord | undefined, entry: Bonus | undefined, captured: number) {
  const p = getPiece(s, m.pieceId);
  if (!p) return;
  if (m.uses?.includes('super_jump')) p.counters.superJumpCd = MARIO_COOLDOWNS.superJumpCd;
  if (m.uses?.includes('high_jump')) p.counters.highJumpCd = MARIO_COOLDOWNS.highJumpCd;
  if (m.uses?.includes('flutter_jump')) p.counters.flutterCd = MARIO_COOLDOWNS.flutterCd;
  if (m.uses?.includes('shell_slide')) p.counters.shellSlideCd = MARIO_COOLDOWNS.shellSlideCd;
  if (captured > 0) {
    // Mario: Stomp — after a jumping capture, a hop of one square orthogonally.
    if (p.type === 'mario' && m.leap && entry?.source !== 'stomp' && ORTHO.some((d) => isStandable(s.board, add(p.pos, d)) && isEmpty(s, add(p.pos, d))))
      s.bonus.unshift({ pieceId: p.id, filter: 'nonCapturing', optional: true, source: 'stomp', maxDistance: 1 });
    // Wario: Greedy.
    if (p.type === 'wario' && p.side === 'player') s.goldBonus = (s.goldBonus ?? 0) + WARIO_GREED_GOLD * captured;
    // Daisy: Competitive Spirit.
    for (const d of s.pieces.filter((d) => d.type === 'daisy' && d.side === p.side && d.id !== p.id && pieceDistance(d, p) <= 2))
      addStatus(d, { kind: 'rangeBuff', amount: 1, until: endOfTurn(s.ply, d.side), source: 'competitive_spirit' });
  }
  const moved = !!from && !sameCoord(from, p.pos);
  if (!moved) return;
  // Luigi: Scaredy-Cat — once per battle, he flees an enemy that comes next to him.
  const before = (c: Coord) => footprint(p, from!).some((f) => Math.max(Math.abs(f.x - c.x), Math.abs(f.y - c.y)) <= 1);
  for (const l of s.pieces.filter((l) => l.type === 'luigi' && l.side !== p.side && !hasUsed(l, 'scaredy') && pieceDistance(l, p) === 1 && !before(l.pos))) {
    const spot = ALL_DIRS.map((d) => add(l.pos, d))
      .filter((c) => isStandable(s.board, c) && isEmpty(s, c))
      .sort((a, b) => distanceTo(p, b) - distanceTo(p, a))[0];
    if (spot) {
      markUsed(l, 'scaredy');
      l.pos = { ...spot };
      log(s, 'Luigi panics and jumps away!');
    }
  }
  // Goombas: Marching Formation — a Goomba that a friendly Goomba moves next to steps forward (once per turn).
  if (p.type === 'goomba')
    for (const g of s.pieces.filter((g) => g.type === 'goomba' && g.side === p.side && g.id !== p.id && pieceDistance(g, p) === 1)) {
      if (g.counters.marchPly === s.ply || hasStatus(g, 'bound') || hasStatus(g, 'stunned')) continue;
      const ahead = { x: g.pos.x, y: g.pos.y + forward(g.side) };
      if (isStandable(s.board, ahead) && isEmpty(s, ahead)) {
        g.counters.marchPly = s.ply;
        g.pos = ahead;
        log(s, 'The Goombas march forward!');
      }
    }
}

/** Display names for movement abilities tagged on moves. */
export const MARIO_USE_NAMES: Record<string, string> = {
  super_jump: 'Super Jump',
  high_jump: 'High Jump',
  flutter_jump: 'Flutter Jump',
  shell_slide: 'Shell Slide',
  ghostly_passage: 'Ghostly Passage',
};

