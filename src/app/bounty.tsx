import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PIECE_STATS } from '../engine/pieces';
import { UPGRADE_BY_ID } from '../engine/upgrades/catalog';
import { Bounty, bountyPayText, leaveBountyBoard, pickBounty } from '../run/bounty';
import { rarityOf } from '../run/rewards';
import { useRun } from '../run/RunContext';
import PieceTile from '../ui/PieceTile';
import RunGuard from '../ui/RunGuard';
import { Button, Panel, text } from '../ui/common';
import { COLORS } from '../ui/theme';

const upgradeName = (id: string) => `✦ ${UPGRADE_BY_ID[id]?.name ?? id}`;

/** Bounty Board: pick one wanted enemy piece to hunt. */
export default function BountyScreen() {
  const { update } = useRun();
  return (
    <RunGuard phase="bounty">
      {(run) => (
        <ScrollView style={{ backgroundColor: COLORS.background }} contentContainerStyle={styles.screen}>
          <Text style={text.title}>🎯 Bounty Board</Text>
          <Text style={[text.dim, { textAlign: 'center' }]}>
            Choose a wanted piece. The next time you capture one in a battle you win, you collect the reward. Wanted pieces turn up in
            enemy armies more often while you hunt them.
          </Text>
          {run.bounty && (
            <Panel>
              <Text style={text.body}>
                Current bounty: <Text style={{ color: COLORS.gold }}>{PIECE_STATS[run.bounty.target].name}</Text> —{' '}
                {bountyPayText(run.bounty, upgradeName)}
              </Text>
              <Text style={[text.dim, { marginTop: 4 }]}>Taking a new bounty replaces it.</Text>
            </Panel>
          )}
          <View style={{ gap: 8 }}>
            {run.bountyBoard!.map((b, i) => (
              <BountyCard key={i} bounty={b} onPress={() => update((r) => pickBounty(r, i))} />
            ))}
          </View>
          <Button label={run.bounty ? 'Keep my current bounty' : 'Leave'} onPress={() => update(leaveBountyBoard)} />
        </ScrollView>
      )}
    </RunGuard>
  );
}

function BountyCard({ bounty: b, onPress }: { bounty: Bounty; onPress: () => void }) {
  const stats = PIECE_STATS[b.target];
  const rarity = rarityOf(b.target);
  return (
    <Pressable onPress={onPress} style={styles.card}>
      <PieceTile piece={{ type: b.target }} side="enemy" />
      <View style={{ flex: 1 }}>
        <Text style={styles.wanted}>WANTED · {rarity.toUpperCase()}</Text>
        <Text style={styles.name}>{stats.name}</Text>
        <Text style={text.dim} numberOfLines={3}>
          {stats.blurb}
        </Text>
        <Text style={styles.reward}>Reward: {bountyPayText(b, upgradeName)}</Text>
        {b.upgrade && <Text style={text.dim}>{UPGRADE_BY_ID[b.upgrade]?.text}</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 12, maxWidth: 560, width: '100%', alignSelf: 'center' },
  card: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.panelBorder,
  },
  wanted: { color: COLORS.danger, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  name: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  reward: { color: COLORS.gold, fontSize: 14, fontWeight: '700', marginTop: 4 },
});
