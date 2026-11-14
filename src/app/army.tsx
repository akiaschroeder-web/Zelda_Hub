import { Redirect, router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRun } from '../run/RunContext';
import PieceTile, { byRank } from '../ui/PieceTile';
import { Button, Panel, text } from '../ui/common';
import { COLORS } from '../ui/theme';

/** Your roster and the fallen. Reached from the map; read-only. */
export default function Army() {
  const { loaded, run } = useRun();
  if (!loaded) return null;
  if (!run) return <Redirect href="/" />;
  const roster = [...run.roster].sort(byRank);

  return (
    <ScrollView style={{ backgroundColor: COLORS.background }} contentContainerStyle={styles.screen}>
      <Text style={text.title}>Your Army</Text>
      <Text style={[text.dim, { textAlign: 'center' }]}>
        💰 {run.gold} gold · ⚑ {run.armyPoints} Army Points per battle
      </Text>
      <Panel>
        <Text style={text.heading}>ROSTER · {run.roster.length} PIECES</Text>
        <View style={styles.grid}>
          {roster.map((p) => (
            <PieceTile key={p.uid} piece={p} />
          ))}
        </View>
        <Text style={[text.dim, { marginTop: 8 }]}>★ = battles survived.</Text>
      </Panel>
      {run.fallen.length > 0 && (
        <Panel>
          <Text style={text.heading}>FALLEN · {run.fallen.length}</Text>
          <View style={styles.grid}>
            {run.fallen.map((p) => (
              <PieceTile key={p.uid} piece={p} faded />
            ))}
          </View>
        </Panel>
      )}
      <Button label="‹ Back" primary onPress={() => router.back()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 14, maxWidth: 600, width: '100%', alignSelf: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
});
