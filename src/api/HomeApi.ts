import type {
  Area,
  ConnectionState,
  Entity,
  EntityAction,
  HaStatus,
  HistorySeries,
  Alias,
  CalibrationInput,
  CoverCalibration,
  AlertRule,
  AlertRuleInput,
  ServerEvent,
} from "./types";

export interface EntityFilter {
  domain?: string;
  area?: string;
}

// Everything the panel needs from home-control-backend. Two implementations: live (HTTP) and mock.
export interface HomeApi {
  getStatus(): Promise<HaStatus>;
  getAreas(): Promise<Area[]>;
  getEntities(filter?: EntityFilter): Promise<Entity[]>;
  runAction(entityId: string, action: EntityAction): Promise<Entity>;
  subscribe(
    onEntity: (e: Entity) => void,
    onConnection: (s: ConnectionState) => void,
    // Feature 132: non-entity frames (resource_changed, event, ha_link, alert, alert_acked). Optional.
    onServerEvent?: (e: ServerEvent) => void,
  ): () => void;
  getHistory(entityIds: string[], hours: number): Promise<HistorySeries[]>;
  // Feature 115 (backend 008). getAliases rejects with kind "not_found" when the backend has no aliases endpoint.
  getAliases(): Promise<Alias[]>;
  setAlias(entityId: string, alias: string): Promise<Alias[]>;
  deleteAlias(entityId: string): Promise<Alias[]>;
  // Feature 127 (backend 010/011). Writes answer with the full list / the updated entity; errors are ApiError messages (e.g. not_calibrated).
  getCalibrations(): Promise<CoverCalibration[]>;
  putCalibration(entityId: string, input: CalibrationInput): Promise<CoverCalibration[]>;
  deleteCalibration(entityId: string): Promise<CoverCalibration[]>;
  setCoverPercent(entityId: string, percent: number): Promise<Entity>;
  // Feature 128 (backend 012). Writes answer with the stored rule; errors are ApiError messages (e.g. duplicate_rule).
  listAlertRules(): Promise<AlertRule[]>;
  createAlertRule(rule: AlertRuleInput): Promise<AlertRule>;
  updateAlertRule(id: string, rule: AlertRuleInput): Promise<AlertRule>;
  deleteAlertRule(id: string): Promise<void>;
}
