import { useCallback } from "react";
import type { Entity } from "@/api/types";
import type { NameSource } from "./displayName";
import { useAliases } from "@/state/AliasesProvider";
import { useEntities } from "@/state/EntitiesProvider";
import { useToast } from "@components/feedback/Toast";
import { displayName, shortName } from "./displayName";

// Feature 115: the one place that turns an entity into the name the user sees.
// Alias wins verbatim; otherwise the cleaned HA name. Raw name stays for matching and tooltips.
export function useEntityName() {
  const { aliases, aliasesStatus, renameEntity: rename, retry } = useAliases();
  const { state } = useEntities();
  const toast = useToast();

  const areaName = useCallback(
    (areaId: string | null) => (areaId === null ? null : (state.areas.find((a) => a.areaId === areaId)?.name ?? null)),
    [state.areas],
  );

  const displayNameOf = useCallback((entity: NameSource) => aliases[entity.entityId] ?? displayName(entity), [aliases]);

  const shortNameOf = useCallback(
    (entity: Entity) => aliases[entity.entityId] ?? shortName(entity, areaName(entity.area)),
    [aliases, areaName],
  );

  const renameEntity = useCallback(
    async (entity: Entity, alias: string): Promise<boolean> => {
      const ok = await rename(entity, alias);
      if (!ok) toast.show(`Could not rename ${displayName(entity)}`);
      return ok;
    },
    [rename, toast],
  );

  return {
    displayName: displayNameOf,
    shortName: shortNameOf,
    rawName: (entity: NameSource) => entity.name,
    renameEntity,
    aliasesStatus,
    canRename: aliasesStatus !== "unavailable",
    retryAliases: retry,
  };
}
