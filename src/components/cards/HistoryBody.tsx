import type { ReactNode } from "react";
import Button from "@components/controls/Button";
import type { HistoryState } from "@/features/telemetry/useHistory";

interface HistoryBodyProps {
  state: HistoryState;
  retry: () => void;
  empty: boolean;
  children: ReactNode;
}

// Feature 112: shared by the climate and power charts. Loading, the 404 "not available" state, errors, an empty range.
export default function HistoryBody({ state, retry, empty, children }: HistoryBodyProps) {
  if (state.status === "loading") {
    return <p role="status" className="font-label-caps text-label-caps uppercase text-on-surface-variant">LOADING HISTORY</p>;
  }
  if (state.status === "unavailable") {
    return <p role="status" className="font-label-caps text-label-caps uppercase text-on-surface-variant">HISTORY NOT AVAILABLE</p>;
  }
  if (state.status === "error") {
    return (
      <div role="alert" className="flex items-center gap-space-sm">
        <span className="font-label-caps text-label-caps uppercase text-error">HISTORY ERROR</span>
        <Button variant="secondary" onClick={retry}>
          RETRY
        </Button>
      </div>
    );
  }
  if (empty) return <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">NO HISTORY IN RANGE</p>;
  return <>{children}</>;
}
