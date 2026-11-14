import { EncounterRules } from '../engine/types';

/**
 * A battle in a run. Terrain uses the usual legend plus `d` for the player's
 * deployment squares. `enemies` lists only enemy pieces (lowercase letters).
 *
 * PLACEHOLDER: a fixed sequence of four battles until the branching run map
 * (step 4) replaces it.
 */
export interface RunBattle {
  id: string;
  name: string;
  description: string;
  rules: EncounterRules;
  terrain: string[];
  enemies: string[];
}

export const RUN_BATTLES: RunBattle[] = [
  {
    id: 'skirmish',
    name: 'Border Skirmish',
    description: 'A small raiding party. Checkmate their King.',
    rules: { checkRules: true },
    terrain: [
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '.dddddd.',
      '..dddd..',
    ],
    enemies: [
      '...k....',
      '.p.pp.p.',
      '..n..n..',
      '........',
      '........',
      '........',
      '........',
      '........',
    ],
  },
  {
    id: 'bridge',
    name: 'The Broken Bridge',
    description: 'Extermination: no check rules. Destroy every enemy piece — and keep your King alive.',
    rules: { checkRules: false },
    terrain: [
      '........',
      '........',
      '..#..+..',
      '__....__',
      '___..___',
      '__....__',
      '.dddddd.',
      'dddddddd',
    ],
    enemies: [
      '..bkr...',
      '.pp..pp.',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
    ],
  },
  {
    id: 'siege',
    name: 'Siege Lines',
    description: 'A fortified line of cracked walls, held by Archers and a Guardian.',
    rules: { checkRules: true },
    terrain: [
      '..........',
      '..........',
      '..........',
      '.++.##.++.',
      '..........',
      '..........',
      '..........',
      '..........',
      '.dddddddd.',
      '..dddddd..',
    ],
    enemies: [
      '...rkg....',
      '..a.pp.a..',
      '.p..s...p.',
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
    ],
  },
  {
    id: 'juggernaut',
    name: 'The Juggernaut',
    description: 'A war machine guards their King. Three HP, and it crushes everything it rolls over.',
    rules: { checkRules: true },
    terrain: [
      '........',
      '........',
      '........',
      '.#....#.',
      '........',
      '........',
      'dddddddd',
      'dddddddd',
    ],
    enemies: [
      'r..k...r',
      '...j....',
      'pph...pp',
      '..p..p..',
      '........',
      '........',
      '........',
      '........',
    ],
  },
];
