import type { EntityFilter, HomeApi } from "./HomeApi";
import { ApiError, type ApiErrorKind, type Area, type Entity, type EntityAction, type HaStatus, type HistorySeries } from "./types";

export interface LiveApiOptions {
  baseUrl: string; // "" = same origin (Vite dev proxy forwards /api)
  token: string;
  fetchImpl?: typeof fetch;
}

interface Envelope<T> {
  code?: string;
  status?: number;
  data?: T;
  error?: string | { code?: string; message?: string };
}

type RawEntity = Entity & { areaName?: string | null };

const UNASSIGNED = "unassigned";

function kindFor(status: number, code: string | undefined): ApiErrorKind {
  // ha_unauthorized (502) means HA rejected the panel's HA token: report it as unauthorized too.
  if (code === "ha_unauthorized" || status === 401) return "unauthorized";
  if (status === 404) return "not_found";
  if (status === 503) return "unavailable";
  return "server";
}

function errorCode(body: Envelope<unknown> | undefined): string | undefined {
  if (!body?.error) return body?.code;
  return typeof body.error === "string" ? body.error : body.error.code ?? body.code;
}

export function createLiveApi({ baseUrl, token, fetchImpl }: LiveApiOptions): HomeApi {
  const doFetch = fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let res: Response;
    try {
      res = await doFetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          Accept: "application/json",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          Authorization: `Bearer ${token}`,
          ...init.headers,
        },
      });
    } catch (err) {
      throw new ApiError("network", err instanceof Error ? err.message : "Network error");
    }

    const body = (await res.json().catch(() => undefined)) as Envelope<T> | undefined;
    if (!res.ok) {
      const code = errorCode(body);
      throw new ApiError(kindFor(res.status, code), code ?? `HTTP ${res.status}`, res.status);
    }
    if (body?.data === undefined) {
      throw new ApiError("server", "Response has no data envelope", res.status);
    }
    return body.data;
  }

  const entityQuery = (filter?: EntityFilter) => {
    const params = new URLSearchParams();
    if (filter?.domain) params.set("domain", filter.domain);
    if (filter?.area) params.set("area", filter.area);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  };

  return {
    async getStatus(): Promise<HaStatus> {
      const [status] = await request<HaStatus[]>("/api/ha/status");
      if (!status) throw new ApiError("server", "Empty status response");
      return status;
    },

    async getEntities(filter) {
      return request<Entity[]>(`/api/entities${entityQuery(filter)}`);
    },

    async getAreas(): Promise<Area[]> {
      // No areas endpoint yet: group the entities by their area.
      const entities = await request<RawEntity[]>("/api/entities");
      const groups = new Map<string, Area>();
      for (const entity of entities) {
        const areaId = entity.area ?? UNASSIGNED;
        let group = groups.get(areaId);
        if (!group) {
          group = {
            areaId,
            name: entity.area === null ? "Unassigned" : (entity.areaName ?? areaId),
            entities: [],
          };
          groups.set(areaId, group);
        }
        group.entities.push(entity);
      }
      return [...groups.values()];
    },

    async runAction(entityId, action: EntityAction): Promise<Entity> {
      const [entity] = await request<Entity[]>(`/api/entities/${encodeURIComponent(entityId)}/action`, {
        method: "POST",
        body: JSON.stringify(action),
      });
      if (!entity) throw new ApiError("server", "Empty action response");
      return entity;
    },

    // Implemented in feature 105 (realtime) and 112 (history).
    subscribe() {
      throw new ApiError("unavailable", "Realtime subscribe not implemented yet");
    },

    async getHistory(): Promise<HistorySeries[]> {
      throw new ApiError("unavailable", "History not implemented yet");
    },
  };
}
