import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { parseBoard } from '../engine/board';
import { newPiece } from '../engine/core';
import { PIECE_STATS, footprint } from '../engine/pieces';
import { Coord, Piece, coordKey } from '../engine/types';
import {
  DeployedPiece,
  RunState,
  autoDeploy,
  canPlace,
  costOf,
  deployZone,
  deploymentCost,
  deploymentErrors,
  startBattle,
} from '../run/run';
import { NODE_INFO } from '../run/map';
import { POTION_BY_ID, battleArmyPoints, usePrebattlePotion as drinkPotion } from '../run/potions';
import RunGuard from '../ui/RunGuard';
import { useRun } from '../run/RunContext';
import BoardView, { Marker } from '../ui/BoardView';
import PieceTile, { byRank } from '../ui/PieceTile';
import { Button, text } from '../ui/common';
import { COLORS } from '../ui/theme';

const ZONE_TINT = 'rgba(50, 120, 240, 0.45)';

/** Turn a roster piece into a full Piece object for drawing on the board. */
const asPiece = (uid: string, type: Piece['type'], at: Coord, upgrades: string[] = []): Piece => ({
  ...newPiece(type, 'player', at, uid),
  upgrades,
});

export default function Deploy() {
  return <RunGuard phase="deploy">{(run) => <DeployView run={run} />}</RunGuard>;
}

function DeployView({ run }: { run: RunState }) {
  const { update } = useRun();
  const { width, height } = useWindowDimensions();
  const battle = run.battle!;
  const [deployed, setDeployed] = useState<DeployedPiece[]>(() => autoDeploy(run, battle));
  const [selected, setSelected] = useState<string | null>(null);

  const board = useMemo(() => parseBoard(battle.terrain), [battle]);
  const enemies = useMemo(
    () => battle.enemies.map((p, i): Piece => ({ ...asPiece(`enemy${i}`, p.type, { x: p.x, y: p.y }, p.upgrades), side: 'enemy' })),
    [battle],
  );

  const typeOf = (uid: string) => run.roster.find((r) => r.uid === uid)!.type;
  const fielded: Piece[] = deployed.map((d) =>
    asPiece(d.uid, typeOf(d.uid), { x: d.x, y: d.y }, run.roster.find((r) => r.uid === d.uid)!.upgrades),
  );
  const cost = deploymentCost(run, deployed);
  const zone = deployZone(battle, run);
  const ap = battleArmyPoints(run);
  const squaresUsed = fielded.reduce((n, p) => n + footprint(p).length, 0);
  const errors = deploymentErrors(run, battle, deployed);
  const reserve = run.roster.filter((r) => !deployed.some((d) => d.uid === r.uid)).sort(byRank);

  const pieceAt = (c: Coord) => fielded.find((p) => footprint(p).some((f) => f.x === c.x && f.y === c.y));
  const pieceCost = (uid: string) => costOf(run.roster.find((r) => r.uid === uid)!);
  const fits = (uid: string) => cost - (deployed.some((d) => d.uid === uid) ? pieceCost(uid) : 0) + pieceCost(uid) <= ap;

  const onSquare = (c: Coord) => {
    const occupant = pieceAt(c);
    if (occupant) {
      if (occupant.id === selected) {
        // Tapping the selected piece again sends it back to the reserve.
        setDeployed(deployed.filter((d) => d.uid !== occupant.id));
        setSelected(null);
      } else setSelected(occupant.id);
      return;
    }
    if (selected && canPlace(run, battle, deployed, selected, c) && fits(selected)) {
      setDeployed([...deployed.filter((d) => d.uid !== selected), { uid: selected, x: c.x, y: c.y }]);
      setSelected(null);
    }
  };

  const tints = new Map<string, string[]>(zone.map((c) => [coordKey(c), [ZONE_TINT]]));
  const selectedPiece = fielded.find((p) => p.id === selected);
  if (selectedPiece) footprint(selectedPiece).forEach((c) => tints.set(coordKey(c), [...(tints.get(coordKey(c)) ?? []), COLORS.selected]));
  const markers = new Map<string, Marker>();
  if (selected && fits(selected)) {
    for (const c of zone) if (!pieceAt(c) && canPlace(run, battle, deployed, selected, c)) markers.set(coordKey(c), { kind: 'dot' });
  }

  const cell = Math.floor(Math.min(Math.min(width - 24, 560) / board.width, (height * 0.48) / board.height));
  const over = cost > ap;
  const bag = [...new Set(run.potions.filter((id) => POTION_BY_ID[id]?.use === 'deploy'))];

  return (
    <ScrollView style={{ backgroundColor: COLORS.background }} contentContainerStyle={styles.screen}>
      <Text style={styles.kind}>
        {NODE_INFO[battle.kind].icon} {NODE_INFO[battle.kind].label.toUpperCase()} ·{' '}
        {battle.rules.checkRules ? 'ROYAL DUEL' : 'EXTERMINATION'}
      </Text>
      <Text style={text.title}>{battle.name}</Text>
      <Text style={[text.dim, { textAlign: 'center' }]}>
        {battle.description}{' '}
        {battle.rules.checkRules ? 'Checkmate the enemy King.' : 'Destroy every enemy piece; no check rules.'}
      </Text>
      {run.bounty && battle.enemies.some((e) => e.type === run.bounty!.target) && (
        <Text style={[text.body, { color: COLORS.gold, textAlign: 'center' }]}>
          🎯 Your bounty target is here: capture the {PIECE_STATS[run.bounty.target].name}!
        </Text>
      )}
      <View style={styles.counters}>
        <Text style={[styles.counter, over && { color: COLORS.danger }]}>
          Army Points {cost}/{ap}
        </Text>
        <Text style={styles.counter}>
          Squares {squaresUsed}/{zone.length}
        </Text>
      </View>

      <BoardView
        board={board}
        pieces={[...enemies, ...fielded]}
        cell={cell}
        tints={tints}
        markers={markers}
        onSquare={onSquare}
      />

      <Text style={[text.dim, { textAlign: 'center' }]}>
        {selected
          ? `${PIECE_STATS[typeOf(selected)].name} selected — tap a blue square to place it${
              deployed.some((d) => d.uid === selected) ? ', or tap it again to send it back' : ''
            }.`
          : 'Tap a reserve piece, then a blue square. Tap a placed piece to move or remove it.'}
      </Text>

      <View style={{ width: '100%' }}>
        <Text style={text.heading}>RESERVE · {reserve.length}</Text>
        <ScrollView horizontal contentContainerStyle={styles.tray} showsHorizontalScrollIndicator={false}>
          {reserve.length === 0 && <Text style={text.dim}>Everyone is deployed.</Text>}
          {reserve.map((r) => (
            <PieceTile
              key={r.uid}
              piece={r}
              selected={r.uid === selected}
              faded={!fits(r.uid)}
              onPress={() => setSelected(r.uid === selected ? null : r.uid)}
            />
          ))}
        </ScrollView>
        <Text style={text.dim}>{"Reserve pieces sit this battle out and can't be captured."}</Text>
      </View>

      {(bag.length > 0 || run.boosts.length > 0) && (
        <View style={{ width: '100%' }}>
          <Text style={text.heading}>POTIONS</Text>
          {run.boosts.length > 0 && (
            <Text style={[text.body, { color: COLORS.gold, marginTop: 4 }]}>
              Active: {run.boosts.map((b) => `${POTION_BY_ID[b].icon} ${POTION_BY_ID[b].name}`).join(', ')}
            </Text>
          )}
          <View style={styles.potions}>
            {bag
              .filter((id) => !run.boosts.includes(id))
              .map((id) => (
                <Button
                  key={id}
                  small
                  label={`${POTION_BY_ID[id].icon} ${POTION_BY_ID[id].name} ×${run.potions.filter((p) => p === id).length}`}
                  onPress={() => update((r) => drinkPotion(r, id))}
                />
              ))}
          </View>
          {bag.some((id) => !run.boosts.includes(id)) && <Text style={text.dim}>Tap a potion to drink it for this battle.</Text>}
        </View>
      )}

      {errors.length > 0 && <Text style={styles.error}>{errors[0]}</Text>}

      <View style={styles.buttons}>
        <Button small label="Auto" onPress={() => setDeployed(autoDeploy(run, battle))} />
        <Button small label="Clear" onPress={() => setDeployed([])} />

      </View>
      <View style={{ width: '100%', maxWidth: 320 }}>
        <Button
          label="Start battle"
          primary
          disabled={errors.length > 0}
          onPress={() => update((r) => startBattle(r, deployed))}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 12, gap: 10, alignItems: 'center', maxWidth: 600, width: '100%', alignSelf: 'center' },
  counters: { flexDirection: 'row', gap: 16 },
  kind: { color: COLORS.gold, fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  counter: { color: COLORS.gold, fontWeight: '700', fontSize: 14 },
  tray: { gap: 6, paddingVertical: 8 },
  error: { color: COLORS.danger, fontSize: 13, textAlign: 'center' },
  buttons: { flexDirection: 'row', gap: 8 },
  potions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 6 },
});
