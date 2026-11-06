import type { HomeApi } from "./HomeApi";
import { createDevApi, createLiveFromEnv } from "./select";

export type { HomeApi, EntityFilter } from "./HomeApi";
export type { ApiMode } from "./mode";
export * from "./types";

// Production builds are always live: the mock is never reachable from the prod bundle.
export const api: HomeApi = import.meta.env.PROD
  ? createLiveFromEnv(import.meta.env)
  : createDevApi(import.meta.env, window.location.search);
