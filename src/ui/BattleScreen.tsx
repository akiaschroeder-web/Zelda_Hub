import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { chooseMove } from '../engine/ai';
import { ENCOUNTERS } from '../engine/encounters';
import { applyMove, findKing, inCheck, legalMoves } from '../engine/moves';
import { createEncounter } from '../engine/setup';
import { Coord, GameResult, GameState, Move, PromotionType, Terrain, sameCoord } from '../engine/types';
import { PIECE_IMAGES } from './pieceImages';
import { COLORS } from './theme';

const AI_DELAY_MS = 350;

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
  const [pendingPromotion, setPendingPromotion] = useState<Move[] | null>(null);

  const encounter = ENCOUNTERS[encounterIdx];
  const over = state.result.kind !== 'ongoing';

  const start = useCallback((idx: number) => {
    setEncounterIdx(idx);
    setState(createEncounter(ENCOUNTERS[idx]));
    setSelected(null);
    setLastMove(null);
    setPendingPromotion(null);
  }, []);

  // Enemy turn
  useEffect(() => {
    if (state.turn !== 'enemy' || over) return;
    const t = setTimeout(() => {
      const m = chooseMove(state, 2);
      if (m) {
        setState(applyMove(state, m));
        setLastMove(m);
      }
    }, AI_DELAY_MS);
    return () => clearTimeout(t);
  }, [state, over]);

  const playerMoves = useMemo(
    () => (state.turn === 'player' && !over ? legalMoves(state) : []),
    [state, over],
  );
  const selectedMoves = useMemo(
    () => (selected ? playerMoves.filter((m) => m.pieceId === selected) : []),
    [selected, playerMoves],
  );

  const commit = (m: Move) => {
    setState(applyMove(state, m));
    setLastMove(m);
    setSelected(null);
    setPendingPromotion(null);
  };

  const onSquare = (c: Coord) => {
    if (state.turn !== 'player' || over || pendingPromotion) return;
    const targets = selectedMoves.filter((m) => sameCoord(m.to, c));
    if (targets.length > 0) {
      if (targets.length > 1 && targets.every((m) => m.promotion)) setPendingPromotion(targets);
      else commit(targets[0]);
      return;
    }
    const piece = state.pieces.find((p) => sameCoord(p.pos, c));
    setSelected(piece && piece.side === 'player' && piece.id !== selected ? piece.id : null);
  };

  // Layout
  const { width: bw, height: bh } = state.board;
  const maxBoardW = Math.min(width - 24, 560);
  const maxBoardH = height - 280;
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

  const rows = [];
  for (let y = 0; y < bh; y++) {
    const squares = [];
    for (let x = 0; x < bw; x++) {
      const c = { x, y };
      const terrain = state.board.terrain[y][x];
      const piece = state.pieces.find((p) => p.pos.x === x && p.pos.y === y);
      const move = selectedMoves.find((m) => sameCoord(m.to, c));
      const isSel = !!piece && piece.id === selected;
      const isLast = !!lastMove && (sameCoord(lastMove.from, c) || sameCoord(lastMove.to, c));
      const isPromo = state.board.promotionSquares?.some((s) => sameCoord(s.pos, c));
      squares.push(
        <Pressable key={x} onPress={() => onSquare(c)} style={{ width: cell, height: cell }}>
          <Square terrain={terrain} light={(x + y) % 2 === 0} size={cell} />
          {isPromo && <View style={[StyleSheet.absoluteFill, styles.promoSquare]} />}
          {isLast && <View style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.lastMove }]} />}
          {isSel && <View style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.selected }]} />}
          {checkedKing && piece?.id === checkedKing.id && (
            <View style={[StyleSheet.absoluteFill, styles.checkGlow]} />
          )}
          {piece && (
            <Image source={PIECE_IMAGES[piece.side][piece.type]} style={styles.pieceImg} resizeMode="contain" />
          )}
          {move &&
            (move.captureId ? (
              <View style={[StyleSheet.absoluteFill, styles.captureRing, { borderRadius: cell / 2 }]} />
            ) : (
              <View style={styles.dotWrap} pointerEvents="none">
                <View style={[styles.dot, { width: cell * 0.3, height: cell * 0.3, borderRadius: cell * 0.15 }]} />
              </View>
            ))}
        </Pressable>,
      );
    }
    rows.push(
      <View key={y} style={styles.row}>
        {squares}
      </View>,
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>{encounter.name}</Text>
        <Text style={styles.tag}>{state.rules.checkRules ? 'ROYAL DUEL · CHECK RULES' : 'EXTERMINATION · NO CHECK'}</Text>
        <Text style={styles.desc}>{encounter.description}</Text>
      </View>

      <Text style={[styles.status, (checkedKing || over) && { color: over ? COLORS.gold : COLORS.danger }]}>{status}</Text>

      <View style={styles.boardFrame}>{rows}</View>

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
  captured: { color: COLORS.textDim, fontSize: 13, marginTop: 8 },
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
