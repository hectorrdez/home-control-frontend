import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useApi } from "@/api/ApiContext";
import { ApiError, ReloadRateLimitedError, type ReloadResult } from "@/api/types";
import { useEntities } from "@/state/EntitiesProvider";
import PageGrid from "@layouts/PageGrid";
import Button from "@components/controls/Button";
import StatusChip from "@components/controls/StatusChip";
import Card from "@components/cards/Card";

// Feature 164: /settings. First section: Integrations, with RELOAD DEVICES (POST /api/ha/reload, backend 024).
type ReloadState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; result: ReloadResult }
  | { kind: "error"; message: string }
  | { kind: "unavailable" };

// Maps a failed reload to the message shown in the section. 429 is handled by the caller (countdown).
function reloadErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 409) return "A reload is already running";
  if (err instanceof ApiError && err.status === 502) return "Home Assistant is not reachable";
  return "Could not reload devices. Try again.";
}

export default function SettingsPage() {
  const api = useApi();
  const { refreshAreas } = useEntities();
  const [reload, setReload] = useState<ReloadState>({ kind: "idle" });
  const [cooldown, setCooldown] = useState(0); // seconds left before the next reload is allowed (429)

  // Countdown after a 429: ticks once a second until the button is enabled again.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const running = reload.kind === "running";
  const unavailable = reload.kind === "unavailable";

  const onReload = () => {
    if (running || cooldown > 0) return;
    setReload({ kind: "running" });
    api.reloadIntegrations().then(
      (result) => {
        setReload({ kind: "done", result });
        // One areas refetch: the panel, devices list and 3D view pick up the new devices.
        refreshAreas();
      },
      (err: unknown) => {
        if (err instanceof ReloadRateLimitedError) {
          setCooldown(err.retryAfterSeconds);
          setReload({ kind: "error", message: `Wait ${err.retryAfterSeconds} s before reloading again` });
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          setReload({ kind: "unavailable" });
          return;
        }
        setReload({ kind: "error", message: reloadErrorMessage(err) });
      },
    );
  };

  const buttonLabel = running ? "RELOADING" : cooldown > 0 ? `WAIT ${cooldown} S` : "RELOAD DEVICES";

  return (
    <PageGrid>
      <div className="col-span-12 flex flex-col gap-space-xs">
        <h1 className="font-label-caps text-label-caps uppercase text-on-surface-variant">SETTINGS</h1>
      </div>

      <section aria-labelledby="settings-integrations" className="col-span-12 md:col-span-8 xl:col-span-6">
        <Card className="flex flex-col gap-space-sm">
          <div className="flex flex-wrap items-center justify-between gap-space-sm">
            <h2 id="settings-integrations" className="font-sans text-title-md text-on-surface">
              Integrations
            </h2>
            {unavailable && <StatusChip tone="neutral">NOT AVAILABLE</StatusChip>}
          </div>

          {!unavailable && (
            <>
              <p className="font-sans text-body-md text-on-surface-variant">
                Reload the device integrations (Tuya) so devices added in Smart Life appear here. Devices of those
                integrations can show as unavailable for a few seconds.
              </p>
              <div>
                <Button
                  busy={running}
                  disabled={running || cooldown > 0}
                  onClick={onReload}
                  className="w-full md:w-auto"
                >
                  {!running && <RefreshCw size={16} aria-hidden="true" />}
                  {buttonLabel}
                </Button>
              </div>
            </>
          )}

          <div role="status" aria-live="polite" className="flex flex-col gap-space-xs font-mono text-label-caps uppercase">
            {reload.kind === "done" && <ReloadSummary result={reload.result} />}
            {reload.kind === "error" && <p className="text-error">{reload.message}</p>}
            {reload.kind === "unavailable" && (
              <p className="text-on-surface-variant">Device reload is not available on this backend</p>
            )}
          </div>
        </Card>
      </section>
    </PageGrid>
  );
}

function ReloadSummary({ result }: { result: ReloadResult }) {
  if (result.entries.length === 0) {
    return <p className="text-on-surface-variant">No integrations to reload</p>;
  }
  const reloaded = result.entries.filter((entry) => entry.ok).length;
  const newEntities = Math.max(result.entities.after - result.entities.before, 0);
  const failed = result.entries.filter((entry) => !entry.ok);
  return (
    <>
      <p className="text-secondary">
        {`${reloaded} INTEGRATIONS RELOADED • ${newEntities} NEW ENTITIES`}
      </p>
      {failed.map((entry) => (
        <p key={entry.entryId} className="text-error">
          {`${entry.title}: ${entry.error ?? "failed"}`}
        </p>
      ))}
    </>
  );
}
