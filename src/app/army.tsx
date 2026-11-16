import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { PIECE_STATS } from '../engine/pieces';
import { UPGRADE_BY_ID, UPGRADE_SLOTS } from '../engine/upgrades/catalog';
import { ELIXIR_BY_ID, POTION_BY_ID } from '../run/potions';
import { equipFromStash } from '../run/forge';
import { bountyPayText } from '../run/bounty';
import UpgradeTargetPicker from '../ui/UpgradeTargetPicker';
import { costOf, livingFortressBonus } from '../run/run';
import { UPGRADE_RARITY_COLORS } from '../ui/OptionCard';
import { useRun } from '../run/RunContext';
import PieceTile, { byRank } from '../ui/PieceTile';
import { Button, Panel, text } from '../ui/common';
import { COLORS } from '../ui/theme';

/** Your roster and the fallen. Reached from the map; read-only. */
export default function Army() {
  const { loaded, run, update } = useRun();
  const [picked, setPicked] = useState<string | null>(null);
  const [stashIndex, setStashIndex] = useState<number | null>(null);
  const [stashTarget, setStashTarget] = useState<string | null>(null);
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
      {run.bounty && (
        <Panel>
          <Text style={text.heading}>🎯 BOUNTY</Text>
          <Text style={[text.body, { marginTop: 4 }]}>
            Wanted: {PIECE_STATS[run.bounty.target].name} — {bountyPayText(run.bounty, (id) => UPGRADE_BY_ID[id]?.name ?? id)}
          </Text>
        </Panel>
      )}
      {(run.potions.length > 0 || run.elixirs.length > 0 || run.stash.length > 0) && (
        <Panel>
          <Text style={text.heading}>INVENTORY</Text>
          {[...new Set(run.potions)].map((id) => (
            <Text key={id} style={[text.body, { marginTop: 6 }]}>
              {POTION_BY_ID[id].icon} {POTION_BY_ID[id].name} ×{run.potions.filter((p) => p === id).length}{' '}
              <Text style={text.dim}>— {POTION_BY_ID[id].text}</Text>
            </Text>
          ))}
          {run.elixirs.map((id) => (
            <Text key={id} style={[text.body, { marginTop: 6, color: COLORS.gold }]}>
              {ELIXIR_BY_ID[id].icon} {ELIXIR_BY_ID[id].name} <Text style={text.dim}>— {ELIXIR_BY_ID[id].text}</Text>
            </Text>
          ))}
          {run.stash.length > 0 && <Text style={[text.dim, { marginTop: 8 }]}>UPGRADE STASH — tap one to put it on a piece:</Text>}
          {run.stash.map((u, i) => (
            <Text
              key={i}
              onPress={() => {
                setStashIndex(stashIndex === i ? null : i);
                setStashTarget(null);
              }}
              style={[text.body, { marginTop: 4, color: UPGRADE_RARITY_COLORS[UPGRADE_BY_ID[u].rarity], fontWeight: stashIndex === i ? '800' : '600' }]}
            >
              {stashIndex === i ? '▸ ' : ''}✦ {UPGRADE_BY_ID[u].name} <Text style={text.dim}>— {UPGRADE_BY_ID[u].text}</Text>
            </Text>
          ))}
          {stashIndex !== null && run.stash[stashIndex] && run.status === 'active' && (
            <View style={{ marginTop: 10, gap: 8 }}>
              <UpgradeTargetPicker run={run} upgradeId={run.stash[stashIndex]} selected={stashTarget} onSelect={setStashTarget} />
              <Button
                label={stashTarget ? 'Equip' : 'Choose a piece'}
                primary
                disabled={!stashTarget}
                onPress={() => {
                  update((r) => equipFromStash(r, stashIndex, stashTarget!));
                  setStashIndex(null);
                  setStashTarget(null);
                }}
              />
            </View>
          )}
        </Panel>
      )}
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
