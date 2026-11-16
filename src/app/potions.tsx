import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ELIXIR_BY_ID, POTION_BY_ID, buyPotion } from '../run/potions';
import { leavePotionShop } from '../run/run';
import { useRun } from '../run/RunContext';
import RunGuard from '../ui/RunGuard';
import { Button, text } from '../ui/common';
import { COLORS } from '../ui/theme';

/** Potion Shop: potions to keep for later, and permanent elixirs. */
export default function PotionShopScreen() {
  const { update } = useRun();
  return (
    <RunGuard phase="potions">
      {(run) => (
        <ScrollView style={{ backgroundColor: COLORS.background }} contentContainerStyle={styles.screen}>
          <Text style={text.title}>🧪 Potion Shop</Text>
          <Text style={styles.gold}>💰 {run.gold} gold</Text>
          <Text style={[text.dim, { textAlign: 'center' }]}>
            Potions go into your inventory to use when you choose. Elixirs work at once, for the rest of the run.
          </Text>
          <View style={{ gap: 8 }}>
            {run.potionShop!.map((item, i) => {
              const info = item.kind === 'potion' ? POTION_BY_ID[item.id] : ELIXIR_BY_ID[item.id];
              const disabled = item.sold || item.price > run.gold;
              return (
                <Pressable key={i} disabled={disabled} onPress={() => update((r) => buyPotion(r, i))} style={[styles.card, disabled && { opacity: 0.45 }]}>
                  <Text style={styles.icon}>{info.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>
                      {info.name} <Text style={[styles.kind, item.kind === 'elixir' && { color: COLORS.gold }]}>{item.kind === 'elixir' ? 'PERMANENT' : 'POTION'}</Text>
                    </Text>
                    <Text style={text.dim}>{info.text}</Text>
                    <Text style={styles.price}>{item.sold ? 'Sold' : `${item.price} gold — tap to buy`}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          {run.potions.length > 0 && (
            <Text style={[text.dim, { textAlign: 'center' }]}>
              In your bag: {run.potions.map((p) => `${POTION_BY_ID[p].icon} ${POTION_BY_ID[p].name}`).join(', ')}
            </Text>
          )}
          <Button label="Leave" primary onPress={() => update(leavePotionShop)} />
        </ScrollView>
      )}
    </RunGuard>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 12, maxWidth: 560, width: '100%', alignSelf: 'center' },
  gold: { color: COLORS.gold, fontSize: 18, fontWeight: '700', textAlign: 'center' },
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
  icon: { fontSize: 30 },
  name: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  kind: { color: COLORS.textDim, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  price: { color: COLORS.gold, fontSize: 13, marginTop: 4 },
});
