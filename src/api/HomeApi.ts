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
  Setting,
  ServerAlert,
  Preset,
  PresetInput,
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
  // Feature 142 (backend 021). Writes answer with the stored preset; applyPreset answers with the moved entity.
  // Errors are ApiError messages (e.g. duplicate_preset, too_many_presets, position_unknown, preset_not_applicable).
  getPresets(entityId?: string): Promise<Preset[]>;
  createPreset(input: PresetInput): Promise<Preset>;
  updatePreset(id: string, input: { name: string; percent: number }): Promise<Preset>;
  deletePreset(id: string): Promise<void>;
  applyPreset(id: string): Promise<Entity>;
  // Feature 128 (backend 012). Writes answer with the stored rule; errors are ApiError messages (e.g. duplicate_rule).
  listAlertRules(): Promise<AlertRule[]>;
  createAlertRule(rule: AlertRuleInput): Promise<AlertRule>;
  updateAlertRule(id: string, rule: AlertRuleInput): Promise<AlertRule>;
  deleteAlertRule(id: string): Promise<void>;
  // Feature 133 (backend 017). getSettings rejects with kind "not_found" when the backend has no settings endpoint.
  // getSetting resolves null for a missing key. putSetting rejects with SettingConflictError on 409 version_conflict.
  getSettings(): Promise<Setting[]>;
  getSetting(key: string): Promise<Setting | null>;
  putSetting(key: string, value: unknown, baseVersion?: number): Promise<Setting>;
  deleteSetting(key: string): Promise<void>;
  // Feature 139 (backend 020). listAlerts rejects with kind "not_found" when the backend has no alerts endpoint (local fallback).
  listAlerts(status: "open" | "all", limit?: number): Promise<ServerAlert[]>;
  ackAlert(id: string): Promise<ServerAlert>;
  ackAllAlerts(): Promise<ServerAlert[]>;
}
