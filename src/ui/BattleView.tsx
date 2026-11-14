import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { chooseMove } from '../engine/ai';
import { occupancy } from '../engine/board';
import { actionLabel, describeMove } from '../engine/describe';
import { UPGRADE_BY_ID } from '../engine/upgrades/catalog';
import { applyMove, distance, findKing, inCheck, legalMoves } from '../engine/moves';
import { PIECE_STATS, footprint, sizeOf } from '../engine/pieces';
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
  coordKey,
  sameCoord,
  shieldTotal,
} from '../engine/types';
import BoardView, { Marker } from './BoardView';
import { Button, Dialog } from './common';
import { PIECE_IMAGES } from './pieceImages';
import { COLORS } from './theme';

const AI_DELAY_MS = 350;
const AI_DEPTH = 2;

export const ACTION_COLORS: Record<ActionKind, string> = {
  shoot: 'rgba(214, 60, 60, 0.95)',
  demolish: 'rgba(230, 140, 40, 0.95)',
  teleport: 'rgba(150, 90, 220, 0.95)',
  swap: 'rgba(70, 140, 230, 0.95)',
  heal: 'rgba(80, 190, 100, 0.95)',
  pull: 'rgba(200, 80, 160, 0.95)',
  shove: 'rgba(230, 110, 60, 0.95)',
  overwatch: 'rgba(90, 200, 220, 0.95)',
  bridge: 'rgba(170, 130, 80, 0.95)',
  divide: 'rgba(150, 90, 220, 0.95)',
  bind: 'rgba(120, 120, 220, 0.95)',
  construct: 'rgba(170, 130, 80, 0.95)',
  repair: 'rgba(80, 190, 100, 0.95)',
  shadowStep: 'rgba(110, 60, 160, 0.95)',
  mirage: 'rgba(150, 90, 220, 0.95)',
  misdirection: 'rgba(70, 140, 230, 0.95)',
  summonPawn: 'rgba(90, 200, 220, 0.95)',
  summonKnight: 'rgba(90, 200, 220, 0.95)',
  convert: 'rgba(200, 80, 160, 0.95)',
  displace: 'rgba(70, 140, 230, 0.95)',
  repulse: 'rgba(230, 110, 60, 0.95)',
  prophecy: 'rgba(240, 220, 120, 0.95)',
  replicate: 'rgba(150, 90, 220, 0.95)',
  detonate: 'rgba(214, 60, 60, 0.95)',
  soulHeal: 'rgba(80, 190, 100, 0.95)',
  soulPower: 'rgba(214, 60, 60, 0.95)',
  royalCommand: 'rgba(240, 200, 80, 0.95)',
  chainLightning: 'rgba(90, 160, 255, 0.95)',
  earthquake: 'rgba(230, 110, 60, 0.95)',
  rupture: 'rgba(80, 40, 30, 0.95)',
  rewind: 'rgba(150, 90, 220, 0.95)',
  accelerate: 'rgba(240, 200, 80, 0.95)',
  upgrade: 'rgba(230, 200, 60, 0.95)',
  pass: 'rgba(160, 160, 160, 0.95)',
};

const ABILITY_LABELS: Partial<Record<PieceType, { id?: AbilityId; label: string }>> = {
  archer: { label: 'Shoot (red)' },
  guardian: { id: 'intercept', label: 'Intercept' },
  siege: { label: 'Demolish (orange)' },
  mage: { id: 'teleport', label: 'Teleport (purple)' },
  switcher: { id: 'swap', label: 'Swap (blue)' },
  medic: { label: 'Heal (green)' },
  magnet: { label: 'Attraction (pink)' },
  pusher: { label: 'Shove (orange)' },
  sentinel: { label: 'Overwatch (cyan): tap a square to watch that line' },
  pathfinder: { id: 'bridge', label: 'Bridge (brown)' },
  splitter: { id: 'divide', label: 'Division (purple)' },
  jailer: { label: 'Bind (blue)' },
  phoenix: { id: 'rebirth', label: 'Rebirth' },
  bastion: { label: 'Fortify (passive)' },
  anchor: { label: 'Stabilize (passive)' },
  reaper: { label: 'Cleave (passive)' },
  engineer: { id: 'repair', label: 'Construct (brown, every 3 turns), Demolish (orange), Repair (green)' },
  assassin: { label: 'Backstab (passive), Shadow Step (every 4 turns), Execution (bonus move)' },
  illusionist: { id: 'misdirection', label: 'Mirage (every 4 turns), Misdirection' },
  summoner: { id: 'summonKnight', label: 'Summon Pawn (every 3 turns), Summon Knight' },
  converter: { id: 'convert', label: 'Conversion' },
  displacer: { id: 'repulse', label: 'Displacement (every 3 turns), Repulsion' },
  oracle: { label: 'Foresight, Revelation (passive), Prophecy (every 4 turns)' },
  clone: { id: 'replicate', label: 'Replication' },
  bomber: { label: 'Detonate (red)' },
  slayer: { label: 'Giant Killer, Relentless, Bloodlust (passive)' },
  warden: { id: 'warden_intercept', label: 'Defensive Aura, Immovable, Intercept' },
  harvester: { label: 'Soul Harvest — spend Souls to heal (2) or empower (3)' },
};

const STATUS_NAMES: Partial<Record<string, string>> = {
  bound: 'Bound',
  stunned: 'Stunned',
  silenced: 'Silenced',
  slowed: 'Slowed',
  disarmed: 'Disarmed',
  pacified: 'Pacified',
  blinded: 'Blinded',
  crippled: 'Crippled',
  rooted: 'Rooted',
  confused: 'Confused',
  cursed: 'Cursed',
  marked: 'Marked',
  permMarked: 'Marked (permanent)',
  vulnerable: 'Vulnerable',
  prey: 'Prey',
  weakened: 'Weakened',
  rangeBuff: '+Range',
  damageBuff: '+Damage',
  immune: 'Immune',
  springLoaded: 'Spring Loaded',
  fortified: 'Fortified',
  prophecy: 'Protected by prophecy',
};

export function describePiece(p: Piece): { title: string; text: string; upgrades: string } {
  const stats = PIECE_STATS[p.type];
  const sh = shieldTotal(p);
  const shields = sh ? ` · ${sh} shield${sh > 1 ? 's' : ''}` : '';
  const ability = ABILITY_LABELS[p.type];
  const abilityText = ability
    ? ` ${ability.label}${ability.id ? (p.used.includes(ability.id) ? ': used' : ': ready') : ''}.`
    : '';
  const statuses = p.statuses.map((st) => STATUS_NAMES[st.kind] ?? st.kind);
  const ups = p.upgrades.map((u) => `${UPGRADE_BY_ID[u]?.name ?? u}${p.used.includes(u) ? ' (used)' : ''}`);
  return {
    title: `${p.clonedFrom ? `Clone as ${stats.name}` : stats.name}${p.temp ? (p.temp.kind === 'converted' ? ' (converted)' : ' (summoned)') : ''} · ${p.hp}/${p.maxHp} HP${shields}${statuses.length ? ` · ${statuses.join(', ')}` : ''}${p.counters.souls ? ` · ${p.counters.souls} Souls` : ''}`,
    text: stats.blurb + abilityText,
    upgrades: ups.length ? `Upgrades: ${ups.join(', ')}. Gold rings mark upgrade actions; tap the piece again for actions on itself.` : '',
  };
}

export function resultText(r: GameResult): string {
  switch (r.kind) {
    case 'checkmate':
      return r.winner === 'player' ? 'Checkmate — victory!' : 'Checkmated — your King has fallen.';
    case 'kingCaptured':
      return r.winner === 'player' ? 'Enemy King captured — victory!' : 'Your King has fallen.';
    case 'eliminated':
      return 'Enemy army eliminated — victory!';
    case 'bossDefeated':
      return r.winner === 'player' ? 'The boss has fallen — victory!' : 'Your army was overwhelmed.';
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

const hexWithAlpha = (rgba: string, a: number) => rgba.replace(/[\d.]+\)$/, `${a})`);

interface Props {
  state: GameState;
  /** Called with the new state after every move (player or AI). */
  onMove: (next: GameState) => void;
  title: string;
  description?: string;
  /** Shown on the end-of-battle dialog. */
  finishLabel: string;
  onFinish: (final: GameState) => void;
  /** Extra controls under the board. */
  footer?: ReactNode;
}

/** Give each battle its own React `key` so a restart starts with clean UI state. */
export default function BattleView({ state, onMove, title, description, finishLabel, onFinish, footer }: Props) {
  const { width, height } = useWindowDimensions();
  const [selected, setSelected] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<Move | null>(null);
  const [log, setLog] = useState('');
  const [pendingPromotion, setPendingPromotion] = useState<Move[] | null>(null);
  const [chooser, setChooser] = useState<Move[] | null>(null);
  const over = state.result.kind !== 'ongoing';
  const bonus = state.turn === 'player' ? state.bonus[0] : undefined;

  const play = (before: GameState, m: Move) => {
    const after = applyMove(before, m);
    setLastMove(m);
    setLog(describeMove(before, m, after));
    onMove(after);
  };

  // Enemy turn
  useEffect(() => {
    if (state.turn !== 'enemy' || over) return;
    const t = setTimeout(() => {
      const m = chooseMove(state, AI_DEPTH);
      if (m) play(state, m);
    }, AI_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, over]);

  const occ = useMemo(() => occupancy(state.pieces), [state]);

  // Revelation: enemy illusions look like Illusionists unless one of your Oracles is within 3 squares.
  const displayPieces = useMemo(() => {
    const oracles = state.pieces.filter((p) => p.side === 'player' && p.type === 'oracle');
    return state.pieces.map((p) =>
      p.side === 'enemy' && p.type === 'illusion' && !oracles.some((o) => distance(o.pos, p.pos) <= 3)
        ? { ...p, type: 'illusionist' as const, temp: undefined }
        : p,
    );
  }, [state]);

  // Foresight: with an Oracle on the field, show the move the enemy currently rates best.
  const foresight = useMemo(() => {
    if (over || state.turn !== 'player' || state.bonus.length) return null;
    if (!state.pieces.some((p) => p.side === 'player' && p.type === 'oracle')) return null;
    return chooseMove({ ...state, turn: 'enemy', bonus: [] }, 1, () => 0);
  }, [state, over]);
  const playerMoves = useMemo(() => (state.turn === 'player' && !over ? legalMoves(state) : []), [state, over]);
  const passMove = playerMoves.find((m) => m.action === 'pass');
  // A bonus move for one specific piece selects it automatically.
  const effectiveSelected = bonus?.pieceId && state.pieces.some((p) => p.id === bonus.pieceId) ? bonus.pieceId : selected;
  const selectedPiece = effectiveSelected ? state.pieces.find((p) => p.id === effectiveSelected) : undefined;
  const selectedMoves = useMemo(
    () => (effectiveSelected ? playerMoves.filter((m) => m.pieceId === effectiveSelected && m.action !== 'pass') : []),
    [effectiveSelected, playerMoves],
  );

  // The square(s) you tap to make each move. For a large piece these are the
  // leading-edge squares its footprint would newly cover.
  const options = useMemo(() => {
    const map = new Map<string, Move[]>();
    if (!selectedPiece) return map;
    const own = footprint(selectedPiece);
    for (const m of selectedMoves) {
      const cells =
        sizeOf(selectedPiece) > 1 && !m.action
          ? footprint(selectedPiece, m.to).filter((c) => !own.some((o) => sameCoord(o, c)))
          : [m.to];
      for (const c of cells) {
        const k = coordKey(c);
        map.set(k, [...(map.get(k) ?? []), m]);
      }
    }
    return map;
  }, [selectedPiece, selectedMoves]);

  const markers = useMemo(() => {
    const out = new Map<string, Marker>();
    for (const [k, ms] of options) {
      const m = ms.find((o) => !o.action) ?? ms[0];
      if (m.action) {
        const color = ACTION_COLORS[m.action];
        out.set(k, {
          kind: 'ring',
          color,
          fill: hexWithAlpha(color, 0.18),
          square: m.action === 'demolish',
          crosshair: m.action === 'shoot',
        });
      } else out.set(k, { kind: (m.targets?.length ?? 0) > 0 ? 'ring' : 'dot' });
    }
    return out;
  }, [options]);

  const commit = (m: Move) => {
    play(state, m);
    setSelected(null);
    setPendingPromotion(null);
    setChooser(null);
  };

  const onSquare = (c: Coord) => {
    if (state.turn !== 'player' || over || pendingPromotion || chooser) return;
    const opts = options.get(coordKey(c)) ?? [];
    if (opts.length > 0) {
      if (opts.length > 1 && opts.every((m) => m.promotion)) {
        setPendingPromotion(opts);
        return;
      }
      // Several different things can happen here (or it's the piece itself): let the player choose.
      const labels = new Set(opts.filter((m) => !m.promotion).map((m) => actionLabel(state, m)));
      const ownSquare = selectedPiece && footprint(selectedPiece).some((f) => sameCoord(f, c));
      if (labels.size > 1 || ownSquare) setChooser(opts);
      else commit(opts.find((m) => !m.action) ?? opts[0]);
      return;
    }
    const piece = occ.get(coordKey(c));
    if (bonus?.pieceId) return; // the bonus move belongs to one piece
    setSelected(piece && piece.side === 'player' && piece.id !== selected ? piece.id : null);
  };

  // Layout
  const { width: bw, height: bh } = state.board;
  const cell = Math.floor(Math.min(Math.min(width - 24, 560) / bw, (height - 320) / bh));

  const checkedKing =
    !over && state.rules.checkRules && inCheck(state, state.turn) ? findKing(state, state.turn) : undefined;
  const bonusName = bonus && bonus.source !== 'turn' ? (UPGRADE_BY_ID[bonus.source]?.name ?? 'Bonus') : null;
  const status = over
    ? resultText(state.result)
    : state.turn === 'player'
      ? checkedKing
        ? 'Your King is in check!'
        : bonus
          ? bonusName
            ? `Bonus move: ${bonusName}`
            : 'Now make your normal move'
          : 'Your move'
      : 'Enemy is thinking…';

  const tints = new Map<string, string[]>();
  const tint = (c: Coord, color: string) => {
    const k = coordKey(c);
    tints.set(k, [...(tints.get(k) ?? []), color]);
  };
  if (lastMove) {
    const mover = state.pieces.find((p) => p.id === lastMove.pieceId);
    const size = mover && !lastMove.action ? sizeOf(mover) : 1;
    for (const at of [lastMove.from, lastMove.to])
      for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) tint({ x: at.x + dx, y: at.y + dy }, COLORS.lastMove);
    for (const id of lastMove.targets ?? []) {
      const hit = state.pieces.find((p) => p.id === id);
      if (hit) footprint(hit).forEach((c) => tint(c, COLORS.hit));
    }
  }
  if (selectedPiece) footprint(selectedPiece).forEach((c) => tint(c, COLORS.selected));
  if (foresight) {
    tint(foresight.from, 'rgba(160, 80, 220, 0.35)');
    tint(foresight.to, 'rgba(160, 80, 220, 0.5)');
  }
  if (checkedKing) tint(checkedKing.pos, COLORS.check);

  const info = selectedPiece ? describePiece(selectedPiece) : null;
  const lostCount = state.captured.filter((p) => p.side === 'player').length;
  const takenCount = state.captured.filter((p) => p.side === 'enemy').length;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.tag}>{state.rules.checkRules ? 'ROYAL DUEL · CHECK RULES' : 'EXTERMINATION · NO CHECK'}</Text>
        {description ? <Text style={styles.desc}>{description}</Text> : null}
      </View>

      <Text style={[styles.status, (checkedKing || over) && { color: over ? COLORS.gold : COLORS.danger }]}>{status}</Text>

      {foresight && (
        <Text style={styles.foresight}>
          🔮 The Oracle foresees: enemy {PIECE_STATS[displayPieces.find((p) => p.id === foresight.pieceId)?.type ?? 'pawn'].name}
          {' — '}
          {actionLabel(state, foresight)} (purple squares)
        </Text>
      )}

      <BoardView board={state.board} pieces={displayPieces} cell={cell} tints={tints} markers={markers} onSquare={onSquare} />

      {info ? (
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>{info.title}</Text>
          <Text style={styles.infoText}>{info.text}</Text>
          {info.upgrades ? <Text style={styles.infoUpgrades}>{info.upgrades}</Text> : null}
        </View>
      ) : (
        <Text style={styles.log} numberOfLines={2}>
          {log || ' '}
        </Text>
      )}

      <Text style={styles.captured}>
        Lost: {lostCount} · Taken: {takenCount}
      </Text>

      {passMove && !over && (
        <View style={{ marginTop: 8 }}>
          <Button small label="Skip bonus move" onPress={() => commit(passMove)} />
        </View>
      )}

      {footer}

      {chooser && (
        <Dialog title="Choose an action">
          <View style={{ gap: 8, alignSelf: 'stretch' }}>
            {chooser
              .filter((m, i, all) => all.findIndex((o) => actionLabel(state, o) === actionLabel(state, m)) === i)
              .map((m, i) => (
                <Button key={i} label={actionLabel(state, m)} onPress={() => (m.promotion ? setPendingPromotion(chooser.filter((o) => o.promotion)) : commit(m))} />
              ))}
          </View>
          <Pressable
            onPress={() => {
              setChooser(null);
              setSelected(null);
            }}
          >
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        </Dialog>
      )}

      {pendingPromotion && (
        <Dialog title="Promote to">
          <View style={{ flexDirection: 'row' }}>
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
        </Dialog>
      )}

      {over && (
        <Dialog title={resultText(state.result)}>
          {lostCount > 0 && (
            <Text style={styles.cancel}>
              {lostCount} of your piece{lostCount > 1 ? 's were' : ' was'} captured.
            </Text>
          )}
          <Button label={finishLabel} primary onPress={() => onFinish(state)} />
        </Dialog>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background, alignItems: 'center', paddingHorizontal: 12, paddingTop: 12 },
  header: { alignItems: 'center', marginBottom: 8 },
  title: { color: COLORS.text, fontSize: 24, fontWeight: '700', letterSpacing: 0.5 },
  tag: { color: COLORS.gold, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginTop: 2 },
  desc: { color: COLORS.textDim, fontSize: 13, textAlign: 'center', marginTop: 4, maxWidth: 420 },
  status: { color: COLORS.text, fontSize: 16, fontWeight: '600', marginBottom: 8 },
  captured: { color: COLORS.textDim, fontSize: 13, marginTop: 2 },
  log: { color: COLORS.text, fontSize: 13, marginTop: 8, textAlign: 'center', maxWidth: 420, minHeight: 34 },
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
  infoUpgrades: { color: COLORS.gold, fontSize: 12, marginTop: 3 },
  foresight: { color: '#c39bf0', fontSize: 12, marginBottom: 6, textAlign: 'center' },
  promoChoice: { padding: 6, marginHorizontal: 4, borderRadius: 8, backgroundColor: COLORS.squareDark },
  cancel: { color: COLORS.textDim, fontSize: 14, textAlign: 'center' },
});
