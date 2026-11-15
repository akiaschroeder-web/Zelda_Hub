/**
 * Procedural battle boards. Every board is a square grid (so a Rotation
 * Switch can always turn it), but its playable shape varies: narrow, wide,
 * cut-cornered, waisted, notched or cross-shaped, with the rest of the grid
 * left as void. Walls, cracked walls, gaps and (with the Zelda Pack) special
 * spaces are scattered at random, often mirrored left-right, and every board
 * is checked so the two armies can reach each other.
 *
 * Output uses the board legend from engine/board.ts: . # + _ - d e and the
 * Zelda tiles S F H W V L (Small Keys are added by the caller).
 */
import { Rng } from './rng';

type Shape = 'full' | 'narrow' | 'wide' | 'octagon' | 'waist' | 'notched' | 'cross';
type Theme = 'open' | 'fortress' | 'ruins' | 'chasm' | 'mixed';

export interface BoardSpec {
  /** Content packs on (Zelda spaces appear only with the Zelda Pack). */
  packs?: readonly string[];
  /** Boss arenas: a bigger board with room for the boss at the top centre. */
  boss?: { size: number; theme?: Theme };
}

export interface GeneratedBoard {
  name: string;
  terrain: string[];
  /** Boss arenas: where the boss's top-left square goes. */
  bossAt?: { x: number; y: number };
}

/** Deployment squares each side needs at least. */
const ZONE_SQUARES = 14;

const SHAPE_NAMES: Record<Shape, string> = {
  full: 'Field',
  narrow: 'Corridor',
  wide: 'Front',
  octagon: 'Octagon',
  waist: 'Hourglass',
  notched: 'Bastion',
  cross: 'Crossroads',
};
const THEME_NAMES: Record<Theme, string> = {
  open: 'Open',
  fortress: 'Walled',
  ruins: 'Crumbling',
  chasm: 'Broken',
  mixed: 'Rugged',
};

/** Obstacle density (share of middle squares) per theme. */
const THEMES: Record<Theme, { wall: number; cracked: number; gap: number }> = {
  open: { wall: 0.02, cracked: 0.03, gap: 0.02 },
  fortress: { wall: 0.09, cracked: 0.05, gap: 0.01 },
  ruins: { wall: 0.03, cracked: 0.11, gap: 0.02 },
  chasm: { wall: 0.02, cracked: 0.03, gap: 0.1 },
  mixed: { wall: 0.05, cracked: 0.06, gap: 0.05 },
};

export function generateBoard(rng: Rng, spec: BoardSpec = {}): GeneratedBoard {
  for (let tries = 0; tries < 60; tries++) {
    const board = attempt(rng, spec, tries > 40);
    if (board) return board;
  }
  return attempt(rng, spec, true, true)!;
}

function attempt(rng: Rng, spec: BoardSpec, simple: boolean, plain = false): GeneratedBoard | null {
  const boss = spec.boss;
  const n = boss ? 10 : rng.int(8, 10);
  const shape: Shape = plain
    ? 'full'
    : boss
      ? rng.weighted<Shape>({ full: 3, octagon: 3, waist: 2, notched: 2 })
      : rng.weighted<Shape>({ full: 2, narrow: 3, wide: 2, octagon: 3, waist: 3, notched: 3, cross: 2 });
  const theme: Theme = boss?.theme ?? (plain ? 'open' : rng.weighted<Theme>({ open: 2, fortress: 3, ruins: 3, chasm: 3, mixed: 4 }));
  const g: string[][] = Array.from({ length: n }, () => Array<string>(n).fill('.'));
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < n && y < n ? g[y][x] : '-');
  const set = (x: number, y: number, ch: string) => {
    if (x >= 0 && y >= 0 && x < n && y < n) g[y][x] = ch;
  };

  // 1. Shape: carve void out of the square grid.
  carveShape(rng, g, shape);

  // 2. Zones: enemy rows from the top, player rows from the bottom, until each has enough squares.
  const rows = g.map((r, y) => ({ y, open: r.filter((c) => c !== '-').length })).filter((r) => r.open > 0);
  if (rows.length < 7) return null;
  const need = boss ? ZONE_SQUARES + 4 : ZONE_SQUARES;
  const take = (from: { y: number; open: number }[], min: number) => {
    const ys: number[] = [];
    let count = 0;
    for (const r of from) {
      if (count >= need && ys.length >= min) break;
      ys.push(r.y);
      count += r.open;
    }
    return ys;
  };
  const enemyRows = take(rows, boss ? 3 : 2);
  const playerRows = take([...rows].reverse(), 2);
  const middle = rows.map((r) => r.y).filter((y) => !enemyRows.includes(y) && !playerRows.includes(y));
  if (middle.length < 3) return null;
  for (const y of enemyRows) for (let x = 0; x < n; x++) if (g[y][x] === '.') g[y][x] = 'e';
  for (const y of playerRows) for (let x = 0; x < n; x++) if (g[y][x] === '.') g[y][x] = 'd';

  // Boss arenas: the boss's square block at the top centre must be whole.
  let bossAt: { x: number; y: number } | undefined;
  if (boss) {
    const bx = Math.floor((n - boss.size) / 2);
    const by = enemyRows[0];
    for (let y = by; y < by + boss.size; y++) for (let x = bx; x < bx + boss.size; x++) if (at(x, y) !== 'e') return null;
    bossAt = { x: bx, y: by };
  }

  // 3. Obstacles in the middle rows, usually mirrored left-right.
  if (!simple) {
    const mirror = rng.chance(0.7);
    const cells = middle.flatMap((y) => g[y].map((c, x) => ({ x, y, c }))).filter((o) => o.c === '.');
    const density = THEMES[theme];
    const place = (ch: string, count: number, cluster = 1) => {
      for (let i = 0; i < count; i++) {
        const free = cells.filter((o) => g[o.y][o.x] === '.');
        if (!free.length) return;
        let { x, y } = rng.pick(free);
        for (let k = 0; k < cluster; k++) {
          if (g[y]?.[x] !== '.') break;
          set(x, y, ch);
          if (mirror && at(n - 1 - x, y) === '.') set(n - 1 - x, y, ch);
          // Gaps grow into small chasms.
          const step = rng.pick([{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]);
          x += step.x;
          y += step.y;
          if (!middle.includes(y)) break;
        }
      }
    };
    const area = cells.length / (mirror ? 2 : 1);
    place('#', Math.round(area * density.wall * (0.6 + rng.next() * 0.8)));
    place('+', Math.round(area * density.cracked * (0.6 + rng.next() * 0.8)));
    place('_', Math.max(0, Math.round((area * density.gap * (0.6 + rng.next() * 0.8)) / 2)), rng.int(1, 3));

    // 4. Zelda Pack special spaces.
    if (spec.packs?.includes('zelda') && rng.chance(boss ? 0.5 : 0.6)) {
      const kinds = rng.shuffle(['S', 'F', 'H', 'W', 'L']).slice(0, rng.int(1, 3));
      for (const k of kinds) {
        const free = cells.filter((o) => g[o.y][o.x] === '.');
        if (free.length < 2) break;
        if (k === 'W') {
          // A linked pair, far apart.
          const a = rng.pick(free);
          const far = free.filter((o) => Math.abs(o.x - a.x) + Math.abs(o.y - a.y) >= n / 2);
          if (!far.length) continue;
          const b = rng.pick(far);
          set(a.x, a.y, 'W');
          set(b.x, b.y, 'W');
        } else if (k === 'L') {
          // A Locked Door set in a short wall: #L#.
          const spots = free.filter((o) => at(o.x - 1, o.y) === '.' && at(o.x + 1, o.y) === '.');
          if (!spots.length) continue;
          const d = rng.pick(spots);
          set(d.x - 1, d.y, '#');
          set(d.x, d.y, 'L');
          set(d.x + 1, d.y, '#');
        } else if (k === 'S') {
          // Rotation Switches sit away from the centre.
          const c = (n - 1) / 2;
          const away = free.filter((o) => Math.abs(o.x - c) + Math.abs(o.y - c) >= n / 3);
          const s = rng.pick(away.length ? away : free);
          set(s.x, s.y, 'S');
        } else {
          const s = rng.pick(free);
          set(s.x, s.y, k);
        }
      }
    }
  }

  // 5. The armies must be able to reach each other (cracked walls and doors count as passable).
  if (!connected(g)) return null;

  const terrain = g.map((r) => r.join(''));
  const name = `${THEME_NAMES[theme]} ${SHAPE_NAMES[shape]}`;
  return { name, terrain, bossAt };
}

function carveShape(rng: Rng, g: string[][], shape: Shape) {
  const n = g.length;
  const voidAt = (x: number, y: number) => (g[y][x] = '-');
  switch (shape) {
    case 'full':
      return;
    case 'narrow': {
      const w = rng.int(6, n - 2);
      const left = Math.floor((n - w) / 2);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (x < left || x >= left + w) voidAt(x, y);
      return;
    }
    case 'wide': {
      const h = rng.int(Math.max(7, n - 3), n - 1);
      const top = Math.floor((n - h) / 2);
      for (let y = 0; y < n; y++) if (y < top || y >= top + h) for (let x = 0; x < n; x++) voidAt(x, y);
      return;
    }
    case 'octagon': {
      const k = n >= 9 ? 2 : 1;
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) if (Math.min(x, n - 1 - x) + Math.min(y, n - 1 - y) < k) voidAt(x, y);
      return;
    }
    case 'waist': {
      const w = rng.int(1, n >= 10 ? 2 : 1);
      for (let y = 3; y < n - 3; y++) for (let x = 0; x < n; x++) if (x < w || x >= n - w) voidAt(x, y);
      return;
    }
    case 'notched': {
      // Bites out of the left and right edges, mirrored or not.
      const mirror = rng.chance(0.6);
      for (let i = 0; i < rng.int(1, 3); i++) {
        const h = rng.int(1, 2);
        const w = rng.int(1, 2);
        const y0 = rng.int(2, n - 3 - h);
        const side = rng.chance(0.5);
        for (let y = y0; y < y0 + h; y++)
          for (let x = 0; x < w; x++) {
            voidAt(side ? x : n - 1 - x, y);
            if (mirror) voidAt(side ? n - 1 - x : x, y);
          }
      }
      return;
    }
    case 'cross': {
      const c = n >= 10 ? 2 : 1;
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) if ((x < c || x >= n - c) && (y < c + 1 || y >= n - c - 1)) voidAt(x, y);
      return;
    }
  }
}

/** Can the player's zone reach the enemy's? Walls block; cracked walls, doors and spaces don't. */
function connected(g: string[][]): boolean {
  const n = g.length;
  const passable = (ch: string) => ch !== '#' && ch !== '_' && ch !== '-';
  const start: [number, number][] = [];
  g.forEach((r, y) => r.forEach((ch, x) => ch === 'd' && start.push([x, y])));
  if (!start.length) return false;
  const seen = new Set(start.map(([x, y]) => y * n + x));
  const queue = [...start];
  while (queue.length) {
    const [x, y] = queue.pop()!;
    if (g[y][x] === 'e') return true;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= n || ny >= n || seen.has(ny * n + nx) || !passable(g[ny][nx])) continue;
      seen.add(ny * n + nx);
      queue.push([nx, ny]);
    }
  }
  return false;
}
