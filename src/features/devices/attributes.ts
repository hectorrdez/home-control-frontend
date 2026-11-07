import type { Entity } from "@/api/types";

// Feature 122: one attribute value as text for the detail page's ATTRIBUTES list.
export function formatAttributeValue(value: unknown): string {
  if (value === null || value === undefined) return "--";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.join(", ");
  return JSON.stringify(value);
}

// Attribute rows sorted by key, for the <dl>.
export function attributeRows(entity: Entity): Array<{ key: string; value: string }> {
  return Object.keys(entity.attributes)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => ({ key, value: formatAttributeValue(entity.attributes[key]) }));
}
