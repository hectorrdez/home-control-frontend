import type { HomeApi } from "./HomeApi";
import { createApiFromEnv } from "./select";

export type { HomeApi, EntityFilter } from "./HomeApi";
export type { ApiMode } from "./mode";
export * from "./types";

export const api: HomeApi = createApiFromEnv(import.meta.env);
