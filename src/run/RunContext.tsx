import AsyncStorage from '@react-native-async-storage/async-storage';
import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { GameState } from '../engine/types';
import { DeployedPiece, RunState, currentBattle, finishBattle, newRun, startBattle } from './run';

const STORAGE_KEY = 'chessrogue.run.v1';

interface RunApi {
  /** False until the saved run (if any) has been read from storage. */
  loaded: boolean;
  run: RunState | null;
  startNewRun: () => void;
  abandonRun: () => void;
  /** Lock in a deployment and start the current battle. */
  beginBattle: (deployed: DeployedPiece[]) => void;
  /** Save the in-progress battle after each move. */
  updateBattle: (state: GameState) => void;
  /** Apply the finished battle's casualties and advance the run. */
  endBattle: (final: GameState) => void;
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
        if (saved?.version === 1) setRun(saved);
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
  const beginBattle = useCallback((deployed: DeployedPiece[]) => {
    setRun((r) => (r ? { ...r, activeBattle: startBattle(r, currentBattle(r)!, deployed) } : r));
  }, []);
  const updateBattle = useCallback((state: GameState) => {
    setRun((r) => (r ? { ...r, activeBattle: state } : r));
  }, []);
  const endBattle = useCallback((final: GameState) => {
    setRun((r) => (r ? finishBattle(r, final) : r));
  }, []);

  const api = useMemo(
    () => ({ loaded, run, startNewRun, abandonRun, beginBattle, updateBattle, endBattle }),
    [loaded, run, startNewRun, abandonRun, beginBattle, updateBattle, endBattle],
  );
  return <RunContext.Provider value={api}>{children}</RunContext.Provider>;
}

export function useRun(): RunApi {
  const ctx = useContext(RunContext);
  if (!ctx) throw new Error('useRun must be used inside <RunProvider>');
  return ctx;
}
