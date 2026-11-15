/**
 * Abilities of the special piece set: Engineer, Assassin, Illusionist,
 * Summoner, Converter, Displacer, Oracle, Clone, Bomber and Harvester.
 * (Slayer and Warden are purely passive and live in the damage code.)
 */
import { inBounds, isStandable, isWall, terrainAt } from './board';
import {
  ALL_DIRS,
  add,
  addStatus,
  adjacent,
  capture,
  dealDamage,
  destroyCracked,
  distance,
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
  pieceAt,
  pieceDistance,
  push,
  pushDistance,
  setTerrain,
  sign,
  silenced,
  sub,
  summon,
  suppressed,
} from './core';
import { sizeOf } from './pieces';
import { haunted } from './bosses';
import { Coord, GameState, Move, Piece, PieceType, forward, sameCoord } from './types';

/** Cooldown lengths in the owner's turns. */
export const COOLDOWNS = {
  constructCd: 3,
  shadowCd: 4,
  mirageCd: 4,
  summonPawnCd: 3,
  displaceCd: 3,
  prophecyCd: 4,
  lightCd: 4,
} as const;

const ready = (p: Piece, cd: keyof typeof COOLDOWNS) => (p.counters[cd] ?? 0) <= 0;
const SUMMON_LIMIT = 3;

/** Pieces the Displacer, Converter and similar can't affect. */
const untouchable = (t: Piece) => t.type === 'king' || sizeOf(t) > 1 || isBoss(t);

/** The square on an enemy's own back-row side (Shadow Step target). */
export const behindOf = (t: Piece): Coord => ({ x: t.pos.x, y: t.pos.y - forward(t.side) });

export function specialMoves(s: GameState, p: Piece): Move[] {
  if (silenced(p) || haunted(s, p)) return [];
  const moves: Move[] = [];
  const base = { pieceId: p.id, from: p.pos };
  const around = ALL_DIRS.map((d) => add(p.pos, d));
  const enemiesNear = (r: number) => s.pieces.filter((e) => e.side !== p.side && distance(e.pos, p.pos) <= r);
  const moveBlocked = hasStatus(p, 'bound') || suppressed(s, p);

  switch (p.type) {
    case 'engineer':
      if (ready(p, 'constructCd')) around.filter((c) => isEmpty(s, c)).forEach((c) => moves.push({ ...base, to: c, action: 'construct' }));
      around.filter((c) => terrainAt(s.board, c) === 'cracked').forEach((c) => moves.push({ ...base, to: c, action: 'demolish' }));
      if (!hasUsed(p, 'repair'))
        s.pieces
          .filter((a) => a.side === p.side && a.id !== p.id && a.maxHp > 1 && a.hp < a.maxHp && adjacent(a, p))
          .forEach((a) => moves.push({ ...base, to: a.pos, action: 'repair', allyId: a.id }));
      break;
    case 'assassin':
      if (ready(p, 'shadowCd') && !moveBlocked)
        for (const e of enemiesNear(3)) {
          const c = behindOf(e);
          if (isEmpty(s, c) && !sameCoord(c, p.pos)) moves.push({ ...base, to: c, action: 'shadowStep', allyId: e.id });
        }
      break;
    case 'illusionist': {
      const mine = s.pieces.filter((a) => a.temp?.summonerId === p.id && a.type === 'illusion');
      if (ready(p, 'mirageCd')) around.filter((c) => isEmpty(s, c)).forEach((c) => moves.push({ ...base, to: c, action: 'mirage' }));
      if (!hasUsed(p, 'misdirection') && !moveBlocked)
        mine.forEach((a) => moves.push({ ...base, to: a.pos, action: 'misdirection', allyId: a.id }));
      break;
    }
    case 'summoner': {
      const count = s.pieces.filter((a) => a.temp?.summonerId === p.id).length;
      if (count >= SUMMON_LIMIT) break;
      const spots = around.filter((c) => isEmpty(s, c));
      if (ready(p, 'summonPawnCd')) spots.forEach((c) => moves.push({ ...base, to: c, action: 'summonPawn' }));
      if (!hasUsed(p, 'summonKnight')) spots.forEach((c) => moves.push({ ...base, to: c, action: 'summonKnight' }));
      break;
    }
    case 'converter':
      if (!hasUsed(p, 'convert'))
        s.pieces
          .filter((e) => e.side !== p.side && e.hp === 1 && !untouchable(e) && adjacent(e, p))
          .forEach((e) => moves.push({ ...base, to: e.pos, action: 'convert', allyId: e.id }));
      break;
    case 'displacer':
      if (ready(p, 'displaceCd') && !moveBlocked)
        enemiesNear(2)
          .filter((e) => !untouchable(e) && e.type !== 'displacer' && !immuneToForcedMove(s, e, p, true))
          .forEach((e) => moves.push({ ...base, to: e.pos, action: 'displace', allyId: e.id }));
      if (!hasUsed(p, 'repulse') && s.pieces.some((e) => e.side !== p.side && adjacent(e, p)))
        moves.push({ ...base, to: p.pos, action: 'repulse' });
      break;
    case 'oracle':
      if (ready(p, 'prophecyCd'))
        s.pieces
          .filter((a) => a.side === p.side && !hasStatus(a, 'prophecy'))
          .forEach((a) => moves.push({ ...base, to: a.pos, action: 'prophecy', allyId: a.id }));
      break;
    case 'clone':
      if (!hasUsed(p, 'replicate'))
        s.pieces
          .filter((a) => a.side === p.side && a.id !== p.id && adjacent(a, p) && sizeOf(a) === 1 && a.type !== 'king' && !isBoss(a))
          .filter((a) => a.type !== 'clone' && a.type !== 'decoy' && a.type !== 'illusion')
          .forEach((a) => moves.push({ ...base, to: a.pos, action: 'replicate', allyId: a.id }));
      break;
    case 'bomber':
      moves.push({ ...base, to: p.pos, action: 'detonate' });
      break;
    case 'zelda':
      // Sacred Light: instead of moving, heal an ally within 2 squares.
      if (ready(p, 'lightCd'))
        s.pieces
          .filter((a) => a.side === p.side && a.id !== p.id && a.hp < a.maxHp && pieceDistance(a, p) <= 2)
          .forEach((a) => moves.push({ ...base, to: a.pos, action: 'sacredLight', allyId: a.id }));
      break;
    case 'deku_scrub':
      // Deku Spit: the first piece within 3 in a straight orthogonal line; walls and pieces block.
      for (const d of [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]) {
        for (let k = 1; k <= 3; k++) {
          const c = add(p.pos, { x: d.x * k, y: d.y * k });
          if (!inBounds(s.board, c) || isWall(s.board, c) || terrainAt(s.board, c) === 'door') break;
          const o = pieceAt(s, c);
          if (o) {
            if (o.side !== p.side) moves.push({ ...base, to: o.pos, action: 'spit', allyId: o.id });
            break;
          }
        }
      }
      break;
    case 'harvester': {
      const souls = p.counters.souls ?? 0;
      if (souls >= 2 && p.hp < p.maxHp) moves.push({ ...base, to: p.pos, action: 'soulHeal' });
      if (souls >= 3) moves.push({ ...base, to: p.pos, action: 'soulPower' });
      break;
    }
  }
  return moves;
}

/** Resolve one of the actions above. Returns false if the action isn't one of these. */
export function resolveSpecial(s: GameState, m: Move): boolean {
  const p = getPiece(s, m.pieceId);
  if (!p) return false;
  const target = getPiece(s, m.allyId);
  switch (m.action) {
    case 'construct':
      p.counters.constructCd = COOLDOWNS.constructCd;
      if (isEmpty(s, m.to)) setTerrain(s, m.to, 'cracked');
      return true;
    case 'repair':
      markUsed(p, 'repair');
      if (target) heal(s, target, 1);
      return true;
    case 'shadowStep':
      p.counters.shadowCd = COOLDOWNS.shadowCd;
      p.pos = { ...m.to };
      log(s, `${nameOf(p)} slips behind the enemy.`);
      return true;
    case 'mirage': {
      p.counters.mirageCd = COOLDOWNS.mirageCd;
      summon(s, p, 'illusion', m.to, 'mirage');
      log(s, `${nameOf(p)} conjures an illusion.`);
      return true;
    }
    case 'misdirection':
      markUsed(p, 'misdirection');
      if (target) [p.pos, target.pos] = [target.pos, p.pos];
      return true;
    case 'summonPawn':
      p.counters.summonPawnCd = COOLDOWNS.summonPawnCd;
      summon(s, p, 'pawn', m.to, 'summonPawn');
      return true;
    case 'summonKnight':
      markUsed(p, 'summonKnight');
      summon(s, p, 'knight', m.to, 'summonKnight');
      return true;
    case 'convert':
      markUsed(p, 'convert');
      if (target) {
        target.side = p.side;
        target.temp = { summonerId: p.id, expires: null, kind: 'converted' };
        target.statuses = [];
        log(s, `${nameOf(p)} converts the ${target.type} to its side.`);
      }
      return true;
    case 'displace':
      p.counters.displaceCd = COOLDOWNS.displaceCd;
      if (target) [p.pos, target.pos] = [target.pos, p.pos];
      return true;
    case 'repulse':
      markUsed(p, 'repulse');
      for (const e of s.pieces.filter((e) => e.side !== p.side && adjacent(e, p)))
        push(s, e.id, sign(sub(e.pos, p.pos)), pushDistance(p), p.id);
      return true;
    case 'prophecy':
      p.counters.prophecyCd = COOLDOWNS.prophecyCd;
      if (target) addStatus(target, { kind: 'prophecy', until: null });
      return true;
    case 'replicate':
      markUsed(p, 'replicate');
      if (target) {
        p.clonedFrom = p.clonedFrom ?? 'clone';
        p.type = target.type as PieceType;
        p.maxHp = 1;
        p.hp = Math.min(p.hp, 1);
        log(s, `${nameOf(p)} becomes a copy of the ${target.type}.`);
      }
      return true;
    case 'detonate': {
      const victims = s.pieces.filter((o) => o.id !== p.id && distance(o.pos, p.pos) === 1);
      log(s, `${nameOf(p)} detonates!`);
      capture(s, p, { kind: 'ability' });
      for (const v of victims) dealDamage(s, v.id, 2, { kind: 'splash' });
      return true;
    }
    case 'spit':
      if (target) dealDamage(s, target.id, 1, { sourceId: p.id, kind: 'ranged' });
      return true;
    case 'sacredLight':
      p.counters.lightCd = COOLDOWNS.lightCd;
      if (target) {
        heal(s, target, 1);
        log(s, `Sacred Light restores ${nameOf(target)}.`);
      }
      return true;
    case 'soulHeal':
      p.counters.souls = (p.counters.souls ?? 0) - 2;
      heal(s, p, 1);
      return true;
    case 'soulPower':
      p.counters.souls = (p.counters.souls ?? 0) - 3;
      addStatus(p, { kind: 'damageBuff', amount: 1, until: null });
      return true;
  }
  return false;
}

/** Harvester: gain a Soul for a personal capture (max 5); reaching 5 grants +1 max HP once per run. */
export function harvestSoul(s: GameState, p: Piece) {
  if (p.type !== 'harvester') return;
  p.counters.souls = Math.min(5, (p.counters.souls ?? 0) + 1);
  if (p.counters.souls >= 5 && !p.counters.deathReward) {
    p.counters.deathReward = 1;
    p.maxHp += 1;
    p.hp += 1;
    log(s, "Death's Reward: the Harvester grows stronger.");
  }
}

export { inBounds, isStandable, isWall, pieceAt, destroyCracked };
