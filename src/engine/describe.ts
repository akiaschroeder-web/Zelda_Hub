import { PIECE_STATS } from './pieces';
import { UPGRADE_BY_ID } from './upgrades/catalog';
import { GameState, Move, Piece, sameCoord } from './types';

const name = (p: Piece) => `${p.side === 'player' ? 'Your' : 'Enemy'} ${PIECE_STATS[p.type].name}`;
const pieceName = (p: Piece) => PIECE_STATS[p.type].name;

/** Short label for a move, used in the action chooser. */
export function actionLabel(state: GameState, m: Move): string {
  const target = m.allyId ? state.pieces.find((p) => p.id === m.allyId) : undefined;
  switch (m.action) {
    case 'pass':
      return 'Skip bonus move';
    case 'shoot':
      return 'Shoot';
    case 'demolish':
      return 'Demolish wall';
    case 'teleport':
      return 'Teleport';
    case 'swap':
      return `Swap with ${target ? pieceName(target) : 'ally'}`;
    case 'heal':
      return `Heal ${target ? pieceName(target) : 'ally'}`;
    case 'pull':
      return 'Attraction (pull)';
    case 'shove':
      return 'Shove';
    case 'overwatch':
      return 'Overwatch this line';
    case 'bridge':
      return 'Build bridge';
    case 'divide':
      return 'Division (copy)';
    case 'bind':
      return 'Bind';
    case 'construct':
      return 'Construct cracked wall';
    case 'repair':
      return `Repair ${target ? pieceName(target) : 'ally'}`;
    case 'shadowStep':
      return 'Shadow Step';
    case 'mirage':
      return 'Mirage (create illusion)';
    case 'misdirection':
      return 'Misdirection (swap with illusion)';
    case 'summonPawn':
      return 'Summon Pawn';
    case 'summonKnight':
      return 'Summon Knight';
    case 'convert':
      return `Convert ${target ? pieceName(target) : 'enemy'}`;
    case 'displace':
      return `Displace ${target ? pieceName(target) : 'enemy'}`;
    case 'repulse':
      return 'Repulsion';
    case 'prophecy':
      return `Prophecy on ${target ? pieceName(target) : 'ally'}`;
    case 'replicate':
      return `Copy ${target ? pieceName(target) : 'ally'}`;
    case 'detonate':
      return 'Detonate!';
    case 'soulHeal':
      return 'Spend 2 Souls: heal 1';
    case 'soulPower':
      return 'Spend 3 Souls: +1 damage';
    case 'sacredLight':
      return `Sacred Light: heal ${target ? pieceName(target) : 'ally'}`;
    case 'darkWarp':
      return 'Dark Warp (teleport)';
    case 'spit':
      return 'Deku Spit';
    case 'carry':
      return `Fly, carrying the ${target ? pieceName(target) : 'ally'}`;
    case 'chaosControl':
      return 'Chaos Control (teleport)';
    case 'chaosSpear':
      return 'Chaos Spear';
    case 'psychokinesis':
      return `Psychokinesis: move the ${target ? pieceName(target) : 'enemy'} here`;
    case 'energyShot':
      return 'Energy Shot';
    case 'missiles':
      return 'Homing Missiles';
    case 'burningAura':
      return 'Burning Aura';
    case 'harmony':
      return `Digital Harmony: heal the ${target ? pieceName(target) : 'ally'}`;
    case 'unlock':
      return 'Unlock the door (uses a Small Key)';
    case 'upgrade': {
      const u = UPGRADE_BY_ID[m.upgrade!]?.name ?? m.upgrade!;
      if (m.param) return `${u}: ${m.param}`;
      return target && target.id !== m.pieceId ? `${u} → ${pieceName(target)}` : u;
    }
  }
  const extras: string[] = [];
  if (m.targets?.length) extras.push('Attack');
  else extras.push('Move');
  for (const u of m.uses ?? []) extras.push(UPGRADE_BY_ID[u]?.name ?? u);
  if (m.escort) extras.push('with the King');
  if (m.focusId) extras.push('focus');
  if (m.bounceTo && m.targets?.length && !sameCoord(m.bounceTo, m.to)) {
    if (sameCoord(m.bounceTo, m.from)) extras.push('(bounce home)');
  }
  return extras.join(' · ');
}

/** One-line, human-readable summary of what a move did. */
export function describeMove(before: GameState, m: Move, after: GameState): string {
  const mover = before.pieces.find((p) => p.id === m.pieceId);
  const notes = after.log.join(' ');
  if (m.action === 'pass') return 'Bonus move skipped.';
  if (!mover) return notes;
  if (m.castle) return `${name(mover)} castled.`;
  const ally = m.allyId ? before.pieces.find((p) => p.id === m.allyId) : undefined;
  const parts: string[] = [];
  if (m.action === 'demolish') parts.push(`${name(mover)} demolished a cracked wall.`);
  else if (m.action === 'teleport') parts.push(`${name(mover)} teleported.`);
  else if (m.action === 'swap' && ally) parts.push(`${name(mover)} swapped places with the ${pieceName(ally)}.`);
  else if (m.action === 'heal' && ally) {
    const healed = after.pieces.find((p) => p.id === ally.id);
    parts.push(`${name(mover)} healed the ${pieceName(ally)}${healed ? ` (${healed.hp}/${healed.maxHp} HP)` : ''}.`);
  } else if (m.action && m.action !== 'shoot' && m.action !== 'upgrade' && !m.targets?.length) {
    parts.push(`${name(mover)}: ${actionLabel(before, m)}.`);
  } else if (m.action === 'upgrade' && m.upgrade !== 'temporal_echo') {
    // The engine log already says "X uses Y."
  } else if (m.targets?.length) {
    const results: string[] = [];
    let captured = 0;
    for (const id of m.targets) {
      const t = before.pieces.find((p) => p.id === id);
      if (!t) continue;
      const now = after.pieces.find((p) => p.id === id);
      if (!now) captured++;
      else if (now.hp < t.hp) results.push(`hit ${pieceName(t)} (${now.hp}/${now.maxHp} HP left)`);
      else results.push(`struck ${pieceName(t)}`);
    }
    if (captured) results.unshift(captured === 1 ? 'captured a piece' : `captured ${captured} pieces`);
    const moverAfter = after.pieces.find((p) => p.id === m.pieceId);
    const bounced = moverAfter && m.action !== 'shoot' && !sameCoord(moverAfter.pos, m.to);
    parts.push(`${name(mover)} ${m.action === 'shoot' ? 'fired and ' : ''}${results.join(', ')}${bounced ? ' and bounced back' : ''}.`);
  } else if (m.promotion) parts.push(`${name(mover)} promoted to ${PIECE_STATS[m.promotion].name}.`);
  else if (m.uses?.length) parts.push(`${name(mover)} moved (${m.uses.map((u) => UPGRADE_BY_ID[u]?.name ?? u).join(', ')}).`);
  const capitalized = notes ? notes.charAt(0).toUpperCase() + notes.slice(1) : '';
  return [...parts, capitalized].filter(Boolean).join(' ');
}
