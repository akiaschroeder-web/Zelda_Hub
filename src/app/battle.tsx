import { router } from 'expo-router';
import { PIECE_STATS } from '../engine/pieces';
import { drinkBattlePotion } from '../run/potions';
import { RunState, finishBattle } from '../run/run';
import { useRun } from '../run/RunContext';
import BattleView from '../ui/BattleView';
import RunGuard from '../ui/RunGuard';

/** The current run battle. Every move is saved, so closing the app can't undo it. */
export default function Battle() {
  const { update } = useRun();
  return (
    <RunGuard phase="battle">
      {(run) => (
        <BattleView
          key={run.battle!.id}
          state={run.activeBattle!}
          onMove={(s) => update((r) => ({ ...r, activeBattle: s }))}
          title={run.battle!.name}
          description={run.battle!.description}
          finishLabel="Continue"
          onFinish={(final) => update((r) => finishBattle(r, final))}
          menu={[
            ...potionMenu(run, update),
            {
              label: 'Save & quit to menu',
              onPress: () => router.dismissTo('/'),
            },
            {
              label: 'Forfeit battle',
              confirm: 'Forfeiting counts as a defeat. Losing a battle ends your run.',
              onPress: () =>
                update((r) =>
                  r.activeBattle ? finishBattle(r, { ...r.activeBattle, result: { kind: 'forfeit', winner: 'enemy' } }) : r,
                ),
            },
          ]}
        />
      )}
    </RunGuard>
  );
}

type Update = (fn: (r: RunState) => RunState) => void;

/** Menu entries for the healing potions in the bag. */
function potionMenu(run: RunState, update: Update) {
  const s = run.activeBattle;
  if (!s || s.turn !== 'player') return [];
  const hurt = s.pieces.filter((p) => p.side === 'player' && p.hp < p.maxHp && !p.temp);
  const entries = [];
  const count = (id: string) => run.potions.filter((p) => p === id).length;
  if (count('recovery') && hurt.length)
    entries.push({
      label: `💚 Recovery ×${count('recovery')}: heal all pieces 1`,
      onPress: () => update((r) => drinkBattlePotion(r, 'recovery')),
    });
  if (count('restoration'))
    for (const p of [...hurt].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp).slice(0, 5))
      entries.push({
        label: `💖 Restoration: ${PIECE_STATS[p.type].name} (${p.hp}/${p.maxHp} HP)`,
        onPress: () => update((r) => drinkBattlePotion(r, 'restoration', p.id)),
      });
  return entries;
}
