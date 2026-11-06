import type { Hue } from "@/features/telemetry/telemetry";

// Token classes only (no hex). Arc hue: secondary OK, tertiary warning, error low.
const ARC: Record<Hue, string> = {
  secondary: "stroke-secondary",
  tertiary: "stroke-tertiary-fixed-dim",
  error: "stroke-error",
};

interface RingGaugeProps {
  label: string;
  value: number;
  hue: Hue;
}

// DESIGN.md RingGauge: 36x36 SVG viewBox, track surface-container-highest, percent centered in mono.
export default function RingGauge({ label, value, hue }: RingGaugeProps) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="img"
      aria-label={`${label}: ${pct}%`}
      className="flex flex-col items-center gap-space-xs rounded border border-outline-variant bg-surface-container p-space-sm"
    >
      <div className="relative h-16 w-16">
        <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" aria-hidden="true">
          <circle cx="18" cy="18" r="15.9155" fill="none" strokeWidth="3" className="stroke-surface-container-highest" />
          <circle
            cx="18"
            cy="18"
            r="15.9155"
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${pct} 100`}
            className={ARC[hue]}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-mono text-label-caps text-on-surface">
          {`${pct}%`}
        </span>
      </div>
      <span className="line-clamp-1 max-w-full font-label-caps text-label-caps uppercase text-on-surface-variant">
        {label}
      </span>
    </div>
  );
}
