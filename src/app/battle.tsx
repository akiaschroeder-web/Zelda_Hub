import { Redirect, router } from 'expo-router';
import { currentBattle } from '../run/run';
import { useRun } from '../run/RunContext';
import BattleView from '../ui/BattleView';

/** The current run battle. Every move is saved, so closing the app can't undo it. */
export default function Battle() {
  const { loaded, run, updateBattle, endBattle } = useRun();
  if (!loaded) return null;
  if (!run?.activeBattle) return <Redirect href="/army" />;
  const battle = currentBattle(run)!;

  return (
    <BattleView
      key={run.activeBattle.positionHistory[0] + run.battleIndex}
      state={run.activeBattle}
      onMove={updateBattle}
      title={battle.name}
      description={battle.description}
      finishLabel="Continue"
      onFinish={(final) => {
        endBattle(final);
        router.replace('/army');
      }}
    />
  );
}
