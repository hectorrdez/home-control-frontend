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

// Proposed contract, see feature 112.
export interface HistorySeries {
  entityId: string;
  unit: string | null;
  points: { t: string; v: number }[];
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
