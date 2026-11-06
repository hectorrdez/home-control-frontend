import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Network, Thermometer, Wind, Zap } from "lucide-react";
import PageGrid from "@layouts/PageGrid";
import { useEntities } from "@/state/EntitiesProvider";
import { UNASSIGNED } from "@/state/entities";
import { allEntities, houseLoad } from "@/state/selectors";
import type { ConnectionState, Entity } from "@/api/types";
import Button from "@components/controls/Button";
import StatusChip from "@components/controls/StatusChip";
import KpiCard from "@components/cards/KpiCard";
import RingGauge from "@components/cards/RingGauge";
import EventFeed from "@components/cards/EventFeed";
import TelemetryChartsGrid from "@components/cards/TelemetryChartsGrid";
import ClimateHistoryCard from "@components/cards/ClimateHistoryCard";
import PowerHistoryBars from "@components/cards/PowerHistoryBars";
import {
  airGrade,
  airQuality,
  climateStats,
  energyToday,
  nodeHealth,
  ringGauges,
  sensorCount,
  solarPower,
} from "@/features/telemetry/telemetry";

const LABEL: Record<ConnectionState, string> = {
  open: "LIVE",
  reconnecting: "RECONNECTING",
  closed: "OFFLINE",
};

const TEXT: Record<ConnectionState, string> = {
  open: "text-secondary",
  reconnecting: "text-tertiary-fixed-dim",
  closed: "text-error",
};

const BEACON: Record<ConnectionState, string> = {
  open: "bg-secondary shadow-glow-secondary",
  reconnecting: "bg-tertiary-fixed-dim",
  closed: "bg-error shadow-glow-error",
};

// Watts below 1000 as whole W, else kW with two decimals (DESIGN.md).
function powerReading(watts: number): { value: string; unit: string } {
  return watts < 1000 ? { value: String(Math.round(watts)), unit: "W" } : { value: (watts / 1000).toFixed(2), unit: "kW" };
}

function SkeletonGrid() {
  return (
    <div aria-hidden="true" className="col-span-12 grid grid-cols-1 gap-space-md md:grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-36 animate-pulse rounded bg-surface-container motion-reduce:animate-none" />
      ))}
    </div>
  );
}

// The 103/105 store is the source; the header strip (109 slot) gets the sensor and node counts on desktop.
function StatusStrip({ text }: { text: string }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setSlot(document.querySelector<HTMLElement>('[data-slot="status-strip"]'));
  }, []);
  if (!slot) return null;
  return createPortal(<span className="font-mono text-label-caps uppercase text-on-surface">{text}</span>, slot);
}

export default function TelemetryPage() {
  const { state, reload, connection } = useEntities();

  if (state.status === "error") {
    return (
      <PageGrid>
        <Header title="Telemetry & sensors" sub={null} />
        <div role="alert" className="col-span-12 flex flex-col gap-space-sm rounded-xl bg-surface-container-low p-space-md">
          <StatusChip tone="error">ERROR</StatusChip>
          <p className="font-body-md text-on-surface">Could not load telemetry.</p>
          <Button variant="secondary" className="self-start" onClick={reload}>
            RETRY
          </Button>
        </div>
      </PageGrid>
    );
  }

  if (state.status === "loading") {
    return (
      <PageGrid>
        <Header title="Telemetry & sensors" sub={null} />
        <div aria-busy="true" className="col-span-12 flex flex-col gap-space-md">
          <SkeletonGrid />
        </div>
      </PageGrid>
    );
  }

  const entities: Entity[] = allEntities(state);
  const sensors = sensorCount(entities);
  const areaName = (areaId: string | null): string => {
    const id = areaId ?? UNASSIGNED;
    return state.areas.find((a) => a.areaId === id)?.name ?? "Unassigned";
  };
  const roomOf = (e: Entity) => areaName(e.area);
  const nodes = nodeHealth(entities);
  const climate = climateStats(entities, roomOf);
  const air = airQuality(entities);
  const load = houseLoad(entities);
  const energy = energyToday(entities);
  const solar = solarPower(entities);
  const gauges = ringGauges(entities);

  if (sensors === 0) {
    return (
      <PageGrid>
        <Header title="Telemetry & sensors" sub={null} />
        <p className="col-span-12 rounded border border-outline-variant/30 p-space-md font-label-caps text-label-caps uppercase text-on-surface-variant">
          NO SENSORS
        </p>
      </PageGrid>
    );
  }

  const sub = (
    <span className="flex items-center gap-space-xs font-label-caps text-label-caps uppercase">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${BEACON[connection]}`} aria-hidden="true" />
      <span className={TEXT[connection]} role="status" aria-label="Live connection">
        {`${sensors} SENSORS • ${LABEL[connection]}`}
      </span>
    </span>
  );

  return (
    <PageGrid>
      <Header title="Telemetry & sensors" sub={sub} />
      <StatusStrip text={`SENSORS ${sensors} • ${nodes ? `${nodes.online}/${nodes.total}` : "0/0"} ONLINE`} />

      <section aria-label="Key metrics" className="col-span-12 grid grid-cols-1 gap-space-md md:grid-cols-2 xl:grid-cols-4">
        {climate && (
          <KpiCard
            title="Climate mean"
            icon={Thermometer}
            value={climate.mean.toFixed(1)}
            unit="°C"
            footer={
              <>
                {`MIN ${climate.min.value.toFixed(1)} ${climate.min.room} • MAX ${climate.max.value.toFixed(1)} ${climate.max.room}`}
              </>
            }
          />
        )}
        {air && (
          <KpiCard
            title="Air quality"
            icon={Wind}
            value={air.co2 !== null ? String(Math.round(air.co2)) : String(air.pm25)}
            unit={air.co2 !== null ? "PPM" : "µg/m³"}
            chip={
              air.co2 !== null ? (
                <StatusChip tone={airGrade(air.co2).tone}>{airGrade(air.co2).grade}</StatusChip>
              ) : undefined
            }
            footer={air.co2 !== null && air.pm25 !== null ? `PM2.5 ${air.pm25} µg/m³` : undefined}
          />
        )}
        {load && (
          <KpiCard
            title="Power"
            icon={Zap}
            value={powerReading(load.watts).value}
            unit={powerReading(load.watts).unit}
            footer={[
              energy !== null ? `TODAY ${energy} kWh` : null,
              solar !== null ? `SOLAR ${Math.round(solar)} W` : null,
            ]
              .filter(Boolean)
              .join(" • ") || undefined}
          />
        )}
        {nodes && (
          <KpiCard
            title="Nodes"
            icon={Network}
            value={`${nodes.online}/${nodes.total}`}
            unit="ONLINE"
            footer={`${nodes.percent}%`}
          />
        )}
      </section>

      {gauges.length > 0 && (
        <section aria-label="Levels" className="col-span-12 grid grid-cols-2 gap-space-md md:grid-cols-3 xl:grid-cols-6">
          {gauges.map((g) => (
            <RingGauge key={g.id} label={g.label} value={g.value} hue={g.hue} />
          ))}
        </section>
      )}

      <section aria-label="Climate history" className="col-span-12 flex flex-col gap-space-sm xl:col-span-8">
        <ClimateHistoryCard entities={entities} areaName={areaName} />
        <PowerHistoryBars entities={entities} />
        <TelemetryChartsGrid sensors={entities} areaName={areaName} connection={connection} />
      </section>

      <div className="col-span-12 xl:col-span-4">
        <EventFeed events={state.feed} areaName={areaName} />
      </div>
    </PageGrid>
  );
}

function Header({ title, sub }: { title: string; sub: ReactNode }) {
  return (
    <header className="col-span-12 flex flex-col gap-space-xs">
      <h1 className="font-sans text-headline-md uppercase text-on-surface">{title}</h1>
      {sub && <div>{sub}</div>}
    </header>
  );
}
