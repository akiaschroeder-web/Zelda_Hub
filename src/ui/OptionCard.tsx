import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { PIECE_STATS } from '../engine/pieces';
import { CATEGORY_NAMES, UPGRADE_BY_ID } from '../engine/upgrades/catalog';
import { RARITY_COLORS, RewardOption, describeOption, rarityOf } from '../run/rewards';
import { PIECE_IMAGES } from './pieceImages';
import { COLORS } from './theme';

/** Colours for upgrade rarities (piece rarities plus Legendary). */
export const UPGRADE_RARITY_COLORS = { ...RARITY_COLORS, legendary: '#f0a030' };

interface Props {
  option: RewardOption;
  selected?: boolean;
  disabled?: boolean;
  /** Extra line, e.g. a price. */
  footer?: string;
  onPress?: () => void;
}

/** A reward, shop item or recruit choice: art, name, rarity and rules text. */
export default function OptionCard({ option, selected, disabled, footer, onPress }: Props) {
  const piece = option.kind === 'piece' ? option.type : null;
  const rarity = piece ? rarityOf(piece) : null;
  const upgrade = option.kind === 'upgrade' ? UPGRADE_BY_ID[option.id] : null;
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={[styles.card, selected && styles.selected, disabled && { opacity: 0.45 }]}
    >
      <View style={styles.art}>
        {piece ? (
          <Image source={PIECE_IMAGES.player[piece]} style={styles.img} resizeMode="contain" />
        ) : (
          <Text style={[styles.bigIcon, upgrade && { color: UPGRADE_RARITY_COLORS[upgrade.rarity] }]}>
            {option.kind === 'armyPoints' ? '⚑' : upgrade ? '✦' : '💰'}
          </Text>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{describeOption(option)}</Text>
        {piece && rarity && (
          <Text style={[styles.rarity, { color: RARITY_COLORS[rarity] }]}>
            {rarity.toUpperCase()} · {PIECE_STATS[piece].cost} pt · {PIECE_STATS[piece].maxHp} HP
          </Text>
        )}
        {upgrade && (
          <Text style={[styles.rarity, { color: UPGRADE_RARITY_COLORS[upgrade.rarity] }]}>
            {upgrade.rarity.toUpperCase()} UPGRADE · {CATEGORY_NAMES[upgrade.category]} · +{upgrade.cost} pt
            {upgrade.slots > 1 ? ' · 2 slots' : ''}
          </Text>
        )}
        <Text style={styles.blurb}>
          {piece
            ? PIECE_STATS[piece].blurb
            : upgrade
              ? upgrade.text
              : option.kind === 'armyPoints'
                ? 'Field a bigger army in every battle.'
                : ''}
        </Text>
        {footer ? <Text style={styles.footer}>{footer}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.panelBorder,
    backgroundColor: COLORS.panel,
    alignItems: 'center',
  },
  selected: { borderColor: COLORS.gold, backgroundColor: '#3a3024' },
  art: { width: 60, height: 60, alignItems: 'center', justifyContent: 'center' },
  img: { width: 60, height: 60 },
  bigIcon: { fontSize: 34, color: COLORS.gold },
  name: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  rarity: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginTop: 1 },
  blurb: { color: COLORS.textDim, fontSize: 12, marginTop: 3 },
  footer: { color: COLORS.gold, fontSize: 13, fontWeight: '700', marginTop: 4 },
});
