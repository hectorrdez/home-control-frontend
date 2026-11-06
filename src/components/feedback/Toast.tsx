import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

// Feature 104: error toasts. role="status", auto-dismiss after 4 s.
const AUTO_DISMISS_MS = 4000;

interface ToastItem {
  id: number;
  text: string;
}

interface ToastContextValue {
  show: (text: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const show = useCallback((text: string) => {
    const id = ++counter.current;
    setItems((current) => [...current, { id, text }]);
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, AUTO_DISMISS_MS);
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
        {items.map((item) => (
          <p
            key={item.id}
            className="rounded border border-error bg-error-container px-space-md py-space-sm font-mono text-label-caps uppercase text-on-error-container"
          >
            {item.text}
          </p>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside ToastProvider");
  return value;
}
