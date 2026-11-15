import { router } from 'expo-router';
import { finishBattle } from '../run/run';
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
