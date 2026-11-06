export type ApiMode = "live" | "mock";

export interface ModeEnv {
  VITE_API_MODE?: string;
  PROD: boolean;
}

// VITE_API_MODE wins when set to a known value; otherwise mock in dev and live in production builds.
export function resolveMode(env: ModeEnv): ApiMode {
  const raw = env.VITE_API_MODE?.trim().toLowerCase();
  if (raw === "live" || raw === "mock") return raw;
  return env.PROD ? "live" : "mock";
}
