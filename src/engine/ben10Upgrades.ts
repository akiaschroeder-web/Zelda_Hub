/**
 * Ben 10 Pack upgrades: Omnitrix technology, alien abilities, Plumber
 * equipment and villain tech. Activated ones replace the piece's move and have
 * cooldowns ("every N turns"; 0 = once per battle). Several have extra effects
 * on Ben, Upgrade, Way Big, Kevin 11 or Vilgax.
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
  nearestEmpty,
  pieceAt,
  pieceDistance,
  scale,
  setTerrain,
  sign,
  sub,
} from './core';
import { MECHANICAL } from './crash';
import { OMNITRIX_ALIENS, isBen, transformBen } from './ben10';
import { PIECE_STATS, sizeOf } from './pieces';
import { Bonus, Coord, GameState, Move, Piece, PieceType, endOfTurn, sameCoord } from './types';

export const BEN10_UPGRADE_COOLDOWNS: Record<string, number> = {
  omnitrix_recharge: 4,
  omnitrix_scanner: 3,
  dna_repair: 4,
  pyronite_flames: 3,
  petrosapien_crystals: 4,
  galvan_intelligence: 4,
  galvanic_mechamorph: 3,
  tokustar_energy: 4,
  plumber_blaster: 3,
  null_void_projector: 0,
  plumber_restraints: 3,
  plumber_teleporter: 4,
  charm_of_telekinesis: 3,
  ascalon: 0,
  dna_fusion: 0,
};
/** Movement and passive upgrades with a cooldown. */
const OTHER_COOLDOWNS: Record<string, number> = { lepidopterran_wings: 3, kineceleran_speed: 3, kevins_absorption: 3 };
export const isBen10Action = (id: string) => id in BEN10_UPGRADE_COOLDOWNS;
const HARMFUL = new Set(['pyronite_flames', 'tokustar_energy', 'plumber_blaster', 'ascalon', 'null_void_projector']);

const charged = (p: Piece, id: string) => {
  if (!has(p, id)) return false;
  const cd = BEN10_UPGRADE_COOLDOWNS[id] ?? OTHER_COOLDOWNS[id];
  return cd === 0 ? !hasUsed(p, id) : (p.counters[`${id}Cd`] ?? 0) <= 0;
};
function spend(p: Piece, id: string) {
  const cd = BEN10_UPGRADE_COOLDOWNS[id] ?? OTHER_COOLDOWNS[id];
  if (cd === 0) markUsed(p, id);
  else if (cd) p.counters[`${id}Cd`] = cd;
}

function firstInLine(s: GameState, from: Coord, d: Coord, reach: number): Piece | undefined {
  for (let k = 1; k <= reach; k++) {
    const c = add(from, scale(d, k));
    if (!inBounds(s.board, c) || isWall(s.board, c)) return undefined;
    const o = pieceAt(s, c);
    if (o) return o;
  }
  return undefined;
}

function lineEnemies(s: GameState, p: Piece, d: Coord, reach: number): Piece[] {
  const out: Piece[] = [];
  for (let k = 1; k <= reach; k++) {
    const c = add(p.pos, scale(d, k));
    if (!inBounds(s.board, c) || isWall(s.board, c)) break;
    const o = pieceAt(s, c);
    if (o && o.side !== p.side && !out.includes(o)) out.push(o);
  }
  return out;
}

export function ben10UpgradeActions(s: GameState, p: Piece): Move[] {
  const out: Move[] = [];
  const act = (upgrade: string, to: Coord, extra: Partial<Move> = {}) => out.push({ pieceId: p.id, from: p.pos, action: 'upgrade', upgrade, to, ...extra });
  const foes = s.pieces.filter((e) => e.side !== p.side);
  const friends = s.pieces.filter((a) => a.side === p.side && a.id !== p.id);
  const can = (id: string) => charged(p, id) && !(cannotAttack(p) && HARMFUL.has(id));
  const small = sizeOf(p) === 1;

  if (can('omnitrix_recharge') && (isBen(p) ? (p.counters.omnitrixCd ?? 0) > 0 : Object.entries(p.counters).some(([k, v]) => k.endsWith('Cd') && v > 0 && k !== 'omnitrix_rechargeCd')))
    act('omnitrix_recharge', p.pos);
  if (can('omnitrix_scanner'))
    for (const e of foes.filter((e) => sizeOf(e) === 1 && !isBoss(e) && e.type !== 'pawn' && pieceDistance(e, p) <= 3)) act('omnitrix_scanner', e.pos, { allyId: e.id });
  if (can('dna_repair') && p.hp < p.maxHp) act('dna_repair', p.pos);
  if (can('pyronite_flames'))
    for (const d of ORTHO) {
      const hit = firstInLine(s, p.pos, d, 3);
      if (hit && hit.side !== p.side) act('pyronite_flames', hit.pos, { allyId: hit.id });
    }
  if (can('petrosapien_crystals'))
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const c = { x: p.pos.x + dx, y: p.pos.y + dy };
        if ((dx || dy) && isStandable(s.board, c) && isEmpty(s, c) && !(s.tiles ?? []).some((t) => sameCoord(t.pos, c))) act('petrosapien_crystals', c);
      }
  if (can('galvan_intelligence'))
    for (const e of foes.filter((e) => MECHANICAL.has(e.type) && !isBoss(e) && pieceDistance(e, p) <= 3)) act('galvan_intelligence', e.pos, { allyId: e.id });
  if (can('galvanic_mechamorph'))
    for (const a of friends.filter((a) => MECHANICAL.has(a.type) && pieceDistance(a, p) === 1)) act('galvanic_mechamorph', a.pos, { allyId: a.id });
  if (can('tokustar_energy') && p.type !== 'way_big')
    for (const d of ORTHO) if (lineEnemies(s, p, d, 6).length) act('tokustar_energy', add(p.pos, d), { param: `${d.x},${d.y}` });
  if (can('plumber_blaster'))
    for (const d of ORTHO) {
      const hit = firstInLine(s, p.pos, d, 4);
      if (hit && hit.side !== p.side) act('plumber_blaster', hit.pos, { allyId: hit.id });
    }
  if (can('null_void_projector'))
    for (const e of foes.filter((e) => !isBoss(e) && e.type !== 'king' && pieceDistance(e, p) <= 3)) act('null_void_projector', e.pos, { allyId: e.id });
  if (can('plumber_restraints'))
    for (const e of foes.filter((e) => !isBoss(e) && pieceDistance(e, p) <= 3)) act('plumber_restraints', e.pos, { allyId: e.id });
  if (can('plumber_teleporter') && small && !hasStatus(p, 'bound'))
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const c = { x: p.pos.x + dx, y: p.pos.y + dy };
        if ((dx || dy) && isStandable(s.board, c) && isEmpty(s, c)) act('plumber_teleporter', c);
      }
  if (can('charm_of_telekinesis'))
    for (const e of foes.filter((e) => sizeOf(e) === 1 && !isBoss(e) && pieceDistance(e, p) <= 3 && !immuneToForcedMove(s, e, p, true)))
      for (const d of ALL_DIRS) {
        const c = add(e.pos, d);
        if (isStandable(s.board, c) && isEmpty(s, c)) act('charm_of_telekinesis', c, { allyId: e.id });
      }
  if (can('ascalon'))
    for (const d of ALL_DIRS) {
      const hit = firstInLine(s, p.pos, d, 3);
      if (hit && hit.side !== p.side) act('ascalon', hit.pos, { allyId: hit.id });
    }
  // DNA Fusion: two friendly pieces' moves — or, for an Ben already transformed, a second alien's.
  if (can('dna_fusion')) {
    if (isBen(p)) {
      if (p.type !== 'ben') for (const a of OMNITRIX_ALIENS.filter((a) => a !== p.type && PIECE_STATS[a].size === 1)) act('dna_fusion', p.pos, { param: a });
    } else {
      const pool = friends.filter((a) => !isBoss(a) && sizeOf(a) === 1 && a.type !== p.type && pieceDistance(a, p) <= 3);
      for (let i = 0; i < pool.length; i++)
        for (let j = i + 1; j < pool.length; j++)
          if (pool[i].type !== pool[j].type) act('dna_fusion', p.pos, { param: `${pool[i].type}+${pool[j].type}`, allyId: pool[i].id });
    }
  }
  // Tetramand Strength: knock down an adjacent cracked wall.
  if (has(p, 'tetramand_strength'))
    for (const d of ALL_DIRS) {
      const c = add(p.pos, d);
      if (inBounds(s.board, c) && terrainAt(s.board, c) === 'cracked') out.push({ pieceId: p.id, from: p.pos, to: c, action: 'demolish' });
    }
  return out;
}

export function resolveBen10Upgrade(s: GameState, m: Move) {
  const p = getPiece(s, m.pieceId)!;
  const id = m.upgrade!;
  spend(p, id);
  const target = getPiece(s, m.allyId);
  switch (id) {
    case 'omnitrix_recharge':
      if (isBen(p)) p.counters.omnitrixCd = Math.max(0, (p.counters.omnitrixCd ?? 0) - 2);
      else {
        const key = Object.entries(p.counters)
          .filter(([k, v]) => k.endsWith('Cd') && v > 0 && k !== 'omnitrix_rechargeCd')
          .sort((a, b) => b[1] - a[1])[0]?.[0];
        if (key) p.counters[key] -= 1;
      }
      break;
    case 'omnitrix_scanner':
      if (target) addStatus(p, { kind: 'copying', until: endOfTurn(s.ply, p.side), source: target.type });
      break;
    case 'dna_repair':
      heal(s, p, 1);
      break;
    case 'pyronite_flames':
      if (target) {
        const pos = { ...target.pos };
        dealDamage(s, target.id, 1, { sourceId: p.id, kind: 'ranged' });
        const second = s.pieces.find((e) => e.side !== p.side && e.id !== target.id && Math.max(Math.abs(e.pos.x - pos.x), Math.abs(e.pos.y - pos.y)) === 1);
        if (second) dealDamage(s, second.id, 1, { sourceId: p.id, kind: 'splash' });
      }
      break;
    case 'petrosapien_crystals':
      setTerrain(s, m.to, 'cracked');
      break;
    case 'galvan_intelligence':
      if (target) addStatus(target, { kind: 'stunned', until: endOfTurn(s.ply, target.side), source: 'galvan' });
      break;
    case 'galvanic_mechamorph':
      if (target) {
        const until = endOfTurn(s.ply, target.side, 2);
        addStatus(target, { kind: 'damageBuff', amount: 1, until, source: 'mechamorph' });
        addStatus(target, { kind: 'rangeBuff', amount: 1, until, source: 'mechamorph' });
      }
      break;
    case 'tokustar_energy': {
      const [dx, dy] = (m.param ?? '0,1').split(',').map(Number);
      for (const e of lineEnemies(s, p, { x: dx, y: dy }, 6)) dealDamage(s, e.id, 2, { sourceId: p.id, kind: 'ranged' });
      break;
    }
    case 'plumber_blaster':
      if (target) dealDamage(s, target.id, 1, { sourceId: p.id, kind: 'ranged' });
      break;
    case 'null_void_projector':
      if (target) {
        s.pieces = s.pieces.filter((o) => o.id !== target.id);
        s.voided = [...(s.voided ?? []), { piece: target, at: { ...target.pos }, until: endOfTurn(s.ply, target.side, 2) }];
        log(s, `The ${PIECE_STATS[target.type].name} is sent to the Null Void!`);
      }
      break;
    case 'plumber_restraints':
      if (target) addStatus(target, { kind: 'bound', until: endOfTurn(s.ply, target.side, 2), source: 'restraints' });
      break;
    case 'plumber_teleporter':
      p.pos = { ...m.to };
      break;
    case 'charm_of_telekinesis':
      if (target && isEmpty(s, m.to)) target.pos = { ...m.to };
      break;
    case 'ascalon':
      if (target) dealDamage(s, target.id, 2, { sourceId: p.id, kind: 'ranged' });
      break;
    case 'dna_fusion':
      if (isBen(p)) {
        transformBen(s, p, p.type, p.pos, m.param as PieceType);
      } else {
        const [a, b] = (m.param ?? '').split('+') as PieceType[];
        const until = endOfTurn(s.ply, p.side, 3);
        addStatus(p, { kind: 'copying', until, source: a });
        addStatus(p, { kind: 'copying2', until, source: b });
        if (p.maxHp < 3) p.maxHp += 1;
        heal(s, p, 1);
        log(s, `DNA Fusion: the ${PIECE_STATS[p.type].name} gains the ${PIECE_STATS[a].name} and ${PIECE_STATS[b].name}'s moves!`);
      }
      break;
  }
}

/** Extra movement: Lepidopterran Wings, Galvan Intelligence, Ectonurite Phasing, Ascalon. */
export function ben10UpgradeSteps(s: GameState, p: Piece, slides: { dir: Coord; max: number }[]) {
  if (!p.upgrades.length || sizeOf(p) !== 1 || hasStatus(p, 'bound')) return [];
  const out: { to: Coord; capture: boolean; quiet: boolean; leap: boolean; uses: string[] }[] = [];
  if (charged(p, 'lepidopterran_wings'))
    for (const d of DIAG) {
      const c = add(p.pos, scale(d, 3));
      if (!inBounds(s.board, c) || isWall(s.board, c) || terrainAt(s.board, c) === 'void') continue;
      const o = pieceAt(s, c);
      if (o && o.side === p.side) continue;
      out.push({ to: c, capture: !!o, quiet: !o, leap: true, uses: ['lepidopterran_wings'] });
    }
  const phase = (walls: boolean, use: string) => {
    for (const { dir, max } of slides) {
      let through = false;
      for (let k = 1; k <= max; k++) {
        const c = add(p.pos, scale(dir, k));
        if (!inBounds(s.board, c) || terrainAt(s.board, c) === 'void') break;
        if (isStandable(s.board, c) && isEmpty(s, c)) {
          if (through) out.push({ to: c, capture: false, quiet: true, leap: false, uses: [use] });
        } else if (terrainAt(s.board, c) === 'gap') break;
        else if (!walls && isWall(s.board, c)) break;
        else through = true;
      }
    }
  };
  if (has(p, 'ectonurite_phasing')) phase(true, 'ectonurite_phasing');
  else if (has(p, 'galvan_intelligence')) phase(false, 'galvan_intelligence');
  // Lepidopterran Wings: may also come to rest on a gap.
  if (has(p, 'lepidopterran_wings'))
    for (const { dir, max } of slides)
      for (let k = 1; k <= max; k++) {
        const c = add(p.pos, scale(dir, k));
        if (!inBounds(s.board, c) || isWall(s.board, c) || terrainAt(s.board, c) === 'void') break;
        if (pieceAt(s, c)) break;
        if (terrainAt(s.board, c) === 'gap') out.push({ to: c, capture: false, quiet: true, leap: false, uses: ['flight'] });
      }
  // Ascalon: slides cut through cracked walls.
  if (has(p, 'ascalon'))
    for (const { dir, max } of slides) {
      let broke = false;
      for (let k = 1; k <= max; k++) {
        const c = add(p.pos, scale(dir, k));
        if (!inBounds(s.board, c)) break;
        if (terrainAt(s.board, c) === 'cracked') {
          broke = true;
          continue;
        }
        if (!isStandable(s.board, c)) break;
        const o = pieceAt(s, c);
        if (o && o.side === p.side) break;
        if (broke) out.push({ to: c, capture: !!o, quiet: !o, leap: false, uses: ['ascalon_cut'] });
        if (o) break;
      }
    }
  return out;
}

/** Sliding range from upgrades. */
export const ben10UpgradeRange = (p: Piece) =>
  (has(p, 'omnitrix_dial') ? 1 : 0) + (has(p, 'master_control') ? 1 : 0) + (has(p, 'kineceleran_speed') ? 2 : 0) + (has(p, 'vilgax_cybernetics') ? 1 : 0);

/** Extra direct-attack damage from upgrades. */
export function ben10UpgradeAttackBonus(p: Piece, m: Move): number {
  let dmg = 0;
  if (has(p, 'tetramand_strength')) dmg += 1;
  if (has(p, 'vilgax_cybernetics')) dmg += 1;
  if (has(p, 'ascalon')) dmg += 1;
  if (has(p, 'piscciss_jaws') && p.attacks === 0) dmg += 1;
  if (has(p, 'pelarota_armor') && !m.action && !m.leap) {
    const n = Math.max(Math.abs(m.to.x - m.from.x), Math.abs(m.to.y - m.from.y));
    if (n >= 3) dmg += 1;
  }
  return dmg;
}

/** Charm of Luck (50%, once) and Ectonurite Phasing (the first ranged attack). True if the attack is negated. */
export function ben10UpgradeNegates(s: GameState, target: Piece, source: Piece | undefined, amount: number, ranged: boolean): boolean {
  if (amount <= 0) return false;
  if (ranged && has(target, 'ectonurite_phasing') && !hasUsed(target, 'ectonurite_phasing')) {
    markUsed(target, 'ectonurite_phasing');
    log(s, 'The shot passes through!');
    return true;
  }
  if (has(target, 'charm_of_luck') && !hasUsed(target, 'charm_of_luck')) {
    markUsed(target, 'charm_of_luck');
    let h = (s.ply + 3) | 0;
    for (const ch of `${target.id}|${source?.id ?? ''}|${target.pos.x},${target.pos.y}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12;
    if (((h >>> 0) & 1) === 1) {
      const spot = ALL_DIRS.map((d) => add(target.pos, d)).find((c) => isStandable(s.board, c) && isEmpty(s, c));
      if (spot) target.pos = { ...spot };
      log(s, 'The Charm of Luck turns the blow aside!');
      return true;
    }
  }
  return false;
}

/** Plumber Armor and Pelarota Armor: the first point of damage each battle. */
export function ben10UpgradeReduction(target: Piece, dmg: number): number {
  if (dmg > 0 && has(target, 'pelarota_armor') && !target.counters.pelarotaUsed) {
    target.counters.pelarotaUsed = 1;
    return dmg - 1;
  }
  return dmg;
}

/** Kevin's Energy Absorption: surviving an attack charges the next one (every 3 turns). */
export function ben10UpgradeAfterHit(s: GameState, target: Piece) {
  if (!getPiece(s, target.id) || !charged(target, 'kevins_absorption')) return;
  spend(target, 'kevins_absorption');
  addStatus(target, { kind: 'damageBuff', amount: 1, until: null, source: 'absorption' });
  if (target.type === 'kevin_11') heal(s, target, 1);
  log(s, `The ${PIECE_STATS[target.type].name} absorbs the energy!`);
}

/** Omnitrix Failsafe: once, survive at 1 HP — Ben in human form transforms into an alien instead. True if saved. */
export function omnitrixFailsafe(s: GameState, p: Piece): boolean {
  if (!has(p, 'omnitrix_failsafe') || hasUsed(p, 'omnitrix_failsafe')) return false;
  markUsed(p, 'omnitrix_failsafe');
  if (p.type === 'ben') {
    const options = OMNITRIX_ALIENS.filter((a) => PIECE_STATS[a].size === 1);
    const alien = options[(s.ply + p.pos.x * 7 + p.pos.y * 13) % options.length];
    transformBen(s, p, alien, p.pos);
    p.hp = p.maxHp;
    log(s, 'The Omnitrix failsafe kicks in!');
    return true;
  }
  p.hp = 1;
  log(s, `The ${PIECE_STATS[p.type].name}'s failsafe kicks in — it survives at 1 HP!`);
  return true;
}

/** Before a move: Ascalon cuts the cracked walls on its path. */
export function ben10UpgradeBeforeMove(s: GameState, m: Move) {
  if (!m.uses?.includes('ascalon_cut')) return;
  const p = getPiece(s, m.pieceId);
  const d = sign(sub(m.to, m.from));
  const n = Math.max(Math.abs(m.to.x - m.from.x), Math.abs(m.to.y - m.from.y));
  for (let k = 1; k < n; k++) {
    const c = add(m.from, scale(d, k));
    if (terrainAt(s.board, c) === 'cracked') destroyCracked(s, c, p);
  }
}

/** After a move: cooldowns, Kineceleran Speed's second move, and Piscciss Volann Jaws' hop. */
export function ben10UpgradeAfterMove(s: GameState, m: Move, from: Coord | undefined, entry: Bonus | undefined, captured: number) {
  const p = getPiece(s, m.pieceId);
  if (!p || !p.upgrades.length) return;
  if (m.uses?.includes('lepidopterran_wings')) spend(p, 'lepidopterran_wings');
  if (entry?.source === 'kineceleran') spend(p, 'kineceleran_speed');
  const moved = !!from && !sameCoord(from, p.pos);
  if (captured > 0 && has(p, 'piscciss_jaws') && p.attacks === 1 && entry?.source !== 'piscciss' && sizeOf(p) === 1)
    s.bonus.unshift({ pieceId: p.id, filter: 'nonCapturing', optional: true, source: 'piscciss', maxDistance: 1 });
  if (moved && !m.action && !entry && charged(p, 'kineceleran_speed')) s.bonus.unshift({ pieceId: p.id, filter: 'nonCapturing', optional: true, source: 'kineceleran' });
}

/** End of a ply: pieces in the Null Void come back when their time is up. */
export function nullVoidReturn(s: GameState) {
  for (const v of (s.voided ?? []).filter((v) => v.until <= s.ply)) {
    const spot = isEmpty(s, v.at) && isStandable(s.board, v.at) ? v.at : nearestEmpty(s, v.at, 8);
    s.voided = s.voided!.filter((o) => o !== v);
    if (!spot) continue;
    v.piece.pos = { ...spot };
    s.pieces.push(v.piece);
    log(s, `The ${PIECE_STATS[v.piece.type].name} returns from the Null Void.`);
  }
}

