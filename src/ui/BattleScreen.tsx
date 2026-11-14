import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { chooseMove } from '../engine/ai';
import { ENCOUNTERS } from '../engine/encounters';
import { occupancy } from '../engine/board';
import { describeMove } from '../engine/describe';
import { applyMove, findKing, inCheck, legalMoves } from '../engine/moves';
import { PIECE_STATS, footprint, sizeOf } from '../engine/pieces';
import { createEncounter } from '../engine/setup';
import {
  AbilityId,
  ActionKind,
  Coord,
  GameResult,
  GameState,
  Move,
  Piece,
  PieceType,
  PromotionType,
  Terrain,
  coordKey,
  sameCoord,
} from '../engine/types';
import { PIECE_IMAGES } from './pieceImages';
import { COLORS } from './theme';

const AI_DELAY_MS = 350;

const ACTION_COLORS: Record<ActionKind, string> = {
  shoot: 'rgba(214, 60, 60, 0.95)',
  demolish: 'rgba(230, 140, 40, 0.95)',
  teleport: 'rgba(150, 90, 220, 0.95)',
  swap: 'rgba(70, 140, 230, 0.95)',
  heal: 'rgba(80, 190, 100, 0.95)',
};

const ABILITY_LABELS: Partial<Record<PieceType, { id?: AbilityId; label: string }>> = {
  archer: { label: 'Shoot (red)' },
  guardian: { id: 'intercept', label: 'Intercept' },
  siege: { label: 'Demolish (orange)' },
  mage: { id: 'teleport', label: 'Teleport (purple)' },
  switcher: { id: 'swap', label: 'Swap (blue)' },
  medic: { label: 'Heal (green)' },
};

function describePiece(p: Piece): { title: string; text: string } {
  const stats = PIECE_STATS[p.type];
  const shields = p.shields ? ` · ${p.shields} shield${p.shields > 1 ? 's' : ''}` : '';
  const ability = ABILITY_LABELS[p.type];
  const abilityText = ability
    ? ` ${ability.label}${ability.id ? (p.used.includes(ability.id) ? ': used' : ': ready') : ''}.`
    : '';
  return { title: `${stats.name} · ${p.hp}/${p.maxHp} HP${shields}`, text: stats.blurb + abilityText };
}

function resultText(r: GameResult): string {
  switch (r.kind) {
    case 'checkmate':
      return r.winner === 'player' ? 'Checkmate — victory!' : 'Checkmated — the run is over.';
    case 'kingCaptured':
      return r.winner === 'player' ? 'Enemy King captured — victory!' : 'Your King has fallen — the run is over.';
    case 'eliminated':
      return 'Enemy army eliminated — victory!';
    case 'draw':
      return {
        stalemate: 'Stalemate — draw.',
        fiftyMove: 'Fifty-move rule — draw.',
        repetition: 'Threefold repetition — draw.',
        insufficientMaterial: 'Insufficient material — draw.',
      }[r.reason];
    default:
      return '';
  }
}

export default function BattleScreen() {
  const { width, height } = useWindowDimensions();
  const [encounterIdx, setEncounterIdx] = useState(0);
  const [state, setState] = useState<GameState>(() => createEncounter(ENCOUNTERS[0]));
  const [selected, setSelected] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<Move | null>(null);
  const [log, setLog] = useState('');
  const [pendingPromotion, setPendingPromotion] = useState<Move[] | null>(null);

  const encounter = ENCOUNTERS[encounterIdx];
  const over = state.result.kind !== 'ongoing';

  const start = useCallback((idx: number) => {
    setEncounterIdx(idx);
    setState(createEncounter(ENCOUNTERS[idx]));
    setSelected(null);
    setLastMove(null);
    setLog('');
    setPendingPromotion(null);
  }, []);

  const play = useCallback((before: GameState, m: Move) => {
    const after = applyMove(before, m);
    setState(after);
    setLastMove(m);
    setLog(describeMove(before, m, after));
  }, []);

  // Enemy turn
  useEffect(() => {
    if (state.turn !== 'enemy' || over) return;
    const t = setTimeout(() => {
      const m = chooseMove(state, 2);
      if (m) play(state, m);
    }, AI_DELAY_MS);
    return () => clearTimeout(t);
  }, [state, over, play]);

  const occ = useMemo(() => occupancy(state.pieces), [state]);
  const playerMoves = useMemo(
    () => (state.turn === 'player' && !over ? legalMoves(state) : []),
    [state, over],
  );
  const selectedPiece = selected ? state.pieces.find((p) => p.id === selected) : undefined;
  const selectedMoves = useMemo(
    () => (selected ? playerMoves.filter((m) => m.pieceId === selected) : []),
    [selected, playerMoves],
  );
  // The square(s) you tap to make each move. For a large piece these are the
  // leading-edge squares its footprint would newly cover.
  const markers = useMemo(() => {
    const map = new Map<string, Move[]>();
    if (!selectedPiece) return map;
    const own = footprint(selectedPiece);
    for (const m of selectedMoves) {
      const cells =
        sizeOf(selectedPiece) > 1
          ? footprint(selectedPiece, m.to).filter((c) => !own.some((o) => sameCoord(o, c)))
          : [m.to];
      for (const c of cells) {
        const k = coordKey(c);
        map.set(k, [...(map.get(k) ?? []), m]);
      }
    }
    return map;
  }, [selectedPiece, selectedMoves]);

  const commit = (m: Move) => {
    play(state, m);
    setSelected(null);
    setPendingPromotion(null);
  };

  const onSquare = (c: Coord) => {
    if (state.turn !== 'player' || over || pendingPromotion) return;
    const options = markers.get(coordKey(c)) ?? [];
    if (options.length > 0) {
      if (options.length > 1 && options.every((m) => m.promotion)) setPendingPromotion(options);
      else commit(options.find((m) => !m.action) ?? options[0]);
      return;
    }
    const piece = occ.get(coordKey(c));
    setSelected(piece && piece.side === 'player' && piece.id !== selected ? piece.id : null);
  };

  // Layout
  const { width: bw, height: bh } = state.board;
  const maxBoardW = Math.min(width - 24, 560);
  const maxBoardH = height - 300;
  const cell = Math.floor(Math.min(maxBoardW / bw, maxBoardH / bh));

  const checkedKing =
    !over && state.rules.checkRules && inCheck(state, state.turn) ? findKing(state, state.turn) : undefined;

  const status = over
    ? resultText(state.result)
    : state.turn === 'player'
      ? checkedKing
        ? 'Your King is in check!'
        : 'Your move'
      : 'Enemy is thinking…';

  const selectedCells = selectedPiece ? footprint(selectedPiece).map(coordKey) : [];
  const lastCells = new Set<string>();
  if (lastMove) {
    const mover = state.pieces.find((p) => p.id === lastMove.pieceId);
    const size = mover ? sizeOf(mover) : 1;
    for (const at of [lastMove.from, lastMove.to]) {
      for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) lastCells.add(`${at.x + dx},${at.y + dy}`);
    }
  }
  const hitIds = new Set(lastMove?.targets ?? []);

  const rows = [];
  for (let y = 0; y < bh; y++) {
    const squares = [];
    for (let x = 0; x < bw; x++) {
      const c = { x, y };
      const k = coordKey(c);
      const terrain = state.board.terrain[y][x];
      const occupant = occ.get(k);
      const isPromo = state.board.promotionSquares?.some((s) => sameCoord(s.pos, c));
      squares.push(
        <Pressable key={x} onPress={() => onSquare(c)} style={{ width: cell, height: cell }}>
          <Square terrain={terrain} light={(x + y) % 2 === 0} size={cell} />
          {isPromo && <View style={[StyleSheet.absoluteFill, styles.promoSquare]} />}
          {lastCells.has(k) && <View style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.lastMove }]} />}
          {occupant && hitIds.has(occupant.id) && (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.hit }]} />
          )}
          {selectedCells.includes(k) && <View style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.selected }]} />}
          {checkedKing && occupant?.id === checkedKing.id && <View style={[StyleSheet.absoluteFill, styles.checkGlow]} />}
        </Pressable>,
      );
    }
    rows.push(
      <View key={y} style={styles.row}>
        {squares}
      </View>,
    );
  }

  const pieceLayer = state.pieces.map((p) => {
    const size = sizeOf(p) * cell;
    return (
      <View
        key={p.id}
        pointerEvents="none"
        style={{ position: 'absolute', left: p.pos.x * cell, top: p.pos.y * cell, width: size, height: size }}
      >
        <Image source={PIECE_IMAGES[p.side][p.type]} style={styles.pieceImg} resizeMode="contain" />
        {p.maxHp > 1 && (
          <View style={styles.hpRow}>
            {Array.from({ length: p.maxHp }, (_, i) => (
              <View
                key={i}
                style={[
                  styles.hpPip,
                  { width: Math.max(6, cell * 0.16), height: Math.max(6, cell * 0.16) },
                  i < p.hp ? (p.side === 'player' ? styles.hpFullPlayer : styles.hpFullEnemy) : styles.hpEmpty,
                ]}
              />
            ))}
          </View>
        )}
        {p.shields > 0 && (
          <View style={styles.shieldBadge}>
            <Text style={styles.shieldText}>{p.shields}</Text>
          </View>
        )}
      </View>
    );
  });

  const markerLayer = [...markers.entries()].map(([k, ms]) => {
    const [x, y] = k.split(',').map(Number);
    const m = ms.find((o) => !o.action) ?? ms[0];
    const ringColor = m.action ? ACTION_COLORS[m.action] : (m.targets?.length ?? 0) > 0 ? COLORS.moveDot : undefined;
    return (
      <View
        key={k}
        pointerEvents="none"
        style={{ position: 'absolute', left: x * cell, top: y * cell, width: cell, height: cell }}
      >
        {ringColor ? (
          <View
            style={[
              StyleSheet.absoluteFill,
              styles.captureRing,
              { borderRadius: m.action === 'demolish' ? 4 : cell / 2, borderColor: ringColor },
              m.action && { backgroundColor: ringColor.replace(/[\d.]+\)$/, '0.18)') },
            ]}
          />
        ) : (
          <View style={styles.dotWrap}>
            <View style={[styles.dot, { width: cell * 0.3, height: cell * 0.3, borderRadius: cell * 0.15 }]} />
          </View>
        )}
        {m.action === 'shoot' && <View style={[styles.crossH, { width: cell * 0.5 }]} />}
        {m.action === 'shoot' && <View style={[styles.crossV, { height: cell * 0.5 }]} />}
      </View>
    );
  });

  const info = selectedPiece ? describePiece(selectedPiece) : null;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>{encounter.name}</Text>
        <Text style={styles.tag}>{state.rules.checkRules ? 'ROYAL DUEL · CHECK RULES' : 'EXTERMINATION · NO CHECK'}</Text>
        <Text style={styles.desc}>{encounter.description}</Text>
      </View>

      <Text style={[styles.status, (checkedKing || over) && { color: over ? COLORS.gold : COLORS.danger }]}>{status}</Text>

      <View style={styles.boardFrame}>
        {rows}
        {pieceLayer}
        {markerLayer}
      </View>

      {info ? (
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>{info.title}</Text>
          <Text style={styles.infoText}>{info.text}</Text>
        </View>
      ) : (
        <Text style={styles.log} numberOfLines={2}>
          {log || ' '}
        </Text>
      )}

      <Text style={styles.captured}>
        Lost: {state.captured.filter((p) => p.side === 'player').length} · Taken:{' '}
        {state.captured.filter((p) => p.side === 'enemy').length}
      </Text>

      <View style={styles.controls}>
        {ENCOUNTERS.map((e, i) => (
          <Pressable key={e.id} onPress={() => start(i)} style={[styles.btn, i === encounterIdx && styles.btnActive]}>
            <Text style={[styles.btnText, i === encounterIdx && styles.btnTextActive]}>{e.name}</Text>
          </Pressable>
        ))}
      </View>

      {pendingPromotion && (
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Promote to</Text>
            <View style={styles.row}>
              {(['queen', 'rook', 'bishop', 'knight'] as PromotionType[]).map((t) => {
                const m = pendingPromotion.find((pm) => pm.promotion === t)!;
                return (
                  <Pressable key={t} onPress={() => commit(m)} style={styles.promoChoice}>
                    <Image source={PIECE_IMAGES.player[t]} style={{ width: 56, height: 56 }} resizeMode="contain" />
                  </Pressable>
                );
              })}
            </View>
            <Pressable onPress={() => setPendingPromotion(null)}>
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}

      {over && (
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>{resultText(state.result)}</Text>
            <Pressable onPress={() => start(encounterIdx)} style={[styles.btn, styles.btnActive]}>
              <Text style={[styles.btnText, styles.btnTextActive]}>Play again</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

function Square({ terrain, light, size }: { terrain: Terrain; light: boolean; size: number }) {
  if (terrain === 'gap') return <View style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.gap }]} />;
  if (terrain === 'wall' || terrain === 'cracked') {
    const cracked = terrain === 'cracked';
    return (
      <View
        style={[
          StyleSheet.absoluteFill,
          styles.wall,
          { backgroundColor: cracked ? COLORS.cracked : COLORS.wall, borderWidth: Math.max(2, size * 0.06) },
        ]}
      >
        {cracked && (
          <>
            <View style={[styles.crack, { width: size * 0.7, transform: [{ rotate: '35deg' }] }]} />
            <View style={[styles.crack, { width: size * 0.4, transform: [{ rotate: '-50deg' }, { translateX: size * 0.1 }] }]} />
          </>
        )}
      </View>
    );
  }
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: light ? COLORS.squareLight : COLORS.squareDark }]} />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background, alignItems: 'center', paddingHorizontal: 12, paddingTop: 12 },
  header: { alignItems: 'center', marginBottom: 8 },
  title: { color: COLORS.text, fontSize: 26, fontWeight: '700', letterSpacing: 0.5 },
  tag: { color: COLORS.gold, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginTop: 2 },
  desc: { color: COLORS.textDim, fontSize: 13, textAlign: 'center', marginTop: 4, maxWidth: 420 },
  status: { color: COLORS.text, fontSize: 16, fontWeight: '600', marginBottom: 8 },
  boardFrame: {
    borderWidth: 4,
    borderColor: COLORS.panelBorder,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: COLORS.gap,
  },
  row: { flexDirection: 'row' },
  pieceImg: { position: 'absolute', left: '6%', top: '4%', width: '88%', height: '88%' },
  dotWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  dot: { backgroundColor: COLORS.moveDot },
  captureRing: { borderWidth: 4, borderColor: COLORS.moveDot },
  checkGlow: { backgroundColor: COLORS.check, borderRadius: 999 },
  promoSquare: { borderWidth: 2, borderColor: COLORS.gold, borderStyle: 'dashed' },
  wall: { borderColor: COLORS.wallEdge, alignItems: 'center', justifyContent: 'center' },
  crack: { position: 'absolute', height: 2, backgroundColor: COLORS.wallEdge },
  captured: { color: COLORS.textDim, fontSize: 13, marginTop: 2 },
  log: { color: COLORS.text, fontSize: 13, marginTop: 8, textAlign: 'center', maxWidth: 420, minHeight: 34 },
  hpRow: { position: 'absolute', bottom: 1, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 3 },
  hpPip: { borderRadius: 2, borderWidth: 1, borderColor: '#1a1410' },
  hpFullPlayer: { backgroundColor: '#7cc46a' },
  hpFullEnemy: { backgroundColor: '#e0584f' },
  hpEmpty: { backgroundColor: '#3a2f27' },
  shieldBadge: {
    position: 'absolute',
    top: 1,
    right: 1,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#4f8fd6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#d8e8ff',
  },
  shieldText: { color: 'white', fontSize: 10, fontWeight: '700' },
  crossH: { position: 'absolute', left: '25%', top: '50%', height: 2, marginTop: -1, backgroundColor: 'rgba(214, 60, 60, 0.95)' },
  crossV: { position: 'absolute', top: '25%', left: '50%', width: 2, marginLeft: -1, backgroundColor: 'rgba(214, 60, 60, 0.95)' },
  infoBox: {
    marginTop: 8,
    maxWidth: 440,
    minHeight: 34,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.panelBorder,
  },
  infoTitle: { color: COLORS.gold, fontSize: 13, fontWeight: '700' },
  infoText: { color: COLORS.text, fontSize: 12, marginTop: 2 },
  controls: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 12 },
  btn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.panelBorder,
    backgroundColor: COLORS.panel,
  },
  btnActive: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  btnText: { color: COLORS.text, fontWeight: '600' },
  btnTextActive: { color: COLORS.background },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialog: {
    backgroundColor: COLORS.panel,
    borderColor: COLORS.gold,
    borderWidth: 2,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 24,
  },
  dialogTitle: { color: COLORS.text, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  promoChoice: { padding: 6, marginHorizontal: 4, borderRadius: 8, backgroundColor: COLORS.squareDark },
  cancel: { color: COLORS.textDim, fontSize: 14 },
});
