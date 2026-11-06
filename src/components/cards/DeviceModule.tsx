import { useCallback, useEffect, useRef, useState } from "react";
import StringUtils from "@utils/StringUtils";
import Card from "@components/cards/Card";
import type { Entity } from "@/api/types";
import { useEntities } from "@/state/EntitiesProvider";
import { useToast } from "@components/feedback/Toast";
import EditableName from "@components/controls/EditableName";
import { useEntityName } from "@/features/names/useEntityName";
import type { Intent } from "@/state/actions";
import DeviceControls from "./DeviceControls";
import { describeState, domainHue, domainIcon } from "./deviceState";

type DeviceModuleProps = {
  entity: Entity;
  areaName: string;
  drawText?: string; // linked plug power sensor, e.g. "42 W" (103 mapping)
};

const beaconTone = {
  primary: "bg-primary-container shadow-glow-primary",
  secondary: "bg-secondary shadow-glow-secondary",
  tertiary: "bg-tertiary-fixed-dim shadow-glow-tertiary",
};

const hueText = {
  primary: "text-primary-container",
  secondary: "text-secondary",
  tertiary: "text-tertiary-fixed-dim",
};

// Left indicator on ON cards (only the left edge takes the hue).
const hueBorderLeft = {
  primary: "border-l-primary-container",
  secondary: "border-l-secondary",
  tertiary: "border-l-tertiary-fixed-dim",
};

// Icon tile halo, lit only while the device is ON.
const hueHalo = {
  primary: "shadow-glow-primary",
  secondary: "shadow-glow-secondary",
  tertiary: "shadow-glow-tertiary",
};

// Surface wash on ON cards: hue fades into the card surface.
const hueWash = {
  primary: "from-primary-container/10",
  secondary: "from-secondary/10",
  tertiary: "from-tertiary-fixed-dim/10",
};

// 117: how long the success flash / error highlight stays after an action settles.
const FEEDBACK_MS = 1200;

// Device card (103 read-only, 104 controls, 117 feedback). A pending or settling action shows a loader in the
// control that sent it; success flashes the card, failure highlights it and shows the error toast.
export default function DeviceModule({ entity, areaName, drawText }: DeviceModuleProps) {
  const Icon = domainIcon(entity.domain);
  const hue = domainHue(entity.domain);
  const view = describeState(entity);
  const { state, sendIntent } = useEntities();
  const toast = useToast();
  const names = useEntityName();
  const transition = state.pending[entity.entityId];
  const pending = Boolean(transition);
  const settling = transition?.settling ?? false;
  const outcome = useRef<boolean | null>(null); // result of the last send: false = rolled back by the provider
  const wasPending = useRef(false);
  const feedbackTimer = useRef<number | undefined>(undefined);
  const [feedback, setFeedback] = useState<"success" | "error" | null>(null);

  const flash = useCallback((kind: "success" | "error") => {
    window.clearTimeout(feedbackTimer.current);
    setFeedback(kind);
    feedbackTimer.current = window.setTimeout(() => setFeedback(null), FEEDBACK_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(feedbackTimer.current), []);

  // The settled action flashes success, unless its send already failed (the failure owns the highlight).
  useEffect(() => {
    if (pending) {
      wasPending.current = true;
      return;
    }
    if (!wasPending.current) return;
    wasPending.current = false;
    if (outcome.current !== false) flash("success");
  }, [pending, flash]);

  const send = (intent: Intent) => {
    outcome.current = null;
    void sendIntent(entity, intent).then((ok) => {
      outcome.current = ok;
      if (!ok) {
        flash("error");
        toast.show(`Could not update ${names.displayName(entity)}`);
      }
    });
  };
  const visualState = view.unavailable ? "unavailable" : view.on ? "on" : "off";
  const feedbackClass =
    feedback === "success"
      ? "!border-secondary/50 !bg-secondary/10"
      : feedback === "error"
        ? "!border-error/50 !bg-error/10"
        : "";

  return (
    <Card
      role="article"
      aria-label={names.displayName(entity)}
      data-state={visualState}
      data-feedback={feedback ?? undefined}
      className={StringUtils.JoinClassName(
        "device-card flex flex-col gap-space-sm transition duration-150 motion-reduce:transition-none",
        "hover:-translate-y-0.5 hover:bg-surface-container-high motion-reduce:hover:translate-y-0",
        view.unavailable
          ? "!border-error/40 bg-surface-container-low"
          : view.on
            ? `border-outline-variant/30 border-l-2 bg-linear-to-br to-surface-container ${hueWash[hue]} ${hueBorderLeft[hue]}`
            : "border-outline-variant/30",
        feedbackClass,
      )}
    >
      <div className="flex items-center gap-space-sm">
        <div
          data-testid="device-icon"
          className={StringUtils.JoinClassName(
            "flex h-11 w-11 min-w-11 items-center justify-center rounded-lg bg-surface-container-lowest transition duration-150 motion-reduce:transition-none",
            view.on ? `${hueText[hue]} ${hueHalo[hue]}` : "text-on-surface-variant",
          )}
        >
          <Icon size={22} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <EditableName
            entityId={entity.entityId}
            shown={names.shortName(entity)}
            label={names.displayName(entity)}
            raw={entity.name}
            canRename={names.canRename}
            onRename={(alias) => names.renameEntity(entity, alias)}
            textClassName="font-sans text-title-md font-semibold text-on-surface"
          />
          <span className="block truncate font-mono text-label-caps uppercase text-on-surface-variant">
            {`${areaName} // ${entity.entityId}`}
          </span>
        </div>
      </div>
      <p
        className={StringUtils.JoinClassName(
          "flex items-center gap-space-xs font-mono text-telemetry-md",
          view.unavailable ? "text-error" : view.on ? hueText[hue] : "text-on-surface-variant",
        )}
      >
        <span
          aria-hidden="true"
          className={StringUtils.JoinClassName(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            view.unavailable ? "bg-error" : view.on ? beaconTone[hue] : "bg-outline-variant",
          )}
        />
        <span>{view.text}</span>
      </p>
      {drawText && (
        <p className="font-mono text-label-caps uppercase text-on-surface-variant">{`DRAW METRIC ${drawText}`}</p>
      )}
      {/* Live status for screen readers; the visible feedback is the loader inside the control. */}
      <span aria-live="polite" className="sr-only">
        {pending ? (settling ? "UPDATING" : "SENDING") : ""}
      </span>
      <DeviceControls entity={entity} disabled={pending} send={send} />
    </Card>
  );
}
