/**
 * Zelda Content Pack mechanics that run around moves and turns:
 * Goron Rolling Charge, Midna's move count, ReDead Paralyzing Scream,
 * Like Like Engulf (release and digestion) and Ganondorf's phases.
 * Damage-time effects (Zora evasion, Darknut armor, Engulf on capture)
 * live in core.ts; movement lives in movement.ts.
 */
import { isStandable, terrainAt } from './board';
import {
  addStatus,
  dealDamage,
  destroyCracked,
  getPiece,
  hasStatus,
  heal,
  isEmpty,
  log,
  nameOf,
  nearestEmpty,
  pieceAt,
  pieceDistance,
  sign,
  sub,
} from './core';
import { PIECE_STATS, footprint, ganonPhase } from './pieces';
import { agonyReveal, burnTick } from './zeldaUpgrades';
import { Coord, GameState, Move, Piece, Side, endOfTurn, sameCoord } from './types';

/** Turns an enemy stays immune to Paralyzing Scream after being paralyzed (counts down each of its turns). */
const SCREAM_COOLDOWN = 3;

const isGanon = (p: Piece) => p.type === 'ganondorf' || p.type === 'ganon';

/** Before a move resolves: a Goron rolling exactly three squares smashes the cracked walls it rolls through. */
export function zeldaBeforeMove(s: GameState, m: Move) {
  const p = getPiece(s, m.pieceId);
  if (!p || p.type !== 'goron' || m.action) return;
  const d = sub(m.to, m.from);
  const straight = d.x === 0 || d.y === 0;
  if (!straight || Math.max(Math.abs(d.x), Math.abs(d.y)) !== 3) return;
  const dir = sign(d);
  let rolled = false;
  for (let i = 1; i < 3; i++) {
    const c = { x: m.from.x + dir.x * i, y: m.from.y + dir.y * i };
    if (terrainAt(s.board, c) === 'cracked') rolled = destroyCracked(s, c, p) || rolled;
  }
  if (rolled) log(s, `${nameOf(p)} rolls straight through the cracked wall!`);
}

/** After a move resolves (before the turn ends). `from` is where the mover started. */
export function zeldaAfterMove(s: GameState, m: Move, from: Coord | undefined) {
  freeEngulfed(s);
  const p = getPiece(s, m.pieceId);
  if (p && from && m.action !== 'pass') {
    const moved = !sameCoord(from, p.pos);
    if (p.type === 'midna' && !m.action && moved) p.counters.moves = (p.counters.moves ?? 0) + 1;

    // Gerudo King: Ganondorf's attacks also hit every enemy along the side he attacks toward
    // (the row of squares in front of his footprint, corners included).
    if (isGanon(p) && m.targets?.length) {
      const dir = sign(sub(m.to, m.from));
      const own = footprint(p);
      const xs = own.map((c) => c.x);
      const ys = own.map((c) => c.y);
      const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const hit = new Set<string>();
      for (let y = minY - 1; y <= maxY + 1; y++)
        for (let x = minX - 1; x <= maxX + 1; x++) {
          const ahead = (dir.x > 0 && x > maxX) || (dir.x < 0 && x < minX) || (dir.y > 0 && y > maxY) || (dir.y < 0 && y < minY);
          if (!ahead) continue;
          const e = pieceAt(s, { x, y });
          if (e && e.side !== p.side && !m.targets.includes(e.id) && !hit.has(e.id)) {
            hit.add(e.id);
            dealDamage(s, e.id, 1, { sourceId: p.id, kind: 'splash' });
          }
        }
    }

    // Demon King: every move damages all adjacent enemies.
    const now = getPiece(s, p.id);
    if (now && moved && ganonPhase(now) === 3) {
      for (const e of s.pieces.filter((e) => e.side !== now.side && pieceDistance(e, now) === 1))
        dealDamage(s, e.id, 1, { sourceId: now.id, kind: 'ability' });
    }

    // Paralyzing Scream: moving next to an enemy ReDead paralyzes the mover for its next turn.
    const mover = getPiece(s, m.pieceId);
    if (mover && moved && (mover.counters.screamCd ?? 0) <= 0 && !isGanon(mover)) {
      const redead = s.pieces.find((r) => r.type === 'redead' && r.side !== mover.side && pieceDistance(r, mover) === 1);
      if (redead) {
        addStatus(mover, { kind: 'bound', until: endOfTurn(s.ply, mover.side), source: 'scream' });
        mover.counters.screamCd = SCREAM_COOLDOWN;
        log(s, `The ReDead screams — ${nameOf(mover)} is paralyzed!`);
      }
    }
  }
  // An enemy stepping onto a pile of Stalfos bones destroys it for good.
  const stepper = getPiece(s, m.pieceId);
  if (stepper && s.bones?.length) {
    const cells = footprint(stepper);
    for (const b of s.bones.filter((b) => b.piece.side !== stepper.side && cells.some((c) => sameCoord(c, b.at)))) {
      s.bones = s.bones.filter((o) => o !== b);
      s.captured.push(b.piece);
      log(s, `${nameOf(stepper)} scatters the Stalfos bones for good.`);
    }
  }
  freeEngulfed(s);
  agonyReveal(s, m.pieceId);
  ganonTransform(s);
}

/** End of `side`'s turn: Dark Sorcerer blasts, Like Likes digest, Ganondorf transforms. */
/** Start of `side`'s turn: Lon Lon Ranch healing and Epona's Malon boost. */
export function zeldaTurnStart(s: GameState, side: Side) {
  const malons = s.pieces.filter((m) => m.side === side && m.type === 'malon');
  for (const p of s.pieces.filter((p) => p.side === side)) {
    const nearMalon = malons.some((m) => m.id !== p.id && pieceDistance(m, p) === 1);
    if (p.type === 'epona') p.counters.malonBoost = nearMalon ? 1 : 0;
    if (nearMalon && p.hp < p.maxHp && (p.counters.ranchCd ?? 0) <= 0) {
      p.counters.ranchCd = 3;
      heal(s, p, 1);
      log(s, `Lon Lon Ranch: ${nameOf(p)} recovers 1 HP.`);
    }
  }
}

export function zeldaTurnEnd(s: GameState, side: Side) {
  burnTick(s, side);
  // Stalfos Reassembly: bones rise again once their time is up and the square is free.
  for (const b of [...(s.bones ?? [])]) {
    if (b.piece.side !== side || b.ready > s.ply || !isEmpty(s, b.at)) continue;
    s.bones = s.bones.filter((o) => o !== b);
    const v = b.piece;
    v.pos = { ...b.at };
    v.turnPos = { ...b.at };
    v.hp = 1;
    s.pieces.push(v);
    log(s, `${nameOf(v)} reassembles!`);
  }
  for (const g of s.pieces.filter((g) => g.side === side && ganonPhase(g) >= 2)) {
    const victim = s.pieces
      .filter((e) => e.side !== side && e.type !== 'king' && pieceDistance(e, g) === 1)
      .sort((a, b) => {
        const fallsA = a.hp + a.shields.reduce((n, sh) => n + sh.strength, 0) <= 1 ? 1 : 0;
        const fallsB = b.hp + b.shields.reduce((n, sh) => n + sh.strength, 0) <= 1 ? 1 : 0;
        return fallsB - fallsA || PIECE_STATS[b.type].value - PIECE_STATS[a.type].value;
      })[0];
    if (victim) {
      log(s, `Dark magic lashes out at ${nameOf(victim)}.`);
      dealDamage(s, victim.id, 1, { sourceId: g.id, kind: 'ability' });
    }
  }
  freeEngulfed(s);
  for (const e of [...(s.engulfed ?? [])]) {
    if (e.freed || e.release > s.ply) continue;
    s.engulfed = s.engulfed.filter((o) => o !== e);
    s.captured.push(e.victim);
    log(s, `The Like Like has swallowed ${nameOf(e.victim)} for good.`);
  }
  ganonTransform(s);
}

/** Put back every piece whose Like Like has fallen: on its old square, or the nearest empty one. */
export function freeEngulfed(s: GameState) {
  if (!s.engulfed?.length) return;
  for (const e of s.engulfed.filter((e) => e.freed || !getPiece(s, e.holderId))) {
    s.engulfed = s.engulfed.filter((o) => o !== e);
    const spot = isEmpty(s, e.at) ? e.at : nearestEmpty(s, e.at, 8);
    if (!spot) {
      s.captured.push(e.victim);
      continue;
    }
    const v = e.victim;
    v.pos = { ...spot };
    v.turnPos = { ...spot };
    v.hp = Math.max(1, v.hp);
    v.statuses = [];
    s.pieces.push(v);
    log(s, `${nameOf(v)} breaks free of the fallen Like Like!`);
  }
}

/** Demon King: at 1 HP, Ganondorf becomes Ganon (3×3) as soon as there is room around him. */
export function ganonTransform(s: GameState) {
  for (const g of s.pieces.filter((g) => g.type === 'ganondorf' && g.hp <= 1)) {
    const spots: Coord[] = [];
    for (const dy of [0, -1]) for (const dx of [0, -1]) spots.push({ x: g.pos.x + dx, y: g.pos.y + dy });
    // Grow toward the enemy first.
    spots.sort((a, b) => (g.side === 'enemy' ? a.y - b.y : b.y - a.y));
    const fits = (at: Coord) => {
      for (let y = 0; y < 3; y++)
        for (let x = 0; x < 3; x++) {
          const c = { x: at.x + x, y: at.y + y };
          if (!isStandable(s.board, c)) return false;
          const o = pieceAt(s, c);
          if (o && o.id !== g.id) return false;
        }
      return true;
    };
    const at = spots.find(fits);
    if (!at) continue;
    g.type = 'ganon';
    g.pos = at;
    log(s, 'Ganondorf transforms into the Demon King, Ganon!');
  }
}

/** Phase 2 Dark Sorcerer: teleport up to three squares to a clear spot instead of moving. */
export function darkWarps(s: GameState, p: Piece): Move[] {
  if (p.type !== 'ganondorf' || ganonPhase(p) !== 2 || hasStatus(p, 'stunned')) return [];
  const out: Move[] = [];
  for (let dy = -3; dy <= 3; dy++)
    for (let dx = -3; dx <= 3; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 2) continue; // one square is just an ordinary move
      const to = { x: p.pos.x + dx, y: p.pos.y + dy };
      const clear = footprint(p, to).every((c) => {
        if (!isStandable(s.board, c)) return false;
        const o = pieceAt(s, c);
        return !o || o.id === p.id;
      });
      if (clear) out.push({ pieceId: p.id, from: p.pos, to, action: 'darkWarp' });
    }
  return out;
}

