import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { chooseMove } from '../engine/ai';
import { occupancy } from '../engine/board';
import { actionLabel, describeMove } from '../engine/describe';
import { UPGRADE_BY_ID } from '../engine/upgrades/catalog';
import { applyMove, distance, findKing, inCheck, legalMoves } from '../engine/moves';
import { PIECE_STATS, footprint, ganonPhase, sizeOf } from '../engine/pieces';
import { attackSquares, twilightCharged } from '../engine/movement';
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
  sacredLight: 'rgba(250, 230, 140, 0.95)',
  darkWarp: 'rgba(120, 40, 60, 0.95)',
  unlock: 'rgba(230, 190, 70, 0.95)',
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
  zelda: { label: 'Sacred Light (pale gold, every 4 turns)' },
  goron: { label: 'Rolling Charge: exact 3-square moves smash cracked walls' },
  redead: { label: 'Paralyzing Scream (passive)' },
  like_like: { label: 'Engulf (passive)' },
  skulltula: { label: 'Wall Crawler (passive)' },
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
  burned: 'Burned',
};

/** Statuses named after what caused them. */
const SOURCE_NAMES: Record<string, string> = {
  scream: 'Paralyzed',
  ice_arrows: 'Frozen',
  slingshot: 'Stunned (slingshot)',
  nayrus_love: "Nayru's Love",
  song_of_storms: 'In the storm',
};

export function describePiece(p: Piece): { title: string; text: string; upgrades: string } {
  const stats = PIECE_STATS[p.type];
  const sh = shieldTotal(p);
  const shields = sh ? ` · ${sh} shield${sh > 1 ? 's' : ''}` : '';
  const ability = ABILITY_LABELS[p.type];
  const abilityText = ability
    ? ` ${ability.label}${ability.id ? (p.used.includes(ability.id) ? ': used' : ': ready') : ''}.`
    : '';
  const statuses = p.statuses.map((st) => (st.source && SOURCE_NAMES[st.source]) || (STATUS_NAMES[st.kind] ?? st.kind));
  const zelda = zeldaNotes(p);
  const ups = p.upgrades.map((u) => `${UPGRADE_BY_ID[u]?.name ?? u}${p.used.includes(u) ? ' (used)' : ''}`);
  return {
    title: `${p.clonedFrom ? `Clone as ${stats.name}` : stats.name}${p.temp ? (p.temp.kind === 'converted' ? ' (converted)' : ' (summoned)') : ''} · ${p.hp}/${p.maxHp} HP${shields}${statuses.length ? ` · ${statuses.join(', ')}` : ''}${p.counters.souls ? ` · ${p.counters.souls} Souls` : ''}`,
    text: stats.blurb + abilityText + zelda,
    upgrades: ups.length ? `Upgrades: ${ups.join(', ')}. Gold rings mark upgrade actions; tap the piece again for actions on itself.` : '',
  };
}

/** Live state of Zelda Pack abilities for the info panel. */
function zeldaNotes(p: Piece): string {
  switch (p.type) {
    case 'link':
      return p.hp === 1 ? " Hero's Courage is active." : '';
    case 'midna':
      return twilightCharged(p) ? ' Twilight Shift is ready this move.' : ` Twilight Shift in ${2 - ((p.counters.moves ?? 0) % 3)} move(s).`;
    case 'zora':
      return p.counters.evadeSpent ? ' Evasion spent (capture to recharge).' : ' Evasion ready.';
    case 'darknut':
      return p.counters.armorBroken ? ' Armor broken: moves up to 3.' : ' Armor intact.';
    case 'zelda':
      return (p.counters.lightCd ?? 0) > 0 ? ` Sacred Light ready in ${p.counters.lightCd} turn(s).` : '';
    case 'ganondorf':
    case 'ganon':
      return [' Phase 1: Gerudo King.', ' Phase 2: Dark Sorcerer.', ' Phase 3: Demon King.'][ganonPhase(p) - 1];
    default:
      return '';
  }
}

/** What a special space does, for the info panel. */
function describeSpace(state: GameState, c: Coord): { title: string; text: string } | null {
  const tile = state.tiles?.find((t) => sameCoord(t.pos, c));
  if (state.board.terrain[c.y]?.[c.x] === 'door')
    return { title: '🔒 Locked Door', text: 'Blocks like a wall. A piece next to it can step in and open it for good by spending one of your Small Keys (find them on the board).' };
  if (!tile) return null;
  switch (tile.kind) {
    case 'key':
      return { title: '🗝️ Small Key', text: 'Move any piece here to pick it up for your side. Each key opens one Locked Door.' };
    case 'switch':
      return { title: '🔄 Rotation Switch', text: 'Landing here turns all the terrain 90° clockwise around the centre. Pieces stay where they are — even if a wall or gap ends up under them, until they move off.' };
    case 'floorMaster':
      return {
        title: '✋ Floor Master',
        text: `A piece landing here is dragged back to the square it started the battle on (Iron Boots resist). Rests 3 turns after grabbing someone.${(tile.readyPly ?? -1) >= state.ply ? ' Resting now.' : ''}`,
      };
    case 'heart':
      return { title: '❤️ Recovery Heart', text: 'The first damaged piece to land here, from either side, heals 1 HP. Pieces at full HP leave it.' };
    case 'warp':
      return { title: `▲ Triforce Warp (${tile.pair === 'V' ? 'teal' : 'gold'})`, text: 'Landing here carries a piece to the other warp of the same colour, if that square is free.' };
  }
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
    case 'forfeit':
      return 'You forfeited the battle.';
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

const ENEMY_MOVE = 'rgba(224, 88, 79, 0.95)';
const ENEMY_THREAT = 'rgba(224, 88, 79, 0.2)';

export interface MenuOption {
  label: string;
  onPress: () => void;
  /** Ask for confirmation with this message first. */
  confirm?: string;
}

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
  /** Entries for the in-battle menu (quit, restart...). */
  menu?: MenuOption[];
}

/** Give each battle its own React `key` so a restart starts with clean UI state. */
export default function BattleView({ state, onMove, title, description, finishLabel, onFinish, footer, menu }: Props) {
  const { width, height } = useWindowDimensions();
  const [selected, setSelected] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<Move | null>(null);
  const [log, setLog] = useState('');
  const [pendingPromotion, setPendingPromotion] = useState<Move[] | null>(null);
  const [chooser, setChooser] = useState<Move[] | null>(null);
  /** A piece being looked at (an enemy, or any piece while it isn't your move). */
  const [inspected, setInspected] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState<MenuOption | null>(null);
  /** A special space being read (tap an empty special square). */
  const [spaceInfo, setSpaceInfo] = useState<{ title: string; text: string } | null>(null);
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
    if (state.turn !== 'enemy' || over || menuOpen) return;
    const t = setTimeout(() => {
      const m = chooseMove(state, AI_DEPTH);
      if (m) play(state, m);
    }, AI_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, over, menuOpen]);

  const occ = useMemo(() => occupancy(state.pieces), [state]);

  // Revelation: enemy illusions look like Illusionists unless one of your Oracles is within 3 squares.
  const displayPieces = useMemo(() => {
    // A Lens of Truth also sees through illusions within 3; the Stone of Agony reveals them for good.
    const seers = state.pieces.filter((p) => p.side === 'player' && (p.type === 'oracle' || p.upgrades.includes('lens_of_truth')));
    return state.pieces.map((p) =>
      p.side === 'enemy' && p.type === 'illusion' && !p.counters.revealed && !seers.some((o) => distance(o.pos, p.pos) <= 3)
        ? { ...p, type: 'illusionist' as const, temp: undefined }
        : p,
    );
  }, [state]);

  // Inspecting a piece: everything it could do if it were its turn, seen as you see it
  // (a disguised illusion shows an Illusionist's moves).
  const inspection = useMemo(() => {
    const shown = inspected ? displayPieces.find((p) => p.id === inspected) : undefined;
    if (!shown) return null;
    const view: GameState = { ...state, pieces: displayPieces, turn: shown.side, bonus: [] };
    const moves = legalMoves(view, shown.side).filter((m) => m.pieceId === shown.id && m.action !== 'pass');
    return { piece: shown, moves, threats: attackSquares(view, shown) };
  }, [inspected, displayPieces, state]);

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
    if (inspection) {
      const p = inspection.piece;
      const enemy = p.side === 'enemy';
      const own = footprint(p);
      for (const m of inspection.moves) {
        const cells = sizeOf(p) > 1 && !m.action ? footprint(p, m.to).filter((c) => !own.some((o) => sameCoord(o, c))) : [m.to];
        for (const c of cells) {
          const k = coordKey(c);
          const prev = out.get(k);
          if (prev && prev.kind === 'ring' && !m.action) continue;
          if (m.action) {
            const color = ACTION_COLORS[m.action];
            out.set(k, { kind: 'ring', color, fill: hexWithAlpha(color, 0.18), square: m.action === 'demolish', crosshair: m.action === 'shoot' });
          } else if ((m.targets?.length ?? 0) > 0) out.set(k, { kind: 'ring', color: enemy ? ENEMY_MOVE : undefined });
          else if (!prev) out.set(k, { kind: 'dot', color: enemy ? ENEMY_MOVE : undefined });
        }
      }
      return out;
    }
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
  }, [options, inspection]);

  const commit = (m: Move) => {
    play(state, m);
    setSelected(null);
    setPendingPromotion(null);
    setChooser(null);
  };

  const onSquare = (c: Coord) => {
    if (pendingPromotion || chooser) return;
    const piece = occ.get(coordKey(c));
    if (spaceInfo) setSpaceInfo(null);
    // Tapping an empty special space (with nothing to do there) explains it.
    const space = !piece && !options.has(coordKey(c)) ? describeSpace(state, c) : null;
    if (space) {
      setInspected(null);
      setSelected(null);
      setSpaceInfo(space);
      return;
    }
    // While looking at a piece, a tap closes the view (or looks at another piece).
    if (inspected) {
      const next = piece && piece.id !== inspected && (piece.side === 'enemy' || state.turn !== 'player' || over) ? piece.id : null;
      setInspected(next);
      return;
    }
    if (state.turn !== 'player' || over) {
      setInspected(piece ? piece.id : null);
      return;
    }
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
    if (piece && piece.side === 'enemy') {
      setInspected(piece.id);
      if (!bonus?.pieceId) setSelected(null);
      return;
    }
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
  if (inspection) {
    footprint(inspection.piece).forEach((c) => tint(c, inspection.piece.side === 'enemy' ? 'rgba(224, 88, 79, 0.45)' : COLORS.selected));
    if (inspection.piece.side === 'enemy') {
      const moveSquares = new Set(markers.keys());
      for (const c of inspection.threats) if (!moveSquares.has(coordKey(c))) tint(c, ENEMY_THREAT);
    }
  } else if (selectedPiece) footprint(selectedPiece).forEach((c) => tint(c, COLORS.selected));
  // Stone of Agony: flag move squares that an enemy hazard (Overwatch, charged ground, the Watcher's gaze) is watching.
  if (selectedPiece?.upgrades.includes('stone_of_agony') && !inspection) {
    const hazards = state.overwatch.filter((o) => o.side !== selectedPiece.side).flatMap((o) => o.cells);
    for (const c of hazards) if (markers.has(coordKey(c))) tint(c, 'rgba(255, 150, 40, 0.55)');
  }
  if (foresight) {
    tint(foresight.from, 'rgba(160, 80, 220, 0.35)');
    tint(foresight.to, 'rgba(160, 80, 220, 0.5)');
  }
  if (checkedKing) tint(checkedKing.pos, COLORS.check);

  const hasKeys = !!state.keys && (state.board.terrain.some((r) => r.includes('door')) || state.keys.player + state.keys.enemy > 0 || state.tiles?.some((t) => t.kind === 'key'));
  const info = spaceInfo ? { title: spaceInfo.title, text: spaceInfo.text, upgrades: '' } : inspection ? describePiece(inspection.piece) : selectedPiece ? describePiece(selectedPiece) : null;
  const inspectHint =
    inspection?.piece.side === 'enemy'
      ? inspection.moves.length || inspection.threats.length
        ? 'Enemy piece. Red dots: where it can move. Rings: what it can attack or do. Red shading: squares it threatens. Tap anywhere to close.'
        : "Enemy piece. It can't move or attack right now. Tap anywhere to close."
      : inspection
        ? 'Tap anywhere to close.'
        : '';
  const lostCount = state.captured.filter((p) => p.side === 'player').length;
  const takenCount = state.captured.filter((p) => p.side === 'enemy').length;

  return (
    <View style={styles.screen}>
      {menu && menu.length > 0 && !over && !menuOpen && (
        <Pressable onPress={() => setMenuOpen(true)} style={styles.menuButton} accessibilityLabel="Battle menu">
          <Text style={styles.menuButtonText}>☰</Text>
        </Pressable>
      )}
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

      <BoardView
        board={state.board}
        pieces={displayPieces}
        cell={cell}
        tints={tints}
        markers={markers}
        onSquare={onSquare}
        tiles={state.tiles}
        rotations={state.rotations}
        ply={state.ply}
      />
      {hasKeys && (
        <Text style={styles.keys}>
          🗝️ Small Keys — you: {state.keys.player} · enemy: {state.keys.enemy}
        </Text>
      )}

      {info ? (
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>{info.title}</Text>
          <Text style={styles.infoText}>{info.text}</Text>
          {info.upgrades && !inspection ? <Text style={styles.infoUpgrades}>{info.upgrades}</Text> : null}
          {inspection && inspection.piece.upgrades.length ? (
            <Text style={styles.infoUpgrades}>
              Upgrades: {inspection.piece.upgrades.map((u) => UPGRADE_BY_ID[u]?.name ?? u).join(', ')}
            </Text>
          ) : null}
          {inspectHint ? <Text style={styles.infoHint}>{inspectHint}</Text> : null}
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

      {menuOpen && !confirming && (
        <Dialog title="Paused">
          <View style={{ gap: 8, alignSelf: 'stretch' }}>
            <Button label="Resume" primary onPress={() => setMenuOpen(false)} />
            {menu?.map((o) => (
              <Button
                key={o.label}
                label={o.label}
                onPress={() => {
                  if (o.confirm) setConfirming(o);
                  else {
                    setMenuOpen(false);
                    o.onPress();
                  }
                }}
              />
            ))}
          </View>
        </Dialog>
      )}

      {confirming && (
        <Dialog title={confirming.label}>
          <Text style={styles.confirmText}>{confirming.confirm}</Text>
          <View style={{ gap: 8, alignSelf: 'stretch' }}>
            <Button
              label={`Yes, ${confirming.label.toLowerCase()}`}
              primary
              onPress={() => {
                const o = confirming;
                setConfirming(null);
                setMenuOpen(false);
                o.onPress();
              }}
            />
            <Button label="Go back" onPress={() => setConfirming(null)} />
          </View>
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
  header: { alignItems: 'center', marginBottom: 8, paddingHorizontal: 44 },
  menuButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 5,
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.panelBorder,
  },
  menuButtonText: { color: COLORS.text, fontSize: 20 },
  confirmText: { color: COLORS.text, fontSize: 14, textAlign: 'center', maxWidth: 300 },
  infoHint: { color: COLORS.textDim, fontSize: 11, marginTop: 3 },
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
  keys: { color: COLORS.gold, fontSize: 13, marginTop: 6 },
  promoChoice: { padding: 6, marginHorizontal: 4, borderRadius: 8, backgroundColor: COLORS.squareDark },
  cancel: { color: COLORS.textDim, fontSize: 14, textAlign: 'center' },
});
