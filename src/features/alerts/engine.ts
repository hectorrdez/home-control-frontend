import type { AlertRule, AlertTrigger, Entity } from "@/api/types";
import { isUnavailable } from "@/state/availability";
import type { PendingAction } from "@/state/entities";
import { triggerLabel, unitOf } from "./rules";

// Feature 129: pure alert evaluation. No React, no I/O. Level "off" never fires.

// One rule per entity and event: the same rule does not fire again within this window.
export const DEDUPE_MS = 2000;

export type FiringLevel = Exclude<import("@/api/types").AlertLevel, "off">;

export interface AlertEvent {
  rule: AlertRule;
  entityId: string;
  level: FiringLevel;
  text: string; // the rule message, or the trigger label
  at: string; // lastChanged of the entity that fired
}

export interface EntityChange {
  before: Entity;
  after: Entity;
  interacted: boolean; // the panel's own pending action was open when the change arrived
}

export interface EvalContext {
  interacted: boolean;
}

function numeric(entity: Entity): number | null {
  if (entity.state.trim() === "") return null;
  const n = Number(entity.state);
  return Number.isFinite(n) ? n : null;
}

// A trigger fires on the change from `before` to `after` (both known versions of the same entity).
// above/below fire only when the value crosses the threshold, so a rule re-arms when the value comes back.
export function fires(trigger: AlertTrigger, before: Entity, after: Entity, ctx: EvalContext): boolean {
  switch (trigger.type) {
    case "connects":
      return isUnavailable(before) && !isUnavailable(after);
    case "disconnects":
      return !isUnavailable(before) && isUnavailable(after);
    case "interacted":
      return ctx.interacted;
    case "state_becomes":
      return after.state === trigger.value && before.state !== trigger.value;
    case "above":
    case "below": {
      const a = numeric(before);
      const b = numeric(after);
      if (a === null || b === null) return false;
      return trigger.type === "above" ? a <= trigger.value && b > trigger.value : a >= trigger.value && b < trigger.value;
    }
  }
}

// The alerts one change raises: enabled rules of this entity whose trigger fires.
export function evaluate(rules: readonly AlertRule[], before: Entity, after: Entity, ctx: EvalContext): AlertEvent[] {
  return rules.flatMap((rule) => {
    if (rule.entityId !== after.entityId || rule.level === "off" || !fires(rule.trigger, before, after, ctx)) return [];
    return [
      {
        rule,
        entityId: after.entityId,
        level: rule.level,
        text: rule.message ?? triggerLabel(rule.trigger, unitOf(after)),
        at: after.lastChanged,
      },
    ];
  });
}

function differs(a: Entity, b: Entity): boolean {
  return (
    a.state !== b.state ||
    a.lastChanged !== b.lastChanged ||
    JSON.stringify(a.attributes) !== JSON.stringify(b.attributes)
  );
}

// Changes between two store snapshots. Skipped: new entities (no before), optimistic values still pending
// (the alert waits for the confirmed value), and rollbacks of the panel's own failed action (not a device event).
export function entityChanges(
  prev: Record<string, Entity>,
  prevPending: Record<string, PendingAction>,
  next: Record<string, Entity>,
  nextPending: Record<string, PendingAction>,
): EntityChange[] {
  const changes: EntityChange[] = [];
  for (const [entityId, after] of Object.entries(next)) {
    const before = prev[entityId];
    if (!before || nextPending[entityId] || !differs(before, after)) continue;
    const pending = prevPending[entityId];
    if (pending && after.state === pending.baseline.state && before.state !== after.state) continue;
    changes.push({ before, after, interacted: pending !== undefined });
  }
  return changes;
}

// Keeps the firings that are not repeats of the same rule within DEDUPE_MS, and records their time.
export function takeFirings(events: AlertEvent[], lastFired: Map<string, number>, now: number): AlertEvent[] {
  return events.filter((event) => {
    const last = lastFired.get(event.rule.id);
    if (last !== undefined && now - last < DEDUPE_MS) return false;
    lastFired.set(event.rule.id, now);
    return true;
  });
}
