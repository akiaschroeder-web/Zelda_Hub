/**
 * The full upgrade compendium (240 entries) as designed. Effects live in the
 * engine; this file holds the names, rarity, category and rules text.
 */

/** Mythical (the Triforce) sits above Legendary: one of each per run, offered only after the biggest fights. */
export type UpgradeRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythical';

export type UpgradeCategory =
  | 'movement'
  | 'offense'
  | 'defense'
  | 'bounce'
  | 'terrain'
  | 'walls'
  | 'support'
  | 'status'
  | 'summon'
  | 'heavy'
  | 'royal'
  | 'legendary';

export const CATEGORY_NAMES: Record<UpgradeCategory, string> = {
  movement: 'Movement',
  offense: 'Capturing & Offense',
  defense: 'Health & Defense',
  bounce: 'Bounceback & Knockback',
  terrain: 'Terrain & Gaps',
  walls: 'Walls & Demolition',
  support: 'Support & Healing',
  status: 'Status Effects & Control',
  summon: 'Summoning & Duplication',
  heavy: 'Multi-Square & Heavy Units',
  royal: 'King & Royal Abilities',
  legendary: 'Legendary & Reality-Bending',
};

type Row = [num: number, id: string, name: string, rarity: UpgradeRarity, text: string];

const R: Record<UpgradeCategory, Row[]> = {
  movement: [
    [1, 'extended_stride', 'Extended Stride', 'common', 'Increase maximum sliding movement by one square.'],
    [2, 'diagonal_step', 'Diagonal Step', 'uncommon', 'Gain the option to move one square diagonally.'],
    [3, 'orthogonal_step', 'Orthogonal Step', 'uncommon', 'Gain the option to move one square horizontally or vertically.'],
    [4, 'long_leap', 'Long Leap', 'rare', 'Increase an existing leaping displacement by one square.'],
    [5, 'side_step', 'Side Step', 'rare', 'After a non-capturing move, shift one square sideways once per battle.'],
    [6, 'retreat', 'Retreat', 'rare', 'Once per battle, return to the square occupied at the start of your previous turn.'],
    [7, 'quick_march', 'Quick March', 'uncommon', 'The first non-capturing move each battle may travel one additional square.'],
    [8, 'corner_turn', 'Corner Turn', 'epic', 'Once per battle, make a sliding move with a single 90-degree turn.'],
    [9, 'diagonal_pivot', 'Diagonal Pivot', 'epic', 'Once per battle, turn a diagonal sliding move into an orthogonal move halfway through.'],
    [10, 'backward_advance', 'Backward Advance', 'uncommon', 'Pawns and forward-only pieces gain one backward non-capturing step.'],
    [11, 'knights_training', "Knight's Training", 'rare', 'Gain a standard Knight jump once per battle.'],
    [12, 'short_hop', 'Short Hop', 'rare', 'Jump exactly two squares orthogonally over a piece or gap.'],
    [13, 'momentum', 'Momentum', 'uncommon', 'After two consecutive moves in the same direction, gain one extra square of range.'],
    [14, 'free_rotation', 'Free Rotation', 'common', 'Change facing before moving without spending an action.'],
    [15, 'long_retreat', 'Long Retreat', 'uncommon', 'When moving toward your deployment zone, increase range by two squares.'],
    [16, 'flanking_step', 'Flanking Step', 'uncommon', 'Gain a one-square diagonal move when adjacent to an enemy.'],
    [17, 'zigzag', 'Zigzag', 'rare', 'Once per battle, move two squares using two different orthogonal directions.'],
    [18, 'royal_pace', 'Royal Pace', 'rare', 'Move one square in any direction, regardless of normal movement, once per battle.'],
    [19, 'crossing_step', 'Crossing Step', 'rare', 'Move one square through a friendly piece to an empty square beyond it.'],
    [20, 'unstoppable_march', 'Unstoppable March', 'legendary', 'Once per battle, move again after completing a non-capturing move.'],
  ],
  offense: [
    [21, 'heavy_strike', 'Heavy Strike', 'rare', 'Deal 2 damage instead of 1 on your next successful attack, once per battle.'],
    [22, 'piercing_capture', 'Piercing Capture', 'epic', 'After capturing a piece, attack the next enemy directly behind it if in range.'],
    [23, 'executioner', 'Executioner', 'uncommon', 'Deal one additional damage to enemies at 1 HP.'],
    [24, 'ambush', 'Ambush', 'uncommon', 'Your first attack each battle deals one additional damage.'],
    [25, 'chain_capture', 'Chain Capture', 'epic', 'After a capture, make one additional capture with this piece if legal.'],
    [26, 'diagonal_cleave', 'Diagonal Cleave', 'rare', 'After a capture, deal one damage to diagonally adjacent enemies.'],
    [27, 'orthogonal_cleave', 'Orthogonal Cleave', 'rare', 'After a capture, deal one damage to orthogonally adjacent enemies.'],
    [28, 'backstab', 'Backstab', 'uncommon', 'Deal one additional damage when attacking from behind a directional enemy.'],
    [29, 'royal_hunter', 'Royal Hunter', 'rare', 'Deal one additional damage to non-King royal-class pieces.'],
    [30, 'siege_damage', 'Siege Damage', 'uncommon', 'Deal one additional damage to pieces occupying multiple squares.'],
    [31, 'overkill', 'Overkill', 'epic', "If your attack exceeds the target's remaining HP, deal excess damage to an adjacent enemy."],
    [32, 'opening_assault', 'Opening Assault', 'epic', 'Your first three attacks each battle gain one damage.'],
    [33, 'marked_prey', 'Marked Prey', 'rare', 'Choose one enemy at deployment; attacks against it deal one additional damage.'],
    [34, 'revenge_strike', 'Revenge Strike', 'uncommon', 'Deal one additional damage to the piece that most recently damaged you.'],
    [35, 'finishing_blow', 'Finishing Blow', 'epic', 'After reducing a target to 1 HP, immediately deal another damage once per battle.'],
    [36, 'shockwave', 'Shockwave', 'rare', 'After a successful capture, push adjacent enemies one square away.'],
    [37, 'double_impact', 'Double Impact', 'epic', 'Once per battle, a successful attack deals damage twice.'],
    [38, 'precision', 'Precision', 'uncommon', 'Ignore one point of temporary shielding when attacking.'],
    [39, 'kingbreaker', 'Kingbreaker', 'epic', 'Deal one additional damage to enemy Kings when King damage is permitted.'],
    [40, 'perfect_strike', 'Perfect Strike', 'legendary', 'Once per battle, defeat a non-boss target regardless of remaining HP.'],
  ],
  defense: [
    [41, 'reinforced_body', 'Reinforced Body', 'uncommon', 'Increase maximum HP by one and heal one HP.'],
    [42, 'thick_armor', 'Thick Armor', 'uncommon', 'Begin each battle with one temporary shield.'],
    [43, 'iron_shell', 'Iron Shell', 'rare', 'The first incoming damage each battle is reduced by one.'],
    [44, 'emergency_barrier', 'Emergency Barrier', 'rare', 'When reduced to 1 HP, gain a shield.'],
    [45, 'lasting_guard', 'Lasting Guard', 'uncommon', 'Shields gained by this piece persist until consumed.'],
    [46, 'fortress_stance', 'Fortress Stance', 'uncommon', 'If this piece does not act during your turn, gain one shield, maximum one.'],
    [47, 'royal_protection', 'Royal Protection', 'rare', 'Take one damage instead of an adjacent King once per battle.'],
    [48, 'brace', 'Brace', 'common', 'Once per battle, negate a forced movement effect.'],
    [49, 'steadfast', 'Steadfast', 'uncommon', 'Cannot be pushed or pulled by ordinary abilities.'],
    [50, 'guardian_aura', 'Guardian Aura', 'epic', 'Adjacent allies gain one shield at the start of battle.'],
    [51, 'stone_skin', 'Stone Skin', 'epic', 'Reduce the first two separate attacks each battle by one damage.'],
    [52, 'second_wind', 'Second Wind', 'rare', 'Once per battle, heal one HP after surviving an attack.'],
    [53, 'sacrificial_guard', 'Sacrificial Guard', 'rare', "Prevent an adjacent ally's capture by taking the attack instead."],
    [54, 'protected_retreat', 'Protected Retreat', 'uncommon', 'After surviving an attack, gain one shield.'],
    [55, 'shield_transfer', 'Shield Transfer', 'common', 'Transfer your shield to an adjacent ally as an action.'],
    [56, 'defiant_armor', 'Defiant Armor', 'rare', 'Gain one shield whenever an adjacent ally is captured, maximum two.'],
    [57, 'critical_survival', 'Critical Survival', 'epic', 'Once per battle, survive an otherwise fatal attack at 1 HP.'],
    [58, 'reflective_armor', 'Reflective Armor', 'epic', 'When damaged by an adjacent attacker, deal one damage back.'],
    [59, 'impenetrable', 'Impenetrable', 'legendary', 'Become immune to damage until your next turn, once per battle.'],
    [60, 'living_fortress', 'Living Fortress', 'legendary', 'Gain one maximum HP for every three battles survived, maximum three bonus HP.'],
  ],
  bounce: [
    [61, 'reduced_recoil', 'Reduced Recoil', 'uncommon', 'When attacking a surviving multi-health piece, reduce bounce distance by one, minimum zero.'],
    [62, 'full_retreat', 'Full Retreat', 'common', 'When bouncing, return to your original square instead.'],
    [63, 'rebound_shield', 'Rebound Shield', 'uncommon', 'Gain one shield after bouncing.'],
    [64, 'rebound_strike', 'Rebound Strike', 'rare', 'After bouncing, damage an adjacent enemy once per battle.'],
    [65, 'controlled_bounce', 'Controlled Bounce', 'rare', 'Choose between two legal retreat squares when bouncing.'],
    [66, 'heavy_impact', 'Heavy Impact', 'rare', 'Push a surviving defender one square backward after damaging it.'],
    [67, 'knockback', 'Knockback', 'uncommon', 'Once per battle, push a target one square after a successful hit.'],
    [68, 'long_knockback', 'Long Knockback', 'rare', 'Increase your forced-push distance by one square.'],
    [69, 'counterweight', 'Counterweight', 'uncommon', 'Become immune to bounceback once per battle.'],
    [70, 'spring_loaded', 'Spring Loaded', 'rare', 'After bouncing, gain an extra non-capturing move next turn.'],
    [71, 'collision_damage', 'Collision Damage', 'epic', 'Enemies pushed into other pieces deal one damage to both.'],
    [72, 'wall_slam', 'Wall Slam', 'rare', 'Deal one extra damage when pushing an enemy against a wall.'],
    [73, 'rebound_capture', 'Rebound Capture', 'epic', 'If your bounce lands adjacent to an enemy, attack it once per battle.'],
    [74, 'anchor_feet', 'Anchor Feet', 'uncommon', 'Your piece cannot be displaced while occupying an objective square.'],
    [75, 'ricochet', 'Ricochet', 'rare', 'Once per battle, bounce sideways instead of backward.'],
    [76, 'forceful_charge', 'Forceful Charge', 'epic', 'Push a defender one square even if it survives your attack.'],
    [77, 'counterpush', 'Counterpush', 'rare', 'When pushed, push the source back one square if possible.'],
    [78, 'shock_absorber', 'Shock Absorber', 'common', 'Take no collision damage from forced movement.'],
    [79, 'recoil_conversion', 'Recoil Conversion', 'epic', 'Convert your next bounce distance into bonus movement range.'],
    [80, 'unyielding_assault', 'Unyielding Assault', 'legendary', 'Once per battle, ignore bounceback and remain adjacent to the damaged defender.'],
  ],
  terrain: [
    [81, 'gap_jumper', 'Gap Jumper', 'rare', 'Cross one gap during a movement action.'],
    [82, 'long_gap_jump', 'Long Gap Jump', 'epic', 'Cross up to two consecutive gaps during one move.'],
    [83, 'bridge_builder', 'Bridge Builder', 'rare', 'Create a temporary bridge over an adjacent gap.'],
    [84, 'permanent_bridge', 'Permanent Bridge', 'epic', 'Once per battle, permanently convert one gap into a playable square.'],
    [85, 'void_step', 'Void Step', 'rare', 'Once per battle, teleport across a gap to a square on the opposite side.'],
    [86, 'cliff_runner', 'Cliff Runner', 'common', 'Gain one movement range when beginning adjacent to a gap.'],
    [87, 'gap_sense', 'Gap Sense', 'common', 'Reveal safe landing squares and movement paths around gaps.'],
    [88, 'island_defender', 'Island Defender', 'uncommon', 'Gain a shield when ending a turn surrounded by gaps on at least two sides.'],
    [89, 'void_anchor', 'Void Anchor', 'uncommon', 'Cannot be forcibly moved into a gap.'],
    [90, 'gap_assault', 'Gap Assault', 'rare', 'Deal one additional damage when attacking across a gap.'],
    [91, 'edge_walker', 'Edge Walker', 'uncommon', 'Move along the edge of a gap with one additional square of range.'],
    [92, 'temporary_platform', 'Temporary Platform', 'rare', 'Create a playable square over a gap for two rounds.'],
    [93, 'platform_extension', 'Platform Extension', 'common', 'Increase the duration of created bridges by two rounds.'],
    [94, 'bridge_collapse', 'Bridge Collapse', 'uncommon', 'Destroy one temporary bridge as an action.'],
    [95, 'leap_assault', 'Leap Assault', 'rare', 'Deal one additional damage after jumping across a gap.'],
    [96, 'void_rescue', 'Void Rescue', 'epic', 'Once per battle, teleport an adjacent ally away from a collapsing bridge.'],
    [97, 'gap_conversion', 'Gap Conversion', 'epic', 'Convert a normal empty square into a gap once per battle.'],
    [98, 'void_immunity', 'Void Immunity', 'epic', 'Survive one otherwise fatal forced fall into a gap by returning to a legal square.'],
    [99, 'terrain_adaptation', 'Terrain Adaptation', 'uncommon', 'Ignore the first movement penalty caused by special terrain each turn.'],
    [100, 'master_of_the_void', 'Master of the Void', 'legendary', 'Once per battle, cross any number of consecutive gaps in one straight movement.'],
  ],
  walls: [
    [101, 'demolition', 'Demolition', 'common', 'Destroy one adjacent cracked wall as an action.'],
    [102, 'siege_strike', 'Siege Strike', 'uncommon', 'Attack cracked walls along your normal attack direction.'],
    [103, 'battering_ram', 'Battering Ram', 'rare', 'Destroy an adjacent cracked wall and enter its square.'],
    [104, 'shatter', 'Shatter', 'epic', 'Destroy all connected cracked walls within two squares once per battle.'],
    [105, 'wall_breaker', 'Wall Breaker', 'uncommon', 'Deal two damage to reinforced destructible walls.'],
    [106, 'phasing', 'Phasing', 'rare', 'Move through one solid wall, ending on a legal square.'],
    [107, 'extended_phasing', 'Extended Phasing', 'epic', 'Move through up to two consecutive walls.'],
    [108, 'wall_climber', 'Wall Climber', 'rare', 'Cross a single wall during a non-capturing move once per battle.'],
    [109, 'reinforcement', 'Reinforcement', 'uncommon', 'Turn one cracked wall into a solid wall.'],
    [110, 'barricade', 'Barricade', 'rare', 'Create one temporary wall on an adjacent empty square.'],
    [111, 'wall_repair', 'Wall Repair', 'uncommon', 'Restore one destroyed cracked wall.'],
    [112, 'siege_master', 'Siege Master', 'epic', 'Destroy a cracked wall without consuming your normal move once per battle.'],
    [113, 'explosive_breach', 'Explosive Breach', 'epic', 'Destroy a cracked wall and damage adjacent enemy pieces.'],
    [114, 'wall_shield', 'Wall Shield', 'common', 'Gain one shield while adjacent to a wall.'],
    [115, 'fortified_position', 'Fortified Position', 'rare', 'Gain one maximum HP while occupying a square adjacent to two walls.'],
    [116, 'wall_swap', 'Wall Swap', 'rare', 'Exchange positions with an adjacent destructible wall, destroying it.'],
    [117, 'structural_weakness', 'Structural Weakness', 'uncommon', 'Cracked walls you damage become vulnerable to attacks from allied pieces.'],
    [118, 'chain_demolition', 'Chain Demolition', 'rare', 'Destroy another adjacent cracked wall after your first demolition.'],
    [119, 'siege_charge', 'Siege Charge', 'uncommon', 'Gain one damage after destroying a cracked wall, lasting until your next attack.'],
    [120, 'absolute_demolition', 'Absolute Demolition', 'legendary', 'Destroy one normally indestructible wall once per battle.'],
  ],
  support: [
    [121, 'field_medic', 'Field Medic', 'uncommon', 'Heal an adjacent friendly piece by one HP as an action.'],
    [122, 'extended_healing', 'Extended Healing', 'uncommon', 'Increase the range of healing abilities by one square.'],
    [123, 'emergency_treatment', 'Emergency Treatment', 'rare', 'Once per battle, heal an ally immediately after it survives damage.'],
    [124, 'group_healing', 'Group Healing', 'epic', 'Heal all adjacent friendly pieces by one HP once per battle.'],
    [125, 'healing_aura', 'Healing Aura', 'rare', 'At the end of every third friendly turn, heal one adjacent ally.'],
    [126, 'regeneration', 'Regeneration', 'rare', 'Heal one HP every four friendly turns.'],
    [127, 'life_transfer', 'Life Transfer', 'uncommon', 'Lose one HP to heal an adjacent ally by two HP.'],
    [128, 'protective_blessing', 'Protective Blessing', 'uncommon', 'Grant one shield to an adjacent ally as an action.'],
    [129, 'shared_armor', 'Shared Armor', 'rare', 'Split incoming damage between this piece and an adjacent ally.'],
    [130, 'rescue', 'Rescue', 'rare', 'Move an adjacent ally to an empty square behind this piece.'],
    [131, 'rally', 'Rally', 'common', 'Give an adjacent ally one extra movement range on its next turn.'],
    [132, 'battlefield_inspiration', 'Battlefield Inspiration', 'epic', 'All adjacent allies gain one extra movement range for one turn.'],
    [133, 'cleansing', 'Cleansing', 'uncommon', 'Remove one negative status effect from an adjacent ally.'],
    [134, 'healing_on_capture', 'Healing on Capture', 'rare', 'Heal one HP after capturing an enemy.'],
    [135, 'medics_reward', "Medic's Reward", 'uncommon', 'After healing an ally, gain one shield.'],
    [136, 'royal_physician', 'Royal Physician', 'rare', 'Healing abilities may target the King.'],
    [137, 'defensive_formation', 'Defensive Formation', 'uncommon', 'Adjacent friendly pieces gain resistance to forced movement.'],
    [138, 'emergency_evacuation', 'Emergency Evacuation', 'epic', 'Once per battle, teleport a critically wounded ally to an empty deployment square.'],
    [139, 'miracle_recovery', 'Miracle Recovery', 'legendary', 'Once per battle, restore a surviving ally to full HP.'],
    [140, 'sanctuary', 'Sanctuary', 'legendary', 'Create a three-square protective zone for two turns once per battle.'],
  ],
  status: [
    [141, 'bind', 'Bind', 'uncommon', 'Prevent an adjacent enemy from moving for one turn.'],
    [142, 'extended_bind', 'Extended Bind', 'rare', 'Increase Bind range by one square.'],
    [143, 'weakening_strike', 'Weakening Strike', 'uncommon', "Reduce a target's next attack damage by one."],
    [144, 'silence', 'Silence', 'rare', 'Prevent a target from using special abilities for one turn.'],
    [145, 'slow', 'Slow', 'common', "Reduce a target's movement range by one for two turns."],
    [146, 'disarm', 'Disarm', 'rare', 'Prevent a target from capturing on its next action.'],
    [147, 'mark', 'Mark', 'uncommon', 'Mark an enemy, making it take one extra damage from the next attack.'],
    [148, 'blind', 'Blind', 'uncommon', "Reduce an enemy's ranged attack distance by two for one turn."],
    [149, 'cripple', 'Cripple', 'rare', 'Prevent a target from using jumping movement for one turn.'],
    [150, 'exhaust', 'Exhaust', 'rare', 'Increase the cooldown of one enemy ability by one turn.'],
    [151, 'root', 'Root', 'uncommon', 'Prevent forced movement of a target for two turns.'],
    [152, 'fear', 'Fear', 'rare', 'Force an adjacent enemy to retreat one legal square.'],
    [153, 'confusion', 'Confusion', 'epic', "Force an enemy's next movement to use its shortest available range."],
    [154, 'curse', 'Curse', 'epic', "Reduce a target's maximum HP by one for the current battle."],
    [155, 'vulnerability', 'Vulnerability', 'rare', 'The next two attacks against the target deal one additional damage.'],
    [156, 'pacify', 'Pacify', 'rare', 'Prevent a target from attacking for one turn.'],
    [157, 'suppression', 'Suppression', 'epic', 'Enemies adjacent to this piece cannot activate movement abilities.'],
    [158, 'chain_bind', 'Chain Bind', 'epic', 'When Binding a target, also Bind one adjacent enemy.'],
    [159, 'permanent_mark', 'Permanent Mark', 'epic', 'Mark one enemy for the remainder of the battle.'],
    [160, 'absolute_silence', 'Absolute Silence', 'legendary', 'Once per battle, disable all special abilities of one non-boss enemy for two turns.'],
  ],
  summon: [
    [161, 'pawn_summon', 'Pawn Summon', 'rare', 'Summon one temporary Pawn on an adjacent empty square once per battle.'],
    [162, 'double_pawn_summon', 'Double Pawn Summon', 'epic', 'Summon two temporary Pawns on separate adjacent squares.'],
    [163, 'decoy', 'Decoy', 'uncommon', 'Create a temporary 1 HP decoy that cannot attack.'],
    [164, 'mirror_image', 'Mirror Image', 'epic', 'Create a temporary copy of this piece with 1 HP and no upgrades.'],
    [165, 'temporary_knight', 'Temporary Knight', 'epic', 'Summon a temporary Knight for three turns.'],
    [166, 'summoners_range', "Summoner's Range", 'uncommon', 'Increase summoning placement range by one square.'],
    [167, 'summon_shield', 'Summon Shield', 'rare', 'Newly summoned pieces begin with one shield.'],
    [168, 'summon_extension', 'Summon Extension', 'uncommon', 'Increase temporary summon duration by two turns.'],
    [169, 'sacrificial_summon', 'Sacrificial Summon', 'rare', 'Destroy an adjacent summon to heal yourself by one HP.'],
    [170, 'explosive_decoy', 'Explosive Decoy', 'rare', 'Your decoy deals one damage to adjacent enemies when destroyed.'],
    [171, 'pawn_swarm', 'Pawn Swarm', 'legendary', 'Summon three temporary Pawns once per battle.'],
    [172, 'summon_swap', 'Summon Swap', 'rare', 'Exchange positions with one of your summons.'],
    [173, 'summon_recall', 'Summon Recall', 'uncommon', 'Remove a summon and redeploy it on another valid square.'],
    [174, 'summoned_guard', 'Summoned Guard', 'epic', 'Summoned units gain the ability to intercept one attack.'],
    [175, 'copy_movement', 'Copy Movement', 'rare', 'A summoned copy gains your basic movement pattern.'],
    [176, 'echo_summon', 'Echo Summon', 'epic', 'After your first summon is destroyed, recreate it once.'],
    [177, 'summoners_reward', "Summoner's Reward", 'uncommon', 'Gain one shield whenever a summon captures an enemy.'],
    [178, 'army_of_one', 'Army of One', 'legendary', 'Once per battle, create two temporary copies of yourself with 1 HP.'],
    [179, 'summon_conversion', 'Summon Conversion', 'rare', 'Transform one temporary summon into a different basic piece for the battle.'],
    [180, 'lasting_reinforcements', 'Lasting Reinforcements', 'legendary', 'Summons remain active until captured or the battle ends.'],
  ],
  heavy: [
    [181, 'reinforced_frame', 'Reinforced Frame', 'uncommon', 'A multi-square piece gains one maximum HP.'],
    [182, 'wide_sweep', 'Wide Sweep', 'rare', 'Increase the damage of a multi-target footprint attack by one.'],
    [183, 'crushing_weight', 'Crushing Weight', 'rare', 'Deal one additional damage to pieces struck by your leading edge.'],
    [184, 'heavy_armor', 'Heavy Armor', 'rare', 'Gain two temporary shields at battle start.'],
    [185, 'siege_momentum', 'Siege Momentum', 'uncommon', 'After moving twice in the same direction, gain one damage on your next attack.'],
    [186, 'massive_push', 'Massive Push', 'epic', 'Push adjacent enemies one square when advancing.'],
    [187, 'footprint_guard', 'Footprint Guard', 'rare', 'Allies adjacent to your footprint gain one shield.'],
    [188, 'iron_advance', 'Iron Advance', 'epic', 'Ignore one ordinary piece that would otherwise block your movement by pushing it.'],
    [189, 'heavy_stabilizer', 'Heavy Stabilizer', 'uncommon', 'Cannot be forcibly moved by smaller pieces.'],
    [190, 'crushing_entry', 'Crushing Entry', 'epic', 'Destroy cracked walls within your destination footprint.'],
    [191, 'wide_healing', 'Wide Healing', 'epic', 'Heal every friendly piece adjacent to your footprint by one HP once per battle.'],
    [192, 'anchor_formation', 'Anchor Formation', 'uncommon', 'Adjacent allies cannot be pushed or pulled.'],
    [193, 'massive_retaliation', 'Massive Retaliation', 'epic', 'Deal one damage to every adjacent attacker after surviving a hit, once per battle.'],
    [194, 'siege_presence', 'Siege Presence', 'rare', 'Enemies adjacent to your footprint lose one movement range.'],
    [195, 'heavy_recovery', 'Heavy Recovery', 'uncommon', 'Heal one HP after remaining stationary for two turns.'],
    [196, 'wide_shield', 'Wide Shield', 'epic', 'Gain a shield that absorbs two damage instead of one.'],
    [197, 'multi_target_precision', 'Multi-Target Precision', 'common', 'Choose which enemies within your footprint receive damage first.'],
    [198, 'unbroken_advance', 'Unbroken Advance', 'epic', 'Once per battle, move after damaging a surviving multi-health defender.'],
    [199, 'colossal_endurance', 'Colossal Endurance', 'legendary', 'Gain two maximum HP, but reduce movement range by one where applicable.'],
    [200, 'living_avalanche', 'Living Avalanche', 'legendary', 'Once per battle, move two squares orthogonally and attack every enemy encountered along the footprint path.'],
  ],
  royal: [
    [201, 'royal_guard', 'Royal Guard', 'rare', 'Intercept one attack against the King per battle.'],
    [202, 'royal_escort', 'Royal Escort', 'rare', 'Move an adjacent King one square as part of your action.'],
    [203, 'kings_shield', "King's Shield", 'epic', 'Grant the King one temporary shield at battle start.'],
    [204, 'royal_rally', 'Royal Rally', 'uncommon', 'Friendly pieces adjacent to the King gain one movement range.'],
    [205, 'royal_retreat', 'Royal Retreat', 'epic', 'Once per battle, move the King to an empty deployment square.'],
    [206, 'royal_swap', 'Royal Swap', 'epic', 'Exchange positions with the King once per battle, if both placements are legal.'],
    [207, 'royal_inspiration', 'Royal Inspiration', 'uncommon', 'After the King moves, gain one extra movement range next turn.'],
    [208, 'crown_defender', 'Crown Defender', 'common', 'Gain one shield while adjacent to the King.'],
    [209, 'royal_sacrifice', 'Royal Sacrifice', 'epic', 'Take a fatal attack intended for the King.'],
    [210, 'royal_authority', 'Royal Authority', 'legendary', 'Once per battle, grant the King an additional action.'],
    [211, 'kings_blessing', "King's Blessing", 'uncommon', 'Heal one HP when ending your turn adjacent to the King.'],
    [212, 'royal_formation', 'Royal Formation', 'rare', 'Gain one damage while positioned between the King and an enemy.'],
    [213, 'royal_command', 'Royal Command', 'epic', 'Once every four turns, grant an adjacent ally an extra move.'],
    [214, 'throne_guardian', 'Throne Guardian', 'rare', 'Gain two temporary shields when the King is threatened.'],
    [215, 'royal_sanctuary', 'Royal Sanctuary', 'legendary', 'Create a protective zone around the King for one turn.'],
    [216, 'crowns_reach', "Crown's Reach", 'uncommon', 'Increase the range of abilities targeting the King by one square.'],
    [217, 'royal_vengeance', 'Royal Vengeance', 'rare', 'Gain one damage after an ally adjacent to the King is captured.'],
    [218, 'kings_path', "King's Path", 'epic', 'Create a temporary safe passage for the King across one gap.'],
    [219, 'royal_resilience', 'Royal Resilience', 'legendary', 'The King survives one otherwise fatal hit at 1 HP, once per run.'],
    [220, 'last_royal_stand', 'Last Royal Stand', 'legendary', 'When only the King and this piece remain, gain two damage and one shield.'],
  ],
  legendary: [
    [221, 'time_reversal', 'Time Reversal', 'legendary', 'Once per battle, undo your most recent move, including its captures and damage.'],
    [222, 'temporal_echo', 'Temporal Echo', 'legendary', 'Repeat your previous action without consuming your normal action, once per battle.'],
    [223, 'dimensional_shift', 'Dimensional Shift', 'legendary', 'Teleport to any empty playable square once per battle.'],
    [224, 'board_rewrite', 'Board Rewrite', 'legendary', 'Convert up to three selected empty squares between normal terrain and gaps.'],
    [225, 'absolute_capture', 'Absolute Capture', 'legendary', 'Once per battle, capture a non-boss enemy regardless of HP or shields.'],
    [226, 'second_life', 'Second Life', 'legendary', 'The first time this piece would be permanently lost, return it to the roster after battle.'],
    [227, 'perfect_clone', 'Perfect Clone', 'legendary', 'Create one temporary full-strength copy of this piece for three turns.'],
    [228, 'reality_anchor', 'Reality Anchor', 'legendary', 'Prevent all terrain changes within three squares for the entire battle.'],
    [229, 'kings_decree', "King's Decree", 'legendary', 'Once per battle, grant every friendly piece one temporary shield.'],
    [230, 'mass_promotion', 'Mass Promotion', 'legendary', 'Transform up to three friendly Pawns into Knights for the remainder of battle.'],
    [231, 'infinite_momentum', 'Infinite Momentum', 'legendary', 'Continue moving after each successful capture, up to three additional captures.'],
    [232, 'chrono_lock', 'Chrono Lock', 'legendary', 'Prevent one enemy from taking actions for two turns.'],
    [233, 'unbreakable_formation', 'Unbreakable Formation', 'legendary', 'All adjacent allies become immune to damage until your next turn, once per battle.'],
    [234, 'army_recall', 'Army Recall', 'legendary', 'Once per battle, return up to three surviving allies to valid deployment squares.'],
    [235, 'total_demolition', 'Total Demolition', 'legendary', 'Destroy every cracked wall on the battlefield.'],
    [236, 'royal_resurrection', 'Royal Resurrection', 'legendary', "Once per run, prevent the King's death and return it to its deployment square."],
    [237, 'board_dominion', 'Board Dominion', 'legendary', 'For three turns, control all unoccupied objective squares within two squares.'],
    [238, 'fate_exchange', 'Fate Exchange', 'legendary', 'Swap the current HP values of two eligible pieces, respecting their maximum HP.'],
    [239, 'final_gambit', 'Final Gambit', 'legendary', 'Sacrifice this piece to deal three damage to every adjacent enemy.'],
    [240, 'checkmate_gambit', 'Checkmate Gambit', 'legendary', 'Once per battle, force one enemy non-King piece to skip its next action and grant an allied piece an extra move.'],
  ],
};

/**
 * Zelda Content Pack upgrades (Ocarina of Time inspired). Only offered when
 * the run has the Zelda Pack on. Activated ones replace the piece's move.
 */
const ZELDA_ROWS: [num: number, id: string, name: string, rarity: UpgradeRarity, category: UpgradeCategory, text: string][] = [
  // Weapons & Equipment
  [241, 'kokiri_sword', 'Kokiri Sword', 'uncommon', 'offense', 'After capturing an enemy, may step one square in any direction into an empty square (no capture).'],
  [242, 'master_sword', 'Master Sword', 'rare', 'offense', 'Attacks against Boss Pieces deal 2 damage instead of 1.'],
  [243, 'biggorons_sword', "Biggoron's Sword", 'rare', 'offense', 'Attacks also deal 1 damage to an enemy directly behind the target, in the direction of the attack.'],
  [244, 'deku_shield', 'Deku Shield', 'common', 'defense', 'Blocks the first point of damage this piece takes each battle.'],
  [245, 'hylian_shield', 'Hylian Shield', 'rare', 'defense', 'Negates the first attack against this piece each battle, however much damage it would deal.'],
  [246, 'mirror_shield', 'Mirror Shield', 'epic', 'defense', 'Once per battle, a ranged or magical attack on this piece is reflected back at its source.'],
  [247, 'fairy_bow', 'Fairy Bow', 'rare', 'offense', 'Every 3 turns, instead of moving, shoot an enemy up to 3 squares away in a clear straight line (orthogonal).'],
  [248, 'fairy_slingshot', 'Fairy Slingshot', 'uncommon', 'status', 'Every 3 turns, instead of moving, stun an enemy within 2 squares so it cannot move on its next turn.'],
  [249, 'boomerang', 'Boomerang', 'uncommon', 'offense', 'Every 3 turns, instead of moving, deal 1 damage to an enemy up to 2 squares away in a clear straight line.'],
  [250, 'megaton_hammer', 'Megaton Hammer', 'uncommon', 'walls', 'Instead of moving, smash an adjacent cracked wall — and hit an enemy directly behind it for 1 damage.'],
  // Tools & Special Equipment
  [251, 'hookshot', 'Hookshot', 'rare', 'movement', 'Every 4 turns, instead of moving, pull this piece up to 4 squares in a straight line to the square in front of a wall, over gaps.'],
  [252, 'longshot', 'Longshot', 'epic', 'movement', 'Like the Hookshot, but reaches 7 squares and recharges every 3 turns.'],
  [253, 'bombs', 'Bombs', 'uncommon', 'walls', 'Every 3 turns, instead of moving, blow up a cracked wall within 2 squares; every piece next to it takes 1 damage (allies too).'],
  [254, 'bombchu', 'Bombchu', 'rare', 'offense', 'Every 4 turns, instead of moving, send a Bombchu up to 5 squares in a straight line over gaps; it hits the first piece (1 damage) or cracked wall (destroyed).'],
  [255, 'hover_boots', 'Hover Boots', 'uncommon', 'terrain', 'Movement can cross a single gap square, as long as it ends on solid ground.'],
  [256, 'iron_boots', 'Iron Boots', 'uncommon', 'defense', 'Cannot be pushed, pulled or forcibly moved — so it can never be knocked into a gap.'],
  [257, 'lens_of_truth', 'Lens of Truth', 'uncommon', 'status', "This piece's attacks ignore evasion and dodges (Zora, Phantom King), and it sees through nearby illusions."],
  [258, 'deku_nut', 'Deku Nut', 'uncommon', 'status', 'Once per battle, instead of moving, stun every adjacent enemy for 1 turn.'],
  // Magic & Spells
  [259, 'dins_fire', "Din's Fire", 'epic', 'offense', 'Every 5 turns, instead of moving, deal 1 damage to every enemy within 2 squares. Walls block it.'],
  [260, 'farores_wind', "Farore's Wind", 'rare', 'movement', 'Once per battle, instead of moving, teleport to any empty square.'],
  [261, 'nayrus_love', "Nayru's Love", 'rare', 'defense', 'Once per battle, instead of moving, become immune to damage until your next turn.'],
  [262, 'fire_arrows', 'Fire Arrows', 'rare', 'status', 'Enemies this piece damages are Burned: they lose 1 HP at the end of their next turn. Does not stack.'],
  [263, 'ice_arrows', 'Ice Arrows', 'rare', 'status', 'Enemies this piece damages are Frozen and cannot move on their next turn.'],
  [264, 'light_arrows', 'Light Arrows', 'epic', 'offense', "This piece's attacks ignore shields, damage reduction, armor and temporary invulnerability."],
  // Ocarina Songs & Magical Relics
  [265, 'song_of_time', 'Song of Time', 'legendary', 'movement', 'Once per battle, instead of moving, return to where this piece began its previous turn, restoring HP lost since.'],
  [266, 'suns_song', "Sun's Song", 'rare', 'status', 'Every 5 turns, instead of moving, stun every enemy undead (ReDead) for 1 turn — or, instead, stun one adjacent enemy.'],
  [267, 'song_of_storms', 'Song of Storms', 'rare', 'status', 'Every 4 turns, instead of moving, call a 3×3 storm within 3 squares: every piece in it moves 1 square less next turn (minimum 1).'],
  [268, 'golden_gauntlets', 'Golden Gauntlets', 'rare', 'bounce', 'Instead of moving, shove an adjacent enemy 1 square away. A wall deals it 1 damage (a cracked wall breaks); a gap captures it.'],
  [269, 'bottled_fairy', 'Bottled Fairy', 'rare', 'defense', 'The first time this piece would be captured, it survives with 1 HP instead.'],
  [270, 'stone_of_agony', 'Stone of Agony', 'common', 'status', 'Ending a move next to a disguised enemy reveals it, and squares watched by hidden hazards are flagged when you select this piece.'],
  // Mythical: the three pieces of the Triforce. One of each per run.
  [271, 'triforce_courage', 'Triforce of Courage', 'mythical', 'legendary', 'Immune to every negative status effect and to forced movement. Deals +1 damage to any enemy with more maximum HP than itself.'],
  [272, 'triforce_power', 'Triforce of Power', 'mythical', 'legendary', '+1 damage on every attack and +1 maximum HP (beyond the usual cap of 3).'],
  [273, 'triforce_wisdom', 'Triforce of Wisdom', 'mythical', 'legendary', "You always see the enemy's intended move and every illusion. Once per battle, instead of moving, every ally within 2 squares becomes immune to damage until your next turn."],
];

/** Sonic Content Pack upgrades. Only offered when the run has the Sonic Pack on. */
const SONIC_ROWS: [num: number, id: string, name: string, rarity: UpgradeRarity, category: UpgradeCategory, text: string][] = [
  // Movement & Offensive
  [274, 'speed_shoes', 'Speed Shoes', 'common', 'movement', 'Sliding moves reach one square further. Fixed-distance jumps are unaffected.'],
  [275, 'spin_dash', 'Spin Dash', 'uncommon', 'offense', 'An attack after travelling 3 or more squares in a straight line deals 2 damage instead of 1.'],
  [276, 'homing_attack', 'Homing Attack', 'rare', 'offense', 'Every 3 turns, leap straight at an enemy within 3 squares and attack it, ignoring anything in the way.'],
  [277, 'bounce_bracelet', 'Bounce Bracelet', 'uncommon', 'movement', 'Can also jump exactly 2 squares orthogonally, over whatever is between.'],
  [278, 'light_speed_dash', 'Light Speed Dash', 'rare', 'movement', 'Every 4 turns, instead of moving normally, dash to any empty square in this row or column, ignoring everything in the way.'],
  [279, 'flame_ring', 'Flame Ring', 'rare', 'offense', 'Attacks also deal 1 damage to one other enemy next to the target.'],
  [280, 'magic_gloves', 'Magic Gloves', 'rare', 'offense', 'Every 4 turns, instead of moving, capture an adjacent non-Boss enemy that has exactly 1 HP.'],
  [281, 'ancient_light', 'Ancient Light', 'legendary', 'offense', 'After a capture, may immediately make one more capture with its normal movement (once per turn).'],
  // Defensive & Survival
  [282, 'blue_shield', 'Blue Shield', 'common', 'defense', 'Blocks the first point of damage this piece takes each battle.'],
  [283, 'flame_shield', 'Flame Shield', 'uncommon', 'defense', 'Once per battle, an adjacent enemy that damages this piece takes 1 damage back.'],
  [284, 'lightning_shield', 'Lightning Shield', 'uncommon', 'offense', 'Every 3 turns, instead of moving, deal 1 damage to an enemy up to 2 squares away orthogonally (clear line).'],
  [285, 'bubble_shield', 'Bubble Shield', 'uncommon', 'movement', 'Every 3 turns, instead of moving normally, jump exactly 2 squares in any direction to an empty square.'],
  [286, 'invincibility', 'Invincibility Monitor', 'rare', 'defense', 'Once per battle, the first time this piece would take damage, it takes none.'],
  [287, 'extra_life', 'Extra Life', 'legendary', 'defense', 'The first time this piece would be permanently lost, it returns to your army after the battle.'],
  [288, 'ring_protection', 'Ring Protection', 'common', 'defense', 'When this piece takes damage and survives, it hops to the safest adjacent empty square (every 3 turns).'],
  // Terrain & Special Movement
  [289, 'yellow_drill', 'Yellow Drill', 'uncommon', 'walls', 'Slides through walls and cracked walls, destroying them on the way. Must finish on open ground.'],
  [290, 'pink_spikes', 'Pink Spikes', 'uncommon', 'walls', 'Slides through walls without breaking them, and can stop on a wall.'],
  [291, 'orange_rocket', 'Orange Rocket', 'rare', 'movement', 'Every 4 turns, instead of moving normally, rocket to any empty square within 4 orthogonally, over anything.'],
  [292, 'cyan_laser', 'Cyan Laser', 'rare', 'offense', 'Every 4 turns, shoot up to 5 squares in a straight or diagonal line through anything; ending on an enemy attacks it.'],
  [293, 'blue_cube', 'Blue Cube', 'uncommon', 'walls', 'Every 4 turns, instead of moving, raise a wall on an empty square within 3, or remove a wall within 3.'],
  [294, 'purple_frenzy', 'Purple Frenzy', 'rare', 'offense', 'Each capture adds 1 to this piece’s sliding range for the rest of the battle (up to +3).'],
  [295, 'hover_wisp', 'Hover Wisp', 'uncommon', 'terrain', 'Slides can cross any run of gaps, as long as they end on solid ground.'],
  // Special & Chaos
  [296, 'chaos_drive', 'Chaos Drive', 'uncommon', 'defense', '+1 maximum HP (up to 3).'],
  [297, 'chaos_spear', 'Chaos Spear', 'rare', 'offense', 'Every 3 turns, instead of moving, deal 1 damage to the first enemy within 4 in a straight or diagonal line. Walls block it.'],
  [298, 'chaos_blast', 'Chaos Blast', 'legendary', 'offense', 'Once per battle, instead of moving, deal 1 damage to every enemy within 2 squares and destroy every cracked wall there.'],
  [299, 'chaos_control', 'Chaos Control', 'legendary', 'movement', 'Every 4 turns, instead of moving normally, teleport to any empty square within 5.'],
  [300, 'team_blast', 'Team Blast', 'legendary', 'offense', 'Once per battle, instead of moving, deal 1 damage to every adjacent enemy — 2 if two or more allies are also adjacent.'],
  [301, 'super_peel_out', 'Super Peel Out', 'uncommon', 'movement', 'Every 3 turns, a non-capturing slide of up to twice the normal range in one direction.'],
  // Emeralds
  [302, 'chaos_emeralds', 'Chaos Emeralds', 'mythical', 'legendary', '+1 maximum HP (up to 3), +1 sliding range and +1 damage. On Sonic, Shadow, Silver or Blaze: they transform into their Super form instead, and the Emeralds are used up (no slot).'],
  [303, 'master_emerald', 'Master Emerald', 'legendary', 'legendary', 'Every 3 turns, instead of moving, deal 1 damage to every adjacent enemy; cannot be forcibly moved. On Super Sonic: he becomes Hyper Sonic instead, using it up (no slot).'],
];

/** Upgrades that depend on systems the game doesn't have yet. Never offered. */
export const EXCLUDED: Record<string, string> = {
  free_rotation: 'Pieces have no facing.',
  anchor_feet: 'Objective squares arrive with Territory Control battles.',
  gap_sense: 'The board already shows every legal move and landing square.',
  terrain_adaptation: 'There is no movement-penalty terrain yet.',
  wall_breaker: 'Walls do not have hit points yet.',
  board_dominion: 'Objective squares arrive with Territory Control battles.',
};

export interface UpgradeInfo {
  num: number;
  id: string;
  name: string;
  rarity: UpgradeRarity;
  category: UpgradeCategory;
  text: string;
  /** Upgrade slots used (Legendary upgrades take two of a piece's three). */
  slots: number;
  /** Extra Army Points the carrying piece costs to deploy. */
  cost: number;
  excluded?: string;
  /** Content pack the upgrade belongs to (offered only when that pack is on). */
  pack?: string;
}

const COST: Record<UpgradeRarity, number> = { common: 0, uncommon: 1, rare: 1, epic: 2, legendary: 3, mythical: 4 };
/** Legendary and Mythical upgrades take two of a piece's three slots. */
const slotsFor = (r: UpgradeRarity) => (r === 'legendary' || r === 'mythical' ? 2 : 1);

export const UPGRADES: UpgradeInfo[] = (Object.entries(R) as [UpgradeCategory, Row[]][])
  .flatMap(([category, rows]): UpgradeInfo[] =>
    rows.map(([num, id, name, rarity, text]) => ({
      num,
      id,
      name,
      rarity,
      category,
      text,
      slots: slotsFor(rarity),
      cost: COST[rarity],
      excluded: EXCLUDED[id],
    })),
  )
  .concat(
    ZELDA_ROWS.map(([num, id, name, rarity, category, text]): UpgradeInfo => ({
      num,
      id,
      name,
      rarity,
      category,
      text,
      slots: slotsFor(rarity),
      cost: COST[rarity],
      pack: 'zelda',
    })),
    SONIC_ROWS.map(([num, id, name, rarity, category, text]): UpgradeInfo => ({
      num,
      id,
      name,
      rarity,
      category,
      text,
      slots: slotsFor(rarity),
      cost: COST[rarity],
      pack: 'sonic',
    })),
  )
  .sort((a, b) => a.num - b.num);

export const UPGRADE_BY_ID: Record<string, UpgradeInfo> = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

/** Slots every piece has for upgrades. */
export const UPGRADE_SLOTS = 3;
