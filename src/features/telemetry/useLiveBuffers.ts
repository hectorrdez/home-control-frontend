import { useEffect, useRef, useState } from "react";
import type { Entity } from "@/api/types";
import { TICK_MS, sampleBuffers, type Buffers } from "./liveBuffer";

// Feature 113: one shared 1 s sampling timer for every chart. Paused while the tab is hidden, cleared on unmount.
export function useLiveBuffers(entities: Entity[]): Buffers {
  const [buffers, setBuffers] = useState<Buffers>({});
  const latest = useRef(entities);

  // A store change samples the new values immediately (the tick covers the quiet sensors).
  useEffect(() => {
    latest.current = entities;
    setBuffers((prev) => sampleBuffers(prev, entities, Date.now()));
  }, [entities]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const tick = () => setBuffers((prev) => sampleBuffers(prev, latest.current, Date.now()));
    const start = () => {
      if (timer === undefined) timer = setInterval(tick, TICK_MS);
    };
    const stop = () => {
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        tick();
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, []);

  return buffers;
}
