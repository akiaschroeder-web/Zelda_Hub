import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { PIECE_STATS } from '../engine/pieces';
import { claimReward } from '../run/run';
import { useRun } from '../run/RunContext';
import OptionCard from '../ui/OptionCard';
import RunGuard from '../ui/RunGuard';
import { Button, Panel, text } from '../ui/common';
import { COLORS } from '../ui/theme';

export default function RewardScreen() {
  const { update } = useRun();
  const [choice, setChoice] = useState<number | null>(null);
  return (
    <RunGuard phase="reward">
      {(run) => {
        const r = run.reward!;
        const lost = run.lastResult?.lost ?? [];
        const fromBattle = run.battle !== null;
        return (
          <ScrollView style={{ backgroundColor: COLORS.background }} contentContainerStyle={styles.screen}>
            <Text style={text.title}>{r.title}</Text>
            {fromBattle && lost.length > 0 && (
              <Text style={[text.body, { color: COLORS.danger, textAlign: 'center' }]}>
                Lost for good: {lost.map((p) => PIECE_STATS[p.type].name).join(', ')}
              </Text>
            )}
            {fromBattle && lost.length === 0 && <Text style={[text.dim, { textAlign: 'center' }]}>No pieces lost.</Text>}
            {(r.gold > 0 || r.armyPoints > 0) && (
              <Panel>
                {r.gold > 0 && <Text style={styles.gain}>+{r.gold} gold</Text>}
                {r.armyPoints > 0 && <Text style={styles.gain}>+{r.armyPoints} Army Points</Text>}
              </Panel>
            )}
            {r.options.length > 0 && <Text style={text.heading}>CHOOSE ONE</Text>}
            <View style={{ gap: 8 }}>
              {r.options.map((o, i) => (
                <OptionCard key={i} option={o} selected={choice === i} onPress={() => setChoice(i)} />
              ))}
            </View>
            <View style={{ gap: 8, marginTop: 6 }}>
              {r.options.length > 0 && (
                <Button
                  label={choice === null ? 'Choose a reward' : 'Take it'}
                  primary
                  disabled={choice === null}
                  onPress={() => update((s) => claimReward(s, choice))}
                />
              )}
              <Button
                label={r.options.length > 0 ? 'Skip' : 'Continue'}
                primary={r.options.length === 0}
                onPress={() => update((s) => claimReward(s, null))}
              />
            </View>
          </ScrollView>
        );
      }}
    </RunGuard>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 12, maxWidth: 560, width: '100%', alignSelf: 'center' },
  gain: { color: COLORS.gold, fontSize: 16, fontWeight: '700' },
});
