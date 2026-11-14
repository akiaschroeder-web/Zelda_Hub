import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { buy, leaveShop } from '../run/run';
import { useRun } from '../run/RunContext';
import OptionCard from '../ui/OptionCard';
import UpgradeTargetPicker from '../ui/UpgradeTargetPicker';
import RunGuard from '../ui/RunGuard';
import { Button, text } from '../ui/common';
import { COLORS } from '../ui/theme';

export default function ShopScreen() {
  const { update } = useRun();
  // Upgrades need a piece to go on before they can be bought.
  const [pending, setPending] = useState<number | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  return (
    <RunGuard phase="shop">
      {(run) => {
        const pendingItem = pending !== null ? run.shop![pending] : undefined;
        return (
          <ScrollView style={{ backgroundColor: COLORS.background }} contentContainerStyle={styles.screen}>
            <Text style={text.title}>Shop</Text>
            <Text style={styles.gold}>💰 {run.gold} gold</Text>
            <View style={{ gap: 8 }}>
              {run.shop!.map((item, i) => (
                <OptionCard
                  key={i}
                  option={item.option}
                  selected={pending === i}
                  disabled={item.sold || item.price > run.gold}
                  footer={item.sold ? 'Sold' : `${item.price} gold — tap to buy`}
                  onPress={() => {
                    if (item.option.kind === 'upgrade') {
                      setPending(i);
                      setTarget(null);
                    } else update((r) => buy(r, i));
                  }}
                />
              ))}
            </View>
            {pendingItem && pendingItem.option.kind === 'upgrade' && !pendingItem.sold && (
              <>
                <UpgradeTargetPicker run={run} upgradeId={pendingItem.option.id} selected={target} onSelect={setTarget} />
                <Button
                  label={target ? `Buy for ${pendingItem.price} gold` : 'Choose a piece'}
                  primary
                  disabled={!target}
                  onPress={() => {
                    update((r) => buy(r, pending!, target!));
                    setPending(null);
                    setTarget(null);
                  }}
                />
              </>
            )}
            <Button label="Leave shop" primary={!pendingItem} onPress={() => update(leaveShop)} />
          </ScrollView>
        );
      }}
    </RunGuard>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 12, maxWidth: 560, width: '100%', alignSelf: 'center' },
  gold: { color: COLORS.gold, fontSize: 18, fontWeight: '700', textAlign: 'center' },
});
