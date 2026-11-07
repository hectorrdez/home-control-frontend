import type { HomeApi } from "./HomeApi";
import { createLiveApi } from "./liveApi";
import { resolveMode } from "./mode";
import { parseScenario, parseSeed } from "./mock/scenarios";

export interface ApiEnv {
  VITE_API_MODE?: string;
  VITE_API_URL?: string;
  VITE_API_TOKEN?: string;
  PROD: boolean;
}

export function createLiveFromEnv(env: ApiEnv): HomeApi {
  return createLiveApi({ baseUrl: env.VITE_API_URL ?? "", token: env.VITE_API_TOKEN ?? "" });
}

// The mock is loaded on first use, so dev-only code is not part of the production entry chunk.
function createLazyMockApi(search: string): HomeApi {
  let impl: Promise<HomeApi> | undefined;
  const load = () =>
    (impl ??= import("./mock/createMockApi").then(({ createMockApi }) =>
      createMockApi({ scenario: parseScenario(search), seed: parseSeed(search) }),
    ));

  return {
    getStatus: async () => (await load()).getStatus(),
    getAreas: async () => (await load()).getAreas(),
    getEntities: async (filter) => (await load()).getEntities(filter),
    runAction: async (entityId, action) => (await load()).runAction(entityId, action),
    getHistory: async (entityIds, hours) => (await load()).getHistory(entityIds, hours),
    getAliases: async () => (await load()).getAliases(),
    setAlias: async (entityId, alias) => (await load()).setAlias(entityId, alias),
    deleteAlias: async (entityId) => (await load()).deleteAlias(entityId),
    getCalibrations: async () => (await load()).getCalibrations(),
    putCalibration: async (entityId, input) => (await load()).putCalibration(entityId, input),
    deleteCalibration: async (entityId) => (await load()).deleteCalibration(entityId),
    setCoverPercent: async (entityId, percent) => (await load()).setCoverPercent(entityId, percent),
    subscribe(onEntity, onConnection) {
      let stop: (() => void) | undefined;
      let closed = false;
      void load().then((impl) => {
        if (!closed) stop = impl.subscribe(onEntity, onConnection);
      });
      return () => {
        closed = true;
        stop?.();
      };
    },
  };
}

// Dev/test selection: VITE_API_MODE decides (mock by default). `search` is the startup query string.
export function createDevApi(env: ApiEnv, search: string): HomeApi {
  const mode = resolveMode({ VITE_API_MODE: env.VITE_API_MODE, PROD: env.PROD });
  return mode === "mock" ? createLazyMockApi(search) : createLiveFromEnv(env);
}
