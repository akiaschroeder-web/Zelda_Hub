import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ENCOUNTERS } from '../engine/encounters';
import { createEncounter } from '../engine/setup';
import BattleView from '../ui/BattleView';
import { Button } from '../ui/common';

/** Free-play test battles with fixed armies; nothing here affects a run. */
export default function Sandbox() {
  const [idx, setIdx] = useState(0);
  const [round, setRound] = useState(0);
  const [state, setState] = useState(() => createEncounter(ENCOUNTERS[0]));

  const start = (i: number) => {
    setIdx(i);
    setRound((r) => r + 1);
    setState(createEncounter(ENCOUNTERS[i]));
  };

  return (
    <BattleView
      key={round}
      state={state}
      onMove={setState}
      title={ENCOUNTERS[idx].name}
      description={ENCOUNTERS[idx].description}
      finishLabel="Play again"
      onFinish={() => start(idx)}
      footer={
        <View style={styles.controls}>
          {ENCOUNTERS.map((e, i) => (
            <Button key={e.id} small label={e.name} primary={i === idx} onPress={() => start(i)} />
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
