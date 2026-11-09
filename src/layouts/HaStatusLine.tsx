import { useEntities } from "../state/EntitiesProvider";
import StatusChip from "../components/controls/StatusChip";
import { useHaStatus, type HaConnection } from "../api/useHaStatus";

const LABEL: Record<HaConnection, string> = {
  connecting: "CONNECTING",
  online: "ONLINE",
  offline: "OFFLINE",
  unauthorized: "UNAUTHORIZED",
};

const TONE: Record<HaConnection, { text: string; beacon: string }> = {
  connecting: { text: "text-on-surface-variant", beacon: "bg-on-surface-variant" },
  online: { text: "text-secondary", beacon: "bg-secondary shadow-glow-secondary" },
  offline: { text: "text-error", beacon: "bg-error shadow-glow-error" },
  unauthorized: { text: "text-error", beacon: "bg-error shadow-glow-error" },
};

// Stale stream (105): the beacon turns amber and a RECONNECTING chip shows; values keep their last state.
export default function HaStatusLine() {
  const { state, version, linkLost } = useHaStatus();
  const { connection } = useEntities();
  // Feature 140: the backend lost HA; shown with error tokens until the link is back.
  const label = linkLost ? "HA LINK LOST" : state === "online" && version ? `ONLINE // HA ${version}` : LABEL[state];
  const tone = linkLost ? TONE.offline : TONE[state];
  const stale = connection === "reconnecting";

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-space-sm">
      <span
        role="status"
        aria-label="Home Assistant status"
        className={`flex items-center gap-space-xs font-mono text-label-caps tracking-widest ${stale ? "text-tertiary-fixed-dim" : tone.text}`}
      >
        <span
          className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${stale ? "bg-tertiary-fixed-dim" : tone.beacon}`}
          aria-hidden="true"
        />
        {label}
      </span>
      {stale && (
        <StatusChip tone="tertiary" beacon role="status" aria-label="Live updates">
          RECONNECTING
        </StatusChip>
      )}
    </div>
  );
}
