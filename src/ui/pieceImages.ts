import { ImageSourcePropType } from 'react-native';
import { PieceType, Side } from '../engine/types';

export const PIECE_IMAGES: Record<Side, Record<PieceType, ImageSourcePropType>> = {
  player: {
    pawn: require('../../assets/pieces/pawn_player.png'),
    knight: require('../../assets/pieces/knight_player.png'),
    bishop: require('../../assets/pieces/bishop_player.png'),
    rook: require('../../assets/pieces/rook_player.png'),
    queen: require('../../assets/pieces/queen_player.png'),
    king: require('../../assets/pieces/king_player.png'),
  },
  enemy: {
    pawn: require('../../assets/pieces/pawn_enemy.png'),
    knight: require('../../assets/pieces/knight_enemy.png'),
    bishop: require('../../assets/pieces/bishop_enemy.png'),
    rook: require('../../assets/pieces/rook_enemy.png'),
    queen: require('../../assets/pieces/queen_enemy.png'),
    king: require('../../assets/pieces/king_enemy.png'),
  },
};
