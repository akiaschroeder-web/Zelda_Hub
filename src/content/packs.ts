/**
 * Content Packs: optional sets of pieces (and later upgrades, events and
 * boards) that can be switched on or off. A run remembers which packs were
 * on when it started, so changing the setting never alters a run in progress.
 */
import { PieceType, Side } from '../engine/types';

export type PackId = 'zelda' | 'sonic';

/** Rarity buckets match the base recruit pools. */
type PackRarity = 'common' | 'uncommon' | 'rare' | 'epic';

export interface ContentPack {
  id: PackId;
  name: string;
  description: string;
  /** Recruitable pieces, by rarity. */
  recruits: Partial<Record<PackRarity, PieceType[]>>;
  /** Boss Pieces and the act (0-based) whose boss pool they join. */
  bosses: { type: PieceType; act: number }[];
  /** Enemy army styles this pack adds (piece weights, like the base archetypes). */
  archetypes: { name: string; blurb: string; weights: Partial<Record<PieceType, number>> }[];
  /** Every piece type the pack owns (for filtering and the pack screen). */
  pieces: PieceType[];
}

export const PACKS: ContentPack[] = [
  {
    id: 'zelda',
    name: 'Zelda Pack',
    description:
      'Heroes and monsters of Hyrule: Link, Zelda, Midna, Malon and Epona, Gorons, Zoras, Deku Scrubs, ReDeads, Like Likes, Darknuts, Skulltulas, Lizalfos, Stalfos — and Ganondorf.',
    recruits: {
      common: ['zora', 'skulltula', 'deku_scrub'],
      uncommon: ['midna', 'goron', 'redead', 'malon', 'lizalfos', 'stalfos'],
      rare: ['link', 'zelda', 'like_like', 'darknut', 'epona'],
    },
    bosses: [{ type: 'ganondorf', act: 2 }],
    archetypes: [
      {
        name: 'Hyrule Monsters',
        blurb: 'ReDeads, Like Likes, Darknuts and Skulltulas.',
        weights: { skulltula: 4, redead: 3, like_like: 2, darknut: 2, pawn: 3, deku_scrub: 3, lizalfos: 3, stalfos: 3 },
      },
      {
        name: 'Hylian Company',
        blurb: 'Heroes and folk of Hyrule.',
        weights: { link: 1, zelda: 1, midna: 2, goron: 3, zora: 3, pawn: 3, knight: 1, malon: 2, epona: 1 },
      },
    ],
    pieces: [
      'link', 'zelda', 'midna', 'goron', 'zora', 'redead', 'like_like', 'darknut', 'skulltula',
      'malon', 'epona', 'deku_scrub', 'lizalfos', 'stalfos', 'ganondorf', 'ganon',
    ],
  },
];

PACKS.push({
  id: 'sonic',
  name: 'Sonic Pack',
  description:
    'Sonic, Tails, Knuckles, Amy, Shadow, Rouge, Silver and Blaze against Dr. Eggman, Metal Sonic, Badniks and Chaos — and the 4×4 Death Egg Robot.',
  recruits: {
    common: ['motobug', 'buzz_bomber', 'crabmeat'],
    uncommon: ['tails', 'amy', 'rouge', 'blaze', 'eggman'],
    rare: ['sonic', 'knuckles', 'shadow', 'silver', 'metal_sonic'],
    epic: ['chaos'],
  },
  bosses: [{ type: 'death_egg', act: 2 }],
  archetypes: [
    {
      name: 'Badnik Swarm',
      blurb: "Dr. Eggman's robots: Motobugs, Buzz Bombers and Crabmeats.",
      weights: { motobug: 5, buzz_bomber: 4, crabmeat: 4, eggman: 1, pawn: 3, metal_sonic: 1 },
    },
    {
      name: 'Freedom Fighters',
      blurb: 'Sonic and friends.',
      weights: { sonic: 1, tails: 2, knuckles: 1, amy: 2, pawn: 3, knight: 1 },
    },
    {
      name: 'Rival Squad',
      blurb: 'Shadow, Rouge, Silver, Blaze and Metal Sonic.',
      weights: { shadow: 1, rouge: 2, silver: 1, blaze: 2, metal_sonic: 1, pawn: 3, chaos: 1 },
    },
  ],
  pieces: [
    'sonic', 'tails', 'knuckles', 'amy', 'shadow', 'rouge', 'silver', 'blaze',
    'eggman', 'metal_sonic', 'motobug', 'buzz_bomber', 'crabmeat', 'chaos', 'death_egg',
  ],
});

/**
 * Placement symbols for Sonic pieces: Cyrillic lower case for the enemy,
 * upper case for the player.
 */
const SONIC_ORDER: PieceType[] = [
  'sonic', 'tails', 'knuckles', 'amy', 'shadow', 'rouge', 'silver', 'blaze',
  'eggman', 'metal_sonic', 'motobug', 'buzz_bomber', 'crabmeat', 'chaos',
];
const CYRILLIC = 'абвгджзиклмнпр';
export const SONIC_LEGEND: Record<string, [PieceType, Side]> = Object.fromEntries(
  SONIC_ORDER.flatMap((t, i) => [
    [CYRILLIC[i], [t, 'enemy']],
    [CYRILLIC[i].toUpperCase(), [t, 'player']],
  ]),
);

export const PACK_BY_ID: Record<PackId, ContentPack> = Object.fromEntries(PACKS.map((p) => [p.id, p])) as Record<PackId, ContentPack>;

const OWNER = new Map<PieceType, PackId>(PACKS.flatMap((p) => p.pieces.map((t) => [t, p.id] as [PieceType, PackId])));

/** Is this piece type available with these packs on? (Base pieces always are.) */
export const pieceAllowed = (t: PieceType, packs: readonly string[]) => {
  const owner = OWNER.get(t);
  return !owner || packs.includes(owner);
};

export const enabledPacks = (packs: readonly string[]) => PACKS.filter((p) => packs.includes(p.id));

/** Packs that are on unless the player switches them off. */
export const DEFAULT_PACKS: PackId[] = ['zelda', 'sonic'];

/**
 * Placement symbols for Zelda pieces in board layouts: digits are enemy
 * pieces, the symbols on the same keys are player pieces.
 */
const ZELDA_ORDER: PieceType[] = ['link', 'zelda', 'midna', 'goron', 'zora', 'redead', 'like_like', 'darknut', 'skulltula'];
export const ZELDA_LEGEND: Record<string, [PieceType, Side]> = {
  ...Object.fromEntries(
    ZELDA_ORDER.flatMap((t, i) => [
      [String(i + 1), [t, 'enemy']],
      ['!@#$%^&*('[i], [t, 'player']],
    ]),
  ),
  // Pieces 11-15: Greek lower case for the enemy, upper case for the player.
  μ: ['malon', 'enemy'],
  Μ: ['malon', 'player'],
  ε: ['epona', 'enemy'],
  Ε: ['epona', 'player'],
  δ: ['deku_scrub', 'enemy'],
  Δ: ['deku_scrub', 'player'],
  λ: ['lizalfos', 'enemy'],
  Λ: ['lizalfos', 'player'],
  σ: ['stalfos', 'enemy'],
  Σ: ['stalfos', 'player'],
};
