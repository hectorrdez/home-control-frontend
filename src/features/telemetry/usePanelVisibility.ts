import { useCallback, useEffect, useMemo, useState } from "react";
import {
  hideNewBatteryGauges,
  isHidden,
  loadPanelState,
  savePanelState,
  setPanelHidden,
  type PanelState,
} from "./panelVisibility";

// Feature 125: React state over the panelVisibility store. The page owns one instance and passes it to the CHARTS panel.
// batteryGaugeIds: entity ids of the battery gauges on screen (hidden the first time they are seen). Keep it memoized.
export function usePanelVisibility(batteryGaugeIds: readonly string[]) {
  const [saved, setSaved] = useState<PanelState>(loadPanelState);
  const state = useMemo(() => hideNewBatteryGauges(saved, batteryGaugeIds), [saved, batteryGaugeIds]);

  useEffect(() => {
    savePanelState(state);
  }, [state]);

  const isPanelHidden = useCallback((id: string) => isHidden(id, state.hidden), [state]);

  const setPanelVisible = useCallback(
    (id: string, visible: boolean) => {
      setSaved((prev) => setPanelHidden(hideNewBatteryGauges(prev, batteryGaugeIds), id, !visible));
    },
    [batteryGaugeIds],
  );

  return { isPanelHidden, setPanelVisible };
}
