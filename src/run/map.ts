import { PieceType } from '../engine/types';
import { Rng } from './rng';

export type NodeType = 'battle' | 'elite' | 'boss' | 'shop' | 'event' | 'treasure' | 'recruit' | 'forge' | 'potion';

export interface MapNode {
  id: string;
  type: NodeType;
  floor: number;
  /** Horizontal position 0..1 for drawing. */
  x: number;
  /** ids of nodes on the next floor reachable from here. */
  next: string[];
  /** Boss nodes: which Boss Piece waits there. */
  boss?: PieceType;
}

export interface ActMap {
  act: number;
  floors: MapNode[][];
}

export const NODE_INFO: Record<NodeType, { label: string; icon: string; blurb: string }> = {
  battle: { label: 'Battle', icon: '⚔️', blurb: 'A standard fight. Earn gold and a reward.' },
  elite: { label: 'Elite', icon: '💀', blurb: 'A tougher army with better rewards.' },
  boss: { label: 'Boss', icon: '👑', blurb: "The act's final battle." },
  shop: { label: 'Shop', icon: '🛒', blurb: 'Spend gold on pieces and Army Points.' },
  event: { label: 'Event', icon: '❓', blurb: 'Something unexpected. Choose wisely.' },
  treasure: { label: 'Treasure', icon: '💰', blurb: 'Free loot.' },
  recruit: { label: 'Recruit', icon: '🛡️', blurb: 'Choose a new piece to join your army.' },
  forge: { label: 'Forge', icon: '⚒️', blurb: 'Melt pieces or upgrades down into rarer ones; take upgrades off or put them on.' },
  potion: { label: 'Potion Shop', icon: '🧪', blurb: 'Potions to keep for later, and permanent elixirs.' },
};

/** Floors per act before the boss. */
export const FLOORS_PER_ACT = 6;

function floorType(rng: Rng, floor: number): NodeType {
  if (floor === 0) return 'battle';
  if (floor === FLOORS_PER_ACT - 1) return rng.weighted<NodeType>({ recruit: 3, shop: 3, treasure: 2, event: 2, forge: 2, potion: 2 });
  return rng.weighted<NodeType>({
    battle: 45,
    event: 15,
    elite: floor >= 2 ? 12 : 0,
    shop: 9,
    treasure: 7,
    recruit: 12,
    forge: floor >= 1 ? 6 : 0,
    potion: floor >= 1 ? 6 : 0,
  });
}

export function generateAct(rng: Rng, act: number, bossPool: PieceType[] = []): ActMap {
  const floors: MapNode[][] = [];
  for (let f = 0; f < FLOORS_PER_ACT; f++) {
    const count = f === 0 ? 3 : rng.int(2, 4);
    const row: MapNode[] = [];
    for (let i = 0; i < count; i++) {
      const x = (i + 0.5) / count + (rng.next() - 0.5) * (0.35 / count);
      row.push({ id: `a${act}f${f}n${i}`, type: floorType(rng, f), floor: f, x, next: [] });
    }
    floors.push(row);
  }
  floors.push([
    { id: `a${act}boss`, type: 'boss', floor: FLOORS_PER_ACT, x: 0.5, next: [], boss: bossPool.length ? rng.pick(bossPool) : undefined },
  ]);

  // Connect each floor to the next without crossings: node i maps to the
  // proportionally-placed node on the next floor, sometimes also a neighbour.
  for (let f = 0; f < floors.length - 1; f++) {
    const here = floors[f];
    const there = floors[f + 1];
    const base = (i: number) => (here.length === 1 ? 0 : Math.round((i * (there.length - 1)) / (here.length - 1)));
    here.forEach((node, i) => {
      const j = base(i);
      node.next.push(there[j].id);
      const side = rng.chance(0.5) ? 1 : -1;
      const k = j + side;
      if (rng.chance(0.45) && k >= 0 && k < there.length) node.next.push(there[k].id);
    });
    // Every node on the next floor must be reachable.
    there.forEach((target, j) => {
      if (here.some((n) => n.next.includes(target.id))) return;
      let best = 0;
      here.forEach((_, i) => {
        if (Math.abs(base(i) - j) < Math.abs(base(best) - j)) best = i;
      });
      here[best].next.push(target.id);
    });
    here.forEach((n) => n.next.sort((a, b) => there.findIndex((t) => t.id === a) - there.findIndex((t) => t.id === b)));
  }
  return { act, floors };
}

export function findNode(map: ActMap, id: string): MapNode | undefined {
  for (const row of map.floors) for (const n of row) if (n.id === id) return n;
  return undefined;
}
