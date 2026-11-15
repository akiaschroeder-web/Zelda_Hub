/**
 * Activated upgrade abilities: generation of the moves that use them and
 * their resolution. A move with `action: 'upgrade'` names the upgrade in
 * `move.upgrade` and its target square in `move.to`.
 */
import { inBounds, isStandable, isWall, terrainAt } from './board';
import {
  ALL_DIRS,
  NEGATIVE,
  ORTHO,
  add,
  addShield,
  addStatus,
  addTimedTerrain,
  adjacent,
  anyHas,
  allies,
  capture,
  collapseBridge,
  dealDamage,
  destroyCracked,
  emptyZoneSquare,
  distance,
  distanceTo,
  enemiesOf,
  getPiece,
  has,
  hasStatus,
  heal,
  healBy,
  isBoss,
  isEmpty,
  kingOf,
  log,
  markUsed,
  nameOf,
  pieceAt,
  pieceDistance,
  ready,
  removeStatus,
  setTerrain,
  silenced,
  summon,
  summonSquares,
  suppressed,
  upgradeName,
} from './core';
import { sizeOf } from './pieces';
import { haunted } from './bosses';
import { isZeldaAction, resolveZeldaUpgrade, zeldaUpgradeActions } from './zeldaUpgrades';
import { isSonicAction, resolveSonicUpgrade, sonicUpgradeActions } from './sonicUpgrades';
import { peelOutSquares } from './movement';
import { Coord, GameState, Move, Piece, PieceType, Side, endOfTurn, opponent, sameCoord, shieldTotal } from './types';

/** Upgrade actions that move pieces around (blocked by Bind and Suppression). */
const MOVEMENT_ACTIONS = new Set([
  'void_step',
  'dimensional_shift',
  'rescue',
  'royal_retreat',
  'royal_swap',
  'summon_swap',
  'emergency_evacuation',
  'army_recall',
  'battering_ram',
  'wall_swap',
]);

/** Actions that cost no turn: they set up bonus moves instead. */
export const FREE_ACTIONS = new Set(['royal_authority', 'royal_command', 'checkmate_gambit', 'temporal_echo', 'siege_master']);

/** Actions that can damage enemies (blocked by Disarm / Pacify). */
const HARMFUL = new Set(['final_gambit', 'explosive_breach']);

function within(p: Piece, c: Coord, r: number) {
  return distanceTo(p, c) <= r && distanceTo(p, c) >= 1;
}

/** Squares within `r` of a piece. */
function squaresNear(s: GameState, p: Piece, r: number): Coord[] {
  const out: Coord[] = [];
  for (let y = p.pos.y - r; y <= p.pos.y + sizeOf(p) - 1 + r; y++)
    for (let x = p.pos.x - r; x <= p.pos.x + sizeOf(p) - 1 + r; x++) {
      const c = { x, y };
      if (inBounds(s.board, c) && within(p, c, r)) out.push(c);
    }
  return out;
}

const healRange = (p: Piece) => 1 + (has(p, 'extended_healing') ? 1 : 0);
const canHeal = (healer: Piece, t: Piece) =>
  t.hp < t.maxHp && (t.type !== 'king' || has(healer, 'royal_physician')) && pieceDistance(healer, t) <= healRange(healer);

/** Generate every upgrade action available to a piece. */
export function upgradeActions(s: GameState, p: Piece): Move[] {
  if (p.upgrades.length === 0 && !anyHas(s, 'structural_weakness')) return [];
  if (silenced(p) || haunted(s, p)) return [];
  const moves: Move[] = [];
  const base = { pieceId: p.id, from: p.pos, action: 'upgrade' as const };
  const act = (upgrade: string, to: Coord, extra: Partial<Move> = {}) => moves.push({ ...base, upgrade, to, ...extra });
  const enemies = enemiesOf(s, p);
  const friends = allies(s, p);
  const near = (r: number) => squaresNear(s, p, r);
  const king = kingOf(s, p.side);
  const statusTargets = (r: number, allowKing = true) =>
    enemies.filter((e) => pieceDistance(e, p) <= r && !isBoss(e) && (allowKing || e.type !== 'king'));
  const cracked = near(1).filter((c) => terrainAt(s.board, c) === 'cracked');

  // --- Defense
  if (has(p, 'shield_transfer') && shieldTotal(p) > 0)
    friends.filter((a) => adjacent(a, p)).forEach((a) => act('shield_transfer', a.pos, { allyId: a.id }));
  if (ready(p, 'impenetrable')) act('impenetrable', p.pos);

  // --- Terrain & gaps
  const gaps = near(1).filter((c) => terrainAt(s.board, c) === 'gap');
  if (has(p, 'bridge_builder')) gaps.forEach((c) => act('bridge_builder', c));
  if (ready(p, 'permanent_bridge')) gaps.forEach((c) => act('permanent_bridge', c));
  if (has(p, 'temporary_platform')) gaps.forEach((c) => act('temporary_platform', c));
  if (has(p, 'bridge_collapse')) s.timed.filter((t) => t.kind === 'bridge').forEach((t) => act('bridge_collapse', t.pos));
  if (ready(p, 'gap_conversion')) near(1).filter((c) => isEmpty(s, c)).forEach((c) => act('gap_conversion', c));
  if (ready(p, 'void_step') && sizeOf(p) === 1) {
    for (const d of ALL_DIRS) {
      let c = add(p.pos, d);
      let crossed = false;
      while (inBounds(s.board, c) && terrainAt(s.board, c) === 'gap') {
        crossed = true;
        c = add(c, d);
      }
      if (crossed && isEmpty(s, c)) act('void_step', c);
    }
  }

  // --- Walls
  if (has(p, 'demolition')) cracked.forEach((c) => act('demolition', c));
  if (has(p, 'battering_ram') && sizeOf(p) === 1) cracked.forEach((c) => act('battering_ram', c));
  if (has(p, 'wall_swap') && sizeOf(p) === 1) cracked.forEach((c) => act('wall_swap', c));
  if (has(p, 'reinforcement')) cracked.forEach((c) => act('reinforcement', c));
  if (has(p, 'explosive_breach')) cracked.forEach((c) => act('explosive_breach', c));
  if (ready(p, 'siege_master')) cracked.forEach((c) => act('siege_master', c));
  if (ready(p, 'shatter') && near(2).some((c) => terrainAt(s.board, c) === 'cracked')) act('shatter', p.pos);
  if (ready(p, 'absolute_demolition'))
    near(1).filter((c) => terrainAt(s.board, c) === 'wall').forEach((c) => act('absolute_demolition', c));
  if (has(p, 'barricade')) near(1).filter((c) => isEmpty(s, c)).forEach((c) => act('barricade', c));
  if (has(p, 'wall_repair'))
    s.destroyedWalls.filter((c) => within(p, c, 1) && isEmpty(s, c)).forEach((c) => act('wall_repair', c));
  if (has(p, 'siege_strike')) {
    for (const d of [...ORTHO, ...ALL_DIRS.slice(4)]) {
      let c = add(p.pos, d);
      while (isEmpty(s, c)) c = add(c, d);
      if (terrainAt(s.board, c) === 'cracked') act('siege_strike', c);
    }
  }
  // Structural Weakness: allies of a carrier may knock down cracked walls next to the carrier.
  const weakeners = friends.filter((a) => has(a, 'structural_weakness'));
  if (weakeners.length && !has(p, 'demolition')) {
    cracked
      .filter((c) => weakeners.some((w) => distanceTo(w, c) <= 1))
      .forEach((c) => act('structural_weakness', c));
  }

  // --- Support & healing
  const wounded = friends.filter((a) => canHeal(p, a));
  if (has(p, 'field_medic')) wounded.forEach((a) => act('field_medic', a.pos, { allyId: a.id }));
  if (ready(p, 'group_healing') && wounded.some((a) => adjacent(a, p))) act('group_healing', p.pos);
  if (has(p, 'life_transfer') && p.hp >= 2) wounded.filter((a) => adjacent(a, p)).forEach((a) => act('life_transfer', a.pos, { allyId: a.id }));
  if (has(p, 'protective_blessing'))
    friends.filter((a) => adjacent(a, p) && shieldTotal(a) < 2).forEach((a) => act('protective_blessing', a.pos, { allyId: a.id }));
  if (has(p, 'rescue') && sizeOf(p) === 1) {
    const behind = { x: p.pos.x, y: p.pos.y + (p.side === 'player' ? 1 : -1) };
    if (isEmpty(s, behind))
      friends.filter((a) => adjacent(a, p) && sizeOf(a) === 1 && a.type !== 'king').forEach((a) => act('rescue', behind, { allyId: a.id }));
  }
  if (has(p, 'rally')) friends.filter((a) => adjacent(a, p)).forEach((a) => act('rally', a.pos, { allyId: a.id }));
  if (ready(p, 'battlefield_inspiration') && friends.some((a) => adjacent(a, p))) act('battlefield_inspiration', p.pos);
  if (has(p, 'cleansing'))
    friends
      .filter((a) => adjacent(a, p) && a.statuses.some((st) => NEGATIVE.includes(st.kind)))
      .forEach((a) => act('cleansing', a.pos, { allyId: a.id }));
  if (ready(p, 'emergency_evacuation') && emptyZoneSquare(s, p.side))
    friends.filter((a) => a.hp === 1 && a.maxHp > 1 && sizeOf(a) === 1).forEach((a) => act('emergency_evacuation', a.pos, { allyId: a.id }));
  if (ready(p, 'miracle_recovery'))
    friends.filter((a) => a.hp < a.maxHp && a.type !== 'king').forEach((a) => act('miracle_recovery', a.pos, { allyId: a.id }));
  if (ready(p, 'sanctuary')) act('sanctuary', p.pos);

  // --- Status effects & control
  const bindRange = has(p, 'extended_bind') ? 2 : 1;
  if (has(p, 'bind'))
    statusTargets(bindRange, false)
      .filter((e) => sizeOf(e) === 1 && !hasStatus(e, 'bound'))
      .forEach((e) => act('bind', e.pos, { allyId: e.id }));
  const simple: [string, number, boolean][] = [
    ['silence', 2, true],
    ['slow', 2, true],
    ['disarm', 2, true],
    ['mark', 2, true],
    ['blind', 2, true],
    ['cripple', 2, true],
    ['exhaust', 2, true],
    ['confusion', 2, true],
    ['curse', 2, false],
    ['vulnerability', 2, true],
    ['pacify', 2, true],
  ];
  for (const [id, r, king] of simple) if (has(p, id)) statusTargets(r, king).forEach((e) => act(id, e.pos, { allyId: e.id }));
  if (has(p, 'fear')) statusTargets(1, false).filter((e) => sizeOf(e) === 1).forEach((e) => act('fear', e.pos, { allyId: e.id }));
  if (ready(p, 'permanent_mark')) statusTargets(3, true).forEach((e) => act('permanent_mark', e.pos, { allyId: e.id }));
  if (ready(p, 'absolute_silence')) statusTargets(3, true).forEach((e) => act('absolute_silence', e.pos, { allyId: e.id }));
  if (has(p, 'root'))
    [p, ...friends.filter((a) => pieceDistance(a, p) <= 2)]
      .filter((a) => !hasStatus(a, 'rooted'))
      .forEach((a) => act('root', a.pos, { allyId: a.id }));

  // --- Summons
  const spots = summonSquares(s, p);
  if (spots.length) {
    if (ready(p, 'pawn_summon')) spots.forEach((c) => act('pawn_summon', c));
    if (ready(p, 'decoy')) spots.forEach((c) => act('decoy', c));
    if (ready(p, 'mirror_image') && sizeOf(p) === 1) spots.forEach((c) => act('mirror_image', c));
    if (ready(p, 'temporary_knight')) spots.forEach((c) => act('temporary_knight', c));
    if (ready(p, 'perfect_clone') && sizeOf(p) === 1 && p.type !== 'king') spots.forEach((c) => act('perfect_clone', c));
    if (ready(p, 'double_pawn_summon') && spots.length >= 2) act('double_pawn_summon', p.pos);
    if (ready(p, 'pawn_swarm') && spots.length >= 1) act('pawn_swarm', p.pos);
    if (ready(p, 'army_of_one') && sizeOf(p) === 1 && p.type !== 'king' && spots.length >= 1) act('army_of_one', p.pos);
  }
  const mySummons = s.pieces.filter((a) => a.temp?.summonerId === p.id);
  if (has(p, 'sacrificial_summon') && p.hp < p.maxHp)
    mySummons.filter((a) => adjacent(a, p)).forEach((a) => act('sacrificial_summon', a.pos, { allyId: a.id }));
  if (has(p, 'summon_swap') && sizeOf(p) === 1) mySummons.filter((a) => sizeOf(a) === 1).forEach((a) => act('summon_swap', a.pos, { allyId: a.id }));
  if (has(p, 'summon_recall'))
    for (const a of mySummons) for (const c of spots) act('summon_recall', c, { allyId: a.id });
  if (has(p, 'summon_conversion'))
    for (const a of mySummons.filter((a) => sizeOf(a) === 1))
      for (const t of ['knight', 'bishop', 'rook'] as PieceType[]) if (a.type !== t) act('summon_conversion', a.pos, { allyId: a.id, param: t });

  // --- Heavy
  if (ready(p, 'wide_healing') && friends.some((a) => adjacent(a, p) && a.hp < a.maxHp && a.type !== 'king')) act('wide_healing', p.pos);

  // --- Royal
  if (king && king.id !== p.id) {
    const reach = has(p, 'crowns_reach') ? 2 : 1;
    const zoneSpot = emptyZoneSquare(s, p.side);
    if (ready(p, 'royal_retreat') && zoneSpot && !hasStatus(king, 'bound')) act('royal_retreat', zoneSpot, { allyId: king.id });
    if (ready(p, 'royal_swap') && sizeOf(p) === 1 && pieceDistance(p, king) <= Math.max(reach, 8)) act('royal_swap', king.pos, { allyId: king.id });
    if (ready(p, 'royal_authority') && !hasStatus(king, 'stunned')) act('royal_authority', king.pos, { allyId: king.id });
    if (ready(p, 'royal_sanctuary')) act('royal_sanctuary', king.pos, { allyId: king.id });
    if (ready(p, 'kings_path'))
      ALL_DIRS.map((d) => add(king.pos, d))
        .filter((c) => inBounds(s.board, c) && terrainAt(s.board, c) === 'gap')
        .forEach((c) => act('kings_path', c));
  }
  if (has(p, 'royal_command') && (p.counters.royalCommandCd ?? 0) <= 0)
    friends.filter((a) => adjacent(a, p) && !hasStatus(a, 'stunned')).forEach((a) => act('royal_command', a.pos, { allyId: a.id }));

  // --- Legendary
  if (ready(p, 'time_reversal') && s.snapshot[p.side] && s.bonus.length === 0) act('time_reversal', p.pos);
  if (ready(p, 'dimensional_shift') && sizeOf(p) === 1)
    for (let y = 0; y < s.board.height; y++)
      for (let x = 0; x < s.board.width; x++) if (isEmpty(s, { x, y }) && distance(p.pos, { x, y }) > 1) act('dimensional_shift', { x, y });
  if (has(p, 'board_rewrite') && (p.counters.rewrites ?? 0) < 3)
    near(3)
      .filter((c) => !pieceAt(s, c) && (terrainAt(s.board, c) === 'normal' || terrainAt(s.board, c) === 'gap'))
      .forEach((c) => act('board_rewrite', c));
  if (ready(p, 'kings_decree')) act('kings_decree', p.pos);
  if (ready(p, 'mass_promotion') && friends.some((a) => a.type === 'pawn')) act('mass_promotion', p.pos);
  if (ready(p, 'chrono_lock')) statusTargets(3, false).forEach((e) => act('chrono_lock', e.pos, { allyId: e.id }));
  if (ready(p, 'unbreakable_formation') && friends.some((a) => adjacent(a, p))) act('unbreakable_formation', p.pos);
  if (ready(p, 'army_recall') && emptyZoneSquare(s, p.side)) act('army_recall', p.pos);
  if (ready(p, 'total_demolition') && s.board.terrain.some((row) => row.includes('cracked'))) act('total_demolition', p.pos);
  if (ready(p, 'fate_exchange'))
    s.pieces
      .filter((o) => o.id !== p.id && adjacent(o, p) && o.type !== 'king' && !isBoss(o) && o.hp !== p.hp)
      .forEach((o) => act('fate_exchange', o.pos, { allyId: o.id }));
  if (has(p, 'final_gambit') && p.type !== 'king' && enemies.some((e) => adjacent(e, p))) act('final_gambit', p.pos);
  if (ready(p, 'checkmate_gambit')) statusTargets(3, false).forEach((e) => act('checkmate_gambit', e.pos, { allyId: e.id }));

  moves.push(...zeldaUpgradeActions(s, p));
  moves.push(...sonicUpgradeActions(s, p, () => peelOutSquares(s, p)));

  return moves.filter((m) => {
    if ((hasStatus(p, 'bound') || suppressed(s, p)) && MOVEMENT_ACTIONS.has(m.upgrade!)) return false;
    if ((hasStatus(p, 'disarmed') || hasStatus(p, 'pacified')) && HARMFUL.has(m.upgrade!)) return false;
    return true;
  });
}

/** Temporal Echo needs the move generator; it is wired in from moves.ts. */
export type OrdinaryResolver = (s: GameState, m: Move) => void;

/** Resolve an upgrade action on the working state. */
export function resolveUpgradeAction(s: GameState, m: Move): void {
  const p = getPiece(s, m.pieceId)!;
  const id = m.upgrade!;
  const ally = getPiece(s, m.allyId);
  const turns = (n: number, side: Side = opponent(p.side)) => endOfTurn(s.ply, side, n);
  const once = () => markUsed(p, id);
  log(s, `${nameOf(p)} uses ${upgradeName(id)}.`);
  if (isZeldaAction(id)) {
    resolveZeldaUpgrade(s, m);
    return;
  }
  if (isSonicAction(id)) {
    resolveSonicUpgrade(s, m);
    return;
  }

  switch (id) {
    // Defense
    case 'shield_transfer':
      if (ally) {
        ally.shields.push(...p.shields);
        p.shields = [];
      }
      break;
    case 'impenetrable':
      once();
      addStatus(p, { kind: 'immune', until: turns(1, opponent(p.side)) });
      break;

    // Terrain
    case 'bridge_builder':
      addTimedTerrain(s, m.to, 'bridge', 3, p.side, p);
      break;
    case 'temporary_platform':
      addTimedTerrain(s, m.to, 'bridge', 2, p.side, p);
      break;
    case 'permanent_bridge':
      once();
      setTerrain(s, m.to, 'normal');
      break;
    case 'bridge_collapse':
      collapseBridge(s, m.to);
      break;
    case 'gap_conversion':
      once();
      setTerrain(s, m.to, 'gap');
      break;
    case 'void_step':
    case 'dimensional_shift':
      once();
      p.pos = { ...m.to };
      break;

    // Walls
    case 'demolition':
    case 'siege_strike':
    case 'structural_weakness':
      demolish(s, p, m.to);
      break;
    case 'battering_ram':
    case 'wall_swap':
      if (destroyCracked(s, m.to, p)) p.pos = { ...m.to };
      chainDemolition(s, p, m.to);
      break;
    case 'reinforcement':
      setTerrain(s, m.to, 'wall');
      break;
    case 'explosive_breach':
      if (demolish(s, p, m.to))
        for (const e of enemiesOf(s, p).filter((e) => distanceTo(e, m.to) === 1)) dealDamage(s, e.id, 1, { kind: 'splash', sourceId: p.id });
      break;
    case 'siege_master':
      once();
      demolish(s, p, m.to);
      s.bonus.unshift({ pieceId: p.id, filter: 'any', optional: true, source: 'siege_master' });
      break;
    case 'shatter': {
      once();
      // Flood-fill connected cracked walls starting within two squares.
      const queue = squaresNear(s, p, 2).filter((c) => terrainAt(s.board, c) === 'cracked');
      const seen = new Set<string>();
      while (queue.length) {
        const c = queue.pop()!;
        const k = `${c.x},${c.y}`;
        if (seen.has(k) || terrainAt(s.board, c) !== 'cracked') continue;
        seen.add(k);
        destroyCracked(s, c, p);
        for (const d of ALL_DIRS) {
          const q = add(c, d);
          if (distanceTo(p, q) <= 2) queue.push(q);
        }
      }
      break;
    }
    case 'absolute_demolition':
      once();
      setTerrain(s, m.to, 'normal');
      break;
    case 'barricade':
      addTimedTerrain(s, m.to, 'barricade', 3, p.side, p);
      break;
    case 'wall_repair':
      if (setTerrain(s, m.to, 'cracked')) s.destroyedWalls = s.destroyedWalls.filter((c) => !sameCoord(c, m.to));
      break;

    // Support
    case 'field_medic':
      if (ally) healBy(s, p, ally, 1);
      break;
    case 'group_healing':
      once();
      allies(s, p)
        .filter((a) => adjacent(a, p) && (a.type !== 'king' || has(p, 'royal_physician')))
        .forEach((a) => healBy(s, p, a, 1));
      break;
    case 'wide_healing':
      once();
      allies(s, p)
        .filter((a) => adjacent(a, p) && a.type !== 'king')
        .forEach((a) => healBy(s, p, a, 1));
      break;
    case 'life_transfer':
      if (ally) {
        p.hp -= 1;
        healBy(s, p, ally, 2);
      }
      break;
    case 'protective_blessing':
      if (ally) addShield(s, ally);
      break;
    case 'rescue':
      if (ally) ally.pos = { ...m.to };
      break;
    case 'rally':
      if (ally) addStatus(ally, { kind: 'rangeBuff', amount: 1, until: endOfTurn(s.ply, ally.side) });
      break;
    case 'battlefield_inspiration':
      once();
      allies(s, p)
        .filter((a) => adjacent(a, p))
        .forEach((a) => addStatus(a, { kind: 'rangeBuff', amount: 1, until: endOfTurn(s.ply, a.side) }));
      break;
    case 'cleansing':
      if (ally) {
        const bad = ally.statuses.find((st) => NEGATIVE.includes(st.kind));
        if (bad) removeStatus(ally, bad.kind);
      }
      break;
    case 'emergency_evacuation': {
      once();
      const spot = emptyZoneSquare(s, p.side);
      if (ally && spot) ally.pos = spot;
      break;
    }
    case 'miracle_recovery':
      once();
      if (ally) ally.hp = ally.maxHp;
      break;
    case 'sanctuary': {
      once();
      const cells: Coord[] = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cells.push({ x: p.pos.x + dx, y: p.pos.y + dy });
      s.zones.push({ cells, side: p.side, until: endOfTurn(s.ply, p.side, 2) });
      break;
    }

    // Status
    case 'bind':
      if (ally) {
        addStatus(ally, { kind: 'bound', until: turns(1, ally.side) });
        if (has(p, 'chain_bind')) {
          const next = enemiesOf(s, p).find((e) => e.id !== ally.id && adjacent(e, ally) && sizeOf(e) === 1 && e.type !== 'king');
          if (next) addStatus(next, { kind: 'bound', until: turns(1, next.side) });
        }
      }
      break;
    case 'silence':
      if (ally) addStatus(ally, { kind: 'silenced', until: turns(1, ally.side) });
      break;
    case 'slow':
      if (ally) addStatus(ally, { kind: 'slowed', until: turns(2, ally.side) });
      break;
    case 'disarm':
      if (ally) addStatus(ally, { kind: 'disarmed', until: turns(1, ally.side) });
      break;
    case 'mark':
      if (ally) addStatus(ally, { kind: 'marked', until: null });
      break;
    case 'blind':
      if (ally) addStatus(ally, { kind: 'blinded', until: turns(1, ally.side) });
      break;
    case 'cripple':
      if (ally) addStatus(ally, { kind: 'crippled', until: turns(1, ally.side) });
      break;
    case 'exhaust':
      if (ally) for (const k of Object.keys(ally.counters)) if (k.endsWith('Cd')) ally.counters[k] += 2;
      break;
    case 'root':
      if (ally) addStatus(ally, { kind: 'rooted', until: turns(2, ally.side) });
      break;
    case 'fear':
      if (ally) {
        const dir = { x: Math.sign(ally.pos.x - p.pos.x), y: Math.sign(ally.pos.y - p.pos.y) };
        const options = [dir, ...ALL_DIRS].map((d) => add(ally.pos, d)).filter((c) => isEmpty(s, c) && distance(c, p.pos) > distance(ally.pos, p.pos));
        if (options[0]) ally.pos = options[0];
      }
      break;
    case 'confusion':
      if (ally) addStatus(ally, { kind: 'confused', until: turns(1, ally.side) });
      break;
    case 'curse':
      if (ally && ally.maxHp > 1) {
        ally.maxHp -= 1;
        ally.hp = Math.min(ally.hp, ally.maxHp);
        addStatus(ally, { kind: 'cursed', until: null });
      }
      break;
    case 'vulnerability':
      if (ally) addStatus(ally, { kind: 'vulnerable', until: null, count: 2 });
      break;
    case 'pacify':
      if (ally) addStatus(ally, { kind: 'pacified', until: turns(1, ally.side) });
      break;
    case 'permanent_mark':
      once();
      if (ally) addStatus(ally, { kind: 'permMarked', until: null });
      break;
    case 'absolute_silence':
      once();
      if (ally) addStatus(ally, { kind: 'silenced', until: turns(2, ally.side) });
      break;
    case 'chrono_lock':
      once();
      if (ally) addStatus(ally, { kind: 'stunned', until: turns(2, ally.side) });
      break;

    // Summons
    case 'pawn_summon':
      once();
      summon(s, p, 'pawn', m.to, id);
      break;
    case 'decoy':
      once();
      summon(s, p, 'decoy', m.to, id);
      break;
    case 'temporary_knight':
      once();
      summon(s, p, 'knight', m.to, id, { turns: 3 });
      break;
    case 'mirror_image':
      once();
      summon(s, p, p.type, m.to, id, { copy: 'weak' });
      break;
    case 'perfect_clone':
      once();
      summon(s, p, p.type, m.to, id, { copy: 'full', turns: 3 });
      break;
    case 'double_pawn_summon':
    case 'pawn_swarm':
    case 'army_of_one': {
      once();
      const n = id === 'pawn_swarm' ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const spot = summonSquares(s, p)[0];
        if (!spot) break;
        if (id === 'army_of_one') summon(s, p, p.type, spot, id, { copy: 'weak' });
        else summon(s, p, 'pawn', spot, id);
      }
      break;
    }
    case 'sacrificial_summon':
      if (ally) {
        capture(s, ally, { kind: 'ability' });
        heal(s, p, 1);
      }
      break;
    case 'summon_swap':
      if (ally) [p.pos, ally.pos] = [ally.pos, p.pos];
      break;
    case 'summon_recall':
      if (ally) ally.pos = { ...m.to };
      break;
    case 'summon_conversion':
      if (ally && m.param) ally.type = m.param as PieceType;
      break;

    // Royal
    case 'royal_retreat':
      once();
      if (ally) ally.pos = { ...m.to };
      break;
    case 'royal_swap':
      once();
      if (ally) [p.pos, ally.pos] = [ally.pos, p.pos];
      break;
    case 'royal_authority':
      once();
      if (ally) s.bonus.unshift({ pieceId: ally.id, filter: 'any', optional: true, source: id }, { filter: 'any', optional: false, source: 'turn' });
      break;
    case 'royal_command':
      p.counters.royalCommandCd = 4;
      if (ally) s.bonus.unshift({ pieceId: ally.id, filter: 'any', optional: true, source: id }, { filter: 'any', optional: false, source: 'turn' });
      break;
    case 'royal_sanctuary': {
      once();
      const king = ally ?? p;
      const cells = [king.pos, ...ALL_DIRS.map((d) => add(king.pos, d))];
      s.zones.push({ cells, side: p.side, until: endOfTurn(s.ply, opponent(p.side)) });
      break;
    }
    case 'kings_path':
      once();
      addTimedTerrain(s, m.to, 'bridge', 3, p.side, p);
      break;

    // Legendary
    case 'board_rewrite':
      p.counters.rewrites = (p.counters.rewrites ?? 0) + 1;
      setTerrain(s, m.to, terrainAt(s.board, m.to) === 'gap' ? 'normal' : 'gap');
      break;
    case 'kings_decree':
      once();
      s.pieces.filter((a) => a.side === p.side).forEach((a) => addShield(s, a));
      break;
    case 'mass_promotion': {
      once();
      const pawns = allies(s, p)
        .filter((a) => a.type === 'pawn')
        .sort((a, b) => (p.side === 'player' ? a.pos.y - b.pos.y : b.pos.y - a.pos.y))
        .slice(0, 3);
      pawns.forEach((a) => (a.type = 'knight'));
      break;
    }
    case 'unbreakable_formation':
      once();
      allies(s, p)
        .filter((a) => adjacent(a, p))
        .forEach((a) => addStatus(a, { kind: 'immune', until: endOfTurn(s.ply, opponent(p.side)) }));
      break;
    case 'army_recall': {
      once();
      // Recall the three most endangered allies (lowest HP first, most advanced first).
      const order = allies(s, p)
        .filter((a) => sizeOf(a) === 1)
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || (p.side === 'player' ? a.pos.y - b.pos.y : b.pos.y - a.pos.y))
        .slice(0, 3);
      for (const a of order) {
        const spot = emptyZoneSquare(s, p.side);
        if (spot) a.pos = spot;
      }
      break;
    }
    case 'total_demolition':
      once();
      s.board.terrain.forEach((row, y) => row.forEach((t, x) => t === 'cracked' && destroyCracked(s, { x, y }, p)));
      break;
    case 'fate_exchange':
      once();
      if (ally) {
        const a = p.hp;
        p.hp = Math.min(p.maxHp, ally.hp);
        ally.hp = Math.min(ally.maxHp, a);
      }
      break;
    case 'final_gambit': {
      const targets = enemiesOf(s, p).filter((e) => adjacent(e, p));
      capture(s, p, { kind: 'ability' });
      for (const e of targets) dealDamage(s, e.id, 3, { kind: 'splash' });
      break;
    }
    case 'checkmate_gambit':
      once();
      if (ally) addStatus(ally, { kind: 'stunned', until: turns(1, ally.side) });
      s.bonus.unshift({ filter: 'any', optional: false, source: 'turn' }, { filter: 'any', optional: true, source: id });
      break;
  }
}

function demolish(s: GameState, p: Piece, c: Coord): boolean {
  const ok = destroyCracked(s, c, p);
  if (ok) chainDemolition(s, p, c);
  return ok;
}

/** Chain Demolition: knock down one more cracked wall next to the one just destroyed. */
function chainDemolition(s: GameState, p: Piece, c: Coord) {
  if (!has(p, 'chain_demolition')) return;
  const next = ALL_DIRS.map((d) => add(c, d)).find((q) => terrainAt(s.board, q) === 'cracked');
  if (next) destroyCracked(s, next, p);
}

export { isWall, isStandable };
