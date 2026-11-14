import { Redirect, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { parseBoard } from '../engine/board';
import { PIECE_STATS, footprint } from '../engine/pieces';
import { parsePlacements } from '../engine/setup';
import { Coord, Piece, coordKey } from '../engine/types';
import {
  DeployedPiece,
  autoDeploy,
  canPlace,
  currentBattle,
  deployZone,
  deploymentCost,
  deploymentErrors,
} from '../run/run';
import { useRun } from '../run/RunContext';
import BoardView, { Marker } from '../ui/BoardView';
import PieceTile, { byRank } from '../ui/PieceTile';
import { Button, text } from '../ui/common';
import { COLORS } from '../ui/theme';

const ZONE_TINT = 'rgba(50, 120, 240, 0.45)';

/** Turn a roster piece into a full Piece object for drawing on the board. */
const asPiece = (uid: string, type: Piece['type'], at: Coord): Piece => ({
  id: uid,
  type,
  side: 'player',
  pos: at,
  hasMoved: false,
  hp: PIECE_STATS[type].maxHp,
  maxHp: PIECE_STATS[type].maxHp,
  shields: 0,
  used: [],
});

export default function Deploy() {
  const { loaded, run, beginBattle } = useRun();
  const { width, height } = useWindowDimensions();
  const battle = run ? currentBattle(run) : undefined;
  const [deployed, setDeployed] = useState<DeployedPiece[]>(() => (run && battle ? autoDeploy(run, battle) : []));
  const [selected, setSelected] = useState<string | null>(null);

  const board = useMemo(() => (battle ? parseBoard(battle.terrain) : null), [battle]);
  const enemies = useMemo(
    () =>
      battle
        ? parsePlacements(battle.enemies).map(
            (p, i): Piece => ({ ...asPiece(`enemy${i}`, p.type, { x: p.x, y: p.y }), side: 'enemy' }),
          )
        : [],
    [battle],
  );

  if (!loaded) return null;
  if (!run || !battle || !board || run.status !== 'active') return <Redirect href="/army" />;
  if (run.activeBattle) return <Redirect href="/battle" />;

  const typeOf = (uid: string) => run.roster.find((r) => r.uid === uid)!.type;
  const fielded: Piece[] = deployed.map((d) => asPiece(d.uid, typeOf(d.uid), { x: d.x, y: d.y }));
  const cost = deploymentCost(run, deployed);
  const zone = deployZone(battle);
  const squaresUsed = fielded.reduce((n, p) => n + footprint(p).length, 0);
  const errors = deploymentErrors(run, battle, deployed);
  const reserve = run.roster.filter((r) => !deployed.some((d) => d.uid === r.uid)).sort(byRank);

  const pieceAt = (c: Coord) => fielded.find((p) => footprint(p).some((f) => f.x === c.x && f.y === c.y));
  const fits = (uid: string) => cost - (deployed.some((d) => d.uid === uid) ? PIECE_STATS[typeOf(uid)].cost : 0) + PIECE_STATS[typeOf(uid)].cost <= run.armyPoints;

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
  const over = cost > run.armyPoints;

  return (
    <ScrollView style={{ backgroundColor: COLORS.background }} contentContainerStyle={styles.screen}>
      <Text style={text.title}>Deploy: {battle.name}</Text>
      <View style={styles.counters}>
        <Text style={[styles.counter, over && { color: COLORS.danger }]}>
          Army Points {cost}/{run.armyPoints}
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

      {errors.length > 0 && <Text style={styles.error}>{errors[0]}</Text>}

      <View style={styles.buttons}>
        <Button small label="Auto" onPress={() => setDeployed(autoDeploy(run, battle))} />
        <Button small label="Clear" onPress={() => setDeployed([])} />
        <Button small label="‹ Back" onPress={() => router.back()} />
      </View>
      <View style={{ width: '100%', maxWidth: 320 }}>
        <Button
          label="Start battle"
          primary
          disabled={errors.length > 0}
          onPress={() => {
            beginBattle(deployed);
            router.replace('/battle');
          }}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 12, gap: 10, alignItems: 'center', maxWidth: 600, width: '100%', alignSelf: 'center' },
  counters: { flexDirection: 'row', gap: 16 },
  counter: { color: COLORS.gold, fontWeight: '700', fontSize: 14 },
  tray: { gap: 6, paddingVertical: 8 },
  error: { color: COLORS.danger, fontSize: 13, textAlign: 'center' },
  buttons: { flexDirection: 'row', gap: 8 },
});
