import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import Card from "./Card";

interface KpiCardProps {
  title: string;
  icon: LucideIcon;
  value: string;
  unit: string;
  chip?: ReactNode;
  footer?: ReactNode;
}

// DESIGN.md KpiCard: label-caps title, telemetry value + unit, footer line, small icon.
export default function KpiCard({ title, icon: Icon, value, unit, chip, footer }: KpiCardProps) {
  return (
    <Card role="region" aria-label={title} className="flex flex-col gap-space-xs">
      <div className="flex items-center justify-between gap-space-xs">
        <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">{title}</span>
        <Icon size={18} className="text-primary-container" aria-hidden="true" />
      </div>
      <div className="flex flex-wrap items-baseline gap-space-xs">
        <span className="font-mono text-telemetry-lg text-on-surface">{value}</span>
        <span className="font-mono text-label-caps uppercase text-on-surface-variant">{unit}</span>
        {chip}
      </div>
      {footer && <div className="font-mono text-label-caps uppercase text-on-surface-variant">{footer}</div>}
    </Card>
  );
}
