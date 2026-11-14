import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { PIECE_STATS } from '../engine/pieces';
import { UPGRADE_BY_ID, UPGRADE_SLOTS } from '../engine/upgrades/catalog';
import { costOf, livingFortressBonus } from '../run/run';
import { UPGRADE_RARITY_COLORS } from '../ui/OptionCard';
import { useRun } from '../run/RunContext';
import PieceTile, { byRank } from '../ui/PieceTile';
import { Button, Panel, text } from '../ui/common';
import { COLORS } from '../ui/theme';

/** Your roster and the fallen. Reached from the map; read-only. */
export default function Army() {
  const { loaded, run } = useRun();
  const [picked, setPicked] = useState<string | null>(null);
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
            <PieceTile key={p.uid} piece={p} selected={picked === p.uid} onPress={() => setPicked(picked === p.uid ? null : p.uid)} />
          ))}
        </View>
        <Text style={[text.dim, { marginTop: 8 }]}>★ = battles survived · ✦ = upgrades. Tap a piece for details.</Text>
      </Panel>
      {(() => {
        const p = run.roster.find((r) => r.uid === picked);
        if (!p) return null;
        const slots = p.upgrades.reduce((n, u) => n + (UPGRADE_BY_ID[u]?.slots ?? 1), 0);
        return (
          <Panel>
            <Text style={text.heading}>{PIECE_STATS[p.type].name.toUpperCase()}</Text>
            <Text style={[text.body, { marginTop: 4 }]}>{PIECE_STATS[p.type].blurb}</Text>
            <Text style={[text.dim, { marginTop: 4 }]}>
              Deploy cost {costOf(p)} pt · {p.battles} battle{p.battles === 1 ? '' : 's'} survived · upgrade slots {slots}/{UPGRADE_SLOTS}
              {livingFortressBonus(p) ? ` · +${livingFortressBonus(p)} max HP (Living Fortress)` : ''}
            </Text>
            {p.upgrades.map((u) => {
              const info = UPGRADE_BY_ID[u];
              return (
                <View key={u} style={{ marginTop: 8 }}>
                  <Text style={{ color: UPGRADE_RARITY_COLORS[info.rarity], fontWeight: '700' }}>
                    ✦ {info.name} <Text style={text.dim}>({info.rarity}, +{info.cost} pt)</Text>
                  </Text>
                  <Text style={text.dim}>{info.text}</Text>
                </View>
              );
            })}
            {p.upgrades.length === 0 && <Text style={[text.dim, { marginTop: 6 }]}>No upgrades yet.</Text>}
          </Panel>
        );
      })()}
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
