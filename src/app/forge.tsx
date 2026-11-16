import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PIECE_STATS } from '../engine/pieces';
import { PieceType } from '../engine/types';
import { UPGRADE_BY_ID } from '../engine/upgrades/catalog';
import {
  PIECE_RECIPES,
  UPGRADE_RECIPES,
  equipFromStash,
  extractUpgrade,
  forgeChoiceCost,
  forgePieces,
  forgeUpgrades,
  leaveForge,
  pickForgeOffer,
} from '../run/forge';
import { rarityOf } from '../run/rewards';
import { RunState } from '../run/run';
import { useRun } from '../run/RunContext';
import OptionCard, { UPGRADE_RARITY_COLORS } from '../ui/OptionCard';
import PieceTile, { byRank } from '../ui/PieceTile';
import RunGuard from '../ui/RunGuard';
import UpgradeTargetPicker from '../ui/UpgradeTargetPicker';
import { Button, Panel, text } from '../ui/common';
import { COLORS } from '../ui/theme';

type Tab = 'pieces' | 'upgrades' | 'extract';

/** Piece rarities by the names the Forge uses. */
const RARITY_LABEL: Record<string, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  boss: 'Boss',
  legendary: 'Legendary',
  mythical: 'Mythical',
};

export default function ForgeScreen() {
  return <RunGuard phase="forge">{(run) => <ForgeView run={run} />}</RunGuard>;
}

function ForgeView({ run }: { run: RunState }) {
  const { update } = useRun();
  const [tab, setTab] = useState<Tab>('pieces');
  const [picked, setPicked] = useState<string[]>([]);
  const [stashPick, setStashPick] = useState<number[]>([]);
  const [equipIndex, setEquipIndex] = useState<number | null>(null);
  const [equipTarget, setEquipTarget] = useState<string | null>(null);
  const choiceCost = forgeChoiceCost(run);

  const switchTab = (t: Tab) => {
    setTab(t);
    setPicked([]);
    setStashPick([]);
    setEquipIndex(null);
  };

  // Pieces: all picks must share a rarity.
  const pieces = run.roster.filter((r) => r.type !== 'king').sort(byRank);
  const pickedRarity = picked.length ? rarityOf(run.roster.find((r) => r.uid === picked[0])!.type) : null;
  const pieceRecipe = pickedRarity ? PIECE_RECIPES[pickedRarity] : undefined;
  const togglePiece = (uid: string) => {
    const rarity = rarityOf(run.roster.find((r) => r.uid === uid)!.type);
    if (picked.includes(uid)) setPicked(picked.filter((u) => u !== uid));
    else if (pickedRarity && rarity !== pickedRarity) setPicked([uid]);
    else setPicked([...picked, uid].slice(-(PIECE_RECIPES[rarity]?.count ?? 3)));
  };
  const losesUpgrades = picked.some((u) => run.roster.find((r) => r.uid === u)!.upgrades.length > 0);

  // Upgrades in the stash: same rule.
  const stash = run.stash ?? [];
  const stashRarity = stashPick.length ? UPGRADE_BY_ID[stash[stashPick[0]]].rarity : null;
  const upgradeRecipe = stashRarity ? UPGRADE_RECIPES[stashRarity] : undefined;
  const toggleStash = (i: number) => {
    const rarity = UPGRADE_BY_ID[stash[i]].rarity;
    if (stashPick.includes(i)) setStashPick(stashPick.filter((j) => j !== i));
    else if (stashRarity && rarity !== stashRarity) setStashPick([i]);
    else setStashPick([...stashPick, i].slice(-(UPGRADE_RECIPES[rarity]?.count ?? 3)));
  };

  const forgeButtons = (ready: boolean, need: string, onForge: (choose: boolean) => void) => (
    <View style={{ gap: 8 }}>
      <Button label={ready ? 'Forge (random result)' : need} primary disabled={!ready} onPress={() => onForge(false)} />
      {ready && (
        <Button
          label={`Forge — choose 1 of 3 (${choiceCost} gold)`}
          disabled={run.gold < choiceCost}
          onPress={() => onForge(true)}
        />
      )}
    </View>
  );

  return (
    <ScrollView style={{ backgroundColor: COLORS.background }} contentContainerStyle={styles.screen}>
      <Text style={text.title}>⚒️ Forge</Text>
      <Text style={styles.gold}>💰 {run.gold} gold</Text>

      {run.forgeResult && !run.forgeOffer && (
        <Panel>
          <Text style={styles.result}>
            Forged:{' '}
            {PIECE_STATS[run.forgeResult as PieceType]?.name ?? UPGRADE_BY_ID[run.forgeResult]?.name ?? run.forgeResult}
            {UPGRADE_BY_ID[run.forgeResult] ? ' (in your stash)' : ' (joined your army)'}
          </Text>
        </Panel>
      )}

      {run.forgeOffer ? (
        <>
          <Text style={text.heading}>CHOOSE YOUR RESULT</Text>
          {run.forgeOffer.options.map((o, i) => (
            <OptionCard
              key={i}
              option={run.forgeOffer!.kind === 'piece' ? { kind: 'piece', type: o as PieceType } : { kind: 'upgrade', id: o }}
              onPress={() => update((r) => pickForgeOffer(r, i))}
            />
          ))}
        </>
      ) : (
        <>
          <View style={styles.tabs}>
            {(
              [
                ['pieces', 'Pieces'],
                ['upgrades', 'Upgrades'],
                ['extract', 'Extract & Equip'],
              ] as [Tab, string][]
            ).map(([t, label]) => (
              <Button key={t} small label={label} primary={tab === t} onPress={() => switchTab(t)} />
            ))}
          </View>

          {tab === 'pieces' && (
            <Panel>
              <Text style={text.heading}>MELT PIECES DOWN</Text>
              <Text style={[text.dim, { marginTop: 4 }]}>
                3 Common → Uncommon · 3 Uncommon → Rare · 3 Rare → Epic · 4 Epic → a Boss Piece. Pick pieces of one rarity. Upgrades on
                them are destroyed — extract them first.
              </Text>
              <View style={styles.grid}>
                {pieces.map((p) => (
                  <View key={p.uid} style={{ alignItems: 'center' }}>
                    <PieceTile piece={p} selected={picked.includes(p.uid)} onPress={() => togglePiece(p.uid)} />
                    <Text style={[styles.rarity, { color: UPGRADE_RARITY_COLORS[rarityOf(p.type) as keyof typeof UPGRADE_RARITY_COLORS] ?? COLORS.textDim }]}>
                      {RARITY_LABEL[rarityOf(p.type)]}
                    </Text>
                  </View>
                ))}
              </View>
              {pickedRarity && (
                <Text style={[text.body, { marginTop: 8 }]}>
                  {pieceRecipe
                    ? `${picked.length}/${pieceRecipe.count} ${RARITY_LABEL[pickedRarity]} → 1 ${RARITY_LABEL[pieceRecipe.into]}`
                    : `${RARITY_LABEL[pickedRarity]} pieces can't be forged.`}
                </Text>
              )}
              {losesUpgrades && <Text style={[text.body, { color: COLORS.danger }]}>Warning: upgrades on these pieces will be destroyed.</Text>}
              <View style={{ marginTop: 8 }}>
                {forgeButtons(!!pieceRecipe && picked.length === pieceRecipe.count, 'Pick pieces to forge', (choose) => {
                  update((r) => forgePieces(r, picked, choose));
                  setPicked([]);
                })}
              </View>
            </Panel>
          )}

          {tab === 'upgrades' && (
            <Panel>
              <Text style={text.heading}>MELT UPGRADES DOWN</Text>
              <Text style={[text.dim, { marginTop: 4 }]}>
                3 Common → Uncommon · 3 Uncommon → Rare · 3 Rare → Epic · 3 Epic → Legendary · 4 Legendary → Mythical. Uses upgrades in your
                stash (extract them from pieces first).
              </Text>
              {stash.length === 0 && <Text style={[text.dim, { marginTop: 8 }]}>Your stash is empty.</Text>}
              <View style={{ gap: 6, marginTop: 8 }}>
                {stash.map((id, i) => (
                  <StashRow key={i} id={id} selected={stashPick.includes(i)} onPress={() => toggleStash(i)} />
                ))}
              </View>
              {stashRarity && (
                <Text style={[text.body, { marginTop: 8 }]}>
                  {upgradeRecipe
                    ? `${stashPick.length}/${upgradeRecipe.count} ${RARITY_LABEL[stashRarity]} → 1 ${RARITY_LABEL[upgradeRecipe.into]}`
                    : `${RARITY_LABEL[stashRarity]} upgrades can't be forged.`}
                </Text>
              )}
              <View style={{ marginTop: 8 }}>
                {forgeButtons(!!upgradeRecipe && stashPick.length === upgradeRecipe.count, 'Pick upgrades to forge', (choose) => {
                  update((r) => forgeUpgrades(r, stashPick, choose));
                  setStashPick([]);
                })}
              </View>
            </Panel>
          )}

          {tab === 'extract' && (
            <>
              <Panel>
                <Text style={text.heading}>EXTRACT</Text>
                <Text style={[text.dim, { marginTop: 4 }]}>Take an upgrade off a piece and keep it in your stash.</Text>
                {run.roster.filter((r) => r.upgrades.length).length === 0 && (
                  <Text style={[text.dim, { marginTop: 8 }]}>None of your pieces have upgrades.</Text>
                )}
                {run.roster
                  .filter((r) => r.upgrades.length)
                  .sort(byRank)
                  .map((r) => (
                    <View key={r.uid} style={{ marginTop: 8 }}>
                      <Text style={text.body}>{PIECE_STATS[r.type].name}</Text>
                      {r.upgrades.map((u) => (
                        <View key={u} style={styles.extractRow}>
                          <Text style={{ color: UPGRADE_RARITY_COLORS[UPGRADE_BY_ID[u].rarity], flex: 1 }}>✦ {UPGRADE_BY_ID[u].name}</Text>
                          <Button small label="Extract" onPress={() => update((s) => extractUpgrade(s, r.uid, u))} />
                        </View>
                      ))}
                    </View>
                  ))}
              </Panel>
              <Panel>
                <Text style={text.heading}>EQUIP FROM STASH</Text>
                {stash.length === 0 && <Text style={[text.dim, { marginTop: 8 }]}>Your stash is empty.</Text>}
                <View style={{ gap: 6, marginTop: 8 }}>
                  {stash.map((id, i) => (
                    <StashRow
                      key={i}
                      id={id}
                      selected={equipIndex === i}
                      onPress={() => {
                        setEquipIndex(equipIndex === i ? null : i);
                        setEquipTarget(null);
                      }}
                    />
                  ))}
                </View>
                {equipIndex !== null && stash[equipIndex] && (
                  <View style={{ marginTop: 10, gap: 8 }}>
                    <UpgradeTargetPicker run={run} upgradeId={stash[equipIndex]} selected={equipTarget} onSelect={setEquipTarget} />
                    <Button
                      label={equipTarget ? 'Equip' : 'Choose a piece'}
                      primary
                      disabled={!equipTarget}
                      onPress={() => {
                        update((r) => equipFromStash(r, equipIndex, equipTarget!));
                        setEquipIndex(null);
                        setEquipTarget(null);
                      }}
                    />
                  </View>
                )}
              </Panel>
            </>
          )}
          <Button label="Leave the Forge" onPress={() => update(leaveForge)} />
        </>
      )}
    </ScrollView>
  );
}

function StashRow({ id, selected, onPress }: { id: string; selected: boolean; onPress: () => void }) {
  const u = UPGRADE_BY_ID[id];
  return (
    <Pressable onPress={onPress} style={[styles.stashRow, selected && styles.stashSelected]}>
      <Text style={{ color: UPGRADE_RARITY_COLORS[u.rarity], fontWeight: '700' }}>
        ✦ {u.name} <Text style={text.dim}>({u.rarity})</Text>
      </Text>
      <Text style={text.dim}>{u.text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 12, maxWidth: 600, width: '100%', alignSelf: 'center' },
  gold: { color: COLORS.gold, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  tabs: { flexDirection: 'row', gap: 8, justifyContent: 'center', flexWrap: 'wrap' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  rarity: { fontSize: 10, fontWeight: '700', marginTop: 2 },
  result: { color: COLORS.gold, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  extractRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  stashRow: { padding: 8, borderRadius: 8, borderWidth: 1, borderColor: COLORS.panelBorder, backgroundColor: COLORS.background },
  stashSelected: { borderColor: COLORS.gold, borderWidth: 2 },
});
