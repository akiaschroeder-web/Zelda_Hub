import { Redirect } from 'expo-router';
import { ReactNode } from 'react';
import { ROUTES, RunPhase, RunState } from '../run/run';
import { useRun } from '../run/RunContext';

/**
 * Renders `children` only when the run is in `phase`; otherwise redirects to
 * wherever the run currently is (or home if there is no run). Finished runs
 * always land on the map, which shows the end-of-run summary.
 */
export default function RunGuard({ phase, children }: { phase: RunPhase; children: (run: RunState) => ReactNode }) {
  const { loaded, run } = useRun();
  if (!loaded) return null;
  if (!run) return <Redirect href="/" />;
  const target: RunPhase = run.status === 'active' ? run.phase : 'map';
  if (target !== phase) return <Redirect href={ROUTES[target]} />;
  return <>{children(run)}</>;
}
