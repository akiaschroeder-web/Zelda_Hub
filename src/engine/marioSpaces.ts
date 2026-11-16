/**
 * Super Mario Pack special spaces:
 * - ? Block (on a wall square): a piece next to it may hit it instead of
 *   moving for a reward (Coin, Mushroom, Star or Fire Flower), leaving an
 *   Empty Block that still blocks.
 * - Brick Block (on a cracked-wall square): smashing it may pay a coin, and
 *   some hide a Mushroom that heals whoever broke it.
 * - Note Block: landing on it offers a 3-square bounce (no capture).
 * - Lava: 1 damage to a piece that lands there, and again at the end of a
 *   turn it started and ended on lava.
 * - Donut Block (over a gap): shakes when stood on and falls at the end of
 *   that piece's next turn, hurting and dislodging anyone still on it.
 */
import { isStandable, terrainAt } from './board';
import { ALL_DIRS, add, addShield, addStatus, capture, dealDamage, getPiece, heal, isEmpty, log, nearestEmpty, scale, setTerrain } from './core';
import { footprint, sizeOf } from './pieces';
import { Coord, GameState, Move, Piece, Side, Tile, endOfTurn, sameCoord } from './types';

/** Gold for a ? Block coin and for a coin in a Brick Block. */
export const QBLOCK_GOLD = 10;
export const BRICK_GOLD = 5;

/** A deterministic roll from the battle state (so replays and the AI agree). */
function roll(s: GameState, key: string, n: number): number {
  let h = (s.ply + 7) | 0;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) % n;
}

const gold = (s: GameState, side: Side, amount: number) => {
  if (side === 'player') s.goldBonus = (s.goldBonus ?? 0) + amount;
};

/** Hit a ? Block next to the piece (instead of moving). */
export function marioSpaceMoves(s: GameState, p: Piece): Move[] {
  const blocks = (s.tiles ?? []).filter((t) => t.kind === 'qblock');
  if (!blocks.length) return [];
  const cells = footprint(p);
  return blocks
    .filter((t) => cells.some((c) => Math.max(Math.abs(c.x - t.pos.x), Math.abs(c.y - t.pos.y)) === 1))
    .map((t) => ({ pieceId: p.id, from: p.pos, to: t.pos, action: 'hitBlock' as const }));
}

export function resolveHitBlock(s: GameState, m: Move): boolean {
  if (m.action !== 'hitBlock') return false;
  const p = getPiece(s, m.pieceId);
  const t = (s.tiles ?? []).find((o) => o.kind === 'qblock' && sameCoord(o.pos, m.to));
  if (!p || !t) return true;
  t.kind = 'emptyBlock';
  switch (roll(s, `${p.id}|${t.pos.x},${t.pos.y}`, 4)) {
    case 0:
      gold(s, p.side, QBLOCK_GOLD);
      log(s, p.side === 'player' ? `A coin! +${QBLOCK_GOLD} gold.` : 'A coin pops out.');
      break;
    case 1:
      heal(s, p, 1);
      log(s, 'A Super Mushroom! +1 HP.');
      break;
    case 2:
      addShield(s, p, 1, true);
      log(s, 'A Super Star! The next point of damage is ignored.');
      break;
    default:
      addStatus(p, { kind: 'damageBuff', amount: 1, until: null, source: 'fire_flower_block' });
      log(s, 'A Fire Flower! +1 damage on its next attack.');
  }
  return true;
}

/** A Brick Block was smashed: maybe a coin, maybe a hidden Mushroom for the piece that broke it. */
export function brickSmashed(s: GameState, c: Coord, by?: Piece) {
  const t = (s.tiles ?? []).find((o) => o.kind === 'brick' && sameCoord(o.pos, c));
  if (!t) return;
  s.tiles = s.tiles.filter((o) => o !== t);
  if (!by) return;
  if (t.mushroom) {
    heal(s, by, 1);
    log(s, 'A Mushroom was hidden in the bricks! +1 HP.');
  } else if (roll(s, `brick|${c.x},${c.y}|${by.id}`, 2) === 0) {
    gold(s, by.side, BRICK_GOLD);
    log(s, by.side === 'player' ? `A coin in the bricks! +${BRICK_GOLD} gold.` : 'A coin flies out of the bricks.');
  }
}

/** Note Block bounces: exactly 3 any direction, over anything, onto an empty square. */
export const noteSquares = (s: GameState, p: Piece): Coord[] =>
  ALL_DIRS.map((d) => add(p.pos, scale(d, 3))).filter((c) => isStandable(s.board, c) && isEmpty(s, c));

/** Landing on a Mario space. */
export function applyMarioTile(s: GameState, p: Piece, t: Tile) {
  switch (t.kind) {
    case 'note':
      if (sizeOf(p) === 1 && p.counters.notePly !== s.ply && noteSquares(s, p).length) {
        p.counters.notePly = s.ply;
        s.bonus.unshift({ pieceId: p.id, filter: 'nonCapturing', optional: true, source: 'note_block' });
      }
      break;
    case 'lava':
      log(s, 'Ouch — lava!');
      dealDamage(s, p.id, 1, { kind: 'ability' });
      break;
    case 'donut':
      if (t.collapse === undefined) {
        t.collapse = endOfTurn(s.ply, p.side);
        log(s, 'The Donut Block starts to shake…');
      }
      break;
  }
}

/** The Note Block bounce moves owed to a piece. */
export function noteMoves(s: GameState, p: Piece): Move[] {
  if (s.bonus[0]?.source !== 'note_block' || s.bonus[0].pieceId !== p.id) return [];
  return noteSquares(s, p).map((to) => ({ pieceId: p.id, from: p.pos, to, param: 'note' }));
}

/** End of a ply: lava burns pieces that stayed on it; Donut Blocks that are due fall. */
export function marioSpacesTurnEnd(s: GameState, side: Side) {
  if (!s.tiles?.length) return;
  const lava = s.tiles.filter((t) => t.kind === 'lava');
  if (lava.length)
    for (const p of s.pieces.filter((p) => p.side === side)) {
      const stayed = !p.turnPos || sameCoord(p.turnPos, p.pos);
      if (stayed && footprint(p).some((c) => lava.some((t) => sameCoord(t.pos, c)))) {
        log(s, 'The lava burns!');
        dealDamage(s, p.id, 1, { kind: 'ability' });
      }
    }
  for (const t of s.tiles.filter((t) => t.kind === 'donut' && t.collapse !== undefined && t.collapse <= s.ply)) {
    s.tiles = s.tiles.filter((o) => o !== t);
    setTerrain(s, t.pos, 'gap');
    log(s, 'The Donut Block falls away!');
    for (const p of s.pieces.filter((p) => footprint(p).some((c) => sameCoord(c, t.pos)))) {
      dealDamage(s, p.id, 1, { kind: 'ability' });
      const still = getPiece(s, p.id);
      if (!still || footprint(still).every((c) => terrainAt(s.board, c) === 'normal')) continue;
      const spot = sizeOf(still) === 1 ? nearestEmpty(s, still.pos, 3) : undefined;
      if (spot && isStandable(s.board, spot)) still.pos = { ...spot };
      else capture(s, still, { kind: 'fall' });
    }
  }
}
