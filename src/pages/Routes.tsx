import type { Page } from "@/types/page";
import DeviceDetailPage from "./DeviceDetailPage";
import DevicesPage from "./DevicesPage";
import HistoryPage from "./HistoryPage";
import HomePage from "./HomePage";
import { ROUTE_PATHS } from "./routePaths";
import TelemetryPage from "./TelemetryPage";

export const SiteMap: Array<Page> = [
  { name: "home", path: ROUTE_PATHS.home, component: <HomePage /> },
  { name: "devices", path: ROUTE_PATHS.devices, component: <DevicesPage /> },
  { name: "deviceDetail", path: ROUTE_PATHS.deviceDetail, component: <DeviceDetailPage /> },
  { name: "telemetry", path: ROUTE_PATHS.telemetry, component: <TelemetryPage /> },
  { name: "history", path: ROUTE_PATHS.history, component: <HistoryPage /> },
];
