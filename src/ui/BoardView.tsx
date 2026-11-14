import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { sizeOf } from '../engine/pieces';
import { Board, Coord, Piece, Terrain, coordKey, sameCoord, shieldTotal } from '../engine/types';
import { PIECE_IMAGES } from './pieceImages';
import { COLORS } from './theme';

export interface Marker {
  /** dot = quiet move, ring = attack or special action. */
  kind: 'dot' | 'ring';
  color?: string;
  /** Draw a square ring instead of a round one (walls). */
  square?: boolean;
  /** Draw crosshairs (ranged shots). */
  crosshair?: boolean;
  /** Tint the inside of the ring. */
  fill?: string;
}

interface Props {
  board: Board;
  pieces: Piece[];
  cell: number;
  /** Background tints per square, drawn under the pieces in order. */
  tints?: Map<string, string[]>;
  markers?: Map<string, Marker>;
  /** Square-shaped outline tints, e.g. deployment zone. */
  outlines?: Map<string, string>;
  onSquare?: (c: Coord) => void;
}

/** Draws terrain, pieces (any size), HP pips, shields and move markers. */
export default function BoardView({ board, pieces, cell, tints, markers, outlines, onSquare }: Props) {
  const rows = [];
  for (let y = 0; y < board.height; y++) {
    const squares = [];
    for (let x = 0; x < board.width; x++) {
      const c = { x, y };
      const k = coordKey(c);
      const isPromo = board.promotionSquares?.some((s) => sameCoord(s.pos, c));
      squares.push(
        <Pressable key={x} onPress={() => onSquare?.(c)} style={{ width: cell, height: cell }}>
          <Square terrain={board.terrain[y][x]} light={(x + y) % 2 === 0} size={cell} />
          {isPromo && <View style={[StyleSheet.absoluteFill, styles.promoSquare]} />}
          {outlines?.get(k) && (
            <View style={[StyleSheet.absoluteFill, { borderWidth: 2, borderColor: outlines.get(k) }]} />
          )}
          {tints?.get(k)?.map((color, i) => (
            <View key={i} style={[StyleSheet.absoluteFill, { backgroundColor: color }]} />
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

  const pieceLayer = pieces.map((p) => {
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
        {shieldTotal(p) > 0 && (
          <View style={styles.shieldBadge}>
            <Text style={styles.shieldText}>{shieldTotal(p)}</Text>
          </View>
        )}
        {p.statuses.length > 0 && (
          <View style={styles.statusDot}>
            <Text style={styles.statusText}>{p.statuses.length}</Text>
          </View>
        )}
        {p.temp && <View style={[StyleSheet.absoluteFill, styles.tempRing]} />}
      </View>
    );
  });

  const markerLayer = [...(markers ?? new Map<string, Marker>()).entries()].map(([k, m]) => {
    const [x, y] = k.split(',').map(Number);
    return (
      <View
        key={k}
        pointerEvents="none"
        style={{ position: 'absolute', left: x * cell, top: y * cell, width: cell, height: cell }}
      >
        {m.kind === 'ring' ? (
          <View
            style={[
              StyleSheet.absoluteFill,
              styles.ring,
              { borderRadius: m.square ? 4 : cell / 2, borderColor: m.color ?? COLORS.moveDot },
              m.fill ? { backgroundColor: m.fill } : null,
            ]}
          />
        ) : (
          <View style={styles.dotWrap}>
            <View
              style={[
                styles.dot,
                { width: cell * 0.3, height: cell * 0.3, borderRadius: cell * 0.15 },
                m.color ? { backgroundColor: m.color } : null,
              ]}
            />
          </View>
        )}
        {m.crosshair && <View style={[styles.crossH, { width: cell * 0.5, backgroundColor: m.color }]} />}
        {m.crosshair && <View style={[styles.crossV, { height: cell * 0.5, backgroundColor: m.color }]} />}
      </View>
    );
  });

  return (
    <View style={styles.frame}>
      {rows}
      {pieceLayer}
      {markerLayer}
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
            <View
              style={[styles.crack, { width: size * 0.4, transform: [{ rotate: '-50deg' }, { translateX: size * 0.1 }] }]}
            />
          </>
        )}
      </View>
    );
  }
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: light ? COLORS.squareLight : COLORS.squareDark }]} />;
}

const styles = StyleSheet.create({
  frame: {
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
  ring: { borderWidth: 4, borderColor: COLORS.moveDot },
  promoSquare: { borderWidth: 2, borderColor: COLORS.gold, borderStyle: 'dashed' },
  wall: { borderColor: COLORS.wallEdge, alignItems: 'center', justifyContent: 'center' },
  crack: { position: 'absolute', height: 2, backgroundColor: COLORS.wallEdge },
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
  statusDot: {
    position: 'absolute',
    top: 1,
    left: 1,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#9b59b6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: { color: 'white', fontSize: 9, fontWeight: '700' },
  tempRing: { borderWidth: 1, borderColor: 'rgba(170, 220, 255, 0.8)', borderStyle: 'dashed', borderRadius: 999 },
  crossH: { position: 'absolute', left: '25%', top: '50%', height: 2, marginTop: -1 },
  crossV: { position: 'absolute', top: '25%', left: '50%', width: 2, marginLeft: -1 },
});
