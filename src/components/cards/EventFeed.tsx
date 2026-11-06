import { Activity, Blinds, Lightbulb, Lock, Plug, Thermometer } from "lucide-react";
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
export default function EventFeed({ events, areaName }: EventFeedProps) {
  const names = useEntityName();
  return (
    <Card role="region" aria-label="Event feed" className="flex flex-col gap-space-sm">
      <div className="flex flex-col gap-space-xs">
        <span className="font-label-caps text-label-caps uppercase text-on-surface">Live event feed</span>
        <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
          Session only, not stored
        </span>
      </div>
      {events.length === 0 ? (
        <p className="rounded border border-outline-variant/30 p-space-md font-label-caps text-label-caps uppercase text-on-surface-variant">
          WAITING FOR EVENTS
        </p>
      ) : (
        <ul aria-label="Event feed items" className="flex max-h-96 flex-col gap-space-xs overflow-y-auto">
          {events.map((event) => {
            const Icon = ICON[event.entityId.split(".")[0]] ?? Activity;
            return (
              <li
                key={event.key}
                className="flex items-center gap-space-sm rounded border border-outline-variant/30 p-space-sm"
              >
                <Icon size={16} className="shrink-0 text-primary-container" aria-hidden="true" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-sans text-body-md text-on-surface">
                    {`${names.displayName(event)} ${event.value}`}
                  </span>
                  <span className="truncate font-mono text-label-caps uppercase text-on-surface-variant">
                    {areaName(event.area)}
                  </span>
                </div>
                <time dateTime={event.at} className="shrink-0 font-mono text-label-caps text-on-surface-variant">
                  {new Date(event.at).toLocaleTimeString("en-GB", { hour12: false })}
                </time>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
