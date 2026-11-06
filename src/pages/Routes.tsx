import type { Page } from "@/types/page";
import HomePage from "./HomePage";
import { ROUTE_PATHS } from "./routePaths";
import TelemetryPage from "./TelemetryPage";

export const SiteMap: Array<Page> = [
  { name: "home", path: ROUTE_PATHS.home, component: <HomePage /> },
  { name: "telemetry", path: ROUTE_PATHS.telemetry, component: <TelemetryPage /> },
];
