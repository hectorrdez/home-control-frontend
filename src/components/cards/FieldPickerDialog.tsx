import { useId, useState } from "react";
import Button from "@components/controls/Button";
import Dialog from "@components/controls/Dialog";

// Feature 163: popup that picks which fields of one device get a chart. "multi" = checkboxes (ADD / SAVE, at least one),
// "single" = radio (swap the field of one chart, SAVE). Focus and Escape come from the Dialog primitive.
export interface PickerField {
  entityId: string;
  label: string; // displayName
  category: string; // category label, e.g. HUMIDITY
  value: string; // current value with unit, "" when unknown
}

interface FieldPickerDialogProps {
  title: string; // the device name
  fields: PickerField[];
  mode: "multi" | "single";
  initial: string[];
  confirmLabel: "ADD" | "SAVE";
  onConfirm: (entityIds: string[]) => void;
  onCancel: () => void;
}

export default function FieldPickerDialog({ title, fields, mode, initial, confirmLabel, onConfirm, onCancel }: FieldPickerDialogProps) {
  const [selected, setSelected] = useState<string[]>(initial);
  const groupName = useId();

  const toggle = (entityId: string, on: boolean) => {
    if (mode === "single") setSelected([entityId]);
    else setSelected((prev) => (on ? [...prev.filter((id) => id !== entityId), entityId] : prev.filter((id) => id !== entityId)));
  };

  return (
    <Dialog title={title} onClose={onCancel}>
      <fieldset className="flex flex-col gap-space-xs">
        <legend className="font-label-caps text-label-caps uppercase text-on-surface-variant">FIELDS</legend>
        <ul className="flex flex-col gap-space-xs">
          {fields.map((field) => {
            const checked = selected.includes(field.entityId);
            return (
              <li key={field.entityId}>
                <label className="flex min-h-11 cursor-pointer items-center justify-between gap-space-sm rounded border border-outline-variant/30 p-space-sm">
                  <span className="flex min-w-0 items-center gap-space-sm">
                    <input
                      type={mode === "single" ? "radio" : "checkbox"}
                      name={mode === "single" ? groupName : undefined}
                      checked={checked}
                      onChange={(event) => toggle(field.entityId, event.target.checked)}
                      className="h-5 w-5 shrink-0 accent-primary-container"
                    />
                    <span className="min-w-0 truncate font-sans text-body-md text-on-surface">{field.label}</span>
                  </span>
                  <span className="shrink-0 font-mono text-label-caps uppercase text-on-surface-variant">
                    {field.category}
                    {field.value && ` · ${field.value}`}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>
      <div className="flex justify-end gap-space-xs">
        <Button variant="secondary" onClick={onCancel}>
          CANCEL
        </Button>
        <Button disabled={selected.length === 0} onClick={() => onConfirm(selected)}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
