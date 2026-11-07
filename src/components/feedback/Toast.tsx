import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

// Feature 104: error toasts. role="status", auto-dismiss after 4 s.
// Feature 129: a toast can run longer and be clickable (an alert opens its device).
const AUTO_DISMISS_MS = 4000;

export interface ToastOptions {
  durationMs?: number;
  onClick?: () => void;
}

interface ToastItem {
  id: number;
  text: string;
  onClick?: () => void;
}

interface ToastContextValue {
  show: (text: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const show = useCallback((text: string, options: ToastOptions = {}) => {
    const id = ++counter.current;
    setItems((current) => [...current, { id, text, onClick: options.onClick }]);
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, options.durationMs ?? AUTO_DISMISS_MS);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed bottom-16 right-space-md z-50 flex flex-col gap-space-sm"
      >
        {items.map((item) =>
          item.onClick ? (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              className="pointer-events-auto rounded border border-error bg-error-container px-space-md py-space-sm text-left font-mono text-label-caps uppercase text-on-error-container focus-visible:outline-2 focus-visible:outline-primary-container"
            >
              {item.text}
            </button>
          ) : (
            <p
              key={item.id}
              className="rounded border border-error bg-error-container px-space-md py-space-sm font-mono text-label-caps uppercase text-on-error-container"
            >
              {item.text}
            </p>
          ),
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside ToastProvider");
  return value;
}
