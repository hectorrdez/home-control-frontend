import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockApi } from "./createMockApi";
import { ApiError } from "../types";

// Feature 127: the mock follows backend 010/011 (validation, positions, timed moves) for the cover-calibration scenario.
const COVER = "cover.salon_blind";
const mock = () => createMockApi({ scenario: "cover-calibration", actionDelayMs: 0 });

// Writes wait one (0 ms) mock delay; under fake timers that delay only fires when time advances.
async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(0);
  return promise;
}

async function rejectionOf(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    return error as ApiError;
  }
  throw new Error("expected a rejection");
}

async function coverNow(api: ReturnType<typeof mock>) {
  const cover = (await api.getEntities()).find((e) => e.entityId === COVER);
  if (!cover) throw new Error("cover fixture missing");
  return cover;
}

async function coverEstimate(api: ReturnType<typeof mock>) {
  return (await coverNow(api)).attributes.estimated_position;
}

afterEach(() => vi.useRealTimers());

describe("mock calibrations (feature 127)", () => {
  it("stores a calibration with an unknown position, lists it, and deletes it idempotently", async () => {
    const api = mock();
    expect(await api.getCalibrations()).toEqual([]);
    const list = await api.putCalibration(COVER, { openMs: 6000, closeMs: 5500 });
    expect(list).toEqual([expect.objectContaining({ entityId: COVER, openMs: 6000, closeMs: 5500, position: null })]);
    expect(await api.deleteCalibration(COVER)).toEqual([]);
    expect(await api.deleteCalibration(COVER)).toEqual([]);
  });

  it("validates calibrations: integers in 500..300000, covers only, a well-formed entity id", async () => {
    const api = mock();
    expect((await rejectionOf(api.putCalibration(COVER, { openMs: 499, closeMs: 5000 }))).message).toBe("invalid_calibration");
    expect((await rejectionOf(api.putCalibration(COVER, { openMs: 5000, closeMs: 300_001 }))).message).toBe("invalid_calibration");
    expect((await rejectionOf(api.putCalibration(COVER, { openMs: 5000.5, closeMs: 5000 }))).message).toBe("invalid_calibration");
    expect((await rejectionOf(api.putCalibration("light.office_desk", { openMs: 5000, closeMs: 5000 }))).message).toBe(
      "domain_not_allowed",
    );
    expect((await rejectionOf(api.putCalibration("cover.nope", { openMs: 5000, closeMs: 5000 }))).status).toBe(404);
    expect((await rejectionOf(api.putCalibration("Bad Id", { openMs: 5000, closeMs: 5000 }))).message).toBe("invalid_entity_id");
  });

  it("refuses a percent move before calibration and validates the percent and the entity", async () => {
    const api = mock();
    expect((await rejectionOf(api.setCoverPercent(COVER, 50))).message).toBe("not_calibrated");
    await api.putCalibration(COVER, { openMs: 5000, closeMs: 5000 });
    expect((await rejectionOf(api.setCoverPercent(COVER, 101))).message).toBe("invalid_params");
    expect((await rejectionOf(api.setCoverPercent(COVER, 1.5))).message).toBe("invalid_params");
    expect((await rejectionOf(api.setCoverPercent("light.office_desk", 50))).message).toBe("domain_not_allowed");
    expect((await rejectionOf(api.setCoverPercent("cover.nope", 50))).status).toBe(404);
  });

  it("needs an end first: an intermediate target with unknown position is refused", async () => {
    const api = mock();
    await api.putCalibration(COVER, { openMs: 5000, closeMs: 5000 });
    expect((await rejectionOf(api.setCoverPercent(COVER, 50))).message).toBe("position_unknown");
  });

  it("runs a full leg with a 10 % margin, then reports the end position", async () => {
    const api = mock();
    await api.putCalibration(COVER, { openMs: 5000, closeMs: 4000 });
    vi.useFakeTimers();
    const started = await api.setCoverPercent(COVER, 100);
    expect(started.attributes.estimated_position).toBeNull();

    vi.advanceTimersByTime(5499);
    expect(await coverEstimate(api)).toBeNull();
    vi.advanceTimersByTime(1);
    const done = await coverNow(api);
    expect(done.attributes.estimated_position).toBe(100);
    expect(done.state).toBe("open");
    expect((await api.getCalibrations())[0].position).toBe(100);
  });

  it("moves from a known position in proportion to the distance", async () => {
    const api = mock();
    await api.putCalibration(COVER, { openMs: 4000, closeMs: 4000 });
    vi.useFakeTimers();
    await api.setCoverPercent(COVER, 100);
    vi.advanceTimersByTime(4400);
    // from 100 down to 50 uses half of the 4000 ms close leg
    await api.setCoverPercent(COVER, 50);
    vi.advanceTimersByTime(1999);
    expect(await coverEstimate(api)).toBeNull();
    vi.advanceTimersByTime(1);
    const half = await coverNow(api);
    expect(half.attributes.estimated_position).toBe(50);
    expect(half.state).toBe("open");
  });

  it("a new request cancels a running move and keeps the elapsed estimate", async () => {
    const api = mock();
    await api.putCalibration(COVER, { openMs: 4000, closeMs: 4000 });
    vi.useFakeTimers();
    await api.setCoverPercent(COVER, 100);
    vi.advanceTimersByTime(4400);
    await api.setCoverPercent(COVER, 0);
    vi.advanceTimersByTime(4400);
    expect((await api.getCalibrations())[0].position).toBe(0);

    // from 100 towards 50 on a 2 s leg: after 1 s of it the estimate is 75
    await api.setCoverPercent(COVER, 100);
    vi.advanceTimersByTime(4400);
    await api.setCoverPercent(COVER, 50);
    vi.advanceTimersByTime(1000);
    await settle(api.runAction(COVER, { action: "stop_cover" }));
    expect((await api.getCalibrations())[0].position).toBe(75);
    expect(await coverEstimate(api)).toBe(75);
  });

  it("stop with no running move changes nothing, and a cancelled full leg leaves the position unknown", async () => {
    const api = mock();
    await api.putCalibration(COVER, { openMs: 4000, closeMs: 4000 });
    vi.useFakeTimers();
    await settle(api.runAction(COVER, { action: "stop_cover" }));
    expect((await api.getCalibrations())[0].position).toBeNull();

    await api.setCoverPercent(COVER, 0);
    vi.advanceTimersByTime(1000);
    await api.setCoverPercent(COVER, 0);
    expect((await api.getCalibrations())[0].position).toBeNull();
    expect(await coverEstimate(api)).toBeNull();
  });

  it("a deleted calibration cancels a running move (no late estimate)", async () => {
    const api = mock();
    await api.putCalibration(COVER, { openMs: 4000, closeMs: 4000 });
    vi.useFakeTimers();
    await api.setCoverPercent(COVER, 100);
    await settle(api.deleteCalibration(COVER));
    vi.advanceTimersByTime(10_000);
    expect(await api.getCalibrations()).toEqual([]);
  });

  it("keeps covers without current_position free of that attribute after open", async () => {
    const api = mock();
    const cover = await api.runAction(COVER, { action: "open_cover" });
    expect("current_position" in cover.attributes).toBe(false);
  });
});
