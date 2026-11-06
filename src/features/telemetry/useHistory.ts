import { useCallback, useEffect, useState } from "react";
import { useApi } from "@/api/ApiContext";
import type { HistorySeries } from "@/api/types";
import { ApiError } from "@/api/types";
import { HISTORY_CACHE_MS } from "./history";

// Feature 112: history for a set of entities over a window. Results are cached per (ids, hours) for 60 s.
// HomeApi.getHistory takes no AbortSignal, so a response for a superseded request is ignored instead of aborted.

export type HistoryState =
  | { status: "loading" }
  | { status: "ready"; series: HistorySeries[] }
  | { status: "unavailable" } // 404 from the backend: the endpoint is not there yet
  | { status: "error" };

interface CacheEntry {
  at: number;
  series: HistorySeries[];
}

const cache = new Map<string, CacheEntry>();

export function historyKey(entityIds: string[], hours: number): string {
  return `${hours}|${entityIds.join(",")}`;
}

export function useHistory(entityIds: string[], hours: number): { state: HistoryState; retry: () => void } {
  const api = useApi();
  const key = historyKey(entityIds, hours);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<HistoryState>(() => initialState(key));

  useEffect(() => {
    if (entityIds.length === 0) {
      setState({ status: "ready", series: [] });
      return;
    }
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < HISTORY_CACHE_MS) {
      setState({ status: "ready", series: cached.series });
      return;
    }

    let active = true;
    setState({ status: "loading" });
    api
      .getHistory(entityIds, hours)
      .then((series) => {
        cache.set(key, { at: Date.now(), series });
        if (active) setState({ status: "ready", series });
      })
      .catch((err: unknown) => {
        if (!active) return;
        const notFound = err instanceof ApiError && err.kind === "not_found";
        setState(notFound ? { status: "unavailable" } : { status: "error" });
      });
    return () => {
      active = false;
    };
    // entityIds is captured by `key`; keying on the string avoids refetching for a new array with the same ids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, key, attempt]);

  const retry = useCallback(() => {
    cache.delete(key);
    setAttempt((n) => n + 1);
  }, [key]);

  return { state, retry };
}

function initialState(key: string): HistoryState {
  const cached = cache.get(key);
  return cached ? { status: "ready", series: cached.series } : { status: "loading" };
}
