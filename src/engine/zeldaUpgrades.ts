/**
 * Zelda Content Pack upgrades (Ocarina of Time inspired): the activated
 * abilities (each replaces the piece's move), plus the hit effects shared by
 * normal attacks and these abilities. Passive defenses live in core.ts
 * (dealDamage, preventDeath, immuneToForcedMove) and movement.ts.
 */
import { inBounds, isWall, terrainAt } from './board';
import {
  ALL_DIRS,
  ORTHO,
  add,
  addStatus,
  cannotAttack,
  capture,
  dealDamage,
  destroyCracked,
  distance,
  distanceTo,
  getPiece,
  has,
  hasStatus,
  hasUsed,
  isBoss,
  isEmpty,
  log,
  markUsed,
  nameOf,
  pieceAt,
  pieceDistance,
  scale,
  sign,
  sub,
  immuneToForcedMove,
} from './core';
import { lPaths } from './movement';
import { footprint, sizeOf } from './pieces';
import { Coord, GameState, Move, Piece, endOfTurn, opponent, sameCoord } from './types';

/** Cooldowns in the owner's turns ("once every N turns"). */
export const ZELDA_COOLDOWNS: Record<string, number> = {
  fairy_bow: 3,
  fairy_slingshot: 3,
  boomerang: 3,
  hookshot: 4,
  longshot: 3,
  bombs: 3,
  bombchu: 4,
  dins_fire: 5,
  suns_song: 5,
  song_of_storms: 4,
};
/** Once-per-battle abilities. */
const ONCE = new Set(['deku_nut', 'farores_wind', 'nayrus_love', 'song_of_time', 'triforce_wisdom']);
/** Abilities that move the user (not allowed while Bound). */
const MOVING = new Set(['hookshot', 'longshot', 'farores_wind', 'song_of_time']);
/** Abilities that hurt enemies (not allowed while Disarmed / Pacified). */
const HARMFUL = new Set(['fairy_bow', 'boomerang', 'megaton_hammer', 'bombs', 'bombchu', 'dins_fire', 'golden_gauntlets']);
/** Pieces Sun's Song treats as undead. */
const UNDEAD = new Set(['redead', 'stalfos']);

const cdKey = (id: string) => `${id}Cd`;
const charged = (p: Piece, id: string) =>
  has(p, id) && (ONCE.has(id) ? !hasUsed(p, id) : (p.counters[cdKey(id)] ?? 0) <= 0);

/** Damage an upgrade ability deals to `t`: 1, or 2 against a boss with the Master Sword. */
const abilityDamage = (p: Piece, t: Piece) => 1 + (has(p, 'master_sword') && isBoss(t) ? 1 : 0);

/** Enemies may be stunned or frozen by these, but never Kings or Boss Pieces. */
const controllable = (e: Piece) => e.type !== 'king' && !isBoss(e);

/** Every Zelda upgrade action available to `p`. Called from upgradeActions. */
export function zeldaUpgradeActions(s: GameState, p: Piece): Move[] {
  const out: Move[] = [];
  const base = { pieceId: p.id, from: p.pos, action: 'upgrade' as const };
  const act = (upgrade: string, to: Coord, extra: Partial<Move> = {}) => out.push({ ...base, upgrade, to, ...extra });
  const enemies = s.pieces.filter((e) => e.side !== p.side);
  const small = sizeOf(p) === 1;

  if (charged(p, 'fairy_bow'))
    for (const d of ORTHO) {
      const hit = firstInLine(s, p.pos, d, 3);
      if (hit && hit.side !== p.side) act('fairy_bow', hit.pos, { allyId: hit.id });
    }
  if (charged(p, 'fairy_slingshot'))
    enemies.filter((e) => controllable(e) && pieceDistance(e, p) <= 2).forEach((e) => act('fairy_slingshot', e.pos, { allyId: e.id }));
  if (charged(p, 'boomerang'))
    for (const d of ALL_DIRS) {
      const hit = firstInLine(s, p.pos, d, 2);
      if (hit && hit.side !== p.side) act('boomerang', hit.pos, { allyId: hit.id });
    }
  if (has(p, 'megaton_hammer'))
    for (const d of ALL_DIRS) {
      const c = add(p.pos, d);
      if (inBounds(s.board, c) && terrainAt(s.board, c) === 'cracked') act('megaton_hammer', c);
    }
  if (small && (charged(p, 'hookshot') || charged(p, 'longshot'))) {
    const id = charged(p, 'longshot') ? 'longshot' : 'hookshot';
    const reach = id === 'longshot' ? 7 : 4;
    for (const d of ALL_DIRS) {
      // The hook flies over gaps and empty squares and bites into the first wall within reach.
      for (let k = 1; k <= reach; k++) {
        const c = add(p.pos, scale(d, k));
        if (!inBounds(s.board, c) || pieceAt(s, c)) break;
        if (isWall(s.board, c)) {
          const land = add(p.pos, scale(d, k - 1));
          if (k >= 2 && isEmpty(s, land)) act(id, land);
          break;
        }
      }
    }
  }
  if (charged(p, 'bombs'))
    for (let y = p.pos.y - 2; y <= p.pos.y + sizeOf(p) + 1; y++)
      for (let x = p.pos.x - 2; x <= p.pos.x + sizeOf(p) + 1; x++) {
        const c = { x, y };
        if (inBounds(s.board, c) && terrainAt(s.board, c) === 'cracked' && distanceTo(p, c) <= 2) act('bombs', c);
      }
  if (charged(p, 'bombchu'))
    for (const d of ORTHO) {
      for (let k = 1; k <= 5; k++) {
        const c = add(p.pos, scale(d, k));
        if (!inBounds(s.board, c)) break;
        const t = terrainAt(s.board, c);
        if (t === 'gap') continue; // it scurries over gaps
        if (t === 'cracked') {
          act('bombchu', c);
          break;
        }
        if (t === 'wall' || t === 'void' || t === 'door') break;
        const o = pieceAt(s, c);
        if (o) {
          if (o.side !== p.side) act('bombchu', c, { allyId: o.id });
          break;
        }
      }
    }
  if (charged(p, 'deku_nut') && enemies.some((e) => controllable(e) && pieceDistance(e, p) === 1)) act('deku_nut', p.pos);
  if (charged(p, 'dins_fire') && enemies.some((e) => dinsReach(s, p, e))) act('dins_fire', p.pos);
  if (small && charged(p, 'farores_wind'))
    for (let y = 0; y < s.board.height; y++)
      for (let x = 0; x < s.board.width; x++) if (isEmpty(s, { x, y }) && distance(p.pos, { x, y }) > 1) act('farores_wind', { x, y });
  if (charged(p, 'nayrus_love')) act('nayrus_love', p.pos);
  if (charged(p, 'triforce_wisdom')) act('triforce_wisdom', p.pos);
  if (small && charged(p, 'song_of_time') && p.prevPos) {
    const back = p.prevPos;
    const hurt = (p.counters.prevHp ?? p.hp) > p.hp;
    if ((!sameCoord(back, p.pos) && isEmpty(s, back)) || (sameCoord(back, p.pos) && hurt)) act('song_of_time', back);
  }
  if (charged(p, 'suns_song')) {
    if (enemies.some((e) => UNDEAD.has(e.type))) act('suns_song', p.pos, { param: 'undead' });
    enemies.filter((e) => controllable(e) && pieceDistance(e, p) === 1).forEach((e) => act('suns_song', e.pos, { allyId: e.id }));
  }
  if (charged(p, 'song_of_storms'))
    for (let y = p.pos.y - 3; y <= p.pos.y + 3; y++)
      for (let x = p.pos.x - 3; x <= p.pos.x + 3; x++) {
        const c = { x, y };
        if (!inBounds(s.board, c)) continue;
        if (enemies.some((e) => footprint(e).some((f) => distance(f, c) <= 1))) act('song_of_storms', c);
      }
  if (has(p, 'golden_gauntlets'))
    for (const e of enemies.filter((e) => sizeOf(e) === 1 && pieceDistance(e, p) === 1 && !immuneToForcedMove(s, e, p, true))) {
      const to = add(e.pos, sign(sub(e.pos, p.pos)));
      // Only worth it if something happens: room to move, or a wall/gap/edge behind.
      if (!inBounds(s.board, to) || !pieceAt(s, to)) act('golden_gauntlets', e.pos, { allyId: e.id });
    }

  return out.filter((m) => {
    if ((hasStatus(p, 'bound') || hasStatus(p, 'rooted')) && MOVING.has(m.upgrade!)) return false;
    if (cannotAttack(p) && HARMFUL.has(m.upgrade!)) return false;
    return true;
  });
}

/** Is this upgrade id one of ours? */
export const isZeldaAction = (id: string) =>
  id in ZELDA_COOLDOWNS || ONCE.has(id) || id === 'megaton_hammer' || id === 'golden_gauntlets';

/** Resolve a Zelda upgrade action on the working state. */
export function resolveZeldaUpgrade(s: GameState, m: Move) {
  const p = getPiece(s, m.pieceId)!;
  const id = m.upgrade!;
  const target = getPiece(s, m.allyId) ?? pieceAt(s, m.to);
  if (ONCE.has(id)) markUsed(p, id);
  if (ZELDA_COOLDOWNS[id]) p.counters[cdKey(id)] = ZELDA_COOLDOWNS[id];
  const stun = (e: Piece, kind: 'stunned' | 'bound', source: string) => addStatus(e, { kind, until: endOfTurn(s.ply, e.side), source });

  switch (id) {
    case 'fairy_bow':
    case 'boomerang':
    case 'bombchu':
      if (target && target.side !== p.side) hit(s, p, target, abilityDamage(p, target), 'ranged');
      else if (terrainAt(s.board, m.to) === 'cracked') destroyCracked(s, m.to, p);
      break;
    case 'fairy_slingshot':
      if (target) stun(target, 'bound', 'slingshot');
      break;
    case 'megaton_hammer': {
      destroyCracked(s, m.to, p);
      const behind = pieceAt(s, add(m.to, sign(sub(m.to, p.pos))));
      if (behind && behind.side !== p.side) hit(s, p, behind, abilityDamage(p, behind), 'attack');
      break;
    }
    case 'hookshot':
    case 'longshot':
      p.pos = { ...m.to };
      break;
    case 'bombs': {
      destroyCracked(s, m.to, p);
      log(s, 'Boom!');
      for (const o of s.pieces.filter((o) => footprint(o).some((c) => distance(c, m.to) === 1)))
        dealDamage(s, o.id, 1, { sourceId: p.id, kind: 'splash' });
      break;
    }
    case 'deku_nut':
      for (const e of s.pieces.filter((e) => e.side !== p.side && controllable(e) && pieceDistance(e, p) === 1)) stun(e, 'stunned', 'deku_nut');
      break;
    case 'dins_fire':
      // Blaze is immune to fire.
      for (const e of s.pieces.filter((e) => e.side !== p.side && e.type !== 'blaze' && e.type !== 'burning_blaze' && dinsReach(s, p, e))) hit(s, p, e, abilityDamage(p, e), 'ability');
      break;
    case 'farores_wind':
      p.pos = { ...m.to };
      break;
    case 'triforce_wisdom':
      log(s, 'The Triforce of Wisdom shines: nearby allies are protected.');
      for (const a of s.pieces.filter((a) => a.side === p.side && pieceDistance(a, p) <= 2))
        addStatus(a, { kind: 'immune', until: endOfTurn(s.ply, opponent(p.side)), source: 'triforce_wisdom' });
      break;
    case 'nayrus_love':
      addStatus(p, { kind: 'immune', until: endOfTurn(s.ply, opponent(p.side)), source: 'nayrus_love' });
      break;
    case 'song_of_time':
      p.pos = { ...m.to };
      p.hp = Math.max(p.hp, Math.min(p.maxHp, p.counters.prevHp ?? p.hp));
      break;
    case 'suns_song':
      if (m.param === 'undead') {
        for (const e of s.pieces.filter((e) => e.side !== p.side && UNDEAD.has(e.type))) stun(e, 'stunned', 'suns_song');
      } else if (target) stun(target, 'stunned', 'suns_song');
      break;
    case 'song_of_storms':
      log(s, 'A storm rolls in.');
      for (const o of s.pieces.filter((o) => footprint(o).some((c) => distance(c, m.to) <= 1)))
        addStatus(o, { kind: 'slowed', until: endOfTurn(s.ply, o.side), source: 'song_of_storms' });
      break;
    case 'golden_gauntlets':
      if (target) gauntletShove(s, p, target);
      break;
  }
}

/** Golden Gauntlets: shove one square away; walls hurt (cracked ones break), gaps swallow. */
function gauntletShove(s: GameState, p: Piece, e: Piece) {
  const to = add(e.pos, sign(sub(e.pos, p.pos)));
  if (!inBounds(s.board, to) || terrainAt(s.board, to) === 'wall') {
    dealDamage(s, e.id, 1, { sourceId: p.id, kind: 'collision' });
    return;
  }
  const t = terrainAt(s.board, to);
  if (t === 'cracked') {
    destroyCracked(s, to, p);
    dealDamage(s, e.id, 1, { sourceId: p.id, kind: 'collision' });
    return;
  }
  if (t === 'gap' || t === 'void') {
    log(s, `${nameOf(e)} is hurled into the void!`);
    capture(s, e, { sourceId: p.id, kind: 'fall' });
    return;
  }
  if (!pieceAt(s, to)) e.pos = { ...to };
}

/** Din's Fire reaches enemies within 2 squares unless walls block the way. */
function dinsReach(s: GameState, p: Piece, e: Piece): boolean {
  for (const a of footprint(p))
    for (const b of footprint(e)) {
      if (distance(a, b) > 2) continue;
      const d = sub(b, a);
      const straight = d.x === 0 || d.y === 0 || Math.abs(d.x) === Math.abs(d.y);
      if (straight) {
        const mid = add(a, sign(d));
        if (sameCoord(mid, b) || !isWall(s.board, mid)) return true;
      } else if (lPaths(a, b).some((path) => !path.some((c) => isWall(s.board, c)))) return true;
    }
  return false;
}

/** The first piece along a straight line within `reach`; walls stop it, gaps don't. */
function firstInLine(s: GameState, from: Coord, d: Coord, reach: number): Piece | undefined {
  for (let k = 1; k <= reach; k++) {
    const c = add(from, scale(d, k));
    if (!inBounds(s.board, c) || isWall(s.board, c)) return undefined;
    const o = pieceAt(s, c);
    if (o) return o;
  }
  return undefined;
}

/** Deal damage from one of these abilities and apply the attacker's arrow effects. */
function hit(s: GameState, p: Piece, t: Piece, amount: number, kind: 'ranged' | 'ability' | 'attack') {
  const before = t.hp;
  const out = dealDamage(s, t.id, amount, { sourceId: p.id, kind, pure: has(p, 'light_arrows'), trueSight: has(p, 'lens_of_truth') });
  if (out.kind === 'survived' && (getPiece(s, t.id)?.hp ?? before) < before) arrowEffects(s, p, t.id);
}

/** Fire Arrows burn and Ice Arrows freeze an enemy this piece just damaged (and didn't capture). */
export function arrowEffects(s: GameState, p: Piece, targetId: string) {
  const t = getPiece(s, targetId);
  if (!t || t.side === p.side) return;
  if (has(p, 'fire_arrows') || p.type === 'blaze') addStatus(t, { kind: 'burned', until: endOfTurn(s.ply, t.side), source: p.type === 'blaze' ? 'pyrokinesis' : 'fire_arrows' });
  // Crabmeat: Pincer Grip — the enemy can't move on its next turn.
  if (p.type === 'crabmeat') addStatus(t, { kind: 'bound', until: endOfTurn(s.ply, t.side), source: 'pincer' });
  if (has(p, 'ice_arrows')) addStatus(t, { kind: 'bound', until: endOfTurn(s.ply, t.side), source: 'ice_arrows' });
}

/** Biggoron's Sword: the enemy right behind the target (in the attack's direction) takes 1. */
export function biggoronCleave(s: GameState, p: Piece, targetPos: Coord, dir: Coord, targetIds: string[]) {
  if (!has(p, 'biggorons_sword') || (dir.x === 0 && dir.y === 0)) return;
  const e = pieceAt(s, add(targetPos, dir));
  if (e && e.side !== p.side && !targetIds.includes(e.id)) dealDamage(s, e.id, 1, { sourceId: p.id, kind: 'splash' });
}

/** End of `side`'s turn: Burned pieces lose 1 HP. */
export function burnTick(s: GameState, side: 'player' | 'enemy') {
  for (const p of s.pieces.filter((p) => p.side === side && hasStatus(p, 'burned'))) {
    p.statuses = p.statuses.filter((st) => st.kind !== 'burned');
    log(s, `${nameOf(p)} burns.`);
    dealDamage(s, p.id, 1, { kind: 'ability' });
  }
}

/** Stone of Agony: ending a move next to a disguised enemy illusion reveals it for good. */
export function agonyReveal(s: GameState, moverId: string) {
  const p = getPiece(s, moverId);
  if (!p || !has(p, 'stone_of_agony')) return;
  for (const e of s.pieces.filter((e) => e.side !== p.side && e.type === 'illusion' && pieceDistance(e, p) === 1)) {
    if (!e.counters.revealed) log(s, 'The Stone of Agony trembles: an illusion is revealed!');
    e.counters.revealed = 1;
  }
}

/** Kokiri Sword: a one-square step in any direction into an empty square (offered as a bonus move after a capture). */
export function kokiriSteps(s: GameState, p: Piece): Move[] {
  if (sizeOf(p) !== 1) return [];
  return ALL_DIRS.map((d) => add(p.pos, d))
    .filter((c) => isEmpty(s, c))
    .map((to) => ({ pieceId: p.id, from: p.pos, to }));
}

