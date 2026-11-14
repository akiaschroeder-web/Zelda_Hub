import AsyncStorage from '@react-native-async-storage/async-storage';
import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { RunState, newRun } from './run';

const STORAGE_KEY = 'chessrogue.run.v2';

interface RunApi {
  /** False until the saved run (if any) has been read from storage. */
  loaded: boolean;
  run: RunState | null;
  startNewRun: () => void;
  abandonRun: () => void;
  /**
   * Apply one of the pure run actions from run.ts, e.g.
   * `update((r) => enterNode(r, id))`. The result is saved immediately.
   */
  update: (fn: (run: RunState) => RunState) => void;
}

const RunContext = createContext<RunApi | null>(null);

export function RunProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [run, setRun] = useState<RunState | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as RunState;
        if (saved?.version === 2) setRun(saved);
      })
      .catch(() => {
        /* A corrupt or unreadable save just means no run to continue. */
      })
      .finally(() => setLoaded(true));
  }, []);

  // Persist every change once loading has finished (so we never overwrite a save with null on startup).
  useEffect(() => {
    if (!loaded) return;
    const write = run ? AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(run)) : AsyncStorage.removeItem(STORAGE_KEY);
    write.catch(() => {
      /* Saving is best-effort; the run continues in memory. */
    });
  }, [run, loaded]);

  const startNewRun = useCallback(() => setRun(newRun()), []);
  const abandonRun = useCallback(() => setRun(null), []);
  const update = useCallback((fn: (run: RunState) => RunState) => setRun((r) => (r ? fn(r) : r)), []);

  const api = useMemo(() => ({ loaded, run, startNewRun, abandonRun, update }), [loaded, run, startNewRun, abandonRun, update]);
  return <RunContext.Provider value={api}>{children}</RunContext.Provider>;
}

export function useRun(): RunApi {
  const ctx = useContext(RunContext);
  if (!ctx) throw new Error('useRun must be used inside <RunProvider>');
  return ctx;
}
