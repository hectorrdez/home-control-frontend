import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSyncedSetting } from "@/features/settings/useSyncedSetting";
import {
  activeFilters,
  filtersSetting,
  fromStoredFilters,
  toStoredFilters,
  type ChartFilters,
} from "./widgetFilters";

// Feature 137: CHARTS panel filters as the shared setting telemetry.filters. Typing is applied at once locally; a remote
// change replaces the filters live, except while the search input has focus (applied on blur, so typing is not overwritten).
export function useChartFilters(zoneIds: ReadonlySet<string>) {
  const [stored] = useSyncedSetting(filtersSetting);
  const [base, setBase] = useState<ChartFilters>(() => fromStoredFilters(stored));
  // JSON of the last value this hook applied or wrote: a value we already have is never re-applied.
  const lastJson = useRef<string | null>(stored === null ? null : JSON.stringify(stored));
  const searchFocused = useRef(false);
  const remotePending = useRef(false);

  useEffect(() => {
    if (stored === null) return;
    const json = JSON.stringify(stored);
    if (json === lastJson.current) return;
    lastJson.current = json;
    if (searchFocused.current) {
      remotePending.current = true;
      return;
    }
    setBase(fromStoredFilters(stored));
  }, [stored]);

  const filters = useMemo(() => activeFilters(base, zoneIds), [base, zoneIds]);

  const change = useCallback((next: ChartFilters) => {
    const snapshot = toStoredFilters(next);
    lastJson.current = JSON.stringify(snapshot);
    setBase(next);
    filtersSetting.set(snapshot);
  }, []);

  const onSearchFocusChange = useCallback((focused: boolean) => {
    searchFocused.current = focused;
    if (focused || !remotePending.current) return;
    remotePending.current = false;
    const latest = filtersSetting.get();
    if (latest === null) return;
    lastJson.current = JSON.stringify(latest);
    setBase(fromStoredFilters(latest));
  }, []);

  return { filters, change, onSearchFocusChange };
}
