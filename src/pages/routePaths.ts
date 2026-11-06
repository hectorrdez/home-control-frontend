// Route paths by page name. Plain data (no component imports) so utils/navigation can use it
// without creating an import cycle: PathUtils -> Routes -> pages -> components -> PathUtils.
export const ROUTE_PATHS: Record<string, string> = {
  home: "/",
  telemetry: "/telemetry",
};
