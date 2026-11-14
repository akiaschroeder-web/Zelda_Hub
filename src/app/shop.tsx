import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { buy, leaveShop } from '../run/run';
import { useRun } from '../run/RunContext';
import OptionCard from '../ui/OptionCard';
import RunGuard from '../ui/RunGuard';
import { Button, text } from '../ui/common';
import { COLORS } from '../ui/theme';

export default function ShopScreen() {
  const { update } = useRun();
  return (
    <RunGuard phase="shop">
      {(run) => (
        <ScrollView style={{ backgroundColor: COLORS.background }} contentContainerStyle={styles.screen}>
          <Text style={text.title}>Shop</Text>
          <Text style={styles.gold}>💰 {run.gold} gold</Text>
          <View style={{ gap: 8 }}>
            {run.shop!.map((item, i) => (
              <OptionCard
                key={i}
                option={item.option}
                disabled={item.sold || item.price > run.gold}
                footer={item.sold ? 'Sold' : `${item.price} gold — tap to buy`}
                onPress={() => update((r) => buy(r, i))}
              />
            ))}
          </View>
          <Button label="Leave shop" primary onPress={() => update(leaveShop)} />
        </ScrollView>
      )}
    </RunGuard>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 12, maxWidth: 560, width: '100%', alignSelf: 'center' },
  gold: { color: COLORS.gold, fontSize: 18, fontWeight: '700', textAlign: 'center' },
});
