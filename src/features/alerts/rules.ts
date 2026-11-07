import type { AlertLevel, AlertTrigger, Entity } from "@/api/types";

// Feature 128: pure rules for the alert editor (backend 012 shapes). No I/O, no React.

export const LEVELS: readonly AlertLevel[] = ["off", "low", "medium", "high"];
export const LEVEL_LABEL: Record<AlertLevel, string> = { off: "OFF", low: "LOW", medium: "MEDIUM", high: "HIGH" };
export const MESSAGE_MAX_LENGTH = 120;
export const STATE_VALUE_MAX_LENGTH = 40;

export type TriggerKind = AlertTrigger["type"];

// What the form offers for one entity. `choices` = the real states of a state entity; `unit` = unit of a numeric sensor.
export interface TriggerOption {
  kind: TriggerKind;
  label: string;
  valueKind: "none" | "choice" | "number";
  choices?: string[];
  unit?: string;
}

// The states each state-bearing domain can be in (the "BECOMES" choices).
const STATE_CHOICES: Partial<Record<string, string[]>> = {
  binary_sensor: ["on", "off"],
  switch: ["on", "off"],
  light: ["on", "off"],
  lock: ["locked", "unlocked"],
  cover: ["open", "closed", "opening", "closing"],
};

export function unitOf(entity: Entity): string | undefined {
  return typeof entity.attributes.unit_of_measurement === "string" ? entity.attributes.unit_of_measurement : undefined;
}

// Every entity: connects, disconnects, user interacts. State entities add BECOMES; numeric sensors add ABOVE/BELOW.
export function availableTriggers(entity: Entity): TriggerOption[] {
  const options: TriggerOption[] = [
    { kind: "connects", label: "CONNECTS", valueKind: "none" },
    { kind: "disconnects", label: "DISCONNECTS", valueKind: "none" },
    { kind: "interacted", label: "USER INTERACTS", valueKind: "none" },
  ];
  const choices = STATE_CHOICES[entity.domain];
  if (choices) options.push({ kind: "state_becomes", label: "BECOMES", valueKind: "choice", choices });
  if (entity.domain === "sensor") {
    const unit = unitOf(entity);
    options.push({ kind: "above", label: "ABOVE", valueKind: "number", unit }, { kind: "below", label: "BELOW", valueKind: "number", unit });
  }
  return options;
}

// The trigger for a form choice and its raw value; null when the value is missing or not a finite number.
export function buildTrigger(option: TriggerOption, raw: string): AlertTrigger | null {
  switch (option.kind) {
    case "connects":
    case "disconnects":
    case "interacted":
      return { type: option.kind };
    case "state_becomes":
      return raw === "" || raw.length > STATE_VALUE_MAX_LENGTH ? null : { type: "state_becomes", value: raw };
    case "above":
    case "below": {
      const value = Number(raw);
      return raw.trim() === "" || !Number.isFinite(value) ? null : { type: option.kind, value };
    }
  }
}

export function triggerLabel(trigger: AlertTrigger, unit?: string): string {
  switch (trigger.type) {
    case "connects":
      return "CONNECTS";
    case "disconnects":
      return "DISCONNECTS";
    case "interacted":
      return "USER INTERACTS";
    case "state_becomes":
      return `BECOMES ${trigger.value.toUpperCase()}`;
    case "above":
    case "below":
      return `${trigger.type.toUpperCase()} ${trigger.value}${unit ? ` ${unit}` : ""}`;
  }
}

// An empty or blank message means "no message" (the field is optional).
export function messageOf(raw: string): string | undefined {
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}
