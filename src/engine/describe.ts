import { resolveAttack } from './moves';
import { PIECE_STATS } from './pieces';
import { GameState, Move, Piece, sameCoord } from './types';

const name = (p: Piece) => `${p.side === 'player' ? 'Your' : 'Enemy'} ${PIECE_STATS[p.type].name}`;

/** One-line, human-readable summary of what a move did. */
export function describeMove(before: GameState, m: Move, after: GameState): string {
  const mover = before.pieces.find((p) => p.id === m.pieceId);
  if (!mover) return '';
  if (m.castle) return `${name(mover)} castled.`;
  const ally = m.allyId ? before.pieces.find((p) => p.id === m.allyId) : undefined;
  if (m.action === 'demolish') return `${name(mover)} demolished a cracked wall.`;
  if (m.action === 'teleport') return `${name(mover)} teleported.`;
  if (m.action === 'swap' && ally) return `${name(mover)} swapped places with the ${PIECE_STATS[ally.type].name}.`;
  if (m.action === 'heal' && ally) {
    const healed = after.pieces.find((p) => p.id === ally.id)!;
    return `${name(mover)} healed the ${PIECE_STATS[ally.type].name} (${healed.hp}/${healed.maxHp} HP).`;
  }
  const targets = (m.targets ?? []).map((id) => before.pieces.find((p) => p.id === id)).filter(Boolean) as Piece[];
  if (targets.length === 0) {
    return m.promotion ? `${name(mover)} promoted to ${PIECE_STATS[m.promotion].name}.` : '';
  }
  const parts: string[] = [];
  const outcome = resolveAttack(before, m);
  if (outcome.interceptor) {
    const g = outcome.interceptor;
    const survived = after.pieces.find((p) => p.id === g.id);
    const verb = m.action === 'shoot' ? 'shot at' : 'attacked';
    return `${name(mover)} ${verb} the ${PIECE_STATS[targets[0].type].name}, but a Guardian intercepted${
      survived ? ` (${survived.hp}/${survived.maxHp} HP left)` : ' and fell'
    }.`;
  }
  if (m.action === 'shoot') parts.push('fired');
  const capturedCounts = new Map<string, number>();
  for (const t of targets) {
    const now = after.pieces.find((p) => p.id === t.id);
    const label = PIECE_STATS[t.type].name;
    if (!now) capturedCounts.set(label, (capturedCounts.get(label) ?? 0) + 1);
    else if (now.shields < t.shields && now.hp === t.hp) parts.push(`broke a shield on ${label}`);
    else parts.push(`hit ${label} (${now.hp}/${now.maxHp} HP left)`);
  }
  const whose = mover.side === 'player' ? 'enemy' : 'your';
  for (const [label, n] of capturedCounts) {
    parts.unshift(n === 1 ? `captured ${whose === 'enemy' ? 'an enemy' : 'your'} ${label}` : `captured ${n} ${whose} ${label}s`);
  }
  const moverAfter = after.pieces.find((p) => p.id === m.pieceId);
  const bounced = moverAfter && !sameCoord(moverAfter.pos, m.to);
  return `${name(mover)} ${parts.join(', ')}${bounced ? ' and bounced back.' : '.'}`;
}
