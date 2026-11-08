import type { EntityFilter, HomeApi } from "./HomeApi";
import { ApiError, SettingConflictError, type AlertRule, type Alias, type CalibrationInput, type CoverCalibration, type ApiErrorKind, type Area, type ConnectionState, type Entity, type EntityAction, type HaStatus, type HistorySeries, type Setting } from "./types";
import { backoffDelay } from "./backoff";
import { parseServerEvent, parseStateChanged, SERVER_EVENT_NAMES, streamUrl, type EventSourceFactory } from "./liveSubscribe";
import { getClientId, getClientName } from "./clientIdentity";
import type { ServerAlert, ServerEvent } from "./types";

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

  // `onError` lets one call map a failure to a richer error (feature 133: 409 carries the parsed body).
  async function request<T>(
    path: string,
    init: RequestInit = {},
    onError?: (status: number, body: Envelope<unknown> | undefined) => ApiError | undefined,
  ): Promise<T> {
    let res: Response;
    try {
      res = await doFetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          Accept: "application/json",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          Authorization: `Bearer ${token}`,
          // Feature 132 (backend 016): writer identity, echoed as resource_changed.by.
          "X-Client-Id": getClientId(),
          "X-Client-Name": getClientName(),
          ...init.headers,
        },
      });
    } catch (err) {
      throw new ApiError("network", err instanceof Error ? err.message : "Network error");
    }

    const body = (await res.json().catch(() => undefined)) as Envelope<T> | undefined;
    if (!res.ok) {
      const mapped = onError?.(res.status, body as Envelope<unknown> | undefined);
      if (mapped) throw mapped;
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
    subscribe(onEntity, onConnection, onServerEvent) {
      let source: EventSource | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let attempt = 0;
      let closed = false;

      const connect = () => {
        const es = openSource(streamUrl(baseUrl, token, getClientId()));
        source = es;
        es.addEventListener("ready", () => {
          attempt = 0;
          onConnection("open" satisfies ConnectionState);
        });
        es.addEventListener("state_changed", (event) => {
          const entity = parseStateChanged((event as MessageEvent).data);
          if (entity) onEntity(entity);
        });
        // Feature 132: resource_changed, event, ha_link, alert, alert_acked. Malformed or unknown frames are dropped.
        for (const name of SERVER_EVENT_NAMES) {
          es.addEventListener(name, (event) => {
            const parsed: ServerEvent | null = parseServerEvent(name, (event as MessageEvent).data);
            if (parsed && onServerEvent) onServerEvent(parsed);
          });
        }
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

    // Feature 115: backend 008. PUT/DELETE answer with the full alias list.
    async getAliases(): Promise<Alias[]> {
      return request<Alias[]>("/api/aliases");
    },

    async setAlias(entityId, alias): Promise<Alias[]> {
      return request<Alias[]>(`/api/aliases/${encodeURIComponent(entityId)}`, {
        method: "PUT",
        body: JSON.stringify({ alias }),
      });
    },

    async deleteAlias(entityId): Promise<Alias[]> {
      return request<Alias[]>(`/api/aliases/${encodeURIComponent(entityId)}`, { method: "DELETE" });
    },
    // Feature 127: backend 010 (calibrations, served from memory) and 011 (cover-percent).
    async getCalibrations(): Promise<CoverCalibration[]> {
      return request<CoverCalibration[]>("/api/calibrations");
    },

    async putCalibration(entityId, input: CalibrationInput): Promise<CoverCalibration[]> {
      return request<CoverCalibration[]>(`/api/calibrations/${encodeURIComponent(entityId)}`, {
        method: "PUT",
        body: JSON.stringify(input),
      });
    },

    async deleteCalibration(entityId): Promise<CoverCalibration[]> {
      return request<CoverCalibration[]>(`/api/calibrations/${encodeURIComponent(entityId)}`, { method: "DELETE" });
    },

    // Feature 128: backend 012 (alert rules, served from memory). Writes answer with `data: [rule]`.
    // Feature 139 (backend 020): server-side alerts.
    async listAlerts(status, limit) {
      const params = new URLSearchParams({ status });
      if (limit !== undefined) params.set("limit", String(limit));
      return request<ServerAlert[]>(`/api/alerts?${params.toString()}`);
    },

    async ackAlert(id: string): Promise<ServerAlert> {
      const [alert] = await request<ServerAlert[]>(`/api/alerts/${encodeURIComponent(id)}/ack`, { method: "POST" });
      if (!alert) throw new ApiError("server", "Empty ack response");
      return alert;
    },

    async ackAllAlerts(): Promise<ServerAlert[]> {
      return request<ServerAlert[]>("/api/alerts/ack-all", { method: "POST" });
    },

    async listAlertRules(): Promise<AlertRule[]> {
      return request<AlertRule[]>("/api/alert-rules");
    },

    async createAlertRule(rule): Promise<AlertRule> {
      const [stored] = await request<AlertRule[]>("/api/alert-rules", { method: "POST", body: JSON.stringify(rule) });
      return stored;
    },

    async updateAlertRule(id, rule): Promise<AlertRule> {
      const [stored] = await request<AlertRule[]>(`/api/alert-rules/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(rule),
      });
      return stored;
    },

    async deleteAlertRule(id): Promise<void> {
      await request<unknown[]>(`/api/alert-rules/${encodeURIComponent(id)}`, { method: "DELETE" });
    },

    // Feature 133: backend 017 shared settings. Writes answer with the stored setting in data[0].
    async getSettings(): Promise<Setting[]> {
      return request<Setting[]>("/api/settings");
    },

    async getSetting(key): Promise<Setting | null> {
      try {
        const [setting] = await request<Setting[]>(`/api/settings/${encodeURIComponent(key)}`);
        return setting ?? null;
      } catch (err) {
        // A missing key is a normal answer, not an error. Any other 404 (no settings endpoint) still rejects.
        if (err instanceof ApiError && err.kind === "not_found" && err.message === "setting_not_found") return null;
        throw err;
      }
    },

    async putSetting(key, value, baseVersion): Promise<Setting> {
      const body = baseVersion === undefined ? { value } : { value, baseVersion };
      const [stored] = await request<Setting[]>(
        `/api/settings/${encodeURIComponent(key)}`,
        { method: "PUT", body: JSON.stringify(body) },
        (status, envelope) => {
          if (status !== 409 || errorCode(envelope) !== "version_conflict") return undefined;
          const current = Array.isArray(envelope?.data) ? ((envelope.data[0] ?? null) as Setting | null) : null;
          return new SettingConflictError(current);
        },
      );
      if (!stored) throw new ApiError("server", "Empty setting response");
      return stored;
    },

    async deleteSetting(key): Promise<void> {
      await request<unknown[]>(`/api/settings/${encodeURIComponent(key)}`, { method: "DELETE" });
    },

    async setCoverPercent(entityId, percent): Promise<Entity> {
      const [entity] = await request<Entity[]>(`/api/entities/${encodeURIComponent(entityId)}/cover-percent`, {
        method: "POST",
        body: JSON.stringify({ percent }),
      });
      if (!entity) throw new ApiError("server", "Empty cover-percent response");
      return entity;
    },
  };
}
