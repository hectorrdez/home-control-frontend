import { useEffect, useRef } from "react";
import { isOwnChange, subscribeServerEvents, subscribeStreamState } from "@/api/serverEvents";
import type { ServerResource } from "@/api/types";

// Feature 138: refetch one resource list when another device changes it (resource_changed, backend 016) and once after a
// stream reconnect (frames may have been missed). Debounced 300 ms; at most one request in flight, and a trigger during
// the request schedules one more. A failed refetch keeps the list (the caller's load decides what to keep).
export const LIVE_REFETCH_DEBOUNCE_MS = 300;

export function useLiveRefetch(resource: ServerResource, load: () => Promise<unknown>): void {
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    let again = false;
    let wasDown = false;

    function schedule() {
      if (timer === undefined) timer = setTimeout(() => void run(), LIVE_REFETCH_DEBOUNCE_MS);
    }

    async function run() {
      timer = undefined;
      if (inFlight) {
        again = true;
        return;
      }
      inFlight = true;
      try {
        await loadRef.current();
      } catch {
        // Keep the list the page already shows; the next frame retries.
      } finally {
        inFlight = false;
        if (again) {
          again = false;
          schedule();
        }
      }
    }

    const offEvents = subscribeServerEvents((event) => {
      if (event.type === "resource_changed" && event.resource === resource && !isOwnChange(event)) schedule();
    });
    const offStream = subscribeStreamState((state) => {
      if (state !== "open") {
        wasDown = true;
      } else if (wasDown) {
        wasDown = false;
        schedule();
      }
    });
    return () => {
      clearTimeout(timer);
      offEvents();
      offStream();
    };
  }, [resource]);
}
