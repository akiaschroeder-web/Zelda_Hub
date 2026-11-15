import { Coord, Piece, PieceType } from './types';

export interface PieceStats {
  /** Footprint is size x size squares; pos is the top-left square. */
  size: number;
  maxHp: number;
  /** Damage dealt per successful hit. */
  damage: number;
  /** Army Point deployment cost (King is special: 0). */
  cost: number;
  /** AI evaluation weight (centipawns at full HP). */
  value: number;
  /** Display name. */
  name: string;
  /** One-line rules summary shown in the UI. */
  blurb: string;
}

export const PIECE_STATS: Record<PieceType, PieceStats> = {
  pawn: { size: 1, maxHp: 1, damage: 1, cost: 1, value: 100, name: 'Pawn', blurb: 'Advances forward, captures diagonally.' },
  knight: { size: 1, maxHp: 1, damage: 1, cost: 3, value: 300, name: 'Knight', blurb: 'L-shaped jump. Leaps gaps; blocked only if walls cut off both ways around the L.' },
  bishop: { size: 1, maxHp: 1, damage: 1, cost: 3, value: 310, name: 'Bishop', blurb: 'Slides diagonally.' },
  rook: { size: 1, maxHp: 1, damage: 1, cost: 5, value: 500, name: 'Rook', blurb: 'Slides orthogonally.' },
  queen: { size: 1, maxHp: 1, damage: 1, cost: 9, value: 900, name: 'Queen', blurb: 'Slides in any direction.' },
  king: { size: 1, maxHp: 1, damage: 1, cost: 0, value: 20000, name: 'King', blurb: 'One square any direction. Lose it and the run ends.' },
  juggernaut: {
    size: 2, maxHp: 3, damage: 1, cost: 12, value: 1100, name: 'Juggernaut',
    blurb: '2×2. One square orthogonally, hits everything under its new footprint.',
  },
  archer: {
    size: 1, maxHp: 1, damage: 1, cost: 4, value: 380, name: 'Archer',
    blurb: 'Steps one square diagonally (no capture). Shoots an enemy exactly 2 squares away orthogonally.',
  },
  guardian: {
    size: 1, maxHp: 2, damage: 1, cost: 5, value: 480, name: 'Guardian',
    blurb: 'One square any direction. Once per battle, takes a hit meant for an adjacent ally (not the King).',
  },
  lancer: {
    size: 1, maxHp: 1, damage: 1, cost: 4, value: 350, name: 'Lancer',
    blurb: 'Leaps exactly 2 or 3 squares orthogonally over pieces and gaps, not walls.',
  },
  siege: {
    size: 1, maxHp: 2, damage: 1, cost: 6, value: 400, name: 'Siege Engine',
    blurb: 'One square orthogonally. Can demolish an adjacent cracked wall instead of moving.',
  },
  mage: {
    size: 1, maxHp: 1, damage: 1, cost: 6, value: 450, name: 'Mage',
    blurb: 'Up to 2 squares diagonally. Once per battle, teleports up to 3 squares away, ignoring everything.',
  },
  switcher: {
    size: 1, maxHp: 1, damage: 1, cost: 5, value: 300, name: 'Switcher',
    blurb: 'One square any direction. Once per battle, swaps places with an ally within 2 squares.',
  },
  chancellor: {
    size: 1, maxHp: 1, damage: 1, cost: 10, value: 850, name: 'Chancellor',
    blurb: 'Moves like a Rook or a Knight.',
  },
  medic: {
    size: 1, maxHp: 1, damage: 1, cost: 5, value: 300, name: 'Medic',
    blurb: 'One square diagonally or sideways. Can heal an adjacent ally 1 HP instead of moving.',
  },
  hopper: {
    size: 1, maxHp: 1, damage: 1, cost: 3, value: 280, name: 'Hopper',
    blurb: 'Jumps exactly two squares diagonally over the square between. Crosses a single gap; walls block it.',
  },
  magnet: {
    size: 1, maxHp: 1, damage: 1, cost: 5, value: 380, name: 'Magnet',
    blurb: 'One square orthogonally. Instead of moving, pulls an enemy exactly two squares away one square closer (not Kings or large pieces).',
  },
  pusher: {
    size: 1, maxHp: 2, damage: 1, cost: 6, value: 450, name: 'Pusher',
    blurb: 'Up to two squares orthogonally. Instead of capturing, can shove an adjacent enemy one square directly away.',
  },
  mimic: {
    size: 1, maxHp: 1, damage: 1, cost: 7, value: 420, name: 'Mimic',
    blurb: 'Moves like any adjacent friendly 1×1 piece (movement only, not abilities). Alone, it steps one square diagonally.',
  },
  anchor: {
    size: 1, maxHp: 2, damage: 1, cost: 5, value: 380, name: 'Anchor',
    blurb: 'One square diagonally. Adjacent allies cannot be pushed, pulled or forcibly moved by enemy abilities.',
  },
  reaper: {
    size: 1, maxHp: 1, damage: 1, cost: 7, value: 600, name: 'Reaper',
    blurb: 'Up to three squares diagonally. When it captures, enemies next to the captured piece take 1 damage.',
  },
  bastion: {
    size: 1, maxHp: 3, damage: 1, cost: 8, value: 600, name: 'Bastion',
    blurb: 'One square orthogonally. If it neither moves nor acts in your turn, it gains a shield (maximum one).',
  },
  pathfinder: {
    size: 1, maxHp: 1, damage: 1, cost: 5, value: 400, name: 'Pathfinder',
    blurb: 'Up to two squares in any direction. Once per battle, bridges an adjacent gap for three rounds.',
  },
  sentinel: {
    size: 1, maxHp: 1, damage: 1, cost: 6, value: 420, name: 'Sentinel',
    blurb: 'One square orthogonally. Instead of moving, watches a line of up to four squares: the first enemy to stop on it takes 1 damage.',
  },
  splitter: {
    size: 1, maxHp: 1, damage: 1, cost: 6, value: 420, name: 'Splitter',
    blurb: 'Up to two squares diagonally. Once per battle, creates a temporary 1 HP copy of itself on an adjacent square.',
  },
  jailer: {
    size: 1, maxHp: 1, damage: 1, cost: 7, value: 520, name: 'Jailer',
    blurb: 'Up to two squares orthogonally. Instead of moving, binds an adjacent enemy so it cannot move on its next turn.',
  },
  phoenix: {
    size: 1, maxHp: 1, damage: 1, cost: 8, value: 650, name: 'Phoenix',
    blurb: 'Up to three squares orthogonally. The first time it would be captured, it is reborn on a friendly deployment square next turn.',
  },
  engineer: {
    size: 1, maxHp: 2, damage: 1, cost: 4, value: 360, name: 'Engineer',
    blurb: 'One square any direction. Builds a cracked wall nearby (every 3 turns), demolishes adjacent cracked walls, and once per battle repairs 1 HP of an adjacent multi-HP ally.',
  },
  assassin: {
    size: 1, maxHp: 1, damage: 1, cost: 5, value: 420, name: 'Assassin',
    blurb: 'Up to three squares diagonally. Deals 2 to enemies that did not move last turn. Shadow Step behind an enemy (every 4 turns). After a capture, may move up to 2 squares again.',
  },
  illusionist: {
    size: 1, maxHp: 1, damage: 1, cost: 5, value: 400, name: 'Illusionist',
    blurb: 'Up to two squares in any straight line. Creates look-alike illusions (every 4 turns) and once per battle swaps places with one.',
  },
  summoner: {
    size: 1, maxHp: 2, damage: 1, cost: 6, value: 460, name: 'Summoner',
    blurb: 'One square diagonally. Summons a temporary Pawn (every 3 turns) and once per battle a Knight. Up to three summons at once.',
  },
  converter: {
    size: 1, maxHp: 1, damage: 1, cost: 7, value: 520, name: 'Converter',
    blurb: 'Up to two squares orthogonally. Once per battle, converts an adjacent 1 HP enemy (not a King, boss or large piece) to your side for the battle.',
  },
  displacer: {
    size: 1, maxHp: 2, damage: 1, cost: 5, value: 420, name: 'Displacer',
    blurb: 'Leaps exactly two squares orthogonally. Swaps places with an enemy within 2 (every 3 turns); once per battle pushes all adjacent enemies away. Immune to enemy swaps.',
  },
  oracle: {
    size: 1, maxHp: 1, damage: 1, cost: 6, value: 440, name: 'Oracle',
    blurb: "Up to three squares diagonally. Shows the enemy's intended move, reveals illusions within 3, and every 4 turns protects an ally from the next attack.",
  },
  clone: {
    size: 1, maxHp: 1, damage: 1, cost: 6, value: 400, name: 'Clone',
    blurb: 'One square any direction. Once per battle, copies an adjacent ally: its movement and abilities (not upgrades or HP) for the rest of the battle.',
  },
  bomber: {
    size: 1, maxHp: 1, damage: 1, cost: 4, value: 320, name: 'Bomber',
    blurb: 'One square orthogonally. Can detonate, dealing 2 damage to every piece around it (allies too) and destroying itself. Deals 1 around it if captured.',
  },
  slayer: {
    size: 1, maxHp: 2, damage: 1, cost: 7, value: 600, name: 'Slayer',
    blurb: 'Up to three squares orthogonally or one diagonally. Deals 2 to multi-HP enemies (3 to bosses), bounces only one square, and heals after felling a multi-HP enemy.',
  },
  warden: {
    size: 1, maxHp: 3, damage: 1, cost: 6, value: 560, name: 'Warden',
    blurb: 'One square orthogonally. Adjacent allies take 1 less from hits of 2+. Cannot be moved by enemies. Once per battle, takes a hit meant for an adjacent ally.',
  },
  harvester: {
    size: 1, maxHp: 2, damage: 1, cost: 5, value: 440, name: 'Harvester',
    blurb: 'Up to two squares in any direction. Gains a Soul per capture (max 5, kept between battles). Spend 2 to heal or 3 for +1 damage. Reaching 5 Souls grants +1 max HP once per run.',
  },
  colossus: {
    size: 3, maxHp: 6, damage: 2, cost: 28, value: 3000, name: 'The Colossus',
    blurb: '3×3. One square orthogonally. Deals 2 damage to every enemy under its new footprint and smashes cracked walls in its path.',
  },
  empress: {
    size: 1, maxHp: 3, damage: 1, cost: 25, value: 2600, name: 'The Empress',
    blurb: 'Moves like a Queen or a Knight. Every 3 turns grants an ally an immediate extra move. The first attack on her is absorbed by an adjacent ally.',
  },
  necromancer: {
    size: 1, maxHp: 3, damage: 1, cost: 23, value: 2300, name: 'The Necromancer',
    blurb: 'Up to two squares diagonally. Every 3 turns raises a fallen ally on a deployment square. Heals 1 whenever an enemy is captured.',
  },
  stormbringer: {
    size: 1, maxHp: 4, damage: 1, cost: 24, value: 2400, name: 'The Stormbringer',
    blurb: 'Up to three squares orthogonally. Chain Lightning every 4 turns. The square it leaves is charged: the first enemy to stop there takes 1.',
  },
  watcher: {
    size: 2, maxHp: 4, damage: 1, cost: 26, value: 2600, name: 'The Watcher',
    blurb: '2×2. One square diagonally. Marks every open line from its footprint; the first enemy to stop on a marked square takes 1.',
  },
  worldbreaker: {
    size: 2, maxHp: 5, damage: 1, cost: 27, value: 2700, name: 'The Worldbreaker',
    blurb: '2×2. One square orthogonally. Earthquake (every 4 turns) shatters nearby cracked walls; Rupture turns an adjacent square into a gap.',
  },
  phantom_king: {
    size: 1, maxHp: 3, damage: 1, cost: 24, value: 2400, name: 'The Phantom King',
    blurb: 'Up to three squares any direction through walls and pieces, not gaps. Escapes the first attack by teleporting. Adjacent enemies cannot use abilities.',
  },
  doppelganger: {
    size: 1, maxHp: 4, damage: 1, cost: 25, value: 2500, name: 'The Doppelganger',
    blurb: 'One square any direction, or the movement of any enemy 1×1 piece. Every 4 turns, borrows an enemy piece’s ability for one use.',
  },
  hive_mother: {
    size: 2, maxHp: 5, damage: 1, cost: 26, value: 2600, name: 'The Hive Mother',
    blurb: '2×2. One square orthogonally. Spawns a temporary Pawn every 3 turns. Adjacent friendly Pawns may advance an extra square.',
  },
  chronarch: {
    size: 1, maxHp: 4, damage: 1, cost: 30, value: 3000, name: 'The Chronarch',
    blurb: 'Up to two squares any direction. Rewind undoes the enemy’s last move (once). Every 4 turns, takes two actions in a row.',
  },
  // Zelda Content Pack
  link: {
    size: 1, maxHp: 2, damage: 1, cost: 6, value: 520, name: 'Link',
    blurb: "Up to two squares any direction. Hero's Courage: at 1 HP, moves up to three squares.",
  },
  zelda: {
    size: 1, maxHp: 2, damage: 1, cost: 6, value: 520, name: 'Princess Zelda',
    blurb: 'Moves like a Bishop. Sacred Light (every 4 turns): instead of moving, heals an ally within 2 squares by 1.',
  },
  midna: {
    size: 1, maxHp: 1, damage: 1, cost: 4, value: 380, name: 'Midna',
    blurb: 'Knight jump or one square sideways. Twilight Shift: every third move, her sideways step can pass through an occupied square to the one beyond.',
  },
  goron: {
    size: 1, maxHp: 3, damage: 1, cost: 6, value: 560, name: 'Goron',
    blurb: 'Up to three squares orthogonally. Rolling Charge: a move of exactly three squares rolls through and smashes cracked walls.',
  },
  zora: {
    size: 1, maxHp: 1, damage: 1, cost: 5, value: 450, name: 'Zora',
    blurb: 'Any distance sideways, or up to two diagonally. Graceful Evasion: dodges the first damage to an empty adjacent square; recharges when it captures.',
  },
  redead: {
    size: 1, maxHp: 2, damage: 1, cost: 4, value: 340, name: 'ReDead',
    blurb: 'One square any direction. Paralyzing Scream: an enemy that moves next to it cannot move on its next turn (once per 3 turns each).',
  },
  like_like: {
    size: 1, maxHp: 3, damage: 1, cost: 6, value: 520, name: 'Like Like',
    blurb: 'Up to two squares orthogonally. Engulf: swallows the piece it captures; it is lost for good if the Like Like survives 2 more turns, freed if the Like Like falls.',
  },
  darknut: {
    size: 1, maxHp: 3, damage: 1, cost: 7, value: 620, name: 'Darknut',
    blurb: 'Up to two squares any direction. Armored Shell: the first attack only breaks its armor; then it moves up to three.',
  },
  skulltula: {
    size: 1, maxHp: 1, damage: 1, cost: 3, value: 260, name: 'Skulltula',
    blurb: 'Up to three squares diagonally. Wall Crawler: moves through and stands on walls and cracked walls, but never gaps.',
  },
  ganondorf: {
    size: 2, maxHp: 3, damage: 1, cost: 26, value: 2700, name: 'Ganondorf',
    blurb: '2×2. Up to two squares any direction. Grows stronger as he weakens: Gerudo King (3 HP), Dark Sorcerer (2 HP), then Demon King Ganon (1 HP, 3×3).',
  },
  ganon: {
    size: 3, maxHp: 3, damage: 1, cost: 26, value: 2700, name: 'Ganon',
    blurb: "3×3. Ganondorf's demon form. One square any direction, damaging every adjacent enemy whenever he moves.",
  },
  illusion: {
    size: 1, maxHp: 1, damage: 0, cost: 0, value: 80, name: 'Illusion',
    blurb: 'A 1 HP illusion. Moves one square; cannot capture.',
  },
  decoy: {
    size: 1, maxHp: 1, damage: 0, cost: 0, value: 60, name: 'Decoy',
    blurb: 'A temporary 1 HP decoy. Moves one square; cannot attack.',
  },
};

export const sizeOf = (p: Piece): number => PIECE_STATS[p.type].size;

export const BOSS_TYPES = new Set<PieceType>([
  'colossus', 'empress', 'necromancer', 'stormbringer', 'watcher',
  'worldbreaker', 'phantom_king', 'doppelganger', 'hive_mother', 'chronarch',
  'ganondorf', 'ganon',
]);

/** Ganondorf's current phase (3 HP = 1, 2 HP = 2, 1 HP or Ganon = 3); 0 for anything else. */
export function ganonPhase(p: Piece): number {
  if (p.type === 'ganon') return 3;
  if (p.type !== 'ganondorf') return 0;
  return p.hp >= 3 ? 1 : p.hp === 2 ? 2 : 3;
}

/** Zelda Content Pack piece types (handled outside some engine fast paths). */
export const ZELDA_TYPES = new Set<PieceType>([
  'link', 'zelda', 'midna', 'goron', 'zora', 'redead', 'like_like', 'darknut', 'skulltula', 'ganondorf', 'ganon',
]);

/** Every square a piece occupies. */
export function footprint(p: Piece, at: Coord = p.pos): Coord[] {
  const s = sizeOf(p);
  if (s === 1) return [at];
  const out: Coord[] = [];
  for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) out.push({ x: at.x + dx, y: at.y + dy });
  return out;
}
