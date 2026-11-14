import { PieceType } from '../engine/types';

/**
 * PLACEHOLDER run settings. Swap these for the real starting setup when it's
 * designed; nothing else in the code hard-codes these numbers.
 */
export const RUN_CONFIG = {
  /** Army Points available for deployment in each battle. */
  armyPoints: 24,
  /** Gold at the start of a run. */
  startingGold: 40,
  /** The roster a new run starts with. The King is always included and costs 0. */
  startingRoster: [
    'king',
    'queen',
    'rook',
    'rook',
    'bishop',
    'bishop',
    'knight',
    'knight',
    'pawn',
    'pawn',
    'pawn',
    'pawn',
    'pawn',
    'pawn',
    'pawn',
    'pawn',
  ] as PieceType[],
  /** Promoted Pawns keep their new type for the rest of the run. */
  promotionsArePermanent: true,
  /** Damaged multi-HP pieces return to full HP after each battle. */
  healBetweenBattles: true,
};
