import { hasDiagonal, hasFiniteRange, hasOrthogonal, isLeaper, isSlider } from '../movement';
import { PIECE_STATS } from '../pieces';
import { PieceType } from '../types';
import { UPGRADE_BY_ID, UPGRADE_SLOTS } from './catalog';

const SUMMONERS = ['pawn_summon', 'double_pawn_summon', 'decoy', 'mirror_image', 'temporary_knight', 'pawn_swarm', 'army_of_one', 'perfect_clone'];
const HEALERS = ['field_medic', 'group_healing', 'life_transfer', 'emergency_treatment', 'healing_aura', 'wide_healing', 'miracle_recovery'];
const KING_TARGETING = ['royal_guard', 'royal_escort', 'royal_protection'];
/** Upgrades that make sense on the King itself. */
const KING_ALLOWED = new Set(['royal_resilience', 'royal_resurrection']);

/** Upgrades that need a finite movement range to do anything. */
const FINITE = ['extended_stride', 'quick_march', 'momentum', 'long_retreat', 'cliff_runner', 'edge_walker'];
/** Upgrades that need the piece to make moving attacks (bounceback). */
const BOUNCERS = [
  'reduced_recoil',
  'full_retreat',
  'rebound_shield',
  'rebound_strike',
  'controlled_bounce',
  'counterweight',
  'spring_loaded',
  'rebound_capture',
  'ricochet',
  'recoil_conversion',
  'unyielding_assault',
];
/** Upgrades that only make sense on a 1x1 piece. */
const SMALL_ONLY = [
  'diagonal_step',
  'orthogonal_step',
  'side_step',
  'retreat',
  'corner_turn',
  'diagonal_pivot',
  'knights_training',
  'short_hop',
  'flanking_step',
  'zigzag',
  'royal_pace',
  'crossing_step',
  'gap_jumper',
  'long_gap_jump',
  'void_step',
  'master_of_the_void',
  'phasing',
  'extended_phasing',
  'wall_climber',
  'battering_ram',
  'wall_swap',
  'rescue',
  'mirror_image',
  'army_of_one',
  'perfect_clone',
  'royal_swap',
  'dimensional_shift',
  'ricochet',
  'hookshot',
  'longshot',
  'farores_wind',
  'song_of_time',
  'hover_boots',
];

/** Why an upgrade can't go on a piece, or null if it can. */
export function ineligibleReason(id: string, type: PieceType, current: string[]): string | null {
  const u = UPGRADE_BY_ID[id];
  if (!u) return 'Unknown upgrade.';
  if (u.excluded) return u.excluded;
  if (current.includes(id)) return 'Already has it.';
  const used = current.reduce((n, c) => n + (UPGRADE_BY_ID[c]?.slots ?? 1), 0);
  if (used + u.slots > UPGRADE_SLOTS) return 'Not enough upgrade slots.';
  if (type === 'decoy') return 'Summons cannot be upgraded.';
  const size = PIECE_STATS[type].size;

  if (type === 'king') {
    return u.category === 'defense' || KING_ALLOWED.has(id) ? null : 'The King can only take defensive upgrades.';
  }
  if (u.category === 'heavy' && size === 1) return 'Only for multi-square pieces.';
  if (size > 1 && SMALL_ONLY.includes(id)) return 'Only for 1×1 pieces.';
  if (FINITE.includes(id) && (!hasFiniteRange(type) || type === 'pawn')) return 'Needs a limited movement range.';
  if (BOUNCERS.includes(id) && type === 'archer') return 'The Archer never bounces.';

  switch (id) {
    case 'diagonal_step':
      return hasDiagonal(type) ? 'Already moves diagonally.' : null;
    case 'orthogonal_step':
      return hasOrthogonal(type) ? 'Already moves orthogonally.' : null;
    case 'long_leap':
      return ['knight', 'lancer', 'chancellor'].includes(type) ? null : 'Needs a leaping move.';
    case 'backward_advance':
      return type === 'pawn' ? null : 'Only for Pawns.';
    case 'knights_training':
      return type === 'knight' || type === 'chancellor' ? 'Already jumps like a Knight.' : null;
    case 'corner_turn':
      return isSlider(type) ? null : 'Needs a long sliding move.';
    case 'diagonal_pivot':
      return type === 'bishop' || type === 'queen' ? null : 'Needs a long diagonal slide.';
    case 'hookshot':
    case 'longshot':
      return current.includes(id === 'hookshot' ? 'longshot' : 'hookshot') ? 'Already has a hook.' : null;
    case 'kokiri_sword':
      return type === 'archer' ? 'The Archer never moves to capture.' : null;
    case 'hover_boots':
    case 'gap_jumper':
    case 'long_gap_jump':
    case 'master_of_the_void':
      return isLeaper(type) && !isSlider(type) ? 'Leapers already cross gaps.' : null;
    case 'extended_healing':
    case 'medics_reward':
    case 'royal_physician':
      return type === 'medic' || current.some((c) => HEALERS.includes(c)) ? null : 'Needs a healing ability.';
    case 'extended_bind':
    case 'chain_bind':
      return current.includes('bind') ? null : 'Needs Bind.';
    case 'explosive_decoy':
    case 'copy_movement':
      return current.includes('decoy') ? null : 'Needs Decoy.';
    case 'summoners_range':
    case 'summon_shield':
    case 'summon_extension':
    case 'sacrificial_summon':
    case 'summon_swap':
    case 'summon_recall':
    case 'summoned_guard':
    case 'echo_summon':
    case 'summoners_reward':
    case 'summon_conversion':
    case 'lasting_reinforcements':
      return current.some((c) => SUMMONERS.includes(c)) ? null : 'Needs a summoning upgrade.';
    case 'crowns_reach':
      return current.some((c) => KING_TARGETING.includes(c)) ? null : 'Needs an ability that targets the King.';
    case 'platform_extension':
      return current.some((c) => ['bridge_builder', 'temporary_platform', 'kings_path'].includes(c)) ? null : 'Needs a bridge ability.';
    case 'chain_demolition':
    case 'siege_charge':
      return type === 'siege' ||
        current.some((c) => ['demolition', 'siege_strike', 'battering_ram', 'explosive_breach', 'siege_master', 'wall_swap'].includes(c))
        ? null
        : 'Needs a demolition ability.';
    case 'perfect_clone':
    case 'mirror_image':
    case 'army_of_one':
    case 'final_gambit':
      return null;
  }
  if (PIECE_STATS[type].damage === 0 && u.category === 'offense') return 'This piece cannot attack.';
  return null;
}

export const canTake = (id: string, type: PieceType, current: string[]) => ineligibleReason(id, type, current) === null;

/** Extra Army Points a piece costs because of its upgrades. */
export const upgradeCost = (upgrades: string[]) => upgrades.reduce((n, id) => n + (UPGRADE_BY_ID[id]?.cost ?? 0), 0);
