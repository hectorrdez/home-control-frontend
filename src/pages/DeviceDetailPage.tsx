import { Fragment, useEffect, useMemo, useRef } from "react";
import { Navigate, useParams } from "react-router-dom";
import { ArrowLeft, CircleOff } from "lucide-react";
import PageGrid from "@layouts/PageGrid";
import { useEntities } from "@/state/EntitiesProvider";
import { useEntityName } from "@/features/names/useEntityName";
import { allEntities, formatPower, isInteractive, isUnavailable, plugDrawBySwitch } from "@/state/selectors";
import type { Entity } from "@/api/types";
import { buildDeviceRows, resolveDeviceKey, type DeviceRow } from "@/features/devices/deviceFilters";
import PathUtils from "@utils/PathUtils";
import Button from "@components/controls/Button";
import ButtonLink from "@components/controls/ButtonLink";
import EditableName from "@components/controls/EditableName";
import StatusChip from "@components/controls/StatusChip";
import Card from "@components/cards/Card";
import DeviceControls from "@components/cards/DeviceControls";
import TileIconPicker from "@components/cards/TileIconPicker";
import EntityHistoryCard from "@components/cards/EntityHistoryCard";
import CoverCalibrationPanel from "@components/cards/CoverCalibrationPanel";
import AlertRulesPanel from "@components/cards/AlertRulesPanel";
import SavedPositionsCard from "@components/cards/SavedPositionsCard";
import { describeState, domainIcon, domainHue, type Hue } from "@components/cards/deviceState";
import { useDeviceAction } from "@components/cards/useDeviceAction";
import { attributeRows } from "@/features/devices/attributes";
import { numericState } from "@/features/telemetry/telemetry";
import StringUtils from "@utils/StringUtils";

// Features 122/123: one device on its own page (/devices/:deviceKey). Data only from the entities store.

const hueText: Record<Hue, string> = {
  primary: "text-primary-container",
  secondary: "text-secondary",
  tertiary: "text-tertiary-fixed-dim",
};

function LoadingView() {
  return (
    <PageGrid>
      <p role="status" className="col-span-12 font-label-caps text-label-caps uppercase text-on-surface-variant">
        LOADING DEVICE
      </p>
      <div aria-hidden="true" className="col-span-12 grid grid-cols-1 gap-space-sm xl:grid-cols-12">
        <div className="h-24 animate-pulse rounded-xl bg-surface-container motion-reduce:animate-none xl:col-span-12" />
        <div className="h-48 animate-pulse rounded-xl bg-surface-container motion-reduce:animate-none xl:col-span-5" />
        <div className="h-48 animate-pulse rounded-xl bg-surface-container motion-reduce:animate-none xl:col-span-7" />
      </div>
    </PageGrid>
  );
}

function ErrorView({ onRetry }: { onRetry: () => void }) {
  return (
    <PageGrid>
      <div role="alert" className="col-span-12 flex flex-col gap-space-sm rounded-xl bg-surface-container-low p-space-md">
        <StatusChip tone="error">ERROR</StatusChip>
        <p className="font-body-md text-on-surface">Could not load device.</p>
        <Button variant="secondary" className="self-start" onClick={onRetry}>
          RETRY
        </Button>
      </div>
    </PageGrid>
  );
}

function NotFoundView({ deviceKey }: { deviceKey: string }) {
  return (
    <PageGrid>
      <Card className="col-span-12 flex flex-col gap-space-sm">
        <CircleOff size={32} aria-hidden="true" className="text-on-surface-variant" />
        <p className="font-label-caps text-label-caps uppercase text-on-surface">DEVICE NOT FOUND</p>
        <p className="break-all font-mono text-telemetry-md text-on-surface-variant">{deviceKey}</p>
        <ButtonLink to="devices" className="self-start">
          BACK TO DEVICES
        </ButtonLink>
      </Card>
    </PageGrid>
  );
}

// The state, history and attributes of ONE entity (features 122/123). Hooks are per entity, so every device
// section has its own pending and feedback state. Renders two grid items: State (xl:5) and History+Attributes (xl:7).
function EntityBody({ entity }: { entity: Entity }) {
  const { state } = useEntities();
  const names = useEntityName();
  const { send, pending, settling, feedback } = useDeviceAction(entity);
  const displayName = names.displayName(entity);
  const view = describeState(entity);
  const Icon = domainIcon(entity.domain);
  const hue = domainHue(entity.domain);
  const interactive = isInteractive(entity);
  const draw = entity.domain === "switch" ? plugDrawBySwitch(allEntities(state)).get(entity.entityId) : undefined;
  const drawValue = draw ? numericState(draw) : null;
  const showHistory = entity.domain === "sensor" && numericState(entity) !== null;
  const attributes = attributeRows(entity);
  const positionNameRef = useRef<HTMLInputElement>(null); // feature 142: SAVE A POSITION focuses the form
  const changed = new Date(entity.lastChanged);
  const changedText = Number.isNaN(changed.getTime()) ? "--" : changed.toLocaleString();

  const feedbackClass =
    feedback === "success"
      ? "!border-secondary/50 !bg-secondary/10"
      : feedback === "error"
        ? "!border-error/50 !bg-error/10"
        : "";

  return (
    <>
      <section aria-label="State" className="col-span-12 xl:col-span-5">
        <Card className={StringUtils.JoinClassName("flex flex-col gap-space-md", feedbackClass)} data-feedback={feedback ?? undefined}>
          <h2 className="font-label-caps text-label-caps uppercase text-on-surface-variant">STATE</h2>
          <div className="flex items-center gap-space-sm">
            <div
              className={StringUtils.JoinClassName(
                "flex h-11 w-11 min-w-11 items-center justify-center rounded-lg bg-surface-container-lowest",
                view.on ? hueText[hue] : "text-on-surface-variant",
              )}
            >
              <Icon size={22} aria-hidden="true" />
            </div>
            <p className={StringUtils.JoinClassName("font-mono text-telemetry-lg", view.unavailable ? "text-error" : "")}>
              {view.text}
            </p>
          </div>
          {draw && drawValue !== null && (
            <p className="font-mono text-label-caps uppercase text-on-surface-variant">{`DRAW METRIC ${formatPower(drawValue)}`}</p>
          )}
          {interactive ? (
            <DeviceControls entity={entity} disabled={pending} send={send} />
          ) : (
            <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">READ ONLY</p>
          )}
          {/* Feature 155: the icon the actuator tile on the Home 3D page shows (tiles exist for controllable devices only). */}
          {interactive && <TileIconPicker entity={entity} />}
          {entity.domain === "cover" && (
            <CoverCalibrationPanel
              entity={entity}
              disabled={pending}
              onSavePosition={() => {
                positionNameRef.current?.scrollIntoView({ block: "center" });
                positionNameRef.current?.focus();
              }}
            />
          )}
          {/* Live status for screen readers; the visible feedback is the loader inside the control. */}
          <span aria-live="polite" className="sr-only">
            {pending ? (settling ? "UPDATING" : "SENDING") : ""}
          </span>
        </Card>
      </section>

      <div className="col-span-12 flex flex-col gap-space-md xl:col-span-7">
        {showHistory && (
          <Card role="region" aria-label="History" className="flex flex-col gap-space-sm">
            <h2 className="font-label-caps text-label-caps uppercase text-on-surface-variant">HISTORY</h2>
            <EntityHistoryCard entity={entity} displayName={displayName} />
          </Card>
        )}
        {entity.domain === "cover" && <SavedPositionsCard entity={entity} nameRef={positionNameRef} />}
        <AlertRulesPanel entity={entity} />
        <Card role="region" aria-label="Attributes" className="flex flex-col gap-space-sm">
          <h2 className="font-label-caps text-label-caps uppercase text-on-surface-variant">ATTRIBUTES</h2>
          {attributes.length === 0 ? (
            <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">NO ATTRIBUTES</p>
          ) : (
            <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-space-md gap-y-space-xs">
              {attributes.map((row) => (
                <Fragment key={row.key}>
                  <dt className="font-mono text-label-caps uppercase text-on-surface-variant">{row.key}</dt>
                  <dd className="break-all font-mono text-telemetry-md text-on-surface">{row.value}</dd>
                </Fragment>
              ))}
            </dl>
          )}
          <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">
            LAST CHANGED <time dateTime={entity.lastChanged}>{changedText}</time>
          </p>
        </Card>
      </div>
    </>
  );
}

// A device with one entity: the 122 page (header with the entity name, then its body). Unchanged by 123.
function SingleEntityView({ entity, areaName }: { entity: Entity; areaName: string }) {
  const names = useEntityName();
  const displayName = names.displayName(entity);
  const meta = [areaName.toUpperCase(), entity.domain.toUpperCase(), entity.entityId, entity.deviceName].filter(Boolean).join(" // ");

  useEffect(() => {
    document.title = `${displayName} - Home Control`;
  }, [displayName]);

  return (
    <PageGrid>
      <header className="col-span-12 flex flex-col gap-space-sm">
        <ButtonLink to="devices" aria-label="Back to devices" className="self-start">
          <ArrowLeft size={18} aria-hidden="true" />
          BACK TO DEVICES
        </ButtonLink>
        <h1 className="min-w-0">
          <EditableName
            entityId={entity.entityId}
            shown={names.shortName(entity)}
            label={displayName}
            raw={entity.name}
            canRename={names.canRename}
            onRename={(alias) => names.renameEntity(entity, alias)}
            textClassName="font-sans text-headline-md uppercase text-on-surface"
          />
        </h1>
        <p className="font-mono text-label-caps uppercase text-on-surface-variant">{meta}</p>
        <div>
          {isUnavailable(entity) ? (
            <StatusChip tone="error">UNAVAILABLE</StatusChip>
          ) : (
            <StatusChip tone="secondary">ONLINE</StatusChip>
          )}
        </div>
      </header>
      <EntityBody entity={entity} />
    </PageGrid>
  );
}

// A device with several entities (feature 123): one header for the device, then one section per entity, primary first.
function MultiEntityView({ row }: { row: DeviceRow }) {
  const names = useEntityName();
  const allDown = row.entities.every(isUnavailable);

  useEffect(() => {
    document.title = `${row.label} - Home Control`;
  }, [row.label]);

  return (
    <PageGrid>
      <header className="col-span-12 flex flex-col gap-space-sm">
        <ButtonLink to="devices" aria-label="Back to devices" className="self-start">
          <ArrowLeft size={18} aria-hidden="true" />
          BACK TO DEVICES
        </ButtonLink>
        <h1 className="min-w-0 font-sans text-headline-md uppercase text-on-surface">{row.label}</h1>
        <p className="font-mono text-label-caps uppercase text-on-surface-variant">
          {`${row.areaName.toUpperCase()} // ${row.entities.length} ENTITIES`}
        </p>
        <div>
          {allDown ? <StatusChip tone="error">UNAVAILABLE</StatusChip> : <StatusChip tone="secondary">ONLINE</StatusChip>}
        </div>
      </header>
      {row.entities.map((entity) => {
        const displayName = names.displayName(entity);
        return (
          <section key={entity.entityId} aria-label={displayName} className="col-span-12 grid grid-cols-1 gap-space-sm xl:grid-cols-12">
            <header className="col-span-12 flex flex-col gap-space-xs">
              <h2 className="min-w-0">
                <EditableName
                  entityId={entity.entityId}
                  shown={names.shortName(entity)}
                  label={displayName}
                  raw={entity.name}
                  canRename={names.canRename}
                  onRename={(alias) => names.renameEntity(entity, alias)}
                  textClassName="font-sans text-title-md uppercase text-on-surface"
                />
              </h2>
              <p className="font-mono text-label-caps uppercase text-on-surface-variant">{`${entity.domain.toUpperCase()} // ${entity.entityId}`}</p>
            </header>
            <EntityBody entity={entity} />
          </section>
        );
      })}
    </PageGrid>
  );
}

export default function DeviceDetailPage() {
  const { deviceKey = "" } = useParams();
  const { state, reload } = useEntities();
  const names = useEntityName();
  const rows = useMemo(
    () => (state.status === "ready" ? buildDeviceRows(state, names.displayName) : []),
    [state, names.displayName],
  );

  if (state.status === "loading") return <LoadingView />;
  if (state.status === "error") return <ErrorView onRetry={reload} />;
  const resolved = resolveDeviceKey(rows, deviceKey);
  if (!resolved) return <NotFoundView deviceKey={deviceKey} />;
  // An old /devices/<entityId> link to a member of a multi-entity device moves to the device's own key.
  if (!resolved.canonical) return <Navigate replace to={PathUtils.deviceDetailPath(resolved.row.key)} />;
  const { row } = resolved;
  if (row.entities.length === 1) return <SingleEntityView entity={row.primary} areaName={row.areaName} />;
  return <MultiEntityView row={row} />;
}
