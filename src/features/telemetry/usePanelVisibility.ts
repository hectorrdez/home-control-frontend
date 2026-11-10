import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useSyncedSetting } from "@/features/settings/useSyncedSetting";
import {
  EMPTY_PANEL_STATE,
  hideNewBatteryGauges,
  isHidden,
  panelsSetting,
  savePanelState,
  setPanelHidden,
  type PanelState,
} from "./panelVisibility";

// Feature 125: React state over the panelVisibility store. The page owns one instance and passes it to the CHARTS panel.
// batteryGaugeIds: entity ids of the battery gauges on screen (hidden the first time they are seen). Keep it memoized.
// Feature 136: the shared setting is the source, so another device's change applies live.
export function usePanelVisibility(batteryGaugeIds: readonly string[]) {
  const [stored] = useSyncedSetting(panelsSetting);
  const settled = useSyncExternalStore(panelsSetting.subscribe, panelsSetting.settled, panelsSetting.settled);
  const saved: PanelState = stored ?? EMPTY_PANEL_STATE;
  const state = useMemo(() => hideNewBatteryGauges(saved, batteryGaugeIds), [saved, batteryGaugeIds]);

  // Only a change this device makes (a newly seen battery gauge) is saved; a remote value is never echoed back.
  useEffect(() => {
    // Not before the first sync settles: a write from EMPTY would pre-empt the one-time legacy localStorage import.
    if (settled && state !== saved) savePanelState(state);
  }, [state, saved, settled]);

  const isPanelHidden = useCallback((id: string) => isHidden(id, state.hidden), [state]);

  const setPanelVisible = useCallback(
    (id: string, visible: boolean) => savePanelState(setPanelHidden(state, id, !visible)),
    [state],
  );

  return { isPanelHidden, setPanelVisible };
}
