import { useCallback, useSyncExternalStore } from "react";
import type { SyncedSetting } from "./syncedSetting";

// Feature 134: React view of a synced setting. Same tuple shape as useState; `set` goes through the store (debounced PUT).
export function useSyncedSetting<T>(store: SyncedSetting<T>): [T | null, (value: T) => void] {
  const value = useSyncExternalStore(store.subscribe, store.get, store.get);
  const set = useCallback((next: T) => store.set(next), [store]);
  return [value, set];
}
