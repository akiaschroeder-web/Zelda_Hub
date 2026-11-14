import { router } from 'expo-router';
import { ReactElement, useRef, useState } from 'react';
import { Pressable, ScrollView, ScrollViewInstance, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { PIECE_STATS } from '../engine/pieces';
import { MapNode, NODE_INFO } from '../run/map';
import { ACTS, RunState, availableNodes, currentMap, enterNode } from '../run/run';
import { useRun } from '../run/RunContext';
import { resultText } from '../ui/BattleView';
import RunGuard from '../ui/RunGuard';
import { Button, Panel, text } from '../ui/common';
import { COLORS } from '../ui/theme';

const FLOOR_H = 86;
const NODE = 50;

export default function MapScreen() {
  return <RunGuard phase="map">{(run) => <MapView run={run} />}</RunGuard>;
}

function RunHeader({ run }: { run: RunState }) {
  return (
    <View style={styles.header}>
      <Text style={styles.stat}>Act {Math.min(run.act + 1, ACTS)}/{ACTS}</Text>
      <Text style={styles.stat}>💰 {run.gold}</Text>
      <Text style={styles.stat}>⚑ {run.armyPoints} AP</Text>
      <Text style={styles.stat}>♟ {run.roster.length}</Text>
    </View>
  );
}

function EndOfRun({ run }: { run: RunState }) {
  const { abandonRun } = useRun();
  const won = run.status === 'won';
  return (
    <ScrollView style={{ backgroundColor: COLORS.background }} contentContainerStyle={styles.endScreen}>
      <Text style={[text.title, { color: won ? COLORS.gold : COLORS.danger }]}>{won ? 'Victory!' : 'Your King has fallen'}</Text>
      {run.lastResult && (
        <Text style={[text.body, { textAlign: 'center' }]}>
          {run.lastResult.battle}: {resultText(run.lastResult.result)}
        </Text>
      )}
      <Panel>
        <Text style={text.heading}>RUN SUMMARY</Text>
        <Text style={[text.body, { marginTop: 6 }]}>Reached act {Math.min(run.act + 1, ACTS)} of {ACTS}.</Text>
        <Text style={text.body}>Nodes cleared: {run.visited.length}.</Text>
        <Text style={text.body}>Survivors: {run.roster.length}. Fallen: {run.fallen.length}.</Text>
        {run.roster.length > 0 && (
          <Text style={[text.dim, { marginTop: 6 }]}>
            Veterans:{' '}
            {[...run.roster]
              .sort((a, b) => b.battles - a.battles)
              .slice(0, 5)
              .map((r) => `${PIECE_STATS[r.type].name} (${r.battles}★)`)
              .join(', ')}
          </Text>
        )}
      </Panel>
      <Button
        label="Back to menu"
        primary
        onPress={() => {
          abandonRun();
          router.replace('/');
        }}
      />
    </ScrollView>
  );
}

function MapView({ run }: { run: RunState }) {
  const { update } = useRun();
  const { width } = useWindowDimensions();
  const scroll = useRef<ScrollViewInstance>(null);
  const [chosen, setChosen] = useState<string | null>(null);

  if (run.status !== 'active') return <EndOfRun run={run} />;

  const map = currentMap(run);
  const reachable = new Set(availableNodes(run).map((n) => n.id));
  const visited = new Set(run.visited);
  const mapW = Math.min(width - 32, 520);
  const floors = map.floors.length;
  const height = floors * FLOOR_H + 20;
  // Floor 0 at the bottom, boss at the top.
  const pos = (n: MapNode) => ({ x: n.x * (mapW - NODE) + NODE / 2, y: (floors - 1 - n.floor) * FLOOR_H + NODE / 2 + 10 });

  const lines: ReactElement[] = [];
  for (const row of map.floors)
    for (const n of row)
      for (const id of n.next) {
        const to = map.floors[n.floor + 1].find((m) => m.id === id)!;
        const a = pos(n);
        const b = pos(to);
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        const travelled = visited.has(n.id) && visited.has(to.id);
        const open = n.id === run.nodeId && reachable.has(to.id);
        lines.push(
          <View
            key={`${n.id}-${id}`}
            style={{
              position: 'absolute',
              left: (a.x + b.x) / 2 - len / 2,
              top: (a.y + b.y) / 2 - 1.5,
              width: len,
              height: 3,
              borderRadius: 2,
              backgroundColor: travelled ? COLORS.gold : open ? 'rgba(217,164,65,0.6)' : 'rgba(168,151,127,0.25)',
              transform: [{ rotate: `${angle}rad` }],
            }}
          />,
        );
      }

  const chosenNode = chosen ? map.floors.flat().find((n) => n.id === chosen) : undefined;

  return (
    <View style={styles.screen}>
      <RunHeader run={run} />
      <ScrollView
        ref={scroll}
        style={{ flex: 1, alignSelf: 'stretch' }}
        contentContainerStyle={{ alignItems: 'center', paddingVertical: 8 }}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
      >
        <View style={{ width: mapW, height }}>
          {lines}
          {map.floors.flat().map((n) => {
            const p = pos(n);
            const isReachable = reachable.has(n.id);
            const isHere = n.id === run.nodeId;
            const done = visited.has(n.id);
            const boss = n.type === 'boss';
            const size = boss ? NODE + 14 : NODE;
            return (
              <Pressable
                key={n.id}
                disabled={!isReachable}
                onPress={() => setChosen(n.id)}
                style={[
                  styles.node,
                  {
                    left: p.x - size / 2,
                    top: p.y - size / 2,
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                  },
                  done && styles.nodeDone,
                  isReachable && styles.nodeReachable,
                  isHere && styles.nodeHere,
                  chosen === n.id && styles.nodeChosen,
                  !isReachable && !done && { opacity: 0.55 },
                ]}
              >
                <Text style={{ fontSize: boss ? 28 : 22 }}>{NODE_INFO[n.type].icon}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <Panel style={styles.footer}>
        {chosenNode && reachable.has(chosenNode.id) ? (
          <>
            <Text style={text.heading}>
              {chosenNode.boss ? `BOSS: ${PIECE_STATS[chosenNode.boss].name.toUpperCase()}` : NODE_INFO[chosenNode.type].label.toUpperCase()}
            </Text>
            <Text style={[text.body, { marginVertical: 6 }]}>
              {chosenNode.boss ? PIECE_STATS[chosenNode.boss].blurb : NODE_INFO[chosenNode.type].blurb}
            </Text>
            <Button
              label="Go"
              primary
              onPress={() => {
                setChosen(null);
                update((r) => enterNode(r, chosenNode.id));
              }}
            />
          </>
        ) : (
          <Text style={[text.dim, { textAlign: 'center' }]}>
            Tap a glowing node to choose your path. ⚔️ battle · 💀 elite · 🛡️ recruit · 🛒 shop · ❓ event · 💰 treasure · 👑 boss
          </Text>
        )}
        <View style={styles.footerButtons}>
          <Button small label="Army" onPress={() => router.push('/army')} />
          <Button small label="‹ Menu" onPress={() => router.replace('/')} />
        </View>
      </Panel>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background, alignItems: 'center', paddingTop: 8 },
  header: { flexDirection: 'row', gap: 16, paddingVertical: 6 },
  stat: { color: COLORS.gold, fontWeight: '700', fontSize: 14 },
  node: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.panel,
    borderWidth: 2,
    borderColor: COLORS.panelBorder,
  },
  nodeDone: { backgroundColor: '#3a3024', borderColor: COLORS.gold, opacity: 0.8 },
  nodeReachable: { borderColor: COLORS.gold, borderWidth: 3, backgroundColor: '#3a2f20' },
  nodeHere: { borderColor: '#f1e6d2', borderWidth: 3 },
  nodeChosen: { backgroundColor: COLORS.gold },
  footer: { alignSelf: 'stretch', margin: 10, gap: 4 },
  footerButtons: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 6 },
  endScreen: { padding: 20, gap: 14, maxWidth: 560, width: '100%', alignSelf: 'center' },
});
