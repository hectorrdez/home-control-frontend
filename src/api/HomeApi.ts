import type {
  Area,
  ConnectionState,
  Entity,
  EntityAction,
  HaStatus,
  HistorySeries,
  Alias,
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
}
