import { describe, expect, it } from 'vitest';
import { chooseMove } from '../ai';
import { isStandable } from '../board';
import { ENCOUNTERS } from '../encounters';
import { applyMove } from '../moves';
import { footprint } from '../pieces';
import { createEncounter } from '../setup';
import { GameState } from '../types';

/** Deterministic pseudo-random numbers so failures are reproducible. */
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
}

function checkInvariants(s: GameState) {
  const seen = new Set<string>();
  for (const p of s.pieces) {
    expect(p.hp).toBeGreaterThan(0);
    expect(p.hp).toBeLessThanOrEqual(p.maxHp);
    for (const c of footprint(p)) {
      const k = `${c.x},${c.y}`;
      expect(isStandable(s.board, c), `${p.type} on blocked square ${k}`).toBe(true);
      expect(seen.has(k), `two pieces on ${k}`).toBe(false);
      seen.add(k);
    }
  }
}

describe('AI self-play', () => {
  for (const e of ENCOUNTERS) {
    it(`plays ${e.name} without breaking any board invariant`, () => {
      const actions: Record<string, number> = {};
      for (const seed of [1, 2, 3]) {
        let s = createEncounter(e);
        const r = rng(seed);
        for (let ply = 0; ply < 80 && s.result.kind === 'ongoing'; ply++) {
          const m = chooseMove(s, 1, r)!;
          expect(m).toBeTruthy();
          if (m.action) actions[m.action] = (actions[m.action] ?? 0) + 1;
          s = applyMove(s, m);
          checkInvariants(s);
        }
      }
      if (e.id === 'vanguard') {
        // The new pieces' abilities should actually get used.
        expect(Object.keys(actions).length).toBeGreaterThan(0);
        console.log('vanguard actions used:', JSON.stringify(actions));
      }
    }, 60000);
  }
});
