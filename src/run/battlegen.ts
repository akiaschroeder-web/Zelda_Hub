import { isStandable, parseBoard } from '../engine/board';
import { PIECE_STATS, footprint } from '../engine/pieces';
import { parsePlacements } from '../engine/setup';
import { Coord, EncounterRules, Piece, PieceType, coordKey } from '../engine/types';
import { canTake } from '../engine/upgrades/eligibility';
import { rollUpgrade } from './rewards';
import { Rng } from './rng';
import { generateBoard } from './boardgen';
import { CRASH_LEGEND, SONIC_LEGEND, ZELDA_LEGEND, enabledPacks } from '../content/packs';

/** How many upgrades an enemy army gets. */
export function enemyUpgradeCount(act: number, kind: 'battle' | 'elite' | 'boss'): number {
  if (kind === 'boss') return 3 + act * 3;
  if (kind === 'elite') return 1 + act * 2;
  return act;
}

/** Hand out upgrades to random non-King enemy pieces. */
export function upgradeEnemies(
  rng: Rng,
  enemies: EnemyPlacement[],
  act: number,
  count: number,
  packs: readonly string[] = [],
): EnemyPlacement[] {
  const out = enemies.map((e) => ({ ...e, upgrades: [...(e.upgrades ?? [])] }));
  const candidates = out.filter((e) => e.type !== 'king');
  for (let i = 0; i < count && candidates.length; i++) {
    const e = rng.pick(candidates);
    const id = rollUpgrade(rng, 'enemy', act, [{ type: e.type, upgrades: e.upgrades! }], [], packs);
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
  /** The Boss Piece at the heart of a boss battle. */
  boss?: PieceType;
}


type Archetype = 'swarm' | 'cavalry' | 'fortress' | 'royal' | 'unorthodox';
type ArchetypeInfo = { name: string; blurb: string; weights: Partial<Record<PieceType, number>> };

const ARCHETYPES: Record<Archetype, ArchetypeInfo> = {
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
function buyArmy(rng: Rng, archetype: ArchetypeInfo, budget: number, act: number, elite: boolean): PieceType[] {
  const army: PieceType[] = ['king'];
  let left = budget;
  const weights = { ...archetype.weights };
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

/** Every piece type enemy armies can field with these packs (not Kings or Pawns). */
export function enemyPieceTypes(packs: readonly string[]): PieceType[] {
  const styles: ArchetypeInfo[] = [...Object.values(ARCHETYPES), ...enabledPacks(packs).flatMap((p) => p.archetypes)];
  const types = new Set(styles.flatMap((st) => Object.keys(st.weights) as PieceType[]));
  types.add('juggernaut'); // elite armies
  types.delete('king');
  types.delete('pawn');
  return [...types];
}

export function generateBattle(
  rng: Rng,
  act: number,
  floor: number,
  kind: 'battle' | 'elite',
  id: string,
  unlockedBosses: PieceType[] = [],
  packs: readonly string[] = [],
  bounty?: PieceType,
): RunBattle {
  // Content packs add their own boards and army styles alongside the base ones.
  // Every battle gets freshly generated ground.
  const template = placeKeys(rng, generateBoard(rng, { packs }));
  const styles: ArchetypeInfo[] = [...Object.values(ARCHETYPES), ...enabledPacks(packs).flatMap((p) => p.archetypes)];
  const info = rng.pick(styles);
  const rules: EncounterRules = { checkRules: rng.chance(0.65) };
  // Elites in later acts may bring a boss you've already beaten, with a smaller escort.
  const smallBosses = unlockedBosses.filter((b) => PIECE_STATS[b].size <= 2);
  const withBoss = kind === 'elite' && act >= 1 && smallBosses.length > 0 && rng.chance(0.35);
  const budget = enemyBudget(act, floor, kind) - (withBoss ? 10 : 0);
  const army = buyArmy(rng, info, budget, act, kind === 'elite');
  if (withBoss) army.splice(1, 0, rng.pick(smallBosses));
  // An active bounty's target turns up in some battles (in place of the last piece bought).
  if (bounty && !army.includes(bounty) && rng.chance(0.4)) {
    if (army.length > 3) army.pop();
    army.splice(1, 0, bounty);
  }
  return {
    id,
    kind,
    name: `${kind === 'elite' ? 'Elite ' : ''}${info.name}`,
    description: `${info.blurb} ${template.name}.`,
    rules,
    terrain: template.terrain,
    enemies: upgradeEnemies(rng, placeArmy(template.terrain, army), act, enemyUpgradeCount(act, kind), packs),
  };
}

/** Put one Small Key (K) on a random open square for every Locked Door (L) on a board. */
function placeKeys(rng: Rng, board: { name: string; terrain: string[] }): { name: string; terrain: string[] } {
  const doors = board.terrain.join('').split('L').length - 1;
  if (!doors) return board;
  const rows = board.terrain.map((r) => [...r]);
  const open: Coord[] = [];
  rows.forEach((r, y) => r.forEach((ch, x) => ch === '.' && open.push({ x, y })));
  for (let i = 0; i < doors && open.length; i++) {
    const c = open.splice(rng.int(0, open.length - 1), 1)[0];
    rows[c.y][c.x] = 'K';
  }
  return { ...board, terrain: rows.map((r) => r.join('')) };
}

/** Boss pools by act (ordered by deployment cost). */
export const BOSS_POOLS: PieceType[][] = [
  ['necromancer', 'stormbringer', 'phantom_king'],
  ['empress', 'doppelganger', 'watcher', 'hive_mother'],
  ['worldbreaker', 'colossus', 'chronarch'],
];

/**
 * Each boss's arena: its name, flavour and escort. `β` marks the boss; the
 * other letters are its escort (their positions here don't matter: the
 * ground is generated fresh for every fight and the escort placed on it).
 */
const ARENAS: Partial<Record<PieceType, { name: string; description: string; enemies: string[] }>> = {
  necromancer: {
    name: 'The Ossuary',
    description: 'Weak soldiers that keep rising while the Necromancer stands.',
    enemies: ['.n.kβ.b.', 'p.pppp.p', '........', '........', '........', '........', '........', '........'],
  },
  stormbringer: {
    name: 'The Open Steppe',
    description: 'An open field under a storm. Spread out — lightning arcs between clustered pieces.',
    enemies: ['r..akβa..r', 'pp.p..p.pp', '..l....l..', '..........', '..........', '..........', '..........', '..........'],
  },
  phantom_king: {
    name: 'The Labyrinth',
    description: 'Walls everywhere. The Phantom King walks straight through them.',
    enemies: ['.n.gkβg.n.', 'pp.pp.pp.p', '..........', '..........', '..........', '..........', '..........', '..........', '..........', '..........'],
  },
  empress: {
    name: 'The Throne Room',
    description: 'A royal army that the Empress drives forward, move after move.',
    enemies: ['rnbkβbnr', 'pgp..pgp', '........', '........', '........', '........', '........', '........'],
  },
  doppelganger: {
    name: 'Hall of Mirrors',
    description: 'The Doppelganger moves like your own pieces and borrows their tricks.',
    enemies: ['.w.kβ.i.', 'pppppppp', '........', '........', '........', '........', '........', '........'],
  },
  watcher: {
    name: 'The Long Corridors',
    description: 'Every open line is watched. Use walls to approach from protected angles.',
    enemies: ['a..kβ...a.', '.y.p..p.y.', '..........', '..........', '..........', '..........', '..........', '..........', '..........', '..........'],
  },
  hive_mother: {
    name: 'The Nest',
    description: 'An ever-growing swarm of Pawns. Box the Hive Mother in to stop the spawning.',
    enemies: ['...kβ.....', 'pppp..pppp', '.o......o.', '..........', '..........', '..........', '..........', '..........', '..........', '..........'],
  },
  worldbreaker: {
    name: 'The Shattered Plain',
    description: 'The ground breaks apart as the fight goes on — but the Worldbreaker cannot cross gaps either.',
    enemies: ['r..kβ..s.r', 'pp.p..p.pp', '..........', '..........', '..........', '..........', '..........', '..........', '..........', '..........'],
  },
  colossus: {
    name: 'The Fortress Gate',
    description: 'The Colossus advances steadily. Spread out and strike it from several sides.',
    enemies: ['gk..β..g.r', 'pp.....p.p', '..........', '..........', '..........', '..........', '..........', '..........', '..........', '..........'],
  },
  ganondorf: {
    name: 'The Dark Tower',
    description: 'The King of Evil grows more dangerous with every wound: sorcery at 2 HP, and the beast Ganon at 1 HP. Leave him room and he will use it.',
    enemies: ['9.8kβ.8.9.', '.6.7..7.6.', 'p.p....p.p', '..........', '..........', '..........', '..........', '..........', '..........', '..........'],
  },
  death_egg: {
    name: 'Death Egg Zone',
    description:
      "Dr. Eggman's giant robot fills a quarter of the field. It stomps everything next to it, fires missiles at 2 HP, and goes critical at 1 HP — and explodes when it falls.",
    // King, Dr. Eggman, Metal Sonic, then three each of Motobug, Buzz Bomber and Crabmeat (see SONIC_LEGEND).
    enemies: ['kклмммнннппп'],
  },
  n_tropy: {
    name: 'The Time Twister',
    description:
      "Dr. N. Tropy bends time: he teleports, freezing anyone next to where he lands. At 2 HP he can turn back the clock once, and at 1 HP time collapses around him — he moves further, teleports every turn, and hurts everything he ends up next to.",
    // King, Cortex, N. Gin, N. Brio, Tiny, Dingodile, then Pawns (see CRASH_LEGEND).
    enemies: ['kզէծըթ', 'pppppp'],
  },
  chronarch: {
    name: 'The Clockwork Court',
    description: 'A master tactician that can undo your best move — but only once.',
    enemies: ['rc.qkβm..r', 'ppgpp.pgpp', '..........', '..........', '..........', '..........', '..........', '..........', '..........', '..........'],
  },
};

/** The kind of ground each boss's arena is generated with. */
const ARENA_THEMES: Partial<Record<PieceType, 'open' | 'fortress' | 'ruins' | 'chasm' | 'mixed'>> = {
  stormbringer: 'open',
  watcher: 'open',
  phantom_king: 'fortress',
  chronarch: 'fortress',
  worldbreaker: 'ruins',
  colossus: 'ruins',
  hive_mother: 'chasm',
  ganondorf: 'chasm',
  death_egg: 'open',
  n_tropy: 'fortress',
};

export const bossArenaName = (boss: PieceType) => ARENAS[boss]?.name ?? PIECE_STATS[boss].name;

export function bossBattle(act: number, id: string, rng?: Rng, boss?: PieceType, packs: readonly string[] = []): RunBattle {
  const type = boss ?? BOSS_POOLS[Math.min(act, BOSS_POOLS.length - 1)][0];
  const arena = ARENAS[type]!;
  // Without a run (sandbox), the arena is still generated, just from a fixed seed.
  const r = rng ?? new Rng([...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7));
  const size = PIECE_STATS[type].size;
  const board = generateBoard(r, { packs, boss: { size, theme: ARENA_THEMES[type] ?? 'mixed' } });
  const terrain = placeKeys(r, board).terrain;
  const bossAt = board.bossAt!;
  // The escort fills the rest of the enemy zone (the boss's squares are taken).
  const escort = parsePlacements(arena.enemies, { ...ZELDA_LEGEND, ...SONIC_LEGEND, ...CRASH_LEGEND })
    .filter((p) => p.side === 'enemy')
    .map((p) => p.type);
  const withoutBoss = terrain.map((row, y) =>
    [...row].map((ch, x) => (x >= bossAt.x && x < bossAt.x + size && y >= bossAt.y && y < bossAt.y + size ? '.' : ch)).join(''),
  );
  const enemies: EnemyPlacement[] = [{ type, x: bossAt.x, y: bossAt.y }, ...placeArmy(withoutBoss, escort)];
  return {
    id,
    kind: 'boss',
    name: `${PIECE_STATS[type].name} — ${arena.name}`,
    description: `${arena.description} ${board.name}.`,
    rules: { checkRules: true, bossKill: true },
    terrain,
    enemies: rng ? upgradeEnemies(rng, enemies, act, enemyUpgradeCount(act, 'boss'), packs) : enemies,
    boss: type,
  };
}
