import { Redirect, router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { parsePlacements } from '../engine/setup';
import { PIECE_STATS } from '../engine/pieces';
import { RUN_BATTLES } from '../run/battles';
import { RosterPiece, currentBattle, isDefeat, isVictory } from '../run/run';
import { useRun } from '../run/RunContext';
import { resultText } from '../ui/BattleView';
import { Button, Panel, text } from '../ui/common';
import PieceTile, { byRank } from '../ui/PieceTile';
import { COLORS } from '../ui/theme';

export default function Army() {
  const { loaded, run, abandonRun } = useRun();
  if (!loaded) return null;
  if (!run) return <Redirect href="/" />;
  if (run.activeBattle) return <Redirect href="/battle" />;

  const battle = currentBattle(run);
  const roster = [...run.roster].sort(byRank);
  const last = run.lastResult;
  const finished = run.status !== 'active';

  const endRun = () => {
    abandonRun();
    router.replace('/');
  };

  return (
    <ScrollView style={{ backgroundColor: COLORS.background }} contentContainerStyle={styles.screen}>
      {run.status === 'won' && <Text style={[text.title, { color: COLORS.gold }]}>Run complete — victory!</Text>}
      {run.status === 'lost' && <Text style={[text.title, { color: COLORS.danger }]}>Your King has fallen</Text>}
      {!finished && (
        <Text style={text.title}>
          Battle {run.battleIndex + 1} of {RUN_BATTLES.length}
        </Text>
      )}

      {last && (
        <Panel>
          <Text style={text.heading}>{last.battle.toUpperCase()}</Text>
          <Text
            style={[
              text.body,
              { marginTop: 4, color: isVictory(last.result) ? COLORS.gold : isDefeat(last.result) ? COLORS.danger : COLORS.text },
            ]}
          >
            {resultText(last.result)}
          </Text>
          <Text style={[text.dim, { marginTop: 4 }]}>
            {last.lost.length === 0
              ? 'No pieces lost.'
              : `Lost for good: ${last.lost.map((p) => PIECE_STATS[p.type].name).join(', ')}.`}
          </Text>
        </Panel>
      )}

      {battle && !finished && (
        <Panel>
          <Text style={text.heading}>NEXT: {battle.name.toUpperCase()}</Text>
          <Text style={[text.body, { marginTop: 4 }]}>{battle.description}</Text>
          <Text style={[text.dim, { marginTop: 4 }]}>
            {battle.rules.checkRules ? 'Royal Duel — checkmate the enemy King.' : 'Extermination — destroy every enemy piece.'}{' '}
            {battle.terrain[0].length}×{battle.terrain.length} board.
          </Text>
          <View style={styles.grid}>
            {parsePlacements(battle.enemies)
              .sort(byRank)
              .map((p, i) => (
                <PieceTile key={i} piece={p} side="enemy" />
              ))}
          </View>
          <View style={{ marginTop: 12 }}>
            <Button label="Prepare deployment" primary onPress={() => router.push('/deploy')} />
          </View>
        </Panel>
      )}

      <Panel>
        <Text style={text.heading}>
          YOUR ARMY · {run.roster.length} PIECES · {run.armyPoints} ARMY POINTS PER BATTLE
        </Text>
        <View style={styles.grid}>
          {roster.map((p: RosterPiece) => (
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

      <View style={{ gap: 10, marginTop: 4 }}>
        {finished ? (
          <Button label="Back to menu" primary onPress={endRun} />
        ) : (
          <>
            <Button label="‹ Menu" onPress={() => router.replace('/')} />
            <Button label="Abandon run" onPress={endRun} />
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 14, maxWidth: 600, width: '100%', alignSelf: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
});
