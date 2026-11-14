import { isStandable, parseBoard } from './board';
import { addStatus, adjacent, freeze, has, newPiece } from './core';
import { evaluateResult, positionKey } from './moves';
import { PIECE_STATS, footprint, sizeOf } from './pieces';
import { Board, EncounterRules, GameState, Piece, PieceType, Side, opponent } from './types';

export interface Placement {
  /** Fixed id (roster pieces keep theirs so casualties can be tracked). */
  id?: string;
  type: PieceType;
  side: Side;
  x: number;
  y: number;
  /** Starting HP if not full (e.g. a wounded roster piece). */
  hp?: number;
  /** Starting shields (each absorbs one damage, lasting). */
  shields?: number;
  upgrades?: string[];
  /** Extra maximum HP from the run (e.g. Living Fortress). */
  bonusMaxHp?: number;
  /** Counters carried in from the run (e.g. Harvester Souls). */
  counters?: Record<string, number>;
}

/** Maximum HP including upgrades that raise it. */
export function maxHpFor(type: PieceType, upgrades: string[] = [], bonus = 0): number {
  let hp = PIECE_STATS[type].maxHp + bonus;
  if (upgrades.includes('reinforced_body')) hp += 1;
  if (upgrades.includes('reinforced_frame') && PIECE_STATS[type].size > 1) hp += 1;
  if (upgrades.includes('colossal_endurance')) hp += 2;
  return hp;
}

/** Shields and marks granted when a battle begins. */
function battleStart(state: GameState) {
  const lasting = (p: Piece, strength = 1) => p.shields.push({ strength, expires: null });
  for (const p of state.pieces) {
    const friends = state.pieces.filter((o) => o.side === p.side && o.id !== p.id);
    if (has(p, 'thick_armor')) lasting(p);
    if (has(p, 'heavy_armor')) {
      lasting(p);
      lasting(p);
    }
    if (has(p, 'wide_shield')) lasting(p, 2);
    if (has(p, 'guardian_aura')) friends.filter((a) => adjacent(a, p)).forEach((a) => lasting(a));
    if (has(p, 'footprint_guard') && sizeOf(p) > 1) friends.filter((a) => adjacent(a, p)).forEach((a) => lasting(a));
    if (has(p, 'kings_shield')) {
      const king = state.pieces.find((o) => o.side === p.side && o.type === 'king');
      if (king) lasting(king);
    }
    if (has(p, 'marked_prey')) {
      // The most valuable enemy (other than the King, if possible) becomes the prey.
      const foes = state.pieces.filter((o) => o.side === opponent(p.side));
      const prey = [...foes].sort(
        (a, b) => Number(a.type === 'king') - Number(b.type === 'king') || PIECE_STATS[b.type].value - PIECE_STATS[a.type].value,
      )[0];
      if (prey) addStatus(prey, { kind: 'prey', until: null, source: p.side });
    }
  }
}

let nextId = 0;

export function createGame(board: Board, placements: Placement[], rules: EncounterRules, runFlags: string[] = []): GameState {
  const pieces: Piece[] = placements.map((p) => {
    const piece = newPiece(p.type, p.side, { x: p.x, y: p.y }, p.id ?? `${p.side[0]}${p.type}${nextId++}`);
    piece.hasMoved = false;
    piece.upgrades = [...(p.upgrades ?? [])];
    piece.maxHp = maxHpFor(p.type, piece.upgrades, p.bonusMaxHp ?? 0);
    piece.hp = Math.min(p.hp ?? piece.maxHp, piece.maxHp);
    for (let i = 0; i < (p.shields ?? 0); i++) piece.shields.push({ strength: 1, expires: null });
    if (p.counters) piece.counters = { ...p.counters };
    return piece;
  });
  // Every square of every footprint must be open terrain and unshared.
  const taken = new Set<string>();
  for (const p of pieces) {
    for (const c of footprint(p)) {
      const k = `${c.x},${c.y}`;
      if (!isStandable(board, c)) throw new Error(`${p.type} placed on blocked square ${k}`);
      if (taken.has(k)) throw new Error(`${p.type} overlaps another piece at ${k}`);
      taken.add(k);
    }
  }
  const state: GameState = {
    board,
    pieces,
    turn: 'player',
    rules,
    enPassant: null,
    halfmoveClock: 0,
    positionHistory: [],
    captured: [],
    result: { kind: 'ongoing' },
    ply: 0,
    timed: [],
    destroyedWalls: [],
    bonus: [],
    snapshot: {},
    zones: [],
    runFlags: [],
    saved: [],
    log: [],
    overwatch: [],
    reborn: [],
  };
  state.runFlags = [...runFlags];
  battleStart(state);
  for (const p of state.pieces) p.turnPos = { ...p.pos };
  freeze(state);
  state.positionHistory = [positionKey(state)];
  state.result = evaluateResult(state);
  return state;
}

/**
 * Parse a piece layout drawn as text, one row per string (top row first).
 * Uppercase = player, lowercase = enemy.
 *   K Q R B N P  traditional pieces
 *   J  Juggernaut (top-left square of its 2x2 footprint; leave the rest '.')
 *   A Archer   G Guardian   L Lancer   S Siege Engine
 *   M Mage     W Switcher   C Chancellor   H Medic (healer)
 *   O Hopper   T Magnet     U Pusher       I Mimic    V Anchor   X Reaper
 *   F Bastion  Z Pathfinder Y Sentinel     D Splitter E Jailer
 *   @ / &  Phoenix (player / enemy) — there are more piece types than letters
 */
export function parsePlacements(rows: string[], legend: Record<string, [PieceType, Side]> = {}): Placement[] {
  const types: Record<string, PieceType> = {
    k: 'king',
    q: 'queen',
    r: 'rook',
    b: 'bishop',
    n: 'knight',
    p: 'pawn',
    j: 'juggernaut',
    a: 'archer',
    g: 'guardian',
    l: 'lancer',
    s: 'siege',
    m: 'mage',
    w: 'switcher',
    c: 'chancellor',
    h: 'medic',
    o: 'hopper',
    t: 'magnet',
    u: 'pusher',
    i: 'mimic',
    v: 'anchor',
    x: 'reaper',
    f: 'bastion',
    z: 'pathfinder',
    y: 'sentinel',
    d: 'splitter',
    e: 'jailer',
  };
  const out: Placement[] = [];
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (legend[ch]) {
        out.push({ type: legend[ch][0], side: legend[ch][1], x, y });
        return;
      }
      if (ch === '@' || ch === '&') {
        out.push({ type: 'phoenix', side: ch === '@' ? 'player' : 'enemy', x, y });
        return;
      }
      const type = types[ch.toLowerCase()];
      if (!type) return;
      out.push({ type, side: ch === ch.toUpperCase() ? 'player' : 'enemy', x, y });
    });
  });
  return out;
}

export interface EncounterDef {
  id: string;
  name: string;
  description: string;
  rules: EncounterRules;
  terrain: string[];
  pieces: string[];
  /** Upgrades by square ("x,y"). */
  upgrades?: Record<string, string[]>;
  /** Extra layout characters for pieces without a letter. */
  legend?: Record<string, [PieceType, Side]>;
}

export function createEncounter(def: EncounterDef): GameState {
  const placements = parsePlacements(def.pieces, def.legend).map((p) => ({ ...p, upgrades: def.upgrades?.[`${p.x},${p.y}`] ?? [] }));
  return createGame(parseBoard(def.terrain), placements, def.rules);
}
