/**
 * Super Mario Pack upgrades. Activated ones replace the piece's move and have
 * cooldowns ("every N turns", in the owner's turns; 0 = once per battle).
 * Movement extras are steps tagged with `uses`; passives hook into damage,
 * movement and setup. The Mega Mushroom makes a 1×1 piece 2×2 for 3 turns
 * (see sizeOf in pieces.ts).
 */
import { inBounds, isStandable, isWall, terrainAt } from './board';
import {
  ALL_DIRS,
  DIAG,
  ORTHO,
  add,
  addStatus,
  addTimedTerrain,
  cannotAttack,
  dealDamage,
  destroyCracked,
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
  push,
  scale,
  setTerrain,
  sign,
  sub,
  summon,
} from './core';
import { grappleSquares } from './crash';
import { hammerTargets } from './mario';
import { PIECE_STATS, footprint, sizeOf } from './pieces';
import { Bonus, Coord, GameState, Move, Piece, Side, endOfTurn, sameCoord } from './types';

export const MARIO_UPGRADE_COOLDOWNS: Record<string, number> = {
  fire_flower: 3,
  ice_flower: 3,
  super_star: 0,
  mega_mushroom: 0,
  tanooki_suit: 4,
  hammer_suit: 2,
  super_bell: 3,
  double_cherry: 0,
  boomerang_flower: 3,
  bee_mushroom: 3,
  cappy: 4,
  spin_attack: 3,
  cloud_flower: 4,
  bubble_flower: 3,
  elephant_fruit: 3,
  p_switch: 4,
  pow_block: 4,
  red_shell: 3,
  spiny_shell: 0,
  super_horn: 3,
  wonder_flower: 0,
};
/** Movement upgrades with a cooldown (spent when the tagged step is taken). */
const STEP_COOLDOWNS: Record<string, number> = { super_leaf: 3, p_wing: 3, propeller_mushroom: 3, drill_wall: 3 };
const HARMFUL = new Set(['fire_flower', 'ice_flower', 'hammer_suit', 'boomerang_flower', 'cappy', 'spin_attack', 'elephant_fruit', 'pow_block', 'red_shell', 'spiny_shell', 'super_horn']);
const MOVING = new Set(['super_bell', 'bee_mushroom', 'cappy']);
/** Gold per capture with the Gold Coin (paid when the battle is won). */
export const GOLD_COIN_GOLD = 8;

const cdKey = (id: string) => `${id}Cd`;
const charged = (p: Piece, id: string) => {
  // Drill Mushroom's wall-boring is its own cooldown.
  if (!has(p, id === 'drill_wall' ? 'drill_mushroom' : id)) return false;
  const cd = MARIO_UPGRADE_COOLDOWNS[id] ?? STEP_COOLDOWNS[id];
  return cd === 0 ? !hasUsed(p, id) : (p.counters[cdKey(id)] ?? 0) <= 0;
};
export const isMarioAction = (id: string) => id in MARIO_UPGRADE_COOLDOWNS;

function spend(p: Piece, id: string) {
  const cd = MARIO_UPGRADE_COOLDOWNS[id] ?? STEP_COOLDOWNS[id];
  if (cd === 0) markUsed(p, id);
  else if (cd) p.counters[cdKey(id)] = cd;
}

/** Is the Wonder Flower's effect running? */
export const wondering = (p: Piece) => (p.counters.wonderTurns ?? 0) > 0;

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

/** Enemies within `reach` along orthogonal lines, ignoring pieces but stopped by walls; nearest first. */
function throughPieces(s: GameState, p: Piece, reach: number): { piece: Piece; dist: number }[] {
  const out: { piece: Piece; dist: number }[] = [];
  for (const d of ORTHO)
    for (let k = 1; k <= reach; k++) {
      const c = add(p.pos, scale(d, k));
      if (!inBounds(s.board, c) || isWall(s.board, c) || terrainAt(s.board, c) === 'cracked') break;
      const o = pieceAt(s, c);
      if (o && o.side !== p.side && !out.some((x) => x.piece.id === o.id)) out.push({ piece: o, dist: k });
    }
  return out.sort((a, b) => a.dist - b.dist);
}

/** Squares for the Mega Mushroom: top-left corners of a clear 2×2 that includes the piece's square. */
function megaAnchors(s: GameState, p: Piece): Coord[] {
  const out: Coord[] = [];
  for (const [dx, dy] of [
    [0, 0],
    [-1, 0],
    [0, -1],
    [-1, -1],
  ]) {
    const a = { x: p.pos.x + dx, y: p.pos.y + dy };
    const cells = [a, add(a, { x: 1, y: 0 }), add(a, { x: 0, y: 1 }), add(a, { x: 1, y: 1 })];
    if (cells.every((c) => isStandable(s.board, c) && (sameCoord(c, p.pos) || isEmpty(s, c)))) out.push(a);
  }
  return out;
}

/** Every Mario upgrade action for `p`. */
export function marioUpgradeActions(s: GameState, p: Piece): Move[] {
  const out: Move[] = [];
  const act = (upgrade: string, to: Coord, extra: Partial<Move> = {}) => out.push({ pieceId: p.id, from: p.pos, action: 'upgrade', upgrade, to, ...extra });
  const foes = s.pieces.filter((e) => e.side !== p.side);
  const small = sizeOf(p) === 1;
  const can = (id: string) => charged(p, id) && !(cannotAttack(p) && HARMFUL.has(id)) && !(hasStatus(p, 'bound') && MOVING.has(id));

  for (const id of ['fire_flower', 'ice_flower'])
    if (can(id))
      for (const d of ORTHO) {
        const hit = firstInLine(s, p.pos, d, 3);
        if (hit && hit.side !== p.side) act(id, hit.pos, { allyId: hit.id });
      }
  if (can('super_star')) act('super_star', p.pos);
  if (can('mega_mushroom') && small && !p.counters.mega) for (const a of megaAnchors(s, p)) act('mega_mushroom', a);
  if (can('tanooki_suit')) act('tanooki_suit', p.pos);
  if (can('hammer_suit')) for (const t of hammerTargets(s, p)) act('hammer_suit', t.pos, { allyId: t.id });
  if (can('super_bell') && small) for (const c of grappleSquares(s, p, 3)) act('super_bell', c);
  if (can('double_cherry') && small)
    for (const d of ALL_DIRS) {
      const c = add(p.pos, d);
      if (isStandable(s.board, c) && isEmpty(s, c)) act('double_cherry', c);
    }
  if (can('boomerang_flower')) for (const { piece } of throughPieces(s, p, 3)) act('boomerang_flower', piece.pos, { allyId: piece.id });
  if (can('bee_mushroom') && small)
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const c = { x: p.pos.x + dx, y: p.pos.y + dy };
        if ((dx || dy) && isStandable(s.board, c) && isEmpty(s, c)) act('bee_mushroom', c);
      }
  if (can('cappy') && small)
    for (const e of foes.filter((e) => sizeOf(e) === 1 && !isBoss(e) && e.type !== 'king' && e.hp === 1 && !e.shields.length && pieceDistance(e, p) <= 2))
      act('cappy', e.pos, { allyId: e.id });
  if (can('spin_attack')) for (const e of foes.filter((e) => pieceDistance(e, p) === 1)) act('spin_attack', e.pos, { allyId: e.id });
  if (can('cloud_flower'))
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const c = { x: p.pos.x + dx, y: p.pos.y + dy };
        if (inBounds(s.board, c) && terrainAt(s.board, c) === 'gap') act('cloud_flower', c);
      }
  if (can('bubble_flower')) for (const e of foes.filter((e) => !isBoss(e) && pieceDistance(e, p) <= 3)) act('bubble_flower', e.pos, { allyId: e.id });
  if (can('elephant_fruit') && foes.some((e) => pieceDistance(e, p) === 1)) act('elephant_fruit', p.pos);
  if (can('p_switch')) {
    if (crackedNear(s, p, 3).length) act('p_switch', p.pos, { param: 'open' });
    for (const d of ORTHO) {
      const line = [1, 2, 3].map((k) => add(p.pos, scale(d, k))).filter((c) => isStandable(s.board, c) && isEmpty(s, c));
      if (line.length && isEmpty(s, add(p.pos, d))) act('p_switch', add(p.pos, d), { param: `block:${d.x},${d.y}` });
    }
  }
  if (can('pow_block') && foes.some((e) => pieceDistance(e, p) <= 2)) act('pow_block', p.pos);
  if (can('red_shell')) {
    const near = throughPieces(s, p, 4)[0];
    if (near) act('red_shell', near.piece.pos, { allyId: near.piece.id });
  }
  if (can('spiny_shell')) {
    const top = foes
      .filter((e) => e.type !== 'king')
      .sort((a, b) => b.hp - a.hp || PIECE_STATS[b.type].value - PIECE_STATS[a.type].value)[0];
    if (top) act('spiny_shell', top.pos, { allyId: top.id });
  }
  if (can('super_horn') && foes.some((e) => pieceDistance(e, p) === 1 && !isBoss(e))) act('super_horn', p.pos);
  if (can('wonder_flower') && !wondering(p)) act('wonder_flower', p.pos);
  return out;
}

function crackedNear(s: GameState, p: Piece, r: number): Coord[] {
  const out: Coord[] = [];
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const c = { x: p.pos.x + dx, y: p.pos.y + dy };
      if (inBounds(s.board, c) && terrainAt(s.board, c) === 'cracked') out.push(c);
    }
  return out.sort((a, b) => Math.max(Math.abs(a.x - p.pos.x), Math.abs(a.y - p.pos.y)) - Math.max(Math.abs(b.x - p.pos.x), Math.abs(b.y - p.pos.y)));
}

/** Temporarily change a square's terrain, reverting at the end of `rounds` of `side`'s turns. */
function timedTerrain(s: GameState, c: Coord, to: 'normal' | 'cracked', rounds: number, side: Side) {
  const revertTo = terrainAt(s.board, c);
  if (!setTerrain(s, c, to)) return;
  s.timed.push({ pos: { ...c }, revertTo, expires: endOfTurn(s.ply, side, rounds), kind: 'barricade', side });
}

export function resolveMarioUpgrade(s: GameState, m: Move) {
  const p = getPiece(s, m.pieceId)!;
  const id = m.upgrade!;
  spend(p, id);
  const target = getPiece(s, m.allyId);
  switch (id) {
    case 'fire_flower':
    case 'hammer_suit':
    case 'boomerang_flower':
    case 'red_shell':
      if (target) dealDamage(s, target.id, 1, { sourceId: p.id, kind: 'ranged' });
      break;
    case 'ice_flower':
      if (target) {
        const out = dealDamage(s, target.id, 1, { sourceId: p.id, kind: 'ranged' });
        const still = getPiece(s, target.id);
        if (still && out.kind !== 'captured') addStatus(still, { kind: 'bound', until: endOfTurn(s.ply, still.side), source: 'ice_flower' });
      }
      break;
    case 'super_star':
      addStatus(p, { kind: 'immune', until: endOfTurn(s.ply, p.side, 2), source: 'super_star' });
      log(s, `${PIECE_STATS[p.type].name} is invincible!`);
      break;
    case 'mega_mushroom':
      p.counters.mega = 1;
      p.counters.megaTurns = 4; // three more turns; counted down at the end of each of its turns, this one included
      p.counters.megaPrevMax = p.maxHp;
      p.pos = { ...m.to };
      p.maxHp = 3;
      p.hp = Math.min(3, p.hp + 2);
      log(s, `${PIECE_STATS[p.type].name} grows huge!`);
      break;
    case 'tanooki_suit':
      addStatus(p, { kind: 'immune', until: endOfTurn(s.ply, p.side === 'player' ? 'enemy' : 'player'), source: 'tanooki_suit' });
      log(s, `${PIECE_STATS[p.type].name} turns into a statue!`);
      break;
    case 'super_bell':
    case 'bee_mushroom':
      p.pos = { ...m.to };
      break;
    case 'double_cherry': {
      const twin = summon(s, p, p.type, m.to, 'double_cherry', { copy: 'weak' });
      twin.upgrades = [];
      log(s, `${PIECE_STATS[p.type].name} splits in two!`);
      break;
    }
    case 'cappy':
      if (target) {
        const at = { ...target.pos };
        const type = target.type;
        dealDamage(s, target.id, 1, { sourceId: p.id, kind: 'attack' });
        if (!getPiece(s, target.id) && isEmpty(s, at)) {
          p.pos = at;
          addStatus(p, { kind: 'copying', until: endOfTurn(s.ply, p.side, 2), source: type });
          log(s, `Cappy captures the ${PIECE_STATS[type].name}!`);
        }
      }
      break;
    case 'spin_attack':
      if (target) dealDamage(s, target.id, 1, { sourceId: p.id, kind: 'attack' });
      break;
    case 'cloud_flower':
      addTimedTerrain(s, m.to, 'bridge', 3, p.side, p);
      break;
    case 'bubble_flower':
      if (target) addStatus(target, { kind: 'stunned', until: endOfTurn(s.ply, target.side), source: 'bubble' });
      break;
    case 'elephant_fruit':
    case 'pow_block': {
      const reach = id === 'pow_block' ? 2 : 1;
      if (id === 'pow_block') log(s, 'POW!');
      for (const e of s.pieces.filter((e) => e.side !== p.side && pieceDistance(e, p) <= reach)) dealDamage(s, e.id, 1, { sourceId: p.id, kind: 'ability' });
      if (id === 'pow_block') for (const c of crackedNear(s, p, 2)) destroyCracked(s, c, p);
      break;
    }
    case 'p_switch':
      if (m.param === 'open') for (const c of crackedNear(s, p, 3).slice(0, 3)) timedTerrain(s, c, 'normal', 3, p.side);
      else {
        const [dx, dy] = (m.param ?? 'block:0,0').slice(6).split(',').map(Number);
        for (let k = 1; k <= 3; k++) {
          const c = add(p.pos, { x: dx * k, y: dy * k });
          if (!isStandable(s.board, c) || !isEmpty(s, c)) break;
          timedTerrain(s, c, 'cracked', 3, p.side);
        }
      }
      break;
    case 'spiny_shell':
      if (target) dealDamage(s, target.id, 2, { sourceId: p.id, kind: 'ability' });
      break;
    case 'super_horn':
      for (const e of s.pieces.filter((e) => e.side !== p.side && pieceDistance(e, p) === 1 && !isBoss(e))) {
        const d = sign(sub(e.pos, p.pos));
        if (!push(s, e.id, d, 1, p.id) && getPiece(s, e.id)) dealDamage(s, e.id, 1, { sourceId: p.id, kind: 'ability' });
      }
      break;
    case 'wonder_flower':
      p.counters.wonderTurns = 4;
      log(s, `${PIECE_STATS[p.type].name} touches the Wonder Flower!`);
      break;
  }
}

/** A step for stepsFor (structurally the same as movement.ts's Step). */
interface MarioUpgradeStep {
  to: Coord;
  capture: boolean;
  quiet: boolean;
  leap: boolean;
  uses: string[];
}

/** Extra movement: Super Leaf, P-Wing, Propeller Mushroom, Mini Mushroom, Drill Mushroom and the Wonder Flower. */
export function marioUpgradeSteps(s: GameState, p: Piece, slides: { dir: Coord; max: number }[]): MarioUpgradeStep[] {
  if (!p.upgrades.length || sizeOf(p) !== 1 || hasStatus(p, 'bound')) return [];
  const out: MarioUpgradeStep[] = [];
  const land = (c: Coord, uses: string, capture = true) => {
    if (!isStandable(s.board, c)) return;
    const o = pieceAt(s, c);
    if (o && (o.side === p.side || !capture)) return;
    out.push({ to: c, capture: !!o, quiet: !o, leap: true, uses: [uses] });
  };
  if (charged(p, 'super_leaf')) for (const d of DIAG) land(add(p.pos, scale(d, 3)), 'super_leaf');
  if (charged(p, 'propeller_mushroom')) for (const d of ORTHO) land(add(p.pos, scale(d, 4)), 'propeller_mushroom');
  if (charged(p, 'p_wing'))
    for (let dy = -5; dy <= 5; dy++)
      for (let dx = -5; dx <= 5; dx++) if (dx || dy) land({ x: p.pos.x + dx, y: p.pos.y + dy }, 'p_wing');
  // Mini Mushroom: slides pass through pieces and walls, ending on an empty square.
  if (has(p, 'mini_mushroom'))
    for (const { dir, max } of slides) {
      let through = false;
      for (let k = 1; k <= max; k++) {
        const c = add(p.pos, scale(dir, k));
        if (!inBounds(s.board, c) || terrainAt(s.board, c) === 'void') break;
        if (isStandable(s.board, c) && isEmpty(s, c)) {
          if (through) out.push({ to: c, capture: false, quiet: true, leap: false, uses: ['mini_mushroom'] });
        } else if (terrainAt(s.board, c) === 'gap') break;
        else through = true;
      }
    }
  // Drill Mushroom: slides bore through cracked walls (smashing them); every 3 turns, through one wall too.
  if (has(p, 'drill_mushroom'))
    for (const { dir, max } of slides) {
      let broke = false;
      let walls = 0;
      for (let k = 1; k <= max; k++) {
        const c = add(p.pos, scale(dir, k));
        if (!inBounds(s.board, c)) break;
        const t = terrainAt(s.board, c);
        if (t === 'cracked') {
          broke = true;
          continue;
        }
        if (t === 'wall' && walls === 0 && charged(p, 'drill_wall')) {
          walls++;
          continue;
        }
        if (!isStandable(s.board, c)) break;
        const o = pieceAt(s, c);
        if (o && o.side === p.side) break;
        if (broke || walls) out.push({ to: c, capture: !!o, quiet: !o, leap: false, uses: walls ? ['drill_mushroom', 'drill_wall'] : ['drill_mushroom'] });
        if (o) break;
      }
    }
  // Wonder Flower: slides two squares further, over pieces and gaps.
  if (wondering(p))
    for (const { dir, max } of slides)
      for (let k = 1; k <= max + 2; k++) {
        const c = add(p.pos, scale(dir, k));
        if (!inBounds(s.board, c) || isWall(s.board, c) || terrainAt(s.board, c) === 'cracked') break;
        if (!isStandable(s.board, c)) continue;
        const o = pieceAt(s, c);
        if (o && o.side === p.side) continue;
        out.push({ to: c, capture: !!o, quiet: !o, leap: true, uses: ['wonder_flower'] });
      }
  return out;
}

/** Extra direct-attack damage. */
export function marioUpgradeAttackBonus(p: Piece, m: Move): number {
  let dmg = 0;
  if (has(p, 'super_star') && hasStatus(p, 'immune')) dmg += 1;
  if (p.counters.mega) dmg += 1;
  if (wondering(p)) dmg += 1;
  if (m.uses?.includes('propeller_mushroom')) dmg += 1;
  return dmg;
}

/** Mini Mushroom: direct attacks deal at most 1. */
export const marioDamageCap = (p: Piece, dmg: number) => (has(p, 'mini_mushroom') ? Math.min(1, dmg) : dmg);

/** Extra sliding range: Wonder Flower +2. */
export const marioUpgradeRange = (p: Piece) => (wondering(p) ? 2 : 0);

/** Drill Mushroom smashes the cracked walls it bored through. */
export function marioUpgradeBeforeMove(s: GameState, m: Move) {
  const p = getPiece(s, m.pieceId);
  if (!p) return;
  if (m.uses?.includes('drill_mushroom')) {
    const d = sign(sub(m.to, m.from));
    const n = Math.max(Math.abs(m.to.x - m.from.x), Math.abs(m.to.y - m.from.y));
    for (let k = 1; k < n; k++) {
      const c = add(m.from, scale(d, k));
      if (terrainAt(s.board, c) === 'cracked') destroyCracked(s, c, p);
    }
  }
  // Mega Mushroom: a giant flattens walls and cracked walls under its new footprint.
  if (p.counters.mega && !m.action)
    for (const c of footprint(p, m.to)) {
      if (terrainAt(s.board, c) === 'cracked') destroyCracked(s, c, p);
      else if (terrainAt(s.board, c) === 'wall') setTerrain(s, c, 'normal');
    }
}

/** After a move: cooldowns for movement upgrades, Gold Coin, and the Wonder Flower's hop after a capture. */
export function marioUpgradeAfterMove(s: GameState, m: Move, entry: Bonus | undefined, captured: number) {
  const p = getPiece(s, m.pieceId);
  if (!p || !p.upgrades.length) return;
  for (const u of m.uses ?? []) if (STEP_COOLDOWNS[u]) spend(p, u);
  if (captured > 0) {
    if (has(p, 'gold_coin') && p.side === 'player') s.goldBonus = (s.goldBonus ?? 0) + GOLD_COIN_GOLD * captured;
    if (wondering(p) && entry?.source !== 'wonder_hop' && sizeOf(p) === 1)
      s.bonus.unshift({ pieceId: p.id, filter: 'nonCapturing', optional: true, source: 'wonder_hop', maxDistance: 1 });
  }
}

/** End of a side's turn: the Mega Mushroom and Wonder Flower wear off. */
export function marioUpgradeTurnEnd(s: GameState, side: Side) {
  for (const p of s.pieces.filter((p) => p.side === side)) {
    if (p.counters.wonderTurns) {
      p.counters.wonderTurns -= 1;
      if (!p.counters.wonderTurns) log(s, `The Wonder Flower wears off the ${PIECE_STATS[p.type].name}.`);
    }
    if (p.counters.mega) {
      p.counters.megaTurns = (p.counters.megaTurns ?? 1) - 1;
      if (p.counters.megaTurns <= 0) {
        p.counters.mega = 0;
        p.maxHp = p.counters.megaPrevMax ?? PIECE_STATS[p.type].maxHp;
        p.hp = Math.min(p.hp, p.maxHp);
        log(s, `The ${PIECE_STATS[p.type].name} shrinks back to normal size.`);
      }
    }
  }
}

/** Tanooki Suit: an enemy that attacks the statue in melee takes 1. */
export function tanookiCounter(s: GameState, target: Piece, source: Piece | undefined) {
  const statue = target.statuses.find((st) => st.kind === 'immune' && st.source === 'tanooki_suit');
  if (!statue || !source || source.side === target.side) return;
  log(s, 'The statue is hard as stone!');
  dealDamage(s, source.id, 1, { sourceId: target.id, kind: 'ability' });
}

/** Bubble Flower: damage pops the bubble. */
export function popBubble(target: Piece) {
  target.statuses = target.statuses.filter((st) => !(st.kind === 'stunned' && st.source === 'bubble'));
}

