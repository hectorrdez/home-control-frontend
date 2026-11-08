import { useEffect, useRef } from "react";
import type { AlertCenterValue } from "@/features/alerts/useAlerts";

// Feature 129: HIGH alert banner. role=alertdialog, focus on DISMISS, stays until dismissed.
// Its entrance animation is motion-safe only; the sound is not tied to motion.
export default function AlertBanner({ queue, soundEnabled, dismiss, dismissAll }: AlertCenterValue) {
  const dismissRef = useRef<HTMLButtonElement>(null);
  const current = queue[0];
  const currentId = current?.id;

  useEffect(() => {
    if (currentId !== undefined) dismissRef.current?.focus();
  }, [currentId]);

  if (!current) return null;

  return (
    <div
      role="alertdialog"
      aria-labelledby="high-alert-title"
      aria-describedby="high-alert-text"
      className="fixed inset-x-space-md top-20 z-[60] flex flex-col gap-space-sm rounded-xl border-2 border-error bg-error-container p-space-md text-on-error-container motion-safe:animate-pulse"
    >
      <h2 id="high-alert-title" className="font-sans text-title-md uppercase text-on-error-container">
        {`HIGH ALERT: ${current.name}`}
      </h2>
      <p id="high-alert-text" className="font-mono text-label-caps uppercase">
        {`${current.areaName ?? "NO AREA"} · ${current.text}`}
      </p>
      {current.since !== undefined && <p className="font-mono text-label-caps uppercase">{`SINCE ${current.since}`}</p>}
      {queue.length > 1 && <p className="font-mono text-label-caps uppercase">{`+${queue.length - 1} MORE QUEUED`}</p>}
      {!soundEnabled && <p className="font-mono text-label-caps uppercase">SOUND BLOCKED: ENABLE ALERT SOUND TO HEAR IT</p>}
      <div className="flex flex-wrap gap-space-sm">
        <button
          ref={dismissRef}
          type="button"
          onClick={dismiss}
          className="min-h-11 rounded border border-on-error-container px-space-md font-mono text-label-caps uppercase focus-visible:outline-2 focus-visible:outline-on-error-container"
        >
          DISMISS
        </button>
        {queue.length > 1 && (
          <button
            type="button"
            onClick={dismissAll}
            className="min-h-11 rounded border border-on-error-container px-space-md font-mono text-label-caps uppercase focus-visible:outline-2 focus-visible:outline-on-error-container"
          >
            DISMISS ALL
          </button>
        )}
      </div>
    </div>
  );
}

// Header control: unlocks the alert sound for the session (browsers need a user gesture first).
export function AlertSoundControl({ soundEnabled, enableSound }: Pick<AlertCenterValue, "soundEnabled" | "enableSound">) {
  if (soundEnabled) return <span className="font-mono text-label-caps uppercase text-on-surface-variant">ALERT SOUND ON</span>;
  return (
    <button
      type="button"
      onClick={enableSound}
      className="min-h-11 rounded border border-outline-variant/40 px-space-sm font-mono text-label-caps uppercase text-on-surface-variant hover:text-primary-container focus-visible:outline-2 focus-visible:outline-primary-container"
    >
      ENABLE ALERT SOUND
    </button>
  );
}
