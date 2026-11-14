import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { chooseEventOption, currentEvent, leaveEvent } from '../run/run';
import { useRun } from '../run/RunContext';
import RunGuard from '../ui/RunGuard';
import { Button, Panel, text } from '../ui/common';
import { COLORS } from '../ui/theme';

export default function EventScreen() {
  const { update } = useRun();
  return (
    <RunGuard phase="event">
      {(run) => {
        const ev = currentEvent(run)!;
        const outcome = run.event?.outcome;
        return (
          <ScrollView style={{ backgroundColor: COLORS.background }} contentContainerStyle={styles.screen}>
            <Text style={styles.icon}>❓</Text>
            <Text style={text.title}>{ev.title}</Text>
            <Text style={[text.body, { textAlign: 'center' }]}>{ev.text}</Text>
            <Text style={styles.stats}>
              💰 {run.gold} · ⚑ {run.armyPoints} AP · ♟ {run.roster.length} pieces
            </Text>
            {outcome ? (
              <>
                <Panel>
                  <Text style={text.body}>{outcome}</Text>
                </Panel>
                <Button label="Continue" primary onPress={() => update(leaveEvent)} />
              </>
            ) : (
              <View style={{ gap: 10 }}>
                {ev.choices.map((c, i) => {
                  const ok = !c.available || c.available(run);
                  return (
                    <View key={i} style={{ gap: 2 }}>
                      <Button label={c.label} disabled={!ok} onPress={() => update((r) => chooseEventOption(r, i))} />
                      <Text style={[text.dim, { textAlign: 'center' }]}>{ok ? c.detail : `${c.detail} (not available)`}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>
        );
      }}
    </RunGuard>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 20, gap: 14, maxWidth: 560, width: '100%', alignSelf: 'center' },
  icon: { fontSize: 44, textAlign: 'center' },
  stats: { color: COLORS.gold, textAlign: 'center', fontWeight: '700' },
});
