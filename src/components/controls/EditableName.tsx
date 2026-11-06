import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Pencil } from "lucide-react";

// Feature 115: inline rename. Enter saves, Esc or blur cancels, empty resets to the cleaned name (handled by the caller).
interface EditableNameProps {
  entityId: string;
  shown: string; // what the card displays (alias or cleaned name, area stripped where the area is shown)
  label: string; // full display name for the pencil's accessible name
  raw: string; // the Home Assistant name, shown as a tooltip when it differs
  canRename: boolean;
  onRename: (alias: string) => Promise<boolean>;
  textClassName?: string;
}

export default function EditableName({ entityId, shown, label, raw, canRename, onRename, textClassName = "" }: EditableNameProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(shown);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pencilRef = useRef<HTMLButtonElement>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const close = (returnFocus: boolean) => {
    setEditing(false);
    setSaving(false);
    if (returnFocus) pencilRef.current?.focus();
  };

  const save = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    await onRename(draft);
    savingRef.current = false;
    close(true);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void save();
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (!savingRef.current) close(true);
    }
  };

  const onBlur = () => {
    // Disabling the input while saving blurs it; the save finishes the edit itself.
    if (!savingRef.current) close(false);
  };

  return (
    <div className="flex min-w-0 items-center gap-space-xs">
      <div className="flex min-w-0 flex-1 flex-col gap-space-xs">
        {editing ? (
          <>
            <input
              ref={inputRef}
              autoFocus
              type="text"
              value={draft}
              maxLength={80}
              disabled={saving}
              aria-label={`Name for ${entityId}`}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              onBlur={onBlur}
              className={`min-w-0 rounded border border-outline-variant bg-surface px-space-xs py-space-xs font-sans text-title-md text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${textClassName}`}
            />
            <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">
              {saving ? <span className="font-mono">SENDING</span> : "ENTER SAVE • ESC CANCEL • EMPTY RESETS"}
            </p>
          </>
        ) : (
          <span className={`min-w-0 truncate ${textClassName}`} title={raw !== shown ? `${raw} (${entityId})` : undefined}>
            {shown}
          </span>
        )}
      </div>
      {canRename && (
        <button
          ref={pencilRef}
          type="button"
          aria-label={`Rename ${label}`}
          onClick={() => {
            setDraft(shown);
            setEditing(true);
          }}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded text-on-surface-variant hover:text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Pencil size={16} aria-hidden />
        </button>
      )}
    </div>
  );
}
