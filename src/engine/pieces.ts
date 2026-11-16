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
  malon: {
    size: 1, maxHp: 1, damage: 1, cost: 4, value: 360, name: 'Malon',
    blurb: 'Up to two squares diagonally or one orthogonally. Lon Lon Ranch: allies starting their turn next to her heal 1 (each once every 3 turns). Epona next to her gallops further.',
  },
  epona: {
    size: 1, maxHp: 2, damage: 1, cost: 6, value: 540, name: 'Epona',
    blurb: 'Jumps 2-by-1 or 3-by-1 in an L, over anything — walls and gaps included. Gallop: after a capture, may make a Knight jump to an empty square. Starting next to Malon, she can also jump 3-by-2.',
  },
  deku_scrub: {
    size: 1, maxHp: 1, damage: 1, cost: 3, value: 280, name: 'Deku Scrub',
    blurb: 'One square diagonally. Deku Spit: instead of moving, 1 damage to the first enemy within 3 in a straight orthogonal line. Burrow: once per battle, slips to an adjacent square after surviving an attack.',
  },
  lizalfos: {
    size: 1, maxHp: 2, damage: 1, cost: 5, value: 460, name: 'Lizalfos',
    blurb: 'Up to two squares orthogonally, or a Knight jump. Acrobatic Retreat: when hurt but not defeated, leaps 2 squares diagonally (every 3 turns). Pack Hunter: 2 damage to an enemy next to another Lizalfos.',
  },
  stalfos: {
    size: 1, maxHp: 2, damage: 1, cost: 5, value: 440, name: 'Stalfos',
    blurb: 'Up to two squares any direction. Reassembly: the first time it falls it becomes a pile of bones, rising again with 1 HP after 2 of its turns — unless an enemy steps on the bones first.',
  },
  // Crash Bandicoot Content Pack
  crash: {
    size: 1, maxHp: 1, damage: 1, cost: 5, value: 450, name: 'Crash Bandicoot',
    blurb: 'Up to three squares orthogonally or one diagonally. Spin Attack: also hits the enemy right behind his target. Slide Jump: every 3 turns, jumps exactly 3 squares orthogonally over anything (no capture).',
  },
  coco: {
    size: 1, maxHp: 1, damage: 1, cost: 5, value: 420, name: 'Coco Bandicoot',
    blurb: "Up to three squares diagonally or one orthogonally. Hacking: instead of moving, an enemy within 3 can't move or use abilities on its next turn (every 4 turns; not bosses). Quick Thinking: once per battle, steps aside from an attack.",
  },
  crunch: {
    size: 1, maxHp: 3, damage: 2, cost: 8, value: 750, name: 'Crunch Bandicoot',
    blurb: 'Up to two squares any direction. Heavy Punch: his attacks deal 2. Bodyguard: every 3 turns, takes a hit meant for an adjacent ally.',
  },
  aku_aku: {
    size: 1, maxHp: 1, damage: 1, cost: 4, value: 330, name: 'Aku Aku',
    blurb: "Up to three squares any direction, over pieces and gaps (not walls); can't attack. Protective Spirit: every 3 turns, negates an attack on an ally within 2. Guardian Mask: rides on an ally and protects only it, until it sets him down.",
  },
  tawna: {
    size: 1, maxHp: 1, damage: 1, cost: 4, value: 380, name: 'Tawna Bandicoot',
    blurb: 'Up to three squares orthogonally, or a jump of exactly two diagonally. Grappling Hook: every 3 turns, swings to an empty square next to a wall within 4. Acrobatic Strike: after a capture, may hop one square diagonally.',
  },
  cortex: {
    size: 1, maxHp: 1, damage: 1, cost: 5, value: 420, name: 'Dr. Neo Cortex',
    blurb: 'Up to two squares diagonally or one orthogonally. Ray Gun: every 3 turns, 1 damage to the first piece within 4 in an orthogonal line, if it is an enemy. Evil Genius: friendly machines within 2 slide one square further.',
  },
  n_gin: {
    size: 1, maxHp: 1, damage: 1, cost: 4, value: 360, name: 'Dr. N. Gin',
    blurb: 'Up to two squares orthogonally. Missile Launcher: every 3 turns, 1 damage to an enemy within 4, over pieces but not through walls. Mechanical Reinforcement: adjacent friendly machines ignore their first point of damage each battle.',
  },
  tiny: {
    size: 1, maxHp: 2, damage: 1, cost: 6, value: 560, name: 'Tiny Tiger',
    blurb: "Jumps exactly two squares orthogonally (over anything), or steps one diagonally. Savage Leap: captures with the jump deal 2. Intimidation: enemies next to him can't teleport or reposition themselves.",
  },
  dingodile: {
    size: 1, maxHp: 2, damage: 1, cost: 6, value: 540, name: 'Dingodile',
    blurb: 'Up to two squares orthogonally or one diagonally. Vacuum Cannon: every 3 turns, pulls a 1×1 enemy within 3 one square closer (not bosses). Tail Swipe: attacking an adjacent enemy also hits another enemy next to him.',
  },
  ripper_roo: {
    size: 1, maxHp: 1, damage: 1, cost: 4, value: 380, name: 'Ripper Roo',
    blurb: 'Jumps 2-by-1 or 3-by-1 in an L, over anything. Wild Bounce: after a capture, may jump again to an empty square. Unpredictable: the first attack on him each battle has a 50% chance to miss.',
  },
  uka_uka: {
    size: 1, maxHp: 1, damage: 1, cost: 5, value: 430, name: 'Uka Uka',
    blurb: 'Up to three squares any direction, over pieces and gaps (not walls). Dark Protection: every 3 turns, instead of moving, an adjacent ally shrugs off its next attack. Corrupting Presence: enemies within 2 slide one square less (minimum 1).',
  },
  polar: {
    size: 1, maxHp: 1, damage: 1, cost: 4, value: 400, name: 'Polar',
    blurb: "Up to four squares orthogonally; can't move diagonally. Charging Run: attacks after moving 3+ squares deal 2. Momentum: every 3 turns, after moving, may slide one more square the same way.",
  },
  pura: {
    size: 1, maxHp: 1, damage: 1, cost: 4, value: 380, name: 'Pura',
    blurb: "Up to three squares diagonally or two orthogonally. Agile Sprint: every 3 turns, may move again (the second move can't capture). Quick Reflexes: once per battle, steps aside from an attack.",
  },
  brio: {
    size: 1, maxHp: 1, damage: 1, cost: 4, value: 360, name: 'Dr. N. Brio',
    blurb: 'Up to two squares diagonally or one orthogonally. Mutagenic Potion: every 4 turns, an adjacent ally deals +1 on its next attack. Monster Transformation: once per battle, becomes a 3 HP monster for 3 turns (2 squares any direction, 2 damage).',
  },
  brio_monster: {
    size: 1, maxHp: 3, damage: 2, cost: 4, value: 600, name: 'Brio Monster',
    blurb: "Dr. N. Brio, transformed: up to two squares any direction, 2 damage, 3 HP. Turns back (with 1 HP) after 3 turns.",
  },
  n_tropy: {
    size: 2, maxHp: 3, damage: 1, cost: 24, value: 2500, name: 'Dr. Nefarious Tropy',
    blurb: "2×2. Up to two squares any direction. Temporal Distortion: teleports up to 4 (every 3 turns), and enemies next to where he lands can't move next turn. At 2 HP, Time Reversal (once, heal 1) and teleport every 2 turns. At 1 HP, Temporal Collapse: up to three squares, hurts everything next to him after moving, teleport every turn.",
  },
  // Digital Duo Content Pack
  miku: {
    size: 1, maxHp: 2, damage: 1, cost: 5, value: 470, name: 'Hatsune Miku',
    blurb: 'Up to three squares diagonally or one orthogonally. Digital Harmony: instead of moving, heal an ally within 3 by 1 (every 3 turns). Duet: Kasane Teto within 3 is healed too, if hurt.',
  },
  teto: {
    size: 1, maxHp: 2, damage: 1, cost: 5, value: 480, name: 'Kasane Teto',
    blurb: 'Up to three squares orthogonally or one diagonally. Drill Break: smash an adjacent cracked wall instead of moving. Duet: her first attack each battle deals 2 while Hatsune Miku is within 3.',
  },
  // Sonic Content Pack
  sonic: {
    size: 1, maxHp: 2, damage: 1, cost: 7, value: 640, name: 'Sonic',
    blurb: 'Up to four squares orthogonally or two diagonally, spinning through one cracked wall on the way. Blue Blur: every 3 turns, a second (non-capturing) move.',
  },
  tails: {
    size: 1, maxHp: 1, damage: 1, cost: 4, value: 360, name: 'Tails',
    blurb: 'Flies up to three squares diagonally over anything, and can land on gaps. Can carry an adjacent ally along instead of capturing.',
  },
  knuckles: {
    size: 1, maxHp: 3, damage: 2, cost: 7, value: 640, name: 'Knuckles',
    blurb: 'Up to two squares orthogonally, or jumps exactly two diagonally. Power Punch: 2 damage. Wall Breaker: smashes an adjacent cracked wall instead of moving.',
  },
  amy: {
    size: 1, maxHp: 2, damage: 1, cost: 5, value: 440, name: 'Amy Rose',
    blurb: 'Up to two squares any direction. Survives being captured once, with 1 HP. Allies next to her cannot be stunned or paralyzed.',
  },
  shadow: {
    size: 1, maxHp: 2, damage: 1, cost: 8, value: 700, name: 'Shadow',
    blurb: 'Up to three squares any direction. Chaos Control (every 4 turns): teleport anywhere within 4. Chaos Spear (every 3 turns): 1 damage to the first enemy within 3 in a line.',
  },
  rouge: {
    size: 1, maxHp: 1, damage: 1, cost: 4, value: 360, name: 'Rouge',
    blurb: "Up to four squares diagonally, hopping over one obstacle. Collects keys within 1 square. The first attack on her misses, until she's captured something.",
  },
  silver: {
    size: 1, maxHp: 2, damage: 1, cost: 6, value: 520, name: 'Silver',
    blurb: 'Up to two squares any direction, floating over gaps. Psychokinesis: instead of moving, moves an enemy within 3 to an empty square next to it.',
  },
  blaze: {
    size: 1, maxHp: 2, damage: 1, cost: 6, value: 520, name: 'Blaze',
    blurb: 'Up to three squares diagonally or one orthogonally. Enemies she damages are Burned. Immune to fire.',
  },
  eggman: {
    size: 1, maxHp: 1, damage: 1, cost: 3, value: 300, name: 'Dr. Eggman',
    blurb: 'One square any direction. Friendly robots within 3 get +1 max HP (up to 3). Once per battle, escapes capture to a random square on his side.',
  },
  metal_sonic: {
    size: 1, maxHp: 3, damage: 1, cost: 8, value: 720, name: 'Metal Sonic',
    blurb: "Up to three squares orthogonally, or a Knight jump. Copycat: when an enemy damages him, he also moves like it for 2 turns. Overdrive: +1 range at 1 HP.",
  },
  motobug: {
    size: 1, maxHp: 1, damage: 1, cost: 2, value: 200, name: 'Motobug',
    blurb: 'Up to four squares sideways or one forward/back. +1 damage after rolling 3+ squares; after a sideways capture, may roll one more square.',
  },
  buzz_bomber: {
    size: 1, maxHp: 1, damage: 1, cost: 3, value: 280, name: 'Buzz Bomber',
    blurb: 'Flies up to three squares diagonally over anything and can hover over gaps. Energy Shot (every 2 turns): 1 damage to the first enemy within 3 orthogonally.',
  },
  crabmeat: {
    size: 1, maxHp: 2, damage: 1, cost: 3, value: 300, name: 'Crabmeat',
    blurb: 'Up to two squares sideways or one forward/back. Enemies it damages cannot move next turn. Its shell stops the first point of ranged damage.',
  },
  chaos: {
    size: 2, maxHp: 3, damage: 1, cost: 10, value: 900, name: 'Chaos',
    blurb: '2×2. Up to two squares any direction, flowing through walls and pieces. Every 4 turns, heals 1 at the end of a turn it dealt no damage.',
  },
  death_egg: {
    size: 4, maxHp: 3, damage: 1, cost: 30, value: 3200, name: 'Death Egg Robot',
    blurb: '4×4. One square orthogonally, crushing cracked walls; stomps every adjacent enemy when it moves. Gains a missile barrage at 2 HP and goes critical at 1 HP.',
  },
  // Emerald transformations
  super_sonic: {
    size: 1, maxHp: 3, damage: 2, cost: 12, value: 1100, name: 'Super Sonic',
    blurb: 'Up to six squares orthogonally or four diagonally, smashing cracked walls on the way. Attacks deal 2. Every 2 turns, a second move (which can capture). Ignores the first point of damage each battle.',
  },
  super_shadow: {
    size: 1, maxHp: 3, damage: 1, cost: 12, value: 1050, name: 'Super Shadow',
    blurb: 'Up to four squares any direction. Chaos Control (every 2 turns) anywhere on the board; Chaos Spear (every 3 turns) for 2 damage within 5. Cannot be forcibly moved.',
  },
  super_silver: {
    size: 1, maxHp: 3, damage: 1, cost: 11, value: 1000, name: 'Super Silver',
    blurb: 'Up to four squares any direction, over gaps. Every 2 turns, lifts up to two enemies within 4 by a square each (slamming them into walls for 1). Every 3 turns, negates an attack on himself or an adjacent ally.',
  },
  burning_blaze: {
    size: 1, maxHp: 3, damage: 2, cost: 11, value: 1000, name: 'Burning Blaze',
    blurb: 'Up to five squares diagonally or three orthogonally, over gaps. Attacks deal 2; a capture scorches every enemy next to it. Burning Aura (every 3 turns): 1 damage to every adjacent enemy. Immune to fire.',
  },
  hyper_sonic: {
    size: 1, maxHp: 3, damage: 2, cost: 16, value: 1500, name: 'Hyper Sonic',
    blurb: 'Up to seven squares any direction, leaping over everything. Moves twice every turn. Long moves flash enemies within 2; attacks deal 2 and shatter nearby cracked walls. Shrugs off the first 2 damage and survives one fatal hit.',
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
  'ganondorf', 'ganon', 'death_egg', 'n_tropy',
]);

/** Ganondorf's current phase (3 HP = 1, 2 HP = 2, 1 HP or Ganon = 3); 0 for anything else. */
export function ganonPhase(p: Piece): number {
  if (p.type === 'ganon') return 3;
  if (p.type !== 'ganondorf') return 0;
  return p.hp >= 3 ? 1 : p.hp === 2 ? 2 : 3;
}

/** Sonic Content Pack piece types. */
export const SONIC_TYPES = new Set<PieceType>([
  'sonic', 'tails', 'knuckles', 'amy', 'shadow', 'rouge', 'silver', 'blaze',
  'eggman', 'metal_sonic', 'motobug', 'buzz_bomber', 'crabmeat', 'chaos', 'death_egg',
  'super_sonic', 'super_shadow', 'super_silver', 'burning_blaze', 'hyper_sonic',
]);

/** What the Chaos Emeralds (and then the Master Emerald) turn a piece into. */
export const EMERALD_FORMS: Partial<Record<PieceType, PieceType>> = {
  sonic: 'super_sonic',
  shadow: 'super_shadow',
  silver: 'super_silver',
  blaze: 'burning_blaze',
};
export const MASTER_EMERALD_FORMS: Partial<Record<PieceType, PieceType>> = { super_sonic: 'hyper_sonic' };

/** Robots that Dr. Eggman's Mechanical Genius reinforces. */
export const ROBOTS = new Set<PieceType>(['metal_sonic', 'motobug', 'buzz_bomber', 'crabmeat', 'death_egg']);

/** Death Egg Robot phase (3 HP = 1, 2 HP = 2, 1 HP = 3); 0 for anything else. */
export const deathEggPhase = (p: Piece) => (p.type !== 'death_egg' ? 0 : p.hp >= 3 ? 1 : p.hp === 2 ? 2 : 3);

/** Crash Bandicoot Pack piece types. */
export const CRASH_TYPES: PieceType[] = [
  'crash', 'coco', 'crunch', 'aku_aku', 'tawna', 'cortex', 'n_gin', 'tiny', 'dingodile', 'ripper_roo', 'uka_uka', 'polar', 'pura', 'brio',
  'brio_monster', 'n_tropy',
];

/** Zelda Content Pack piece types (handled outside some engine fast paths). */
export const ZELDA_TYPES = new Set<PieceType>([
  'link', 'zelda', 'midna', 'goron', 'zora', 'redead', 'like_like', 'darknut', 'skulltula', 'ganondorf', 'ganon',
  'malon', 'epona', 'deku_scrub', 'lizalfos', 'stalfos',
  // Sonic, Digital Duo and Crash pieces share the same slow paths.
  ...SONIC_TYPES,
  'miku',
  'teto',
  ...CRASH_TYPES,
]);

/** Every square a piece occupies. */
export function footprint(p: Piece, at: Coord = p.pos): Coord[] {
  const s = sizeOf(p);
  if (s === 1) return [at];
  const out: Coord[] = [];
  for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) out.push({ x: at.x + dx, y: at.y + dy });
  return out;
}
