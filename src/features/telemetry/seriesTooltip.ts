// Feature 147: tooltip text of a live series, "<area> · <label>: <value> <unit>". Pure: no React.
export function seriesTooltipText(identity: string, value: unknown, unit: string): string {
  return `${identity}: ${value}${unit ? ` ${unit}` : ""}`;
}
