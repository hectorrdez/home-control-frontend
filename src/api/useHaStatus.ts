import { useEffect, useState } from "react";
import { useApi } from "./ApiContext";
import { subscribeServerEvents } from "./serverEvents";
import { ApiError } from "./types";

export type HaConnection = "connecting" | "online" | "offline" | "unauthorized";

export interface HaStatusView {
  state: HaConnection;
  version: string | null;
  // Feature 140 (backend 019): the backend lost Home Assistant (ha_link connected=false) until it is back.
  linkLost: boolean;
}

export const HA_STATUS_POLL_MS = 30_000;

// Polls the HA link every 30 s. Never throws: failures become a state for the header.
export function useHaStatus(pollMs: number = HA_STATUS_POLL_MS): HaStatusView {
  const api = useApi();
  const [view, setView] = useState<HaStatusView>({ state: "connecting", version: null, linkLost: false });
  const [linkLost, setLinkLost] = useState(false);

  useEffect(
    () =>
      subscribeServerEvents((event) => {
        if (event.type === "ha_link") setLinkLost(!event.connected);
      }),
    [],
  );

  useEffect(() => {
    let active = true;

    const check = async () => {
      try {
        const status = await api.getStatus();
        if (!active) return;
        setView((prev) => ({
          ...prev,
          ...(status.online ? { state: "online", version: status.version } : { state: "offline", version: null }),
        }));
      } catch (err) {
        if (!active) return;
        const unauthorized = err instanceof ApiError && err.kind === "unauthorized";
        setView((prev) => ({ ...prev, state: unauthorized ? "unauthorized" : "offline", version: null }));
      }
    };

    void check();
    const timer = setInterval(() => void check(), pollMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [api, pollMs]);

  return { ...view, linkLost };
}
