import type {
  Area,
  ConnectionState,
  Entity,
  EntityAction,
  HaStatus,
  HistorySeries,
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
}
