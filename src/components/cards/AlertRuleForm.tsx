import { useState, type FormEvent } from "react";
import Button from "@components/controls/Button";
import type { AlertLevel, AlertRuleInput, Entity } from "@/api/types";
import { ApiError } from "@/api/types";
import { availableTriggers, buildTrigger, messageOf, MESSAGE_MAX_LENGTH, type TriggerKind } from "@/features/alerts/rules";
import AlertLevelPicker from "./AlertLevelPicker";

// Feature 128: the inline "ADD ALERT" form. Errors are shown here; a duplicate gets its own sentence.
export const DUPLICATE_MESSAGE = "AN ALERT FOR THIS TRIGGER ALREADY EXISTS";
export const SAVE_FAILED_MESSAGE = "COULD NOT SAVE THE ALERT";
const VALUE_MISSING_MESSAGE = "ENTER A VALUE";
const FIELD = "rounded border border-outline-variant bg-surface-container-low px-space-sm min-h-11 font-mono text-body-md text-on-surface";

interface AlertRuleFormProps {
  entity: Entity;
  onSubmit: (input: AlertRuleInput) => Promise<void>; // rejects with the ApiError to show
  onCancel: () => void;
}

export default function AlertRuleForm({ entity, onSubmit, onCancel }: AlertRuleFormProps) {
  const options = availableTriggers(entity);
  const [kind, setKind] = useState<TriggerKind>("connects");
  const [raw, setRaw] = useState("");
  const [level, setLevel] = useState<AlertLevel>("medium");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const option = options.find((item) => item.kind === kind) ?? options[0];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trigger = buildTrigger(option, raw);
    if (!trigger) {
      setError(VALUE_MISSING_MESSAGE);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ entityId: entity.entityId, trigger, level, message: messageOf(message) });
    } catch (failure) {
      const duplicate = failure instanceof ApiError && failure.message === "duplicate_rule";
      setError(duplicate ? DUPLICATE_MESSAGE : SAVE_FAILED_MESSAGE);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form aria-label="New alert" onSubmit={submit} className="flex flex-col gap-space-sm rounded-lg bg-surface-container-low p-space-sm">
      <div className="flex flex-wrap gap-space-sm">
        <select
          aria-label="Trigger"
          className={FIELD}
          value={kind}
          onChange={(event) => {
            setKind(event.target.value as TriggerKind);
            setRaw("");
          }}
        >
          {options.map((item) => (
            <option key={item.kind} value={item.kind}>
              {item.label}
            </option>
          ))}
        </select>
        {option.valueKind === "choice" && (
          <select aria-label="Value" className={FIELD} value={raw} onChange={(event) => setRaw(event.target.value)}>
            <option value="">CHOOSE A STATE</option>
            {option.choices?.map((choice) => (
              <option key={choice} value={choice}>
                {choice.toUpperCase()}
              </option>
            ))}
          </select>
        )}
        {option.valueKind === "number" && (
          <input
            aria-label={option.unit ? `Value in ${option.unit}` : "Value"}
            type="number"
            step="any"
            className={FIELD}
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
          />
        )}
      </div>
      <AlertLevelPicker label="Level" value={level} disabled={saving} onChange={setLevel} />
      <input
        aria-label="Message (optional)"
        placeholder="MESSAGE (OPTIONAL)"
        maxLength={MESSAGE_MAX_LENGTH}
        className={`${FIELD} w-full`}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
      />
      {error && (
        <p role="alert" className="font-label-caps text-label-caps uppercase text-error">
          {error}
        </p>
      )}
      <div className="flex gap-space-sm">
        <Button type="submit" busy={saving} disabled={saving}>
          SAVE ALERT
        </Button>
        <Button variant="secondary" disabled={saving} onClick={onCancel}>
          CANCEL
        </Button>
      </div>
    </form>
  );
}
