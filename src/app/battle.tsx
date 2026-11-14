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
        />
      )}
    </RunGuard>
  );
}
