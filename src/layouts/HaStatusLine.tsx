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

export default function HaStatusLine() {
  const { state, version } = useHaStatus();
  const label = state === "online" && version ? `ONLINE // HA ${version}` : LABEL[state];
  const tone = TONE[state];

  return (
    <span
      role="status"
      aria-label="Home Assistant status"
      className={`flex items-center gap-space-xs font-mono text-label-caps tracking-widest ${tone.text}`}
    >
      <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${tone.beacon}`} aria-hidden="true" />
      {label}
    </span>
  );
}
