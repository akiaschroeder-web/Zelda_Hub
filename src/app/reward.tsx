import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { PIECE_STATS } from '../engine/pieces';
import { claimReward, rerollReward } from '../run/run';
import { useRun } from '../run/RunContext';
import OptionCard from '../ui/OptionCard';
import UpgradeTargetPicker from '../ui/UpgradeTargetPicker';
import RunGuard from '../ui/RunGuard';
import { Button, Panel, text } from '../ui/common';
import { COLORS } from '../ui/theme';

export default function RewardScreen() {
  const { update } = useRun();
  const [choice, setChoice] = useState<number | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  return (
    <RunGuard phase="reward">
      {(run) => {
        const r = run.reward!;
        const lost = run.lastResult?.lost ?? [];
        const fromBattle = run.battle !== null;
        const chosen = choice !== null ? r.options[choice] : undefined;
        const needsTarget = chosen?.kind === 'upgrade';
        const ready = choice !== null && (!needsTarget || !!target);
        return (
          <ScrollView style={{ backgroundColor: COLORS.background }} contentContainerStyle={styles.screen}>
            <Text style={text.title}>{r.title}</Text>
            {fromBattle && lost.length > 0 && (
              <Text style={[text.body, { color: COLORS.danger, textAlign: 'center' }]}>
                Lost for good: {lost.map((p) => PIECE_STATS[p.type].name).join(', ')}
              </Text>
            )}
            {fromBattle && lost.length === 0 && <Text style={[text.dim, { textAlign: 'center' }]}>No pieces lost.</Text>}
            {fromBattle && (run.lastResult?.saved?.length ?? 0) > 0 && (
              <Text style={[text.body, { color: COLORS.gold, textAlign: 'center' }]}>
                Second Life saved: {run.lastResult!.saved!.map((p) => PIECE_STATS[p.type].name).join(', ')}
              </Text>
            )}
            {(r.gold > 0 || r.armyPoints > 0) && (
              <Panel>
                {r.gold > 0 && <Text style={styles.gain}>+{r.gold} gold</Text>}
                {r.armyPoints > 0 && <Text style={styles.gain}>+{r.armyPoints} Army Points</Text>}
              </Panel>
            )}
            {r.options.length > 0 && <Text style={text.heading}>CHOOSE ONE</Text>}
            <View style={{ gap: 8 }}>
              {r.options.map((o, i) => (
                <OptionCard
                  key={i}
                  option={o}
                  selected={choice === i}
                  onPress={() => {
                    setChoice(i);
                    setTarget(null);
                  }}
                />
              ))}
            </View>
            {chosen?.kind === 'upgrade' && (
              <UpgradeTargetPicker run={run} upgradeId={chosen.id} selected={target} onSelect={setTarget} />
            )}
            <View style={{ gap: 8, marginTop: 6 }}>
              {r.options.length > 0 && !r.rerolled && run.potions.includes('second_chances') && (
                <Button
                  label={`🎲 Second Chances: reroll (×${run.potions.filter((p) => p === 'second_chances').length})`}
                  onPress={() => {
                    setChoice(null);
                    setTarget(null);
                    update(rerollReward);
                  }}
                />
              )}
              {r.options.length > 0 && (
                <Button
                  label={choice === null ? 'Choose a reward' : needsTarget && !target ? 'Choose a piece' : 'Take it'}
                  primary
                  disabled={!ready}
                  onPress={() => update((s) => claimReward(s, choice, target ?? undefined))}
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
