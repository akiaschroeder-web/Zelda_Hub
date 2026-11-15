import { router } from 'expo-router';
import { Image, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { PACKS } from '../content/packs';
import { BOSS_TYPES, PIECE_STATS } from '../engine/pieces';
import { useRun } from '../run/RunContext';
import { UPGRADES } from '../engine/upgrades/catalog';
import { Button, text } from '../ui/common';
import { PIECE_IMAGES } from '../ui/pieceImages';
import { COLORS } from '../ui/theme';

/** Switch content packs on or off for new runs. */
export default function Packs() {
  const { packs, setPackEnabled, run } = useRun();
  const runActive = run?.status === 'active';
  return (
    <ScrollView style={{ backgroundColor: COLORS.background }} contentContainerStyle={styles.screen}>
      <Text style={text.title}>Content Packs</Text>
      <Text style={[text.dim, styles.note]}>
        Packs that are on add their pieces to rewards, shops, enemy armies and boss fights in new runs.
        {runActive ? ' Your current run keeps the packs it started with.' : ''}
      </Text>

      {PACKS.map((pack) => {
        const on = packs.includes(pack.id);
        return (
          <View key={pack.id} style={[styles.card, on && styles.cardOn]}>
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.packName}>{pack.name}</Text>
                <Text style={styles.packDesc}>{pack.description}</Text>
              </View>
              <Switch
                value={on}
                onValueChange={(v) => setPackEnabled(pack.id, v)}
                trackColor={{ true: COLORS.gold, false: COLORS.panelBorder }}
                accessibilityLabel={`${pack.name} ${on ? 'on' : 'off'}`}
              />
            </View>
            <Text style={styles.section}>Pieces</Text>
            {pack.pieces
              .filter((t) => t !== 'ganon')
              .map((t) => (
                <View key={t} style={styles.pieceRow}>
                  <Image source={PIECE_IMAGES.player[t]} style={styles.pieceImg} resizeMode="contain" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pieceName}>
                      {PIECE_STATS[t].name}
                      <Text style={styles.pieceMeta}>
                        {'  '}
                        {PIECE_STATS[t].maxHp} HP{BOSS_TYPES.has(t) ? ' · Boss' : ` · ${PIECE_STATS[t].cost} AP`}
                      </Text>
                    </Text>
                    <Text style={styles.pieceBlurb}>{PIECE_STATS[t].blurb}</Text>
                  </View>
                </View>
              ))}
            {UPGRADES.some((u) => u.pack === pack.id) && <Text style={styles.section}>Upgrades</Text>}
            {UPGRADES.filter((u) => u.pack === pack.id).map((u) => (
              <View key={u.id}>
                <Text style={styles.pieceName}>
                  {u.name}
                  <Text style={[styles.pieceMeta, { color: RARITY_COLORS[u.rarity] }]}>{'  '}{u.rarity}</Text>
                </Text>
                <Text style={styles.pieceBlurb}>{u.text}</Text>
              </View>
            ))}
          </View>
        );
      })}

      <Button label="‹ Back" primary onPress={() => router.back()} />
    </ScrollView>
  );
}

const RARITY_COLORS: Record<string, string> = {
  common: '#b9b2a6',
  uncommon: '#6fbf73',
  rare: '#5aa0e6',
  epic: '#b57ae0',
  legendary: '#f0c040',
};

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 14, alignItems: 'stretch', maxWidth: 560, width: '100%', alignSelf: 'center' },
  note: { textAlign: 'center' },
  card: { backgroundColor: COLORS.panel, borderRadius: 10, borderWidth: 1, borderColor: COLORS.panelBorder, padding: 12, gap: 10 },
  cardOn: { borderColor: COLORS.gold },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  packName: { color: COLORS.gold, fontSize: 18, fontWeight: '700' },
  packDesc: { color: COLORS.text, fontSize: 13, marginTop: 2 },
  pieceRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  pieceImg: { width: 44, height: 44 },
  pieceName: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  pieceMeta: { color: COLORS.textDim, fontSize: 12, fontWeight: '400' },
  pieceBlurb: { color: COLORS.textDim, fontSize: 12 },
  section: { color: COLORS.gold, fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 4 },
});
