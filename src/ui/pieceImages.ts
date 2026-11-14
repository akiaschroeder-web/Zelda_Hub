import { ImageSourcePropType } from 'react-native';
import { PieceType, Side } from '../engine/types';

// Metro needs static require() calls, so every sprite is listed explicitly.
export const PIECE_IMAGES: Record<Side, Record<PieceType, ImageSourcePropType>> = {
  player: {
    pawn: require('../../assets/pieces/pawn_player.png'),
    knight: require('../../assets/pieces/knight_player.png'),
    bishop: require('../../assets/pieces/bishop_player.png'),
    rook: require('../../assets/pieces/rook_player.png'),
    queen: require('../../assets/pieces/queen_player.png'),
    king: require('../../assets/pieces/king_player.png'),
    juggernaut: require('../../assets/pieces/juggernaut_player.png'),
    archer: require('../../assets/pieces/archer_player.png'),
    guardian: require('../../assets/pieces/guardian_player.png'),
    lancer: require('../../assets/pieces/lancer_player.png'),
    siege: require('../../assets/pieces/siege_engine_player.png'),
    mage: require('../../assets/pieces/mage_player.png'),
    switcher: require('../../assets/pieces/switcher_player.png'),
    chancellor: require('../../assets/pieces/chancellor_player.png'),
    medic: require('../../assets/pieces/medic_player.png'),
    decoy: require('../../assets/pieces/illusionist_player.png'),
  },
  enemy: {
    pawn: require('../../assets/pieces/pawn_enemy.png'),
    knight: require('../../assets/pieces/knight_enemy.png'),
    bishop: require('../../assets/pieces/bishop_enemy.png'),
    rook: require('../../assets/pieces/rook_enemy.png'),
    queen: require('../../assets/pieces/queen_enemy.png'),
    king: require('../../assets/pieces/king_enemy.png'),
    juggernaut: require('../../assets/pieces/juggernaut_enemy.png'),
    archer: require('../../assets/pieces/archer_enemy.png'),
    guardian: require('../../assets/pieces/guardian_enemy.png'),
    lancer: require('../../assets/pieces/lancer_enemy.png'),
    siege: require('../../assets/pieces/siege_engine_enemy.png'),
    mage: require('../../assets/pieces/mage_enemy.png'),
    switcher: require('../../assets/pieces/switcher_enemy.png'),
    chancellor: require('../../assets/pieces/chancellor_enemy.png'),
    medic: require('../../assets/pieces/medic_enemy.png'),
    decoy: require('../../assets/pieces/illusionist_enemy.png'),
  },
};
