import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

interface SideDrawerProps {
  side: "left" | "right";
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

// Slide-in panel fixed to a viewport edge. Closed = out of the a11y tree and tab order; children mount only when open.
export default function SideDrawer({
  side,
  title,
  open,
  onClose,
  children,
}: SideDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const edge = side === "left" ? "left-0 border-r" : "right-0 border-l";
  const hidden = side === "left" ? "-translate-x-full" : "translate-x-full";

  return (
    <>
      {open && (
        <div
          aria-hidden="true"
          onClick={onClose}
          className="fixed inset-x-0 bottom-20 top-16 z-30 bg-surface-container-lowest/40 md:bottom-0"
        />
      )}
      <aside
        aria-label={title}
        aria-hidden={!open}
        className={`fixed bottom-20 top-16 z-40 md:bottom-0 flex w-80 max-w-full flex-col gap-space-sm border-outline-variant bg-surface-container-low p-space-md shadow-xl transition-transform duration-200 motion-reduce:transition-none ${edge} ${open ? "translate-x-0" : `${hidden} invisible`}`}
      >
        <div className="flex items-center justify-between gap-space-xs">
          <span className="font-label-caps text-label-caps uppercase text-on-surface">
            {title}
          </span>
          <button
            type="button"
            aria-label={`Close ${title}`}
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded text-on-surface-variant hover:text-primary-container focus-visible:outline-2 focus-visible:outline-primary-container"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {open ? children : null}
        </div>
      </aside>
    </>
  );
}
