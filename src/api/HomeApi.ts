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
}
