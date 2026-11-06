import { createLiveApi } from "./liveApi";
import { resolveMode } from "./mode";
import type { HomeApi } from "./HomeApi";
import { stubApi } from "./stubApi";

export interface ApiEnv {
  VITE_API_MODE?: string;
  VITE_API_URL?: string;
  VITE_API_TOKEN?: string;
  PROD: boolean;
}

// Picks the HomeApi implementation for the build/dev environment.
export function createApiFromEnv(env: ApiEnv): HomeApi {
  const mode = resolveMode({ VITE_API_MODE: env.VITE_API_MODE, PROD: env.PROD });
  if (mode === "mock") return stubApi;
  return createLiveApi({ baseUrl: env.VITE_API_URL ?? "", token: env.VITE_API_TOKEN ?? "" });
}
