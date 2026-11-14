import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import BattleScreen from './src/ui/BattleScreen';
import { COLORS } from './src/ui/theme';

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
        <BattleScreen />
        <StatusBar style="light" />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
