/**
 * Crash Bandicoot Pack upgrades. Activated ones replace the piece's move and
 * have cooldowns ("every N turns", in the owner's turns). Movement extras
 * (Bounce Crate, Turbo Boost, Lani-Loli, Akano) are extra steps tagged with
 * `uses`; bonus moves (Double Jump, Arrow Crate, Death Tornado Spin, Crystal
 * Surge, Time Relic) are offered after a move. Start-of-battle shields and
 * max HP live in setup.ts; Checkpoint Crate in core.ts.
 */
import { inBounds, isStandable, isWall, terrainAt } from './board';
import {
  ALL_DIRS,
  DIAG,
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
  immuneToForcedMove,
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
import { grappleSquares, wallFreeLine } from './crash';
import { PIECE_STATS, sizeOf } from './pieces';
import { Bonus, Coord, GameState, Move, Piece, endOfTurn, sameCoord } from './types';

/** Activated Crash upgrades and their cooldowns (0 = once per battle). */
export const CRASH_UPGRADE_COOLDOWNS: Record<string, number> = {
  super_belly_flop: 3,
  fruit_bazooka: 3,
  wooden_crate: 3,
  iron_crate: 4,
  tnt_crate: 4,
  nitro_crate: 4,
  kupuna_wa: 4,
  ika_ika: 3,
  cortex_ray_gun: 3,
  n_gins_rockets: 4,
  vacuum_cannon: 3,
  grappling_hook: 3,
  bowling_bomb: 4,
  warp_orb: 5,
  mutagen_potion: 0,
  time_relic: 0,
};
/** Cooldowns of the passive and movement upgrades that have one. */
const PASSIVE_COOLDOWNS: Record<string, number> = {
  death_tornado_spin: 3,
  double_jump: 3,
  bounce_crate: 3,
  lani_loli: 3,
  akano: 3,
  turbo_boost: 3,
};
const HARMFUL = new Set(['super_belly_flop', 'fruit_bazooka', 'cortex_ray_gun', 'n_gins_rockets', 'bowling_bomb', 'warp_orb', 'kupuna_wa']);
const MOVING = new Set(['super_belly_flop', 'grappling_hook']);

const cdKey = (id: string) => `${id}Cd`;
const charged = (p: Piece, id: string) => {
  if (!has(p, id)) return false;
  const cd = CRASH_UPGRADE_COOLDOWNS[id] ?? PASSIVE_COOLDOWNS[id];
  return cd === 0 ? !hasUsed(p, id) : (p.counters[cdKey(id)] ?? 0) <= 0;
};
export const isCrashAction = (id: string) => id in CRASH_UPGRADE_COOLDOWNS;

function spend(p: Piece, id: string) {
  const cd = CRASH_UPGRADE_COOLDOWNS[id] ?? PASSIVE_COOLDOWNS[id];
  if (cd === 0) markUsed(p, id);
  else if (cd) p.counters[cdKey(id)] = cd;
}

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

const adjacentEmpty = (s: GameState, p: Piece) => ALL_DIRS.map((d) => add(p.pos, d)).filter((c) => isEmpty(s, c));

/** Every Crash upgrade action available to `p`. */
export function crashUpgradeActions(s: GameState, p: Piece): Move[] {
  const out: Move[] = [];
  const act = (upgrade: string, to: Coord, extra: Partial<Move> = {}) =>
    out.push({ pieceId: p.id, from: p.pos, action: 'upgrade', upgrade, to, ...extra });
  const foes = s.pieces.filter((e) => e.side !== p.side);
  const small = sizeOf(p) === 1;
  const harmless = cannotAttack(p);
  const bound = hasStatus(p, 'bound');
  const can = (id: string) => charged(p, id) && !(harmless && HARMFUL.has(id)) && !(bound && MOVING.has(id));

  if (can('super_belly_flop') && small)
    for (const d of ALL_DIRS) {
      const c = add(p.pos, scale(d, 2));
      if (isStandable(s.board, c) && isEmpty(s, c)) act('super_belly_flop', c);
    }
  if (can('fruit_bazooka'))
    for (const d of ORTHO) {
      const hit = firstInLine(s, p.pos, d, 5);
      if (hit && hit.side !== p.side) act('fruit_bazooka', hit.pos, { allyId: hit.id });
    }
  if (can('cortex_ray_gun'))
    for (const d of DIAG) {
      const hit = firstInLine(s, p.pos, d, 4);
      if (hit && hit.side !== p.side) act('cortex_ray_gun', hit.pos, { allyId: hit.id });
    }
  if (can('n_gins_rockets'))
    for (const e of foes.filter((e) => e.type !== 'king' && pieceDistance(e, p) <= 4 && wallFreeLine(s, p.pos, e.pos))) act('n_gins_rockets', e.pos, { allyId: e.id });
  for (const id of ['wooden_crate', 'iron_crate', 'tnt_crate', 'nitro_crate'])
    if (can(id)) for (const c of adjacentEmpty(s, p)) if (!(s.tiles ?? []).some((t) => sameCoord(t.pos, c))) act(id, c);
  if (can('kupuna_wa'))
    for (const e of foes.filter((e) => !isBoss(e) && pieceDistance(e, p) <= 3)) act('kupuna_wa', e.pos, { allyId: e.id });
  if (can('ika_ika'))
    for (const e of foes.filter((e) => sizeOf(e) === 1 && !isBoss(e) && pieceDistance(e, p) === 1 && !immuneToForcedMove(s, e, p, true)))
      for (const d of ALL_DIRS) {
        const c = add(e.pos, d);
        if (isEmpty(s, c)) act('ika_ika', c, { allyId: e.id });
      }
  if (can('vacuum_cannon'))
    for (const e of foes.filter((e) => sizeOf(e) === 1 && !isBoss(e) && pieceDistance(e, p) <= 3 && pieceDistance(e, p) >= 2)) {
      const to = add(e.pos, sign(sub(p.pos, e.pos)));
      if (isEmpty(s, to) && !immuneToForcedMove(s, e, p, true)) act('vacuum_cannon', to, { allyId: e.id });
    }
  if (can('grappling_hook') && small) for (const c of grappleSquares(s, p, 4)) act('grappling_hook', c);
  if (can('bowling_bomb'))
    for (const d of ORTHO) {
      const impact = bowlingImpact(s, p, d);
      if (impact) act('bowling_bomb', impact, { param: `${d.x},${d.y}` });
    }
  if (can('warp_orb')) {
    const far = farthestEnemy(s, p);
    if (far) act('warp_orb', far.pos, { allyId: far.id });
  }
  if (can('mutagen_potion')) act('mutagen_potion', p.pos);
  // Time Relic: right after this piece moves, take the move back and choose again.
  if (charged(p, 'time_relic') && s.bonus[0]?.source === 'time_relic' && s.bonus[0].pieceId === p.id) act('time_relic', p.pos);
  return out;
}

/** Where a Bowling Bomb rolling from `p` in direction `d` goes off (the first piece, before a wall, or after 4 squares). */
function bowlingImpact(s: GameState, p: Piece, d: Coord): Coord | undefined {
  let last: Coord | undefined;
  for (let k = 1; k <= 4; k++) {
    const c = add(p.pos, scale(d, k));
    if (!inBounds(s.board, c) || isWall(s.board, c) || terrainAt(s.board, c) === 'cracked') return last ?? undefined;
    if (pieceAt(s, c)) return c;
    last = c;
  }
  return last;
}

/** The enemy farthest away (not the King); ties go to the most valuable. */
function farthestEnemy(s: GameState, p: Piece): Piece | undefined {
  return s.pieces
    .filter((e) => e.side !== p.side && e.type !== 'king')
    .sort((a, b) => pieceDistance(b, p) - pieceDistance(a, p) || PIECE_STATS[b.type].value - PIECE_STATS[a.type].value)[0];
}

/** Resolve a Crash upgrade action. */
export function resolveCrashUpgrade(s: GameState, m: Move) {
  const p = getPiece(s, m.pieceId)!;
  const id = m.upgrade!;
  spend(p, id);
  const target = getPiece(s, m.allyId);
  switch (id) {
    case 'super_belly_flop':
      p.pos = { ...m.to };
      log(s, 'Super Belly Flop!');
      for (const e of s.pieces.filter((e) => e.side !== p.side && pieceDistance(e, p) === 1)) dealDamage(s, e.id, 1, { sourceId: p.id, kind: 'ability' });
      break;
    case 'fruit_bazooka':
    case 'cortex_ray_gun':
    case 'n_gins_rockets':
      if (target) dealDamage(s, target.id, 1, { sourceId: p.id, kind: 'ranged' });
      break;
    case 'wooden_crate':
      setTerrain(s, m.to, 'cracked');
      break;
    case 'iron_crate':
      setTerrain(s, m.to, 'wall');
      break;
    case 'tnt_crate':
      if (setTerrain(s, m.to, 'cracked')) s.tiles = [...(s.tiles ?? []), { kind: 'tntCrate', pos: { ...m.to }, fuse: endOfTurn(s.ply, p.side, 2) }];
      break;
    case 'nitro_crate':
      if (setTerrain(s, m.to, 'cracked')) s.tiles = [...(s.tiles ?? []), { kind: 'nitroCrate', pos: { ...m.to } }];
      break;
    case 'kupuna_wa':
      if (target) addStatus(target, { kind: 'stunned', until: endOfTurn(s.ply, target.side), source: 'kupuna_wa' });
      break;
    case 'ika_ika':
    case 'vacuum_cannon':
      if (target && isEmpty(s, m.to)) target.pos = { ...m.to };
      break;
    case 'grappling_hook':
      p.pos = { ...m.to };
      break;
    case 'bowling_bomb': {
      log(s, 'Bowling Bomb!');
      for (const o of s.pieces.filter((o) => pieceDistanceTo(o, m.to) <= 1))
        if (getPiece(s, o.id)) dealDamage(s, o.id, 1, { sourceId: p.id, kind: 'ability' });
      for (const d of ALL_DIRS) {
        const c = add(m.to, d);
        if (terrainAt(s.board, c) === 'cracked') destroyCracked(s, c, p);
      }
      break;
    }
    case 'warp_orb':
      if (target) dealDamage(s, target.id, 1, { sourceId: p.id, kind: 'ability' });
      break;
    case 'mutagen_potion':
      p.counters.mutagenPrev = p.maxHp;
      p.maxHp = Math.max(3, p.maxHp);
      p.hp = p.maxHp;
      p.counters.mutagenTurns = 4; // counted down at the end of each of its turns, this one included
      log(s, `${PIECE_STATS[p.type].name} drinks the Mutagen Potion!`);
      break;
  }
}
const pieceDistanceTo = (p: Piece, c: Coord) => {
  const s = sizeOf(p);
  const dx = c.x < p.pos.x ? p.pos.x - c.x : c.x > p.pos.x + s - 1 ? c.x - (p.pos.x + s - 1) : 0;
  const dy = c.y < p.pos.y ? p.pos.y - c.y : c.y > p.pos.y + s - 1 ? c.y - (p.pos.y + s - 1) : 0;
  return Math.max(dx, dy);
};

/** A movement step for stepsFor (kept structurally compatible with movement.ts's Step). */
export interface CrashStep {
  to: Coord;
  capture: boolean;
  quiet: boolean;
  leap: boolean;
  uses: string[];
}

/** Extra movement from Bounce Crate, Turbo Boost, Lani-Loli and Akano. `slides` are the piece's finite slides. */
export function crashUpgradeSteps(s: GameState, p: Piece, slides: { dir: Coord; max: number; unlimited?: boolean }[]): CrashStep[] {
  if (!p.upgrades.length || sizeOf(p) !== 1 || hasStatus(p, 'bound')) return [];
  const out: CrashStep[] = [];
  if (charged(p, 'bounce_crate'))
    for (const d of ORTHO) {
      const c = add(p.pos, scale(d, 3));
      if (isStandable(s.board, c) && isEmpty(s, c)) out.push({ to: c, capture: false, quiet: true, leap: true, uses: ['bounce_crate'] });
    }
  if (charged(p, 'turbo_boost'))
    for (const { dir, max } of slides.filter((sl) => !sl.unlimited))
      for (let k = 1; k <= max * 2; k++) {
        const c = add(p.pos, scale(dir, k));
        if (!isStandable(s.board, c)) break;
        const o = pieceAt(s, c);
        if (k > max) out.push({ to: c, capture: !!o && o.side !== p.side, quiet: !o, leap: false, uses: ['turbo_boost'] });
        if (o) break;
      }
  if (charged(p, 'lani_loli'))
    for (const { dir, max } of slides) {
      let blocked = false;
      for (let k = 1; k <= max; k++) {
        const c = add(p.pos, scale(dir, k));
        if (!inBounds(s.board, c)) break;
        if (isStandable(s.board, c) && isEmpty(s, c)) {
          if (blocked) out.push({ to: c, capture: false, quiet: true, leap: false, uses: ['lani_loli'] });
        } else if (terrainAt(s.board, c) === 'gap') break;
        else blocked = true;
      }
    }
  if (charged(p, 'akano'))
    for (const d of ALL_DIRS) {
      for (let k = 1; k <= 4; k++) {
        const c = add(p.pos, scale(d, k));
        if (!inBounds(s.board, c)) break;
        if (terrainAt(s.board, c) === 'cracked') continue;
        if (!isStandable(s.board, c)) break;
        const o = pieceAt(s, c);
        if (o && o.side === p.side) break;
        out.push({ to: c, capture: !!o, quiet: !o, leap: false, uses: ['akano'] });
        if (o) break;
      }
    }
  return out;
}

/** Upgrade steps that only duplicate an ordinary move are dropped (so the cooldown isn't spent by accident). */
const OPTIONAL_USES = new Set([
  'turbo_boost', 'lani_loli', 'akano', 'bounce_crate', 'slide_jump',
  // Mario Pack
  'super_jump', 'high_jump', 'flutter_jump', 'ghostly_passage', 'mini_mushroom', 'wonder_flower', 'p_wing', 'super_leaf', 'drill_mushroom',
]);
export function dedupeUpgradeSteps(moves: Move[]): Move[] {
  if (!moves.some((m) => m.uses?.some((u) => OPTIONAL_USES.has(u)))) return moves;
  const plain = new Set(moves.filter((m) => !m.uses && !m.action).map((m) => `${m.to.x},${m.to.y}|${(m.targets ?? []).join(',')}`));
  return moves.filter((m) => !(m.uses?.some((u) => OPTIONAL_USES.has(u)) && !m.action && plain.has(`${m.to.x},${m.to.y}|${(m.targets ?? []).join(',')}`)));
}

/** +1 damage: Power Crystal on every direct attack, Akano on its charge. */
export function crashUpgradeAttackBonus(p: Piece, m: Move): number {
  let dmg = 0;
  if (has(p, 'power_crystal')) dmg += 1;
  if (m.uses?.includes('akano')) dmg += 1;
  return dmg;
}

/** Sliding range: Crash Dash +1, Power Crystal +2. */
export const crashUpgradeRange = (p: Piece) => (has(p, 'crash_dash') ? 1 : 0) + (has(p, 'power_crystal') ? 2 : 0);

/** Akano smashes the cracked walls it charged through. */
export function crashUpgradeBeforeMove(s: GameState, m: Move) {
  if (!m.uses?.includes('akano')) return;
  const p = getPiece(s, m.pieceId);
  const d = sign(sub(m.to, m.from));
  const n = Math.max(Math.abs(m.to.x - m.from.x), Math.abs(m.to.y - m.from.y));
  for (let k = 1; k < n; k++) {
    const c = add(m.from, scale(d, k));
    if (terrainAt(s.board, c) === 'cracked') destroyCracked(s, c, p);
  }
}

/**
 * After a move: start the cooldowns of movement upgrades that were used, then
 * offer bonus moves (Wumpa Fruit healing, Death Tornado Spin, Crystal Surge,
 * Double Jump, Arrow Crate, Time Relic).
 */
export function crashUpgradeAfterMove(s: GameState, m: Move, from: Coord | undefined, entry: Bonus | undefined, captured: number, mainMove: boolean) {
  const p = getPiece(s, m.pieceId);
  if (!p || !p.upgrades.length) return;
  for (const id of m.uses ?? []) if (PASSIVE_COOLDOWNS[id]) spend(p, id);
  if (entry?.source === 'death_tornado') spend(p, 'death_tornado_spin');
  if (entry?.source === 'double_jump') spend(p, 'double_jump');
  if (entry?.source === 'crystal_surge') markUsed(p, 'crystal_surge');
  const src = entry?.source;
  const moved = !!from && !sameCoord(from, p.pos);
  const ordinary = !m.action;
  // Time Relic: the move may be taken back straight away.
  if (mainMove && charged(p, 'time_relic') && moved) s.bonus.unshift({ pieceId: p.id, filter: 'any', optional: true, source: 'time_relic' });
  if (captured > 0) {
    if (has(p, 'wumpa_fruit')) {
      p.counters.wumpa = (p.counters.wumpa ?? 0) + captured;
      while (p.counters.wumpa >= 3) {
        p.counters.wumpa -= 3;
        heal(s, p, 1);
        log(s, `${PIECE_STATS[p.type].name} eats some Wumpa Fruit.`);
      }
    }
    if (charged(p, 'death_tornado_spin') && src !== 'death_tornado')
      s.bonus.unshift({ pieceId: p.id, filter: 'any', optional: true, source: 'death_tornado', maxDistance: 2 });
    if (has(p, 'power_crystal') && !hasUsed(p, 'crystal_surge') && src !== 'crystal_surge')
      s.bonus.unshift({ pieceId: p.id, filter: 'any', optional: true, source: 'crystal_surge' });
  }
  if (!moved || !ordinary) return;
  if (charged(p, 'double_jump') && !captured && !src)
    s.bonus.unshift({ pieceId: p.id, filter: 'nonCapturing', optional: true, source: 'double_jump' });
  if (m.leap) return;
  const d = sign(sub(p.pos, from!));
  const n = Math.max(Math.abs(p.pos.x - from!.x), Math.abs(p.pos.y - from!.y));
  const straight = sameCoord(add(from!, scale(d, n)), p.pos);
  if (has(p, 'arrow_crate') && straight && n >= 2 && src !== 'arrow_crate') {
    const next = add(p.pos, d);
    if (isEmpty(s, next)) s.bonus.unshift({ pieceId: p.id, filter: 'nonCapturing', optional: true, source: 'arrow_crate', to: next });
  }
}

/** End of a side's turn: the Mutagen Potion wears off after 3 turns. */
export function crashUpgradeTurnEnd(s: GameState, side: string) {
  for (const p of s.pieces.filter((p) => p.side === side && p.counters.mutagenTurns)) {
    p.counters.mutagenTurns -= 1;
    if (p.counters.mutagenTurns <= 0) {
      p.maxHp = p.counters.mutagenPrev ?? p.maxHp;
      p.hp = Math.min(p.hp, p.maxHp);
      delete p.counters.mutagenTurns;
      log(s, `The Mutagen Potion wears off the ${PIECE_STATS[p.type].name}.`);
    }
  }
}
