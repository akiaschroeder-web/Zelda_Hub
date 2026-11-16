/**
 * Content Packs: optional sets of pieces (and later upgrades, events and
 * boards) that can be switched on or off. A run remembers which packs were
 * on when it started, so changing the setting never alters a run in progress.
 */
import { PieceType, Side } from '../engine/types';

export type PackId = 'zelda' | 'sonic' | 'duo' | 'crash' | 'mario' | 'metroid';

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
    // Emerald transformations: only reached through the Chaos and Master Emeralds.
    'super_sonic', 'super_shadow', 'super_silver', 'burning_blaze', 'hyper_sonic',
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
export const SONIC_LEGEND: Record<string, [PieceType, Side]> = {
  ...Object.fromEntries(
    SONIC_ORDER.flatMap((t, i) => [
      [CYRILLIC[i], [t, 'enemy']],
      [CYRILLIC[i].toUpperCase(), [t, 'player']],
    ]),
  ),
  // Emerald forms: circled numbers for the player, filled ones for the enemy.
  ...Object.fromEntries(
    (['super_sonic', 'super_shadow', 'super_silver', 'burning_blaze', 'hyper_sonic'] as PieceType[]).flatMap((t, i) => [
      ['①②③④⑤'[i], [t, 'player']],
      ['❶❷❸❹❺'[i], [t, 'enemy']],
    ]),
  ),
};

PACKS.push({
  id: 'duo',
  name: 'Digital Duo',
  description:
    'A mini pack: Hatsune Miku (diagonal healer) and Kasane Teto (orthogonal wall-breaker), who help each other when deployed together, plus the Leek, Baguette and Duet Microphone upgrades.',
  recruits: { uncommon: ['miku', 'teto'] },
  bosses: [],
  archetypes: [
    {
      name: 'Digital Duo',
      blurb: 'Hatsune Miku and Kasane Teto on tour.',
      weights: { miku: 2, teto: 2, pawn: 4, knight: 1, bishop: 1, rook: 1 },
    },
  ],
  pieces: ['miku', 'teto'],
});

PACKS.push({
  id: 'crash',
  name: 'Crash Bandicoot Pack',
  description:
    'Crash, Coco, Crunch, Tawna, Aku Aku, Polar and Pura against Dr. Neo Cortex, N. Gin, N. Brio, Tiny Tiger, Dingodile, Ripper Roo and Uka Uka — and the 2×2 time-bending Dr. N. Tropy.',
  recruits: {
    common: ['polar', 'pura', 'ripper_roo'],
    uncommon: ['coco', 'aku_aku', 'tawna', 'n_gin', 'brio', 'uka_uka'],
    rare: ['crash', 'crunch', 'cortex', 'tiny', 'dingodile'],
  },
  bosses: [{ type: 'n_tropy', act: 1 }],
  archetypes: [
    {
      name: 'Bandicoot Crew',
      blurb: 'Crash and friends.',
      weights: { crash: 1, coco: 2, crunch: 1, tawna: 2, aku_aku: 1, polar: 2, pura: 2, pawn: 3 },
    },
    {
      name: "Cortex's Henchmen",
      blurb: 'Dr. Neo Cortex and his mutant army.',
      weights: { cortex: 1, n_gin: 2, brio: 2, tiny: 1, dingodile: 1, ripper_roo: 2, uka_uka: 1, pawn: 3 },
    },
  ],
  pieces: [
    'crash', 'coco', 'crunch', 'aku_aku', 'tawna', 'cortex', 'n_gin', 'tiny', 'dingodile', 'ripper_roo', 'uka_uka', 'polar', 'pura',
    'brio', 'brio_monster', 'n_tropy',
  ],
});

/** Placement symbols for Crash pieces: Armenian lower case for the enemy, upper case for the player. */
const CRASH_ORDER: PieceType[] = [
  'crash', 'coco', 'crunch', 'aku_aku', 'tawna', 'cortex', 'n_gin', 'tiny', 'dingodile', 'ripper_roo', 'uka_uka', 'polar', 'pura',
  'brio', 'brio_monster', 'n_tropy',
];
const ARMENIAN = 'աբգդեզէըթժիլխծկհ';
export const CRASH_LEGEND: Record<string, [PieceType, Side]> = Object.fromEntries(
  CRASH_ORDER.flatMap((t, i) => [
    [ARMENIAN[i], [t, 'enemy']],
    [ARMENIAN[i].toUpperCase(), [t, 'player']],
  ]),
);

PACKS.push({
  id: 'mario',
  name: 'Super Mario Pack',
  description:
    "Mario, Luigi, Peach, Daisy, Yoshi, Toad, Toadette and Rosalina, rivals Wario and Waluigi, Bowser's Goombas, Koopa Troopas, Boos and Hammer Bros — and the 2×2 King of the Koopas himself.",
  recruits: {
    common: ['goomba', 'koopa', 'toad'],
    uncommon: ['luigi', 'toadette', 'boo', 'hammer_bro', 'waluigi', 'yoshi'],
    rare: ['mario', 'peach', 'daisy', 'wario', 'rosalina'],
  },
  bosses: [{ type: 'bowser', act: 2 }],
  archetypes: [
    {
      name: 'Mushroom Kingdom Heroes',
      blurb: 'Mario and friends.',
      weights: { mario: 1, luigi: 2, peach: 1, daisy: 1, yoshi: 2, toad: 3, toadette: 2, rosalina: 1, pawn: 3 },
    },
    {
      name: "Bowser's Troops",
      blurb: 'Goombas, Koopa Troopas, Boos and Hammer Bros, with Wario and Waluigi for hire.',
      weights: { goomba: 6, koopa: 3, boo: 2, hammer_bro: 2, wario: 1, waluigi: 1, pawn: 2 },
    },
  ],
  pieces: ['mario', 'luigi', 'peach', 'daisy', 'yoshi', 'toad', 'toadette', 'wario', 'waluigi', 'rosalina', 'goomba', 'koopa', 'boo', 'hammer_bro', 'bowser'],
});

PACKS.push({
  id: 'metroid',
  name: 'Metroid Pack',
  description:
    'Samus Aran and Zero Suit Samus against Metroids, Space Pirates, Chozo Soldiers, the E.M.M.I., Ridley (2×2) — and the 3×3 Mother Brain.',
  recruits: {
    common: ['space_pirate'],
    uncommon: ['metroid', 'zero_suit', 'chozo_soldier'],
    rare: ['samus', 'emmi'],
    epic: ['ridley'],
  },
  bosses: [{ type: 'mother_brain', act: 1 }],
  archetypes: [
    {
      name: 'Space Pirate Raiders',
      blurb: 'Space Pirates, Metroids and Chozo Soldiers, with Ridley leading.',
      weights: { space_pirate: 5, metroid: 3, chozo_soldier: 2, emmi: 1, ridley: 1, pawn: 3 },
    },
    {
      name: 'Galactic Federation',
      blurb: 'Samus and Zero Suit Samus with Chozo allies.',
      weights: { samus: 1, zero_suit: 2, chozo_soldier: 2, pawn: 4, knight: 1, bishop: 1 },
    },
  ],
  pieces: ['samus', 'zero_suit', 'metroid', 'space_pirate', 'chozo_soldier', 'emmi', 'ridley', 'mother_brain'],
});

/** Placement symbols for Metroid pieces: Latin Extended lower case for the enemy, upper case for the player. */
const METROID_ORDER: PieceType[] = ['samus', 'zero_suit', 'metroid', 'space_pirate', 'chozo_soldier', 'emmi', 'ridley', 'mother_brain'];
const EXTENDED = 'ðñòóôõöø';
export const METROID_LEGEND: Record<string, [PieceType, Side]> = Object.fromEntries(
  METROID_ORDER.flatMap((t, i) => [
    [EXTENDED[i], [t, 'enemy']],
    [EXTENDED[i].toUpperCase(), [t, 'player']],
  ]),
);

/** Placement symbols for Mario pieces: accented lower case for the enemy, upper case for the player. */
const MARIO_ORDER: PieceType[] = [
  'mario', 'luigi', 'peach', 'daisy', 'yoshi', 'toad', 'toadette', 'wario', 'waluigi', 'rosalina', 'goomba', 'koopa', 'boo', 'hammer_bro', 'bowser',
];
const ACCENTED = 'àáâãäåæçèéêëìíî';
export const MARIO_LEGEND: Record<string, [PieceType, Side]> = Object.fromEntries(
  MARIO_ORDER.flatMap((t, i) => [
    [ACCENTED[i], [t, 'enemy']],
    [ACCENTED[i].toUpperCase(), [t, 'player']],
  ]),
);

/** Placement symbols for Digital Duo pieces: hiragana for the enemy, katakana for the player. */
export const DUO_LEGEND: Record<string, [PieceType, Side]> = {
  み: ['miku', 'enemy'],
  ミ: ['miku', 'player'],
  て: ['teto', 'enemy'],
  テ: ['teto', 'player'],
};

export const PACK_BY_ID: Record<PackId, ContentPack> = Object.fromEntries(PACKS.map((p) => [p.id, p])) as Record<PackId, ContentPack>;

const OWNER = new Map<PieceType, PackId>(PACKS.flatMap((p) => p.pieces.map((t) => [t, p.id] as [PieceType, PackId])));

/** Is this piece type available with these packs on? (Base pieces always are.) */
export const pieceAllowed = (t: PieceType, packs: readonly string[]) => {
  const owner = OWNER.get(t);
  return !owner || packs.includes(owner);
};

export const enabledPacks = (packs: readonly string[]) => PACKS.filter((p) => packs.includes(p.id));

/** Packs that are on unless the player switches them off. */
export const DEFAULT_PACKS: PackId[] = ['zelda', 'sonic', 'duo', 'crash', 'mario', 'metroid'];

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
