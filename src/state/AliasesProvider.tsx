import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useApi } from "@/api/ApiContext";
import type { Alias, Entity } from "@/api/types";
import { ApiError } from "@/api/types";
import { displayName, NAME_MAX_LENGTH } from "@/features/names/displayName";
import { useLiveRefetch } from "./useLiveRefetch";

// Feature 115: user aliases from backend 008. Aliases never travel on entities; the client merges them.
export type AliasesStatus = "loading" | "ready" | "unavailable" | "error";

interface AliasesContextValue {
  aliases: Record<string, string>;
  aliasesStatus: AliasesStatus;
  retry: () => void;
  // Resolves false after a rollback (the caller shows the toast). Empty or equal-to-cleaned name = reset.
  renameEntity: (entity: Entity, alias: string) => Promise<boolean>;
}

const AliasesContext = createContext<AliasesContextValue | null>(null);

function toRecord(list: Alias[]): Record<string, string> {
  return Object.fromEntries(list.map((row) => [row.entityId, row.alias]));
}

// Same normalisation as the backend: trim, collapse whitespace, max 80 chars.
export function normalizeAlias(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, NAME_MAX_LENGTH);
}

export function AliasesProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [aliasesStatus, setStatus] = useState<AliasesStatus>("loading");
  const [reloadToken, setReloadToken] = useState(0);
  const requestCounter = useRef(0);
  const latestByEntity = useRef<Record<string, number>>({});
  const aliasesRef = useRef<Record<string, string>>({});
  aliasesRef.current = aliases;

  useEffect(() => {
    let active = true;
    setStatus("loading");
    api.getAliases().then(
      (list) => {
        if (!active) return;
        setAliases(toRecord(list));
        setStatus("ready");
      },
      (error: unknown) => {
        if (!active) return;
        // Backend without the aliases endpoint: rename UI hidden. Any other failure keeps cleaned names.
        const missing = error instanceof ApiError && error.kind === "not_found";
        setStatus(missing ? "unavailable" : "error");
      },
    );
    return () => {
      active = false;
    };
  }, [api, reloadToken]);

  const retry = useCallback(() => setReloadToken((n) => n + 1), []);

  // Feature 138: another device renamed an entity; a failed refetch keeps the current names.
  const reload = useCallback(() => api.getAliases().then((list) => setAliases(toRecord(list))), [api]);
  useLiveRefetch("aliases", reload);

  const renameEntity = useCallback(
    (entity: Entity, raw: string): Promise<boolean> => {
      if (aliasesStatus === "unavailable") return Promise.resolve(false);
      const normalized = normalizeAlias(raw);
      const previous = aliasesRef.current[entity.entityId];
      const reset = normalized === "" || normalized === displayName(entity);
      const next = reset ? undefined : normalized;
      if (next === previous || (reset && previous === undefined)) return Promise.resolve(true); // unchanged: no request

      const requestId = ++requestCounter.current;
      latestByEntity.current[entity.entityId] = requestId;
      const optimistic = (value: string | undefined) =>
        setAliases((current) => {
          const copy = { ...current };
          if (value === undefined) delete copy[entity.entityId];
          else copy[entity.entityId] = value;
          return copy;
        });
      optimistic(next);

      const request = next === undefined ? api.deleteAlias(entity.entityId) : api.setAlias(entity.entityId, next);
      return request.then(
        (list) => {
          // Latest wins: a stale response must not overwrite a newer rename of the same entity.
          if (latestByEntity.current[entity.entityId] === requestId) setAliases(toRecord(list));
          return true;
        },
        () => {
          if (latestByEntity.current[entity.entityId] === requestId) optimistic(previous);
          return false;
        },
      );
    },
    [api, aliasesStatus],
  );

  const value = useMemo<AliasesContextValue>(
    () => ({ aliases, aliasesStatus, retry, renameEntity }),
    [aliases, aliasesStatus, retry, renameEntity],
  );

  return <AliasesContext.Provider value={value}>{children}</AliasesContext.Provider>;
}

export function useAliases(): AliasesContextValue {
  const value = useContext(AliasesContext);
  if (!value) throw new Error("useAliases must be used inside AliasesProvider");
  return value;
}
