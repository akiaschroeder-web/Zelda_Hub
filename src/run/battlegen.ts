import { isStandable, parseBoard } from '../engine/board';
import { PIECE_STATS, footprint } from '../engine/pieces';
import { parsePlacements } from '../engine/setup';
import { Coord, EncounterRules, Piece, PieceType, coordKey } from '../engine/types';
import { canTake } from '../engine/upgrades/eligibility';
import { rollUpgrade } from './rewards';
import { Rng } from './rng';

/** How many upgrades an enemy army gets. */
export function enemyUpgradeCount(act: number, kind: 'battle' | 'elite' | 'boss'): number {
  if (kind === 'boss') return 3 + act * 3;
  if (kind === 'elite') return 1 + act * 2;
  return act;
}

/** Hand out upgrades to random non-King enemy pieces. */
export function upgradeEnemies(rng: Rng, enemies: EnemyPlacement[], act: number, count: number): EnemyPlacement[] {
  const out = enemies.map((e) => ({ ...e, upgrades: [...(e.upgrades ?? [])] }));
  const candidates = out.filter((e) => e.type !== 'king');
  for (let i = 0; i < count && candidates.length; i++) {
    const e = rng.pick(candidates);
    const id = rollUpgrade(rng, 'enemy', act, [{ type: e.type, upgrades: e.upgrades! }]);
    if (id && canTake(id, e.type, e.upgrades!)) e.upgrades!.push(id);
  }
  return out;
}

export interface EnemyPlacement {
  type: PieceType;
  x: number;
  y: number;
  upgrades?: string[];
}

/** A battle in a run, generated or hand-made. */
export interface RunBattle {
  id: string;
  name: string;
  description: string;
  kind: 'battle' | 'elite' | 'boss';
  rules: EncounterRules;
  /** Terrain rows; `d` marks the player's deployment squares. */
  terrain: string[];
  enemies: EnemyPlacement[];
}

/**
 * Board templates. Legend: . normal, # wall, + cracked wall, _ gap,
 * d player deployment, e enemy deployment.
 */
const TEMPLATES: { name: string; terrain: string[] }[] = [
  {
    name: 'Open Field',
    terrain: ['eeeeeeee', 'eeeeeeee', '........', '........', '........', '........', '.dddddd.', 'dddddddd'],
  },
  {
    name: 'Broken Bridge',
    terrain: ['eeeeeeee', 'eeeeeeee', '..#..+..', '__....__', '___..___', '__....__', '.dddddd.', 'dddddddd'],
  },
  {
    name: 'Twin Pillars',
    terrain: ['eeeeeeee', 'eeeeeeee', '........', '.##..##.', '.##..##.', '........', '.dddddd.', 'dddddddd'],
  },
  {
    name: 'Narrow Pass',
    terrain: ['eeeeee', 'eeeeee', '......', '.#..#.', '......', '.+..+.', '......', '.dddd.', 'dddddd'],
  },
  {
    name: 'Cracked Fortress',
    terrain: [
      'eeeeeeeeee',
      'eeeeeeeeee',
      '.eeeeeeee.',
      '.++.##.++.',
      '..........',
      '..........',
      '..........',
      '..........',
      '.dddddddd.',
      '..dddddd..',
    ],
  },
  {
    name: 'Islands',
    terrain: [
      'eeeeeeeee',
      'eeeeeeeee',
      '.........',
      '..__.__..',
      '..__.__..',
      '.........',
      '..__.__..',
      '.ddddddd.',
      'ddddddddd',
    ],
  },
  {
    name: 'Wide Front',
    terrain: [
      'eeeeeeeeee',
      'eeeeeeeeee',
      '..........',
      '..#....#..',
      '..........',
      '..dddddd..',
      'dddddddddd',
    ],
  },
  {
    name: 'Crossroads',
    terrain: [
      '__eeeee__',
      '__eeeee__',
      '__.....__',
      '.........',
      '....#....',
      '.........',
      '__.....__',
      '__ddddd__',
      '__ddddd__',
    ],
  },
];

type Archetype = 'swarm' | 'cavalry' | 'fortress' | 'royal' | 'unorthodox';

const ARCHETYPES: Record<Archetype, { name: string; blurb: string; weights: Partial<Record<PieceType, number>> }> = {
  swarm: {
    name: 'Swarm Raiders',
    blurb: 'Overwhelming numbers of weak pieces.',
    weights: { pawn: 10, knight: 2, archer: 2, guardian: 1, hopper: 3, bomber: 3, summoner: 1 },
  },
  cavalry: {
    name: 'Cavalry Patrol',
    blurb: 'Knights and leapers that strike from odd angles.',
    weights: { knight: 6, lancer: 5, pawn: 3, chancellor: 1, bishop: 1, hopper: 4, phoenix: 1, assassin: 2, displacer: 2 },
  },
  fortress: {
    name: 'Border Garrison',
    blurb: 'Defenders, archers and siege engines dug in behind walls.',
    weights: { guardian: 4, archer: 4, siege: 2, rook: 2, pawn: 3, medic: 1, bastion: 2, anchor: 2, sentinel: 3, engineer: 2, warden: 2 },
  },
  royal: {
    name: 'Royal Guard',
    blurb: 'Powerful traditional chess pieces.',
    weights: { queen: 2, rook: 3, bishop: 4, knight: 3, pawn: 4, slayer: 1, harvester: 1 },
  },
  unorthodox: {
    name: 'Strange Company',
    blurb: 'Unconventional pieces with tricks of their own.',
    weights: {
      mage: 3,
      switcher: 2,
      medic: 2,
      lancer: 2,
      archer: 2,
      chancellor: 1,
      pawn: 2,
      magnet: 2,
      pusher: 2,
      mimic: 1,
      splitter: 2,
      jailer: 2,
      reaper: 2,
      pathfinder: 2,
      illusionist: 2,
      oracle: 1,
      clone: 1,
      converter: 1,
      summoner: 1,
    },
  },
};

/** Enemy army point budget for a fight. */
export function enemyBudget(act: number, floor: number, kind: 'battle' | 'elite'): number {
  return 9 + act * 9 + floor + (kind === 'elite' ? 9 : 0);
}

/** Squares sorted for placement: back rows first, centre first. */
function zoneOrder(zone: Coord[], width: number, back: boolean): Coord[] {
  const mid = (width - 1) / 2;
  return [...zone].sort((a, b) => (back ? a.y - b.y : b.y - a.y) || Math.abs(a.x - mid) - Math.abs(b.x - mid));
}

/** Place an army list into the enemy zone. Returns the pieces that fit. */
function placeArmy(terrain: string[], army: PieceType[]): EnemyPlacement[] {
  const board = parseBoard(terrain);
  const zone = board.enemyZone ?? [];
  const inZone = new Set(zone.map(coordKey));
  const taken = new Set<string>();
  const out: EnemyPlacement[] = [];
  const fits = (type: PieceType, at: Coord) =>
    footprint({ type } as Piece, at).every((c) => inZone.has(coordKey(c)) && isStandable(board, c) && !taken.has(coordKey(c)));
  const place = (type: PieceType, order: Coord[]) => {
    const spot = order.find((c) => fits(type, c));
    if (!spot) return false;
    footprint({ type } as Piece, spot).forEach((c) => taken.add(coordKey(c)));
    out.push({ type, x: spot.x, y: spot.y });
    return true;
  };
  const back = zoneOrder(zone, board.width, true);
  const front = zoneOrder(zone, board.width, false);
  // King at the back, big pieces next, pawns in front, everyone else behind them.
  const order = [...army].sort((a, b) => {
    const rank = (t: PieceType) => (t === 'king' ? 0 : PIECE_STATS[t].size > 1 ? 1 : t === 'pawn' ? 3 : 2);
    return rank(a) - rank(b) || PIECE_STATS[b].value - PIECE_STATS[a].value;
  });
  for (const t of order) place(t, t === 'pawn' ? front : back);
  return out;
}

/** Build an army list by spending a point budget with archetype weights. */
function buyArmy(rng: Rng, archetype: Archetype, budget: number, act: number, elite: boolean): PieceType[] {
  const army: PieceType[] = ['king'];
  let left = budget;
  const weights = { ...ARCHETYPES[archetype].weights };
  if (elite && act >= 1) weights.juggernaut = 1;
  // Expensive pieces only once the budget can afford them sensibly.
  for (let guard = 0; guard < 60 && left > 0; guard++) {
    const affordable = Object.fromEntries(
      Object.entries(weights).filter(([t]) => PIECE_STATS[t as PieceType].cost <= left),
    ) as Partial<Record<PieceType, number>>;
    if (Object.keys(affordable).length === 0) break;
    const t = rng.weighted(affordable);
    army.push(t);
    left -= PIECE_STATS[t].cost;
    if (t === 'juggernaut' || t === 'queen' || t === 'phoenix' || t === 'converter') weights[t] = 0; // at most one
  }
  return army;
}

export function generateBattle(rng: Rng, act: number, floor: number, kind: 'battle' | 'elite', id: string): RunBattle {
  const template = rng.pick(TEMPLATES);
  const archetype = rng.pick(Object.keys(ARCHETYPES) as Archetype[]);
  const rules: EncounterRules = { checkRules: rng.chance(0.65) };
  const army = buyArmy(rng, archetype, enemyBudget(act, floor, kind), act, kind === 'elite');
  const info = ARCHETYPES[archetype];
  return {
    id,
    kind,
    name: `${kind === 'elite' ? 'Elite ' : ''}${info.name}`,
    description: `${info.blurb} ${template.name}.`,
    rules,
    terrain: template.terrain,
    enemies: upgradeEnemies(rng, placeArmy(template.terrain, army), act, enemyUpgradeCount(act, kind)),
  };
}

/**
 * Act bosses. PLACEHOLDERS built from existing pieces until the real Boss
 * Pieces (Colossus, Empress, ...) are implemented.
 */
const BOSSES: { name: string; description: string; terrain: string[]; enemies: string[] }[] = [
  {
    name: 'The Iron Juggernaut',
    description: 'A war machine with a Medic to keep it running and Guardians at its side.',
    terrain: ['........', '........', '........', '.#....#.', '........', '........', 'dddddddd', 'dddddddd'],
    enemies: ['r..k...r', '.g.j..g.', 'pph...pp', '..p..p..', '........', '........', '........', '........'],
  },
  {
    name: 'The Siege Lord',
    description: 'A fortress line of cracked walls, Archers, Siege Engines and a Juggernaut.',
    terrain: [
      '..........',
      '..........',
      '..........',
      '.++.##.++.',
      '..........',
      '..........',
      '..........',
      '..........',
      '.dddddddd.',
      'dddddddddd',
    ],
    enemies: [
      'r..gkg...r',
      '.a.j...a..',
      'p.s....s.p',
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
    ],
  },
  {
    name: 'The Grand Court',
    description: 'The enemy throne room: a Queen, two Chancellors, a Mage and their guard.',
    terrain: [
      '..........',
      '..........',
      '..........',
      '..........',
      '...#..#...',
      '..........',
      '..........',
      '..........',
      'dddddddddd',
      'dddddddddd',
    ],
    enemies: [
      'rc.qkm.c.r',
      'g.h..w..g.',
      'pp.pppp.pp',
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
    ],
  },
];

export function bossBattle(act: number, id: string, rng?: Rng): RunBattle {
  const b = BOSSES[Math.min(act, BOSSES.length - 1)];
  const enemies = parsePlacements(b.enemies)
    .filter((p) => p.side === 'enemy')
    .map(({ type, x, y }) => ({ type, x, y }));
  return {
    id,
    kind: 'boss',
    name: b.name,
    description: b.description,
    rules: { checkRules: true },
    terrain: b.terrain,
    enemies: rng ? upgradeEnemies(rng, enemies, act, enemyUpgradeCount(act, 'boss')) : enemies,
  };
}
