import { router } from 'expo-router';
import { ROUTES } from '../run/run';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useRun } from '../run/RunContext';
import { Button, text } from '../ui/common';
import { PIECE_IMAGES } from '../ui/pieceImages';
import { COLORS } from '../ui/theme';

export default function Home() {
  const { loaded, run, startNewRun, packs } = useRun();
  const canContinue = run && run.status === 'active';

  const newRun = () => {
    startNewRun();
    router.push('/map');
  };

  return (
    <View style={styles.screen}>
      <View style={styles.hero}>
        <Image source={PIECE_IMAGES.player.king} style={styles.king} resizeMode="contain" />
        <Text style={text.title}>Chess Roguelike</Text>
        <Text style={[text.dim, { textAlign: 'center' }]}>Build an army. Every capture is permanent.</Text>
      </View>
      <View style={styles.buttons}>
        {canContinue && <Button label="Continue run" primary onPress={() => router.push(ROUTES[run.phase])} />}
        <Button label="New run" primary={!canContinue} disabled={!loaded} onPress={newRun} />
        <Button label="Sandbox battles" onPress={() => router.push('/sandbox')} />
        <Button label={`Content packs (${packs.length} on)`} onPress={() => router.push('/packs')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', padding: 24, gap: 40 },
  hero: { alignItems: 'center', gap: 8 },
  king: { width: 120, height: 120, marginBottom: 8 },
  buttons: { gap: 12, alignSelf: 'center', width: '100%', maxWidth: 320 },
});
