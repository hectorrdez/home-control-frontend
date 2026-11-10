import { describe, expect, it, vi } from "vitest";
import { createLiveApi } from "./liveApi";
import { ApiError, ReloadRateLimitedError } from "./types";

// Feature 164: POST /api/ha/reload through the live client.
function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

function clientWith(fetchImpl: unknown) {
  return createLiveApi({ baseUrl: "http://panel.test", token: "secret-token", fetchImpl: fetchImpl as typeof fetch });
}

describe("liveApi.reloadIntegrations", () => {
  it("posts to /api/ha/reload with the bearer token and maps data + entities", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        data: [{ entryId: "e1", domain: "tuya", title: "Tuya", ok: true }],
        entities: { before: 4, after: 5 },
      }),
    );

    const result = await clientWith(fetchImpl).reloadIntegrations();

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://panel.test/api/ha/reload");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-token");
    expect(result).toEqual({
      entries: [{ entryId: "e1", domain: "tuya", title: "Tuya", ok: true }],
      entities: { before: 4, after: 5 },
    });
  });

  it("keeps the per-entry error text of a failed integration", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        data: [{ entryId: "e2", domain: "tuya", title: "Tuya cloud", ok: false, error: "timeout" }],
        entities: { before: 1, after: 1 },
      }),
    );
    const result = await clientWith(fetchImpl).reloadIntegrations();
    expect(result.entries[0]).toEqual({ entryId: "e2", domain: "tuya", title: "Tuya cloud", ok: false, error: "timeout" });
  });

  it("maps 404 to not_found (backend without 024)", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(404, { error: "not_found" }));
    const err = await clientWith(fetchImpl).reloadIntegrations().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).kind).toBe("not_found");
    expect((err as ApiError).status).toBe(404);
  });

  it("maps 409 and 502 to ApiErrors carrying the status", async () => {
    const conflict = await clientWith(vi.fn(async () => jsonResponse(409, { error: "reload_in_progress" })))
      .reloadIntegrations()
      .catch((e: unknown) => e);
    expect((conflict as ApiError).status).toBe(409);

    const unreachable = await clientWith(vi.fn(async () => jsonResponse(502, { error: "ha_unreachable" })))
      .reloadIntegrations()
      .catch((e: unknown) => e);
    expect((unreachable as ApiError).status).toBe(502);
  });

  it("maps 429 to ReloadRateLimitedError with retryAfterSeconds from the body", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(429, { error: "rate_limited", retryAfterSeconds: 12 }));
    const err = await clientWith(fetchImpl).reloadIntegrations().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ReloadRateLimitedError);
    expect((err as ReloadRateLimitedError).retryAfterSeconds).toBe(12);
  });

  it("falls back to the Retry-After header on 429 when the body has no countdown", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(429, { error: "rate_limited" }, { "Retry-After": "5" }));
    const err = await clientWith(fetchImpl).reloadIntegrations().catch((e: unknown) => e);
    expect((err as ReloadRateLimitedError).retryAfterSeconds).toBe(5);
  });

  it("maps a network failure to a network ApiError", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const err = await clientWith(fetchImpl).reloadIntegrations().catch((e: unknown) => e);
    expect((err as ApiError).kind).toBe("network");
  });
});
