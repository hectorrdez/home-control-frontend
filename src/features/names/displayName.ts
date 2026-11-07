import type { Entity } from "@/api/types";

// Feature 115: pure display-name cleanup. No React, no guessing: the device prefix is only the
// real HA device name the backend sends (entity.deviceName, backend 009).

export const NAME_MAX_LENGTH = 80;

// Anything with an id, a raw name and the optional device name (entities, feed events).
export type NameSource = Pick<Entity, "entityId" | "name"> & { deviceName?: string | null };

export interface CleanOptions {
  areaName?: string | null;
  stripArea?: boolean; // true only for titles that already show the area next to the name
}

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function upperFirst(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// Strips `prefix` when `text` starts with it case-insensitively at a word boundary and leaves a non-empty remainder.
function stripPrefix(text: string, prefix: string): string | null {
  if (!prefix || text.length <= prefix.length) return null;
  if (text.slice(0, prefix.length).toLowerCase() !== prefix.toLowerCase()) return null;
  if (text.charAt(prefix.length) !== " ") return null;
  const rest = text.slice(prefix.length + 1).trim();
  return rest.length > 0 ? rest : null;
}

// ALL CAPS runs of 2+ letter-only tokens (one with 4+ letters) become lowercase; acronyms and single words stay.
function fixAllCaps(text: string): string {
  const tokens = text.split(" ");
  const isCapsWord = (token: string) => /^\p{Lu}+$/u.test(token);
  let changed = false;
  for (let i = 0; i < tokens.length; ) {
    if (!isCapsWord(tokens[i])) {
      i++;
      continue;
    }
    let end = i;
    while (end < tokens.length && isCapsWord(tokens[end])) end++;
    const run = tokens.slice(i, end);
    if (run.length >= 2 && run.some((token) => token.length >= 4)) {
      for (let k = i; k < end; k++) tokens[k] = tokens[k].toLowerCase();
      changed = true;
    }
    i = end;
  }
  return changed ? upperFirst(tokens.join(" ")) : text;
}

// Cleanup steps (a) whitespace, (b) device strip, (c) ALL CAPS, (d) area strip (shortName only).
export function cleanName(entity: NameSource, options: CleanOptions = {}): string {
  const fallback = entity.entityId;
  let name = collapse(entity.name ?? "");
  if (!name) return fallback;

  let deviceStripped = false;
  const deviceName = entity.deviceName ? collapse(entity.deviceName) : "";
  const afterDevice = stripPrefix(name, deviceName);
  if (afterDevice !== null) {
    name = afterDevice;
    deviceStripped = true;
  }

  name = fixAllCaps(name);

  if (options.stripArea && !deviceStripped && options.areaName) {
    const area = collapse(options.areaName);
    const afterArea = stripPrefix(name, area);
    if (afterArea !== null) name = upperFirst(afterArea);
  }

  return name;
}

// Accessible names, toasts, feed, gauges, history bars.
export function displayName(entity: NameSource): string {
  return cleanName(entity);
}

// Feature 124: the physical device label (same cleanup as /devices). Empty when there is no usable device name.
export function deviceLabel(entity: Pick<Entity, "entityId" | "deviceName">): string {
  const raw = entity.deviceName ? collapse(entity.deviceName) : "";
  return raw ? cleanName({ entityId: entity.entityId, name: raw }) : "";
}

// Visible card titles that already show the area next to the name.
export function shortName(entity: NameSource, areaName: string | null | undefined): string {
  return cleanName(entity, { areaName, stripArea: true });
}
