// Route paths by page name. Plain data (no component imports) so utils/navigation can use it
// without creating an import cycle: PathUtils -> Routes -> pages -> components -> PathUtils.
export const ROUTE_PATHS: Record<string, string> = {
  home: "/",
  devices: "/devices",
  deviceDetail: "/devices/:deviceKey", // features 122/123; build concrete URLs with PathUtils.deviceDetailPath
  telemetry: "/telemetry",
};
