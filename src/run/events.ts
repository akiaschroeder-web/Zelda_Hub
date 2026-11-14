import { PIECE_STATS } from '../engine/pieces';
import type { RunState } from './run';
import { rollPiece } from './rewards';
import { Rng } from './rng';

export interface EventChoice {
  label: string;
  /** Short description of the cost/benefit, shown under the label. */
  detail: string;
  available?: (run: RunState) => boolean;
  apply: (run: RunState, rng: Rng) => { run: RunState; message: string };
}

export interface EventDef {
  id: string;
  title: string;
  text: string;
  /** Whether this event can appear at all for the current run. */
  available?: (run: RunState) => boolean;
  choices: EventChoice[];
}

let eventUid = 0;
const recruit = (run: RunState, type: RunState['roster'][number]['type']): RunState => ({
  ...run,
  roster: [...run.roster, { uid: `r-${type}-ev-${Date.now().toString(36)}-${eventUid++}`, type, battles: 0 }],
});

const hasPawn = (run: RunState) => run.roster.some((r) => r.type === 'pawn');
const nonKings = (run: RunState) => run.roster.filter((r) => r.type !== 'king');

const leave: EventChoice = {
  label: 'Leave',
  detail: 'Nothing happens.',
  apply: (run) => ({ run, message: 'You move on.' }),
};

export const EVENTS: EventDef[] = [
  {
    id: 'armory',
    title: 'Abandoned Armory',
    text: 'Racks of old equipment line the walls of a ruined keep. Two young recruits are sheltering inside.',
    choices: [
      {
        label: 'Take the recruits',
        detail: 'Gain 2 Pawns.',
        apply: (run) => ({ run: recruit(recruit(run, 'pawn'), 'pawn'), message: 'Two Pawns join your army.' }),
      },
      {
        label: 'Sell the equipment',
        detail: 'Gain 35 gold.',
        apply: (run) => ({ run: { ...run, gold: run.gold + 35 }, message: 'You sell the gear for 35 gold.' }),
      },
    ],
  },
  {
    id: 'captain',
    title: 'Mercenary Captain',
    text: 'A grizzled captain offers her services — or to train one of your soldiers, for a price.',
    choices: [
      {
        label: 'Train a Pawn',
        detail: 'Lose a Pawn, gain a Knight.',
        available: hasPawn,
        apply: (run) => {
          const pawn = run.roster.find((r) => r.type === 'pawn')!;
          const without = { ...run, roster: run.roster.filter((r) => r.uid !== pawn.uid) };
          return { run: recruit(without, 'knight'), message: 'Your Pawn returns as a Knight.' };
        },
      },
      {
        label: 'Hire her',
        detail: 'Pay 60 gold, gain a Rook.',
        available: (run) => run.gold >= 60,
        apply: (run) => ({ run: recruit({ ...run, gold: run.gold - 60 }, 'rook'), message: 'The captain joins as a Rook.' }),
      },
      leave,
    ],
  },
  {
    id: 'shrine',
    title: 'Shrine of Old Generals',
    text: 'Offerings of tarnished medals surround a statue of a forgotten commander.',
    choices: [
      {
        label: 'Pray',
        detail: '+2 Army Points.',
        apply: (run) => ({ run: { ...run, armyPoints: run.armyPoints + 2 }, message: 'You feel ready to lead more troops. +2 Army Points.' }),
      },
      {
        label: 'Loot the offerings',
        detail: '+60 gold, but a random piece (not the King) deserts.',
        available: (run) => nonKings(run).length > 0,
        apply: (run, rng) => {
          const deserter = rng.pick(nonKings(run));
          return {
            run: { ...run, gold: run.gold + 60, roster: run.roster.filter((r) => r.uid !== deserter.uid) },
            message: `You take 60 gold. Your ${PIECE_STATS[deserter.type].name} deserts in disgust.`,
          };
        },
      },
      leave,
    ],
  },
  {
    id: 'gambler',
    title: 'The Gambler',
    text: '"Double or nothing," grins a stranger, flipping a gold coin.',
    available: (run) => run.gold >= 30,
    choices: [
      {
        label: 'Bet 30 gold',
        detail: '50%: win 60 gold. 50%: lose your bet.',
        available: (run) => run.gold >= 30,
        apply: (run, rng) =>
          rng.chance(0.5)
            ? { run: { ...run, gold: run.gold + 30 }, message: 'Heads! You win 60 gold.' }
            : { run: { ...run, gold: run.gold - 30 }, message: 'Tails. The stranger pockets your 30 gold.' },
      },
      leave,
    ],
  },
  {
    id: 'deserters',
    title: 'Enemy Deserters',
    text: 'A band of enemy soldiers has abandoned their lord. They ask to join you.',
    choices: [
      {
        label: 'Welcome them',
        detail: 'Gain 2 random pieces.',
        apply: (run, rng) => {
          const a = rollPiece(rng, 'battle', run.act);
          const b = rollPiece(rng, 'battle', run.act);
          return {
            run: recruit(recruit(run, a), b),
            message: `A ${PIECE_STATS[a].name} and a ${PIECE_STATS[b].name} join your army.`,
          };
        },
      },
      {
        label: 'Turn them in',
        detail: 'Gain 25 gold bounty.',
        apply: (run) => ({ run: { ...run, gold: run.gold + 25 }, message: 'The bounty pays 25 gold.' }),
      },
    ],
  },
  {
    id: 'veteran',
    title: 'Wounded Veteran',
    text: 'An old Guardian rests by the road, shield still in hand. "I can still hold a line," he says.',
    choices: [
      {
        label: 'Pay for his care',
        detail: 'Pay 30 gold, gain a Guardian.',
        available: (run) => run.gold >= 30,
        apply: (run) => ({ run: recruit({ ...run, gold: run.gold - 30 }, 'guardian'), message: 'The Guardian joins you.' }),
      },
      leave,
    ],
  },
];
