// Route paths by page name. Plain data (no component imports) so utils/navigation can use it
// without creating an import cycle: PathUtils -> Routes -> pages -> components -> PathUtils.
export const ROUTE_PATHS: Record<string, string> = {
  home: "/",
  devices: "/devices",
  telemetry: "/telemetry",
};

// Feature 121: detail page of one entity (route registered by feature 122).
export function devicePath(entityId: string): string {
  return `/devices/${encodeURIComponent(entityId)}`;
}
