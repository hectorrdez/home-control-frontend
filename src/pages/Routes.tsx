import type { Page } from "@/types/page";
import HomePage from "./HomePage";
import TelemetryPage from "./TelemetryPage";

export const SiteMap: Array<Page> = [
  { name: "home", path: "/", component: <HomePage /> },
  { name: "telemetry", path: "/telemetry", component: <TelemetryPage /> },
];
