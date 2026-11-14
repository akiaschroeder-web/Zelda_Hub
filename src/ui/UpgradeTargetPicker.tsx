import { StyleSheet, Text, View } from 'react-native';
import { UPGRADE_BY_ID } from '../engine/upgrades/catalog';
import { RosterPiece, upgradeTargets, RunState } from '../run/run';
import PieceTile, { byRank } from './PieceTile';
import { text } from './common';

/** Choose which roster piece receives an upgrade. */
export default function UpgradeTargetPicker({
  run,
  upgradeId,
  selected,
  onSelect,
}: {
  run: RunState;
  upgradeId: string;
  selected: string | null;
  onSelect: (uid: string) => void;
}) {
  const targets = upgradeTargets(run, upgradeId).sort(byRank);
  const u = UPGRADE_BY_ID[upgradeId];
  return (
    <View style={{ gap: 6 }}>
      <Text style={text.heading}>GIVE {u.name.toUpperCase()} TO</Text>
      {targets.length === 0 ? (
        <Text style={text.dim}>None of your pieces can take this upgrade.</Text>
      ) : (
        <View style={styles.grid}>
          {targets.map((r: RosterPiece) => (
            <PieceTile key={r.uid} piece={r} selected={selected === r.uid} onPress={() => onSelect(r.uid)} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
