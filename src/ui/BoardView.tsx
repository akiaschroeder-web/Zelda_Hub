import { ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { BOSS_TYPES, footprint, sizeOf } from '../engine/pieces';
import { Board, Coord, Piece, Terrain, Tile, coordKey, sameCoord, shieldTotal } from '../engine/types';
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
  /** Special spaces (Zelda Pack) drawn on top of the terrain. */
  tiles?: Tile[];
  /** Times the terrain has rotated; each increase plays the rotation animation. */
  rotations?: number;
  /** Current ply (to show a resting Floor Master). */
  ply?: number;
  /** Squares holding a collapsed Stalfos. */
  bones?: Coord[];
}

/** How long the terrain takes to swing round when a Rotation Switch fires. */
export const ROTATE_MS = 750;

/** How long a piece takes to slide to its new square. */
export const MOVE_MS = 260;
const FADE_MS = 280;
const nativeDriver = Platform.OS !== 'web';

/** Draws terrain, pieces (any size), HP pips, shields and move markers. */
export default function BoardView({ board, pieces, cell, tints, markers, outlines, onSquare, tiles = board.tiles, rotations = 0, ply = 0, bones }: Props) {
  // Rotation Switch: the new terrain starts drawn a quarter-turn back (so it looks exactly like
  // the old terrain) and swings clockwise into place. Pieces live in another layer and stay still.
  const [spin] = useState(() => new Animated.Value(0));
  const lastRotations = useRef(rotations);
  useEffect(() => {
    const turns = rotations - lastRotations.current;
    lastRotations.current = rotations;
    if (turns <= 0) return;
    spin.setValue(-90 * turns);
    const anim = Animated.sequence([
      Animated.delay(MOVE_MS),
      Animated.timing(spin, { toValue: 0, duration: ROTATE_MS * turns, easing: Easing.inOut(Easing.cubic), useNativeDriver: nativeDriver }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [rotations, spin]);

  const occupied = new Set(pieces.flatMap((p) => footprint(p).map(coordKey)));
  const rows = [];
  const terrainCells = [];
  const tintCells = [];
  for (let y = 0; y < board.height; y++) {
    const squares = [];
    for (let x = 0; x < board.width; x++) {
      const c = { x, y };
      const k = coordKey(c);
      const isPromo = board.promotionSquares?.some((s) => sameCoord(s.pos, c));
      squares.push(
        <Pressable key={x} onPress={() => onSquare?.(c)} style={{ width: cell, height: cell }}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: (x + y) % 2 === 0 ? COLORS.squareLight : COLORS.squareDark }]} />
          {isPromo && <View style={[StyleSheet.absoluteFill, styles.promoSquare]} />}
          {outlines?.get(k) && (
            <View style={[StyleSheet.absoluteFill, { borderWidth: 2, borderColor: outlines.get(k) }]} />
          )}
        </Pressable>,
      );
      const t = board.terrain[y][x];
      const tile = tiles?.find((o) => sameCoord(o.pos, c));
      if (t !== 'normal' || tile)
        terrainCells.push(
          <View key={k} style={{ position: 'absolute', left: x * cell, top: y * cell, width: cell, height: cell }}>
            {t !== 'normal' && <Square terrain={t} size={cell} />}
            {tile && (
              <TileIcon tile={tile} size={cell} resting={tile.kind === 'floorMaster' && (tile.readyPly ?? -1) >= ply} small={occupied.has(k)} />
            )}
          </View>,
        );
      const tint = tints?.get(k);
      if (tint)
        tintCells.push(
          <View key={k} style={{ position: 'absolute', left: x * cell, top: y * cell, width: cell, height: cell }}>
            {tint.map((color, i) => (
              <View key={i} style={[StyleSheet.absoluteFill, { backgroundColor: color }]} />
            ))}
          </View>,
        );
    }
    rows.push(
      <View key={y} style={styles.row}>
        {squares}
      </View>,
    );
  }

  // Pieces that disappeared since the last render fade out where they stood.
  const prevPieces = useRef(pieces);
  const [ghosts, setGhosts] = useState<Piece[]>([]);
  useEffect(() => {
    const ids = new Set(pieces.map((p) => p.id));
    const gone = prevPieces.current.filter((p) => !ids.has(p.id));
    prevPieces.current = pieces;
    if (gone.length) setGhosts((g) => [...g.filter((o) => !gone.some((n) => n.id === o.id)), ...gone]);
  }, [pieces]);

  const pieceLayer = pieces.map((p) => (
    <Sprite key={p.id} pos={p.pos} cell={cell} size={sizeOf(p) * cell}>
      <PieceArt p={p} cell={cell} />
    </Sprite>
  ));
  const ghostLayer = ghosts.map((p) => (
    <Ghost key={`ghost-${p.id}`} p={p} cell={cell} onDone={() => setGhosts((g) => g.filter((o) => o !== p))} />
  ));

  const markerLayer = [...(markers ?? new Map<string, Marker>()).entries()].map(([k, m]) => {
    const [x, y] = k.split(',').map(Number);
    return (
      <View
        key={k}
        pointerEvents="none"
        style={{ position: 'absolute', left: x * cell, top: y * cell, width: cell, height: cell, zIndex: 3 }}
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
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: board.width * cell,
          height: board.height * cell,
          transform: [{ rotate: spin.interpolate({ inputRange: [-360, 0], outputRange: ['-360deg', '0deg'] }) }],
        }}
      >
        {terrainCells}
      </Animated.View>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {tintCells}
        {bones?.map((c) => (
          <View key={`bones-${coordKey(c)}`} style={[styles.tile, { position: 'absolute', left: c.x * cell, top: c.y * cell, width: cell, height: cell }]}>
            <Text style={{ fontSize: cell * 0.5 }}>💀</Text>
          </View>
        ))}
      </View>
      {ghostLayer}
      {pieceLayer}
      {markerLayer}
    </View>
  );
}

/** Slides to its square whenever the position changes; the moving piece draws on top. */
function Sprite({ pos, cell, size, children }: { pos: Coord; cell: number; size: number; children: ReactNode }) {
  const [xy] = useState(() => new Animated.ValueXY({ x: pos.x * cell, y: pos.y * cell }));
  const lastCell = useRef(cell);
  const [moving, setMoving] = useState(false);
  useEffect(() => {
    const target = { x: pos.x * cell, y: pos.y * cell };
    if (lastCell.current !== cell) {
      // The board was resized: jump, don't slide.
      lastCell.current = cell;
      xy.setValue(target);
      return;
    }
    setMoving(true);
    const anim = Animated.timing(xy, {
      toValue: target,
      duration: MOVE_MS,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: nativeDriver,
    });
    anim.start(() => setMoving(false));
    return () => anim.stop();
  }, [pos.x, pos.y, cell, xy]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: size,
        height: size,
        zIndex: moving ? 2 : 1,
        transform: xy.getTranslateTransform(),
      }}
    >
      {children}
    </Animated.View>
  );
}

/** A captured piece: holds still while the attacker arrives, then fades and shrinks away. */
function Ghost({ p, cell, onDone }: { p: Piece; cell: number; onDone: () => void }) {
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const anim = Animated.timing(t, {
      toValue: 1,
      duration: FADE_MS,
      delay: MOVE_MS * 0.6,
      easing: Easing.in(Easing.quad),
      useNativeDriver: nativeDriver,
    });
    anim.start(() => onDone());
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const size = sizeOf(p) * cell;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: p.pos.x * cell,
        top: p.pos.y * cell,
        width: size,
        height: size,
        opacity: t.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
        transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 0.6] }) }],
      }}
    >
      <PieceArt p={p} cell={cell} />
    </Animated.View>
  );
}

function PieceArt({ p, cell }: { p: Piece; cell: number }) {
  const big = sizeOf(p) > 1;
  return (
    <>
      {/* A multi-square piece sits on a plate covering exactly its footprint, so its size is obvious. */}
      {big ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.footprintPlate,
            p.side === 'player' ? styles.platePlayer : styles.plateEnemy,
            BOSS_TYPES.has(p.type) && { borderWidth: 3 },
          ]}
        />
      ) : (
        BOSS_TYPES.has(p.type) && (
          <View style={[StyleSheet.absoluteFill, styles.bossRing, { borderColor: p.side === 'player' ? COLORS.gold : COLORS.danger }]} />
        )
      )}
      <Image source={PIECE_IMAGES[p.side][p.type]} style={big ? styles.pieceImgBig : styles.pieceImg} resizeMode="contain" />
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
    </>
  );
}

const TILE_ICONS: Record<Tile['kind'], string> = { key: '🗝️', switch: '🔄', floorMaster: '✋', heart: '❤️', warp: '▲' };

/** A special space's marker, drawn on its square. */
function TileIcon({ tile, size, resting, small }: { tile: Tile; size: number; resting: boolean; small: boolean }) {
  const warp = tile.kind === 'warp';
  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        styles.tile,
        warp && { backgroundColor: tile.pair === 'V' ? 'rgba(60, 190, 200, 0.28)' : 'rgba(240, 200, 60, 0.28)' },
        // Under a piece the icon shrinks into the bottom-left corner so the piece stays readable.
        small && { alignItems: 'flex-start', justifyContent: 'flex-end', padding: 1 },
      ]}
    >
      <Text
        style={{
          fontSize: size * (small ? 0.24 : warp ? 0.5 : 0.42),
          color: warp ? (tile.pair === 'V' ? '#3cbec8' : '#f0c83c') : undefined,
          opacity: resting ? 0.45 : 0.9,
        }}
      >
        {TILE_ICONS[tile.kind]}
      </Text>
    </View>
  );
}

function Square({ terrain, size }: { terrain: Terrain; size: number }) {
  if (terrain === 'door')
    return (
      <View style={[StyleSheet.absoluteFill, styles.door, { borderWidth: Math.max(2, size * 0.06) }]}>
        <Text style={{ fontSize: size * 0.42 }}>🔒</Text>
      </View>
    );
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
  return null;
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
  door: { backgroundColor: '#6b4a2a', borderColor: '#3a2614', alignItems: 'center', justifyContent: 'center' },
  tile: { alignItems: 'center', justifyContent: 'center' },
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
  bossRing: { borderWidth: 2, borderRadius: 999, margin: 2 },
  footprintPlate: { margin: 3, borderRadius: 10, borderWidth: 2 },
  platePlayer: { backgroundColor: 'rgba(242, 228, 196, 0.22)', borderColor: COLORS.gold },
  plateEnemy: { backgroundColor: 'rgba(200, 40, 56, 0.18)', borderColor: COLORS.danger },
  pieceImgBig: { position: 'absolute', left: '3%', top: '2%', width: '94%', height: '92%' },
  tempRing: { borderWidth: 1, borderColor: 'rgba(170, 220, 255, 0.8)', borderStyle: 'dashed', borderRadius: 999 },
  crossH: { position: 'absolute', left: '25%', top: '50%', height: 2, marginTop: -1 },
  crossV: { position: 'absolute', top: '25%', left: '50%', width: 2, marginLeft: -1 },
});
