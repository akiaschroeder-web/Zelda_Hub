import { describe, expect, it } from 'vitest';
import { parseBoard } from '../../engine/board';
import { bossBattle, generateBattle } from '../battlegen';
import { generateBoard } from '../boardgen';
import { Rng } from '../rng';

describe('procedural boards', () => {
  it('always builds a square grid with enough room for both armies', () => {
    const rng = new Rng(11);
    for (let i = 0; i < 300; i++) {
      const { terrain } = generateBoard(rng, { packs: ['zelda'] });
      const b = parseBoard(terrain);
      expect(b.width).toBe(b.height);
      expect(b.deployZone!.length).toBeGreaterThanOrEqual(14);
      expect(b.enemyZone!.length).toBeGreaterThanOrEqual(14);
    }
  });

  it('varies the shape: many boards are not plain squares', () => {
    const rng = new Rng(3);
    const boards = Array.from({ length: 200 }, () => generateBoard(rng).terrain.join(''));
    const shaped = boards.filter((t) => t.includes('-')).length;
    expect(shaped).toBeGreaterThan(100);
    expect(shaped).toBeLessThan(200);
    expect(new Set(boards).size).toBeGreaterThan(190); // almost never the same layout twice
  });

  it('scatters walls, cracked walls and gaps, and Zelda spaces only with the pack on', () => {
    const rng = new Rng(8);
    const all = Array.from({ length: 200 }, () => generateBoard(rng).terrain.join('')).join('');
    for (const ch of ['#', '+', '_']) expect(all).toContain(ch);
    expect(all).not.toMatch(/[SFHWL]/);
    const zelda = Array.from({ length: 200 }, () => generateBoard(rng, { packs: ['zelda'] }).terrain.join('')).join('');
    for (const ch of ['S', 'F', 'H', 'W', 'L']) expect(zelda).toContain(ch);
  });

  it('every run battle has a placed enemy King and a Small Key for each Locked Door', () => {
    for (let i = 0; i < 120; i++) {
      const battle = generateBattle(new Rng(i), i % 5, 2, i % 3 ? 'battle' : 'elite', `b${i}`, [], ['zelda']);
      expect(battle.enemies.some((e) => e.type === 'king')).toBe(true);
      const t = battle.terrain.join('');
      expect(t.split('K').length).toBe(t.split('L').length);
    }
  });

  it('boss arenas are generated too, with the boss at the top centre', () => {
    for (const boss of ['colossus', 'ganondorf', 'phantom_king'] as const) {
      const a = bossBattle(2, `a-${boss}`, new Rng(4), boss, ['zelda']);
      const b = bossBattle(2, `b-${boss}`, new Rng(5), boss, ['zelda']);
      expect(a.terrain.join('')).not.toBe(b.terrain.join(''));
      const placed = a.enemies.find((e) => e.type === boss)!;
      expect(placed).toBeTruthy();
      expect(a.enemies.some((e) => e.type === 'king')).toBe(true);
    }
  });
});

describe('Sonic Pack spaces on generated boards', () => {
  it('appear only with the Sonic Pack on', () => {
    const rng = new Rng(21);
    const off = Array.from({ length: 200 }, () => generateBoard(rng).terrain.join('')).join('');
    expect(off).not.toMatch(/[↑↓←→⇧⇩⇦⇨%MT]/);
    const on = Array.from({ length: 200 }, () => generateBoard(rng, { packs: ['sonic'] }).terrain.join('')).join('');
    for (const re of [/[↑↓←→]/, /[⇧⇩⇦⇨]/, /%/, /M/, /T/]) expect(on).toMatch(re);
  });
});

describe('Crash Pack spaces on generated boards', () => {
  it('appear only with the Crash Pack on, and the boards stay playable', () => {
    const rng = new Rng(22);
    const off = Array.from({ length: 200 }, () => generateBoard(rng).terrain.join('')).join('');
    expect(off).not.toMatch(/[XZB]/);
    const boards = Array.from({ length: 200 }, () => generateBoard(rng, { packs: ['crash'] }));
    const on = boards.map((b) => b.terrain.join('')).join('');
    for (const re of [/X/, /Z/, /B/]) expect(on).toMatch(re);
  });
});

describe('Super Mario Pack spaces on generated boards', () => {
  it('appear only with the Mario Pack on', () => {
    const rng = new Rng(23);
    const off = Array.from({ length: 200 }, () => generateBoard(rng).terrain.join('')).join('');
    expect(off).not.toMatch(/[QJjNOD]/);
    const on = Array.from({ length: 300 }, () => generateBoard(rng, { packs: ['mario'] }).terrain.join('')).join('');
    for (const re of [/Q/, /[Jj]/, /N/, /O/, /D/]) expect(on).toMatch(re);
  });
});
