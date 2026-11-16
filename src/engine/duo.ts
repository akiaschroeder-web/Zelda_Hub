/**
 * Digital Duo Content Pack: Hatsune Miku and Kasane Teto, plus the Leek,
 * Baguette and Duet Microphone upgrades.
 *
 * Movement lives in movement.ts; Teto's duet damage and the Baguette's bonus
 * live in the attack code in moves.ts.
 */
import { inBounds, terrainAt } from './board';
import { ALL_DIRS, add, addStatus, getPiece, has, heal, log, nameOf, pieceDistance } from './core';
import { Coord, GameState, Move, Piece, endOfTurn } from './types';

/** "Once every N turns" cooldowns, counted in the owner's turns. */
export const DUO_COOLDOWNS = { harmonyCd: 3, leekCd: 3, duet_microphoneCd: 4 } as const;
const ready = (p: Piece, cd: keyof typeof DUO_COOLDOWNS) => (p.counters[cd] ?? 0) <= 0;

/** Friendly pieces of `p` (not `p` itself). */
const friends = (s: GameState, p: Piece) => s.pieces.filter((a) => a.side === p.side && a.id !== p.id);
const hurt = (p: Piece) => p.hp < p.maxHp;

/** The friendly Kasane Teto (or Hatsune Miku) within 3 squares of `p`, if any. */
export const duetPartner = (s: GameState, p: Piece, type: 'miku' | 'teto') =>
  friends(s, p).find((a) => a.type === type && pieceDistance(a, p) <= 3);

/** Teto's Duet Bonus: her first attack of the battle deals 2 while Miku is within 3 squares. */
export const tetoDuetBonus = (s: GameState, p: Piece) => (p.type === 'teto' && p.attacks === 0 && duetPartner(s, p, 'miku') ? 1 : 0);

/** The Baguette: +1 damage on the piece's first attack of the battle. */
export const baguetteBonus = (p: Piece) => (has(p, 'baguette') && p.attacks === 0 ? 1 : 0);

/** Piece abilities: Miku's Digital Harmony and Teto's Drill Break. */
export function duoMoves(s: GameState, p: Piece): Move[] {
  const out: Move[] = [];
  const base = { pieceId: p.id, from: p.pos };
  if (p.type === 'miku' && ready(p, 'harmonyCd'))
    for (const a of friends(s, p).filter((a) => hurt(a) && pieceDistance(a, p) <= 3))
      out.push({ ...base, to: a.pos, action: 'harmony', allyId: a.id });
  if (p.type === 'teto')
    for (const d of ALL_DIRS) {
      const c = add(p.pos, d);
      if (inBounds(s.board, c) && terrainAt(s.board, c) === 'cracked') out.push({ ...base, to: c, action: 'demolish' });
    }
  return out;
}

/** Resolve Digital Harmony; false for any other move. */
export function resolveDuo(s: GameState, m: Move): boolean {
  if (m.action !== 'harmony') return false;
  const p = getPiece(s, m.pieceId)!;
  const ally = getPiece(s, m.allyId);
  p.counters.harmonyCd = DUO_COOLDOWNS.harmonyCd;
  if (ally) heal(s, ally, 1);
  // Duet Bonus: Teto, if near and also hurt, is healed as well.
  const teto = duetPartner(s, p, 'teto');
  if (teto && teto.id !== ally?.id && hurt(teto)) {
    heal(s, teto, 1);
    log(s, 'Duet! Teto is healed too.');
  }
  return true;
}

export const isDuoAction = (id: string) => id === 'leek' || id === 'duet_microphone';

/** The Leek and Duet Microphone actions (each replaces the piece's move). */
export function duoUpgradeActions(s: GameState, p: Piece): Move[] {
  const out: Move[] = [];
  const act = (upgrade: string, to: Coord, allyId: string) =>
    out.push({ pieceId: p.id, from: p.pos, action: 'upgrade', upgrade, to, allyId });
  if (has(p, 'leek') && ready(p, 'leekCd'))
    friends(s, p)
      .filter((a) => hurt(a) && pieceDistance(a, p) === 1)
      .forEach((a) => act('leek', a.pos, a.id));
  if (has(p, 'duet_microphone') && ready(p, 'duet_microphoneCd'))
    friends(s, p)
      .filter((a) => pieceDistance(a, p) <= 2)
      .forEach((a) => act('duet_microphone', a.pos, a.id));
  return out;
}

export function resolveDuoUpgrade(s: GameState, m: Move) {
  const p = getPiece(s, m.pieceId)!;
  const ally = getPiece(s, m.allyId);
  if (m.upgrade === 'leek') {
    p.counters.leekCd = DUO_COOLDOWNS.leekCd;
    if (ally) heal(s, ally, 1);
  } else if (m.upgrade === 'duet_microphone') {
    p.counters.duet_microphoneCd = DUO_COOLDOWNS.duet_microphoneCd;
    for (const q of ally ? [p, ally] : [p]) {
      const until = endOfTurn(s.ply, q.side);
      addStatus(q, { kind: 'rangeBuff', amount: 1, until, source: 'duet_microphone' });
      addStatus(q, { kind: 'damageBuff', amount: 1, until, source: 'duet_microphone' });
    }
    log(s, `${nameOf(p)}${ally ? ` and ${nameOf(ally)}` : ''} are in harmony: +1 range and +1 damage.`);
  }
}
