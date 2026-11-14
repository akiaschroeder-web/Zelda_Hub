import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { RunProvider } from '../run/RunContext';
import { COLORS } from '../ui/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <RunProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: COLORS.background } }} />
          <StatusBar style="light" />
        </SafeAreaView>
      </RunProvider>
    </SafeAreaProvider>
  );
}
