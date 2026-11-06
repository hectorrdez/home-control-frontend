import type { EntityFilter, HomeApi } from "./HomeApi";
import { ApiError, type ApiErrorKind, type Area, type ConnectionState, type Entity, type EntityAction, type HaStatus, type HistorySeries } from "./types";
import { backoffDelay } from "./backoff";
import { parseStateChanged, streamUrl, type EventSourceFactory } from "./liveSubscribe";

export interface LiveApiOptions {
  baseUrl: string; // "" = same origin (Vite dev proxy forwards /api)
  token: string;
  fetchImpl?: typeof fetch;
  // Tests inject a fake EventSource; the browser default is used otherwise.
  eventSourceFactory?: EventSourceFactory;
}

interface Envelope<T> {
  code?: string;
  status?: number;
  data?: T;
  error?: string | { code?: string; message?: string };
}

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

export function createLiveApi({ baseUrl, token, fetchImpl, eventSourceFactory }: LiveApiOptions): HomeApi {
  const openSource: EventSourceFactory = eventSourceFactory ?? ((url) => new EventSource(url));
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
      // Backend 004: areas sorted by name, last group is the unassigned one with areaId null.
      const areas = await request<Array<Omit<Area, "areaId"> & { areaId: string | null }>>("/api/areas");
      return areas.map((area) => ({ ...area, areaId: area.areaId ?? UNASSIGNED }));
    },

    async runAction(entityId, action: EntityAction): Promise<Entity> {
      const [entity] = await request<Entity[]>(`/api/entities/${encodeURIComponent(entityId)}/action`, {
        method: "POST",
        body: JSON.stringify(action),
      });
      if (!entity) throw new ApiError("server", "Empty action response");
      return entity;
    },

    // SSE on GET /api/stream. Reconnects with backoff (1 s .. 30 s, jitter); the server sends `ready` once the stream is up.
    subscribe(onEntity, onConnection) {
      let source: EventSource | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let attempt = 0;
      let closed = false;

      const connect = () => {
        const es = openSource(streamUrl(baseUrl, token));
        source = es;
        es.addEventListener("ready", () => {
          attempt = 0;
          onConnection("open" satisfies ConnectionState);
        });
        es.addEventListener("state_changed", (event) => {
          const entity = parseStateChanged((event as MessageEvent).data);
          if (entity) onEntity(entity);
        });
        es.onerror = () => {
          if (closed) return;
          es.close();
          onConnection("reconnecting");
          timer = setTimeout(connect, backoffDelay(attempt++));
        };
      };

      connect();
      return () => {
        closed = true;
        clearTimeout(timer);
        source?.close();
      };
    },

    // Backend GET /api/history (endpoints.md): one item per requested entity, in request order.
    // Numeric `v` arrives as a string; non-finite values are dropped so the charts only see numbers.
    async getHistory(entityIds, hours): Promise<HistorySeries[]> {
      const params = new URLSearchParams({ entityIds: entityIds.join(","), hours: String(hours) });
      const rows = await request<Array<{ entityId: string; points: Array<{ t: string; v: string }> }>>(
        `/api/history?${params.toString()}`,
      );
      return rows.map((row) => ({
        entityId: row.entityId,
        unit: null,
        points: row.points
          .map((p) => ({ t: p.t, v: Number(p.v) }))
          .filter((p) => Number.isFinite(p.v)),
      }));
    },
  };
}
