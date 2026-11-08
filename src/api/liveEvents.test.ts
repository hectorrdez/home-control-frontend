import { describe, expect, it, vi } from "vitest";
import { createLiveApi } from "./liveApi";

describe("live listEvents (140)", () => {
  it("builds GET /api/events from the query and returns the data rows", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({ data: [{ id: "7" }] }), { status: 200 }));
    const api = createLiveApi({ baseUrl: "http://api", token: "t", fetchImpl });
    const rows = await api.listEvents({ types: ["action", "alert"], entityId: "light.lamp", before: "9", limit: 100 });
    expect(rows).toEqual([{ id: "7" }]);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      "http://api/api/events?types=action%2Calert&entityId=light.lamp&before=9&limit=100",
    );
  });

  it("maps 404 to not_found (backend without the event log)", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 404 }));
    const api = createLiveApi({ baseUrl: "", token: "t", fetchImpl });
    await expect(api.listEvents()).rejects.toMatchObject({ kind: "not_found" });
  });
});
