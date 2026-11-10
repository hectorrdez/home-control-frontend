import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

// Feature 156: modal dialog for the actuator long-press menu. Rendered in a portal, focus is trapped inside,
// Escape closes (children may stop it first), and focus returns to whatever had it when the dialog opened.
interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement | null): HTMLElement[] {
  return root ? Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
}

export default function Dialog({ title, onClose, children }: DialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    focusables(panelRef.current)[0]?.focus();
    return () => {
      if (previous && previous.isConnected) previous.focus();
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const items = focusables(panelRef.current);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    const inside = panelRef.current?.contains(active) ?? false;
    if (event.shiftKey && (!inside || active === first)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (!inside || active === last)) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      data-testid="dialog-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface-container-lowest/70 p-space-md"
    >
      {/* Backdrop: a native button, so a click outside the panel closes the dialog (Escape and the close button too). */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        className="relative flex max-h-full w-full max-w-sm flex-col gap-space-md overflow-y-auto rounded-lg border border-primary-container/20 bg-surface-container-high p-space-md"
      >
        <div className="flex items-start justify-between gap-space-sm">
          <h2 id={titleId} className="min-w-0 truncate font-sans text-title-md font-semibold text-on-surface">
            {title}
          </h2>
          <button
            type="button"
            aria-label={`Close ${title}`}
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded text-on-surface-variant hover:text-primary-container focus-visible:outline-2 focus-visible:outline-primary-container"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
