import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { PIECE_STATS } from '../engine/pieces';
import { PieceType } from '../engine/types';
import { upgradeCost } from '../engine/upgrades/eligibility';
import { PIECE_IMAGES } from './pieceImages';
import { COLORS } from './theme';

/** Sort order for showing a roster: King first, then by value. */
export const byRank = (a: { type: PieceType }, b: { type: PieceType }) =>
  a.type === 'king' ? -1 : b.type === 'king' ? 1 : PIECE_STATS[b.type].value - PIECE_STATS[a.type].value;

interface Props {
  piece: { type: PieceType; battles?: number; upgrades?: string[] };
  side?: 'player' | 'enemy';
  faded?: boolean;
  selected?: boolean;
  onPress?: () => void;
}

/** A small card showing a piece's art, name, cost and battles survived. */
export default function PieceTile({ piece, side = 'player', faded, selected, onPress }: Props) {
  const stats = PIECE_STATS[piece.type];
  const body = (
    <View style={[styles.tile, faded && { opacity: 0.4 }, selected && styles.selected]}>
      <Image source={PIECE_IMAGES[side][piece.type]} style={styles.img} resizeMode="contain" />
      <Text style={styles.name} numberOfLines={1}>
        {stats.name}
      </Text>
      <Text style={styles.meta}>
        {piece.type === 'king' && !piece.upgrades?.length ? '—' : `${stats.cost + upgradeCost(piece.upgrades ?? [])} pt`}
        {piece.battles ? ` · ${'★'.repeat(Math.min(piece.battles, 3))}` : ''}
      </Text>
      {piece.upgrades && piece.upgrades.length > 0 && <Text style={styles.ups}>{'✦'.repeat(piece.upgrades.length)}</Text>}
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}

const styles = StyleSheet.create({
  tile: {
    width: 68,
    alignItems: 'center',
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#2c241e',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selected: { borderColor: COLORS.gold, backgroundColor: '#3a3024' },
  img: { width: 44, height: 44 },
  name: { color: COLORS.text, fontSize: 10, fontWeight: '600', marginTop: 2 },
  meta: { color: COLORS.gold, fontSize: 10 },
  ups: { color: '#c99bf0', fontSize: 10, marginTop: 1 },
});
