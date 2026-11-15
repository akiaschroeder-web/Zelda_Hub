import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ENCOUNTERS } from '../engine/encounters';
import { PIECE_STATS } from '../engine/pieces';
import { createEncounter } from '../engine/setup';
import { GameState, PieceType } from '../engine/types';
import { BOSS_POOLS, bossBattle } from '../run/battlegen';
import { autoDeploy, newRun, startBattle } from '../run/run';
import BattleView from '../ui/BattleView';
import { Button } from '../ui/common';

/** A boss arena against a standard chess army (24 Army Points, auto-deployed). */
function bossSandbox(type: PieceType): { state: GameState; name: string; description: string } {
  const act = BOSS_POOLS.findIndex((p) => p.includes(type));
  const battle = bossBattle(act, `sandbox-${type}`, undefined, type);
  const run = { ...newRun(1), phase: 'deploy' as const, battle };
  return { state: startBattle(run, autoDeploy(run, battle)).activeBattle!, name: battle.name, description: battle.description };
}

/** Free-play test battles with fixed armies; nothing here affects a run. */
export default function Sandbox() {
  const [idx, setIdx] = useState(0);
  const [boss, setBoss] = useState<PieceType | null>(null);
  const [round, setRound] = useState(0);
  const [state, setState] = useState(() => createEncounter(ENCOUNTERS[0]));

  const start = (i: number) => {
    setIdx(i);
    setBoss(null);
    setRound((r) => r + 1);
    setState(createEncounter(ENCOUNTERS[i]));
  };
  const startBoss = (t: PieceType) => {
    setBoss(t);
    setRound((r) => r + 1);
    setState(bossSandbox(t).state);
  };
  const current = useMemo(() => (boss ? bossSandbox(boss) : null), [boss]);

  return (
    <BattleView
      key={round}
      state={state}
      onMove={setState}
      title={current ? current.name : ENCOUNTERS[idx].name}
      description={current ? current.description : ENCOUNTERS[idx].description}
      finishLabel="Play again"
      onFinish={() => (boss ? startBoss(boss) : start(idx))}
      menu={[
        { label: 'Restart battle', onPress: () => (boss ? startBoss(boss) : start(idx)) },
        { label: 'Quit to menu', onPress: () => router.back() },
      ]}
      footer={
        <View style={styles.controls}>
          {ENCOUNTERS.map((e, i) => (
            <Button key={e.id} small label={e.name} primary={!boss && i === idx} onPress={() => start(i)} />
          ))}
          {BOSS_POOLS.flat().map((t) => (
            <Button key={t} small label={`👑 ${PIECE_STATS[t].name.replace('The ', '')}`} primary={boss === t} onPress={() => startBoss(t)} />
          ))}
          <Button small label="‹ Menu" onPress={() => router.back()} />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  controls: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 12 },
});
