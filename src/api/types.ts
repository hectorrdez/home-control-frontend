// Mirrors home-control-backend .claude/endpoints.md (backend 001-005).

export interface HaStatus {
  online: boolean;
  message: string;
  version: string | null;
}

export interface Entity {
  entityId: string;
  domain: string;
  name: string;
  state: string;
  attributes: Record<string, unknown>;
  area: string | null;
  lastChanged: string;
  // Feature 115 (backend 009): HA device name_by_user or name; null = no device / lookup failed. Absent on older backends.
  deviceName?: string | null;
}

export interface Area {
  areaId: string; // "unassigned" groups entities without an area
  name: string;
  entities: Entity[];
}

export interface EntityAction {
  action: "turn_on" | "turn_off" | "toggle" | string;
  params?: Record<string, unknown>;
}

// Backend GET /api/history (feature 112). unit is not sent by the backend, so it stays null.
export interface HistorySeries {
  entityId: string;
  unit: string | null;
  points: { t: string; v: number }[];
}

// Feature 115: user alias from backend 008 (/api/aliases). Entities never carry it; the client merges.
export interface Alias {
  entityId: string;
  alias: string;
}

export type ConnectionState = "open" | "reconnecting" | "closed";

export type ApiErrorKind = "network" | "unauthorized" | "not_found" | "server" | "unavailable";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | undefined;

  constructor(kind: ApiErrorKind, message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
  }
}

// Feature 127 (backend 010): cover travel-time calibration. position stays null until a percent move has ended.
export interface CoverCalibration {
  entityId: string;
  openMs: number;
  closeMs: number;
  position: number | null;
  calibratedAt: string;
}

export interface CalibrationInput {
  openMs: number;
  closeMs: number;
}

// Feature 128 (backend 012): notification rule. Evaluation happens in the frontend (feature 129); the API only stores rules.
export type AlertLevel = "off" | "low" | "medium" | "high";

export type AlertTrigger =
  | { type: "connects" }
  | { type: "disconnects" }
  | { type: "interacted" }
  | { type: "state_becomes"; value: string }
  | { type: "above" | "below"; value: number };

export interface AlertRule {
  id: string;
  entityId: string;
  trigger: AlertTrigger;
  level: AlertLevel;
  message?: string;
}

export type AlertRuleInput = Omit<AlertRule, "id">;
