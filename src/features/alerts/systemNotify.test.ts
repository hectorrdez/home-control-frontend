import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerAlert } from "@/api/types";
import {
  SYSTEM_NOTIFY_KEY,
  closeSystemAlert,
  disableSystemNotify,
  enableSystemNotify,
  isPageHidden,
  notificationBody,
  notificationTitle,
  notifySystemAlert,
  readPreference,
  resetSystemNotifyForTests,
  shouldNotify,
  systemNotifyStatus,
} from "./systemNotify";

// Feature 145: the decision table, the Notification adapter (fake global) and the permission/preference states.
class FakeNotification {
  static permission: NotificationPermission = "granted";
  static requestPermission = vi.fn(async () => {
    FakeNotification.permission = "granted";
    return "granted" as NotificationPermission;
  });
  static instances: FakeNotification[] = [];
  onclick: (() => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;
  title: string;
  options: NotificationOptions;
  constructor(title: string, options: NotificationOptions) {
    this.title = title;
    this.options = options;
    FakeNotification.instances.push(this);
  }
  close() {
    this.closed = true;
  }
}

const HIDDEN = { fromList: false, hidden: true };
const VISIBLE = { fromList: false, hidden: false };

function alert(level: ServerAlert["level"], id = "alert-1"): ServerAlert {
  return {
    id,
    ruleId: "seed-high",
    entityId: "lock.front_door",
    level,
    text: "Front door unlocked",
    firedAt: "2026-11-08T10:00:00.000Z",
    ackedAt: null,
    ackedBy: null,
    clientId: null,
  };
}

beforeEach(() => {
  vi.stubGlobal("Notification", FakeNotification);
  FakeNotification.permission = "granted";
  FakeNotification.requestPermission.mockClear();
  FakeNotification.instances.length = 0;
  localStorage.clear();
  resetSystemNotifyForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("shouldNotify", () => {
  it.each([
    ["high", HIDDEN, true],
    ["medium", HIDDEN, true],
    ["low", HIDDEN, false],
    ["high", VISIBLE, false],
    ["medium", VISIBLE, false],
    ["high", { fromList: true, hidden: true }, false],
    ["medium", { fromList: true, hidden: true }, false],
  ] as const)("level %s with ctx %j -> %s", (level, ctx, expected) => {
    expect(shouldNotify({ level }, ctx)).toBe(expected);
  });
});

describe("isPageHidden", () => {
  const doc = (visibilityState: DocumentVisibilityState, focused: boolean) => ({ visibilityState, hasFocus: () => focused }) as Document;

  it("is false only when visible and focused", () => {
    expect(isPageHidden(doc("visible", true))).toBe(false);
    expect(isPageHidden(doc("hidden", true))).toBe(true);
    expect(isPageHidden(doc("visible", false))).toBe(true);
  });
});

describe("notifySystemAlert", () => {
  it("builds the title, body and tag, and marks HIGH as requireInteraction", () => {
    const created = notifySystemAlert(alert("high"), { deviceName: "Front door", areaName: "Hall", ctx: HIDDEN, onClick: vi.fn() });
    expect(created).toBe(true);
    const [n] = FakeNotification.instances;
    expect(n.title).toBe("HOME CONTROL • HIGH");
    expect(n.options).toMatchObject({ body: "Front door • Hall: Front door unlocked", tag: "alert-1", requireInteraction: true });
  });

  it("MEDIUM is not sticky and falls back to NO AREA", () => {
    notifySystemAlert(alert("medium", "m1"), { deviceName: "Desk plug", areaName: null, ctx: HIDDEN, onClick: vi.fn() });
    const [n] = FakeNotification.instances;
    expect(n.title).toBe("HOME CONTROL • MEDIUM");
    expect(n.options.requireInteraction).toBe(false);
    expect(n.options.body).toBe("Desk plug • NO AREA: Front door unlocked");
  });

  it("does nothing while the page is visible, for LOW, or for a start-list alert", () => {
    expect(notifySystemAlert(alert("high"), { deviceName: "x", areaName: null, ctx: VISIBLE, onClick: vi.fn() })).toBe(false);
    expect(notifySystemAlert(alert("low"), { deviceName: "x", areaName: null, ctx: HIDDEN, onClick: vi.fn() })).toBe(false);
    expect(notifySystemAlert(alert("high"), { deviceName: "x", areaName: null, ctx: { fromList: true, hidden: true }, onClick: vi.fn() })).toBe(false);
    expect(FakeNotification.instances).toHaveLength(0);
  });

  it("click focuses the window, runs the navigation and closes the notification (no ack)", () => {
    const focus = vi.spyOn(window, "focus").mockImplementation(() => undefined);
    const onClick = vi.fn();
    notifySystemAlert(alert("high"), { deviceName: "x", areaName: null, ctx: HIDDEN, onClick });
    const [n] = FakeNotification.instances;
    n.onclick?.();
    expect(focus).toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(n.closed).toBe(true);
  });

  it("an alert_acked id closes its notification", () => {
    notifySystemAlert(alert("high", "gone"), { deviceName: "x", areaName: null, ctx: HIDDEN, onClick: vi.fn() });
    closeSystemAlert("gone");
    expect(FakeNotification.instances[0].closed).toBe(true);
    closeSystemAlert("never-shown"); // no-op
  });

  it("is silent when the user turned notifications off", () => {
    disableSystemNotify();
    expect(notifySystemAlert(alert("high"), { deviceName: "x", areaName: null, ctx: HIDDEN, onClick: vi.fn() })).toBe(false);
    expect(FakeNotification.instances).toHaveLength(0);
  });
});

describe("permission and preference", () => {
  it("reports ON when granted and the preference is absent (default on)", () => {
    expect(systemNotifyStatus()).toBe("on");
    expect(readPreference()).toBe(true);
  });

  it("reports BLOCKED BY BROWSER when denied, and never asks", () => {
    FakeNotification.permission = "denied";
    expect(systemNotifyStatus()).toBe("blocked");
    expect(notifySystemAlert(alert("high"), { deviceName: "x", areaName: null, ctx: HIDDEN, onClick: vi.fn() })).toBe(false);
  });

  it("reports NOT SUPPORTED without the Notification API", () => {
    vi.stubGlobal("Notification", undefined);
    expect(systemNotifyStatus()).toBe("unsupported");
  });

  it("asks only from the user gesture, and turns the preference on after a grant", async () => {
    FakeNotification.permission = "default";
    expect(systemNotifyStatus()).toBe("ask");
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();

    const status = await enableSystemNotify();
    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1);
    expect(status).toBe("on");
    expect(localStorage.getItem(SYSTEM_NOTIFY_KEY)).toBe("on");
  });

  it("the off preference survives a reload and is re-enabled without a new prompt", async () => {
    disableSystemNotify();
    expect(localStorage.getItem(SYSTEM_NOTIFY_KEY)).toBe("off");
    expect(systemNotifyStatus()).toBe("off");

    expect(await enableSystemNotify()).toBe("on");
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
  });

  it("keeps working when localStorage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readPreference()).toBe(true);
  });
});

describe("text", () => {
  it("title and body follow the spec", () => {
    expect(notificationTitle("medium")).toBe("HOME CONTROL • MEDIUM");
    expect(notificationBody("Hall light", "Hall", "BECOMES ON")).toBe("Hall light • Hall: BECOMES ON");
  });
});
