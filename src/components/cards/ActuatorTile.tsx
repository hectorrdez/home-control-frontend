import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { KeyboardEvent } from "react";
import StringUtils from "@utils/StringUtils";
import PathUtils from "@utils/PathUtils";
import Spinner from "@components/controls/Spinner";
import { useToast } from "@components/feedback/Toast";
import type { Entity } from "@/api/types";
import { useEntityName } from "@/features/names/useEntityName";
import { tapIntentFor } from "@/features/devices/tileActions";
import { useLongPress } from "@/features/devices/useLongPress";
import { tileIconComponent } from "@/features/devices/tileIcons";
import { useTileIcon } from "@/features/devices/useTileIcon";
import { decideCoverTap, estimateMotionPercent } from "@/features/covers/coverTap";
import { clearMotion, getCoverMemory, recordMove, recordStop } from "@/features/covers/coverMemory";
import { useCalibrations } from "@/state/CalibrationsProvider";
import type { CoverCalibration } from "@/api/types";
import { describeState, domainHue, type Hue } from "./deviceState";
import { useDeviceAction } from "./useDeviceAction";

const calibrationLeg = (calibration: CoverCalibration, direction: "open" | "close") =>
  direction === "open" ? calibration.openMs : calibration.closeMs;

const numberOf = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

// Feature 155: compact actuator tile for the Home 3D panel (icon, name, zone). Border: domain hue when on,
// neutral when off, grey when unavailable. A pending or settling action swaps the icon for a loader and ignores taps.
export type ActuatorTileProps = {
  entity: Entity;
  areaName: string;
  // Feature 156: long press, the ContextMenu key, Shift+F10 or a right click open the actuator menu.
  onLongPress?: (entity: Entity) => void;
};

const hueText: Record<Hue, string> = {
  primary: "text-primary-container",
  secondary: "text-secondary",
  tertiary: "text-tertiary-fixed-dim",
};

const hueBorder: Record<Hue, string> = {
  primary: "border-primary-container",
  secondary: "border-secondary",
  tertiary: "border-tertiary-fixed-dim",
};

const hueHalo: Record<Hue, string> = {
  primary: "shadow-glow-primary",
  secondary: "shadow-glow-secondary",
  tertiary: "shadow-glow-tertiary",
};

export default function ActuatorTile({ entity, areaName, onLongPress }: ActuatorTileProps) {
  const names = useEntityName();
  const navigate = useNavigate();
  const view = describeState(entity);
  const hue = domainHue(entity.domain);
  const [iconName] = useTileIcon(entity.entityId, entity.domain);
  const Icon = tileIconComponent(iconName);
  const { send, pending, settling, feedback } = useDeviceAction(entity);
  const visualState = view.unavailable ? "unavailable" : view.on ? "on" : "off";
  const label = names.displayName(entity);
  const isCover = entity.domain === "cover";
  const inert = view.unavailable || (!isCover && pending); // covers stay tappable while moving (a tap stops them)

  const longPress = useLongPress(() => onLongPress?.(entity));

  const openMenu = () => onLongPress?.(entity);

  // Feature 157: cover taps. `flight` is the cover request this tile has in flight (a ref guards synchronous double taps).
  const { status: calibrationStatus, calibrations } = useCalibrations();
  const toast = useToast();
  const calibrated = isCover && calibrationStatus === "ready" && calibrations[entity.entityId] !== undefined;
  const estimate = numberOf(entity.attributes.estimated_position);
  const livePercent = estimate ?? numberOf(entity.attributes.current_position);
  const memory = getCoverMemory(entity.entityId);
  const [flight, setFlight] = useState<"move" | "stop" | null>(null);
  const flightRef = useRef<"move" | "stop" | null>(null);
  const setFlightBoth = (next: "move" | "stop" | null) => {
    flightRef.current = next;
    setFlight(next);
  };
  // A calibrated move reports no position until it ends (backend), so the motion mark is cleared when a settled
  // estimate arrives. Pending requests keep the mark (their optimistic estimate is the target).
  useEffect(() => {
    if (isCover && calibrated && !pending && estimate !== null) clearMotion(entity.entityId);
  }, [isCover, calibrated, pending, estimate, entity.entityId]);
  const coverMoving =
    isCover &&
    (entity.state === "opening" ||
      entity.state === "closing" ||
      flight === "move" ||
      (calibrated && memory.motion !== null && estimate === null));

  // The stop percentage: the reported position, else the estimate from the move this tile started (a calibrated move
  // reports no position while it runs, and a full-travel stop keeps none on the backend).
  const stopCover = () => {
    const motion = getCoverMemory(entity.entityId).motion;
    const percentAtTap = livePercent ?? (motion ? estimateMotionPercent(motion, Date.now()) : null);
    recordStop(entity.entityId);
    setFlightBoth("stop");
    void Promise.resolve(send({ kind: "cover_stop" })).then((ok) => {
      setFlightBoth(null);
      if (ok && calibrated && percentAtTap !== null) toast.show(`${label} stopped at ${percentAtTap}%`);
    });
  };

  const startCoverMove = (direction: "open" | "close") => {
    setFlightBoth("move");
    const legMs = calibrated && calibrations[entity.entityId] ? calibrationLeg(calibrations[entity.entityId], direction) : null;
    recordMove(entity.entityId, direction, { from: livePercent, legMs });
    const intent = calibrated
      ? ({ kind: "cover_percent", percent: direction === "open" ? 100 : 0 } as const)
      : ({ kind: direction === "open" ? "cover_open" : "cover_close" } as const);
    void Promise.resolve(send(intent)).then((ok) => {
      if (!ok) clearMotion(entity.entityId);
      setFlightBoth(null);
    });
  };

  const coverTap = () => {
    if (view.unavailable || flightRef.current === "stop") return;
    const action = decideCoverTap({
      calibrated,
      position: livePercent,
      moving: coverMoving,
      lastCommand: memory.lastCommand,
      lastWasStopped: memory.lastWasStopped,
    });
    if (action.kind === "stop") {
      stopCover();
      return;
    }
    if (pending || flightRef.current !== null) return; // a move is already on its way: no double send
    startCoverMove(action.direction);
  };

  const onClick = () => {
    if (longPress.takeLongPress()) return; // the click that ends a long press is not a tap
    onTap();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
      event.preventDefault();
      openMenu();
    }
  };

  const onTap = () => {
    if (isCover) return coverTap();
    if (inert) return;
    const intent = tapIntentFor(entity);
    if (intent) void send(intent);
    else void navigate(PathUtils.deviceDetailPath(entity.entityId));
  };

  const feedbackClass =
    feedback === "success"
      ? "!border-secondary/50 !bg-secondary/10"
      : feedback === "error"
        ? "!border-error/50 !bg-error/10"
        : "";

  return (
    <button
      type="button"
      aria-label={label}
      aria-busy={pending || undefined}
      aria-disabled={inert || undefined}
      data-state={visualState}
      data-feedback={feedback ?? undefined}
      data-moving={coverMoving || undefined}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => {
        // Touch long press also raises contextmenu on some browsers: suppress the native menu and open ours.
        event.preventDefault();
        openMenu();
      }}
      {...longPress.bind}
      className={StringUtils.JoinClassName(
        "device-card flex w-full min-w-0 select-none flex-col items-center gap-space-xs rounded-xl border bg-surface-container p-space-sm text-center",
        "transition duration-150 hover:bg-surface-container-high motion-reduce:transition-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-container",
        view.unavailable
          ? "border-outline bg-surface-container-low"
          : view.on
            ? hueBorder[hue]
            : "border-outline-variant/30",
        feedbackClass,
      )}
    >
      <span
        data-testid="device-icon"
        data-icon={iconName}
        className={StringUtils.JoinClassName(
          "flex h-11 w-11 items-center justify-center rounded-lg bg-surface-container-lowest transition duration-150 motion-reduce:transition-none",
          view.unavailable ? "text-outline" : view.on ? `${hueText[hue]} ${hueHalo[hue]}` : "text-on-surface-variant",
        )}
      >
        {coverMoving && livePercent !== null ? (
          <span data-testid="cover-percent" className="font-mono text-body-md font-semibold">
            {livePercent}%
          </span>
        ) : pending ? (
          <Spinner size="md" />
        ) : (
          <Icon size={22} aria-hidden="true" />
        )}
      </span>
      <span className="block w-full truncate font-sans text-body-md font-semibold text-on-surface">{names.shortName(entity)}</span>
      <span className="block w-full truncate font-mono text-label-caps uppercase text-on-surface-variant">{areaName}</span>
      {/* Live status for screen readers; the visible feedback is the loader in place of the icon. */}
      <span aria-live="polite" className="sr-only">
        {pending ? (settling ? "UPDATING" : "SENDING") : ""}
      </span>
    </button>
  );
}
