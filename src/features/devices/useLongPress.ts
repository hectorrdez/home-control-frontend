import { useCallback, useEffect, useRef, type PointerEvent } from "react";

// Feature 156: long press (mouse hold or touch hold). The press fires once after LONG_PRESS_MS; moving more than
// MOVE_TOLERANCE_PX, lifting the pointer, leaving the element or a cancelled pointer aborts it.
export const LONG_PRESS_MS = 450;
export const MOVE_TOLERANCE_PX = 10;

export function useLongPress(onLongPress: () => void, delayMs = LONG_PRESS_MS) {
  const callback = useRef(onLongPress);
  useEffect(() => {
    callback.current = onLongPress;
  });
  const timer = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const fired = useRef(false);

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => cancel, [cancel]);

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    cancel();
    fired.current = false;
    origin.current = { x: event.clientX ?? 0, y: event.clientY ?? 0 };
    timer.current = window.setTimeout(() => {
      timer.current = null;
      fired.current = true;
      callback.current();
    }, delayMs);
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (timer.current === null) return;
    const dx = (event.clientX ?? 0) - origin.current.x;
    const dy = (event.clientY ?? 0) - origin.current.y;
    if (Math.hypot(dx, dy) > MOVE_TOLERANCE_PX) cancel();
  };

  // Called from the click handler: true when the click only ended a long press, so the tap must be ignored.
  const takeLongPress = () => {
    const was = fired.current;
    fired.current = false;
    return was;
  };

  const end = (_event: PointerEvent<HTMLElement>) => cancel();

  return {
    bind: {
      onPointerDown,
      onPointerMove,
      onPointerUp: end,
      onPointerLeave: end,
      onPointerCancel: end,
    },
    takeLongPress,
  };
}
