import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Activity, Bell, Blinds, Lightbulb, Lock, Maximize2, Plug, Thermometer, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { FeedEvent } from "@/state/feed";
import Card from "./Card";
import { useEntityName } from "@/features/names/useEntityName";

const ICON: Record<string, LucideIcon> = {
  binary_sensor: Activity,
  lock: Lock,
  cover: Blinds,
  climate: Thermometer,
  light: Lightbulb,
  switch: Plug,
};

interface EventFeedProps {
  events: FeedEvent[];
  areaName: (areaId: string | null) => string;
}

// Newest-first list of state changes. Session only: nothing is stored or fetched (no HA logbook endpoint).
// Feature 153: the expand control opens the same list in a modal (centred on desktop, fullscreen on mobile).
export default function EventFeed({ events, areaName }: EventFeedProps) {
  const names = useEntityName();
  const [expanded, setExpanded] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const collapse = useCallback(() => setExpanded(false), []);

  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = triggerRef.current;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    // Capture phase on window: Escape collapses the expanded panel only, not the SideDrawer behind it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      collapse();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey, true);
      trigger?.focus();
    };
  }, [expanded, collapse]);

  const list =
    events.length === 0 ? (
      <p className="rounded border border-outline-variant/30 p-space-md font-label-caps text-label-caps uppercase text-on-surface-variant">
        WAITING FOR EVENTS
      </p>
    ) : (
      <ul aria-label="Event feed items" className="flex min-h-0 flex-1 flex-col gap-space-xs overflow-y-auto">
        {events.map((event) => {
          // Feature 129: alerts get a bell and the level label; their text is the rule message or trigger.
          const Icon = event.alert ? Bell : (ICON[event.entityId.split(".")[0]] ?? Activity);
          return (
            <li
              key={event.key}
              data-alert={event.alert}
              className={`flex items-center gap-space-sm rounded border p-space-sm ${event.alert === "high" ? "border-error bg-error-container/40" : "border-outline-variant/30"}`}
            >
              <Icon size={16} className="shrink-0 text-primary-container" aria-hidden="true" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-sans text-body-md text-on-surface">
                  {event.entityId ? `${names.displayName(event)} ${event.value}` : event.value}
                </span>
                <span className="truncate font-mono text-label-caps uppercase text-on-surface-variant">
                  {event.alert ? `ALERT ${event.alert.toUpperCase()} · ${areaName(event.area) ?? ""}` : areaName(event.area)}
                </span>
              </div>
              <time dateTime={event.at} className="shrink-0 font-mono text-label-caps text-on-surface-variant">
                {new Date(event.at).toLocaleTimeString("en-GB", { hour12: false })}
              </time>
            </li>
          );
        })}
      </ul>
    );

  return (
    <>
      <Card role="region" aria-label="Event feed" className="flex flex-col gap-space-sm">
        <div className="flex items-start justify-between gap-space-xs">
          <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
            Session only, not stored
          </span>
          <button
            ref={triggerRef}
            type="button"
            aria-label="Expand event feed"
            aria-expanded={expanded}
            onClick={() => setExpanded(true)}
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded text-on-surface-variant hover:text-primary-container focus-visible:outline-2 focus-visible:outline-primary-container"
          >
            <Maximize2 size={18} aria-hidden="true" />
          </button>
        </div>
        {expanded ? (
          <p className="rounded border border-outline-variant/30 p-space-md font-label-caps text-label-caps uppercase text-on-surface-variant">
            SHOWN IN EXPANDED VIEW
          </p>
        ) : (
          list
        )}
      </Card>
      {expanded &&
        createPortal(
          // Portalled to body: the SideDrawer transform would otherwise trap the fixed overlay inside its 20rem column.
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Event feed"
            className="fixed inset-0 z-50 flex bg-surface-container-lowest/90 md:items-center md:justify-center md:p-space-xl"
          >
            <div
              style={{
                paddingTop: "env(safe-area-inset-top)",
                paddingBottom: "env(safe-area-inset-bottom)",
              }}
              className="flex h-dvh w-full flex-col gap-space-sm border-outline-variant bg-surface-container p-space-md text-on-surface motion-reduce:transition-none md:h-4/5 md:max-w-3xl md:rounded-lg md:border"
            >
              <div className="flex items-start justify-between gap-space-xs">
                <div className="flex min-w-0 flex-col">
                  <span className="font-label-caps text-label-caps uppercase text-on-surface">Event feed</span>
                  <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                    Session only, not stored
                  </span>
                </div>
                <button
                  ref={closeRef}
                  type="button"
                  aria-label="Close expanded event feed"
                  onClick={collapse}
                  className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded text-on-surface-variant hover:text-primary-container focus-visible:outline-2 focus-visible:outline-primary-container"
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
              {list}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
