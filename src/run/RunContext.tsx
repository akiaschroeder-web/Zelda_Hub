import AsyncStorage from '@react-native-async-storage/async-storage';
import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { RunState, newRun } from './run';
import { DEFAULT_PACKS, PACKS } from '../content/packs';

const STORAGE_KEY = 'chessrogue.run.v4';
const SETTINGS_KEY = 'chessrogue.settings.v1';

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
  /** Content packs switched on for new runs. */
  packs: string[];
  setPackEnabled: (id: string, on: boolean) => void;
}

const RunContext = createContext<RunApi | null>(null);

export function RunProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [run, setRun] = useState<RunState | null>(null);
  const [packs, setPacks] = useState<string[]>(DEFAULT_PACKS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEY)
      .then((raw) => {
        const saved = raw ? (JSON.parse(raw) as { packs?: unknown; known?: unknown }) : null;
        if (Array.isArray(saved?.packs)) {
          const kept = saved.packs.filter((id): id is string => PACKS.some((p) => p.id === id));
          // Packs added since the settings were saved start switched on.
          const known = Array.isArray(saved.known) ? (saved.known as string[]) : ['zelda'];
          const added = DEFAULT_PACKS.filter((id) => !known.includes(id));
          setPacks([...new Set([...kept, ...added])]);
        }
      })
      .catch(() => {
        /* Unreadable settings fall back to the defaults. */
      })
      .finally(() => setSettingsLoaded(true));
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;
    AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ packs, known: PACKS.map((p) => p.id) })).catch(() => {
      /* Best-effort. */
    });
  }, [packs, settingsLoaded]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as RunState;
        // Runs saved before content packs existed simply have none.
        // Fields added since a run was saved get their starting values.
        if (saved?.version === 3 && Array.isArray(saved.unlockedBosses))
          setRun({
            ...saved,
            packs: saved.packs ?? [],
            stash: saved.stash ?? [],
            potions: saved.potions ?? [],
            boosts: saved.boosts ?? [],
            elixirs: saved.elixirs ?? [],
            potionShop: saved.potionShop ?? null,
            forgeOffer: saved.forgeOffer ?? null,
          });
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

  const startNewRun = useCallback(() => setRun(newRun(undefined, packs)), [packs]);
  const setPackEnabled = useCallback(
    (id: string, on: boolean) => setPacks((ps) => (on ? [...new Set([...ps, id])] : ps.filter((p) => p !== id))),
    [],
  );
  const abandonRun = useCallback(() => setRun(null), []);
  const update = useCallback((fn: (run: RunState) => RunState) => setRun((r) => (r ? fn(r) : r)), []);

  const api = useMemo(
    () => ({ loaded: loaded && settingsLoaded, run, startNewRun, abandonRun, update, packs, setPackEnabled }),
    [loaded, settingsLoaded, run, startNewRun, abandonRun, update, packs, setPackEnabled],
  );
  return <RunContext.Provider value={api}>{children}</RunContext.Provider>;
}

export function useRun(): RunApi {
  const ctx = useContext(RunContext);
  if (!ctx) throw new Error('useRun must be used inside <RunProvider>');
  return ctx;
}
