import { act, renderHook } from "@testing-library/react";
import type { PointerEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LONG_PRESS_MS, useLongPress } from "./useLongPress";

// Feature 156: timing and cancel rules of the long press. Events are plain objects: the hook reads only these fields.
const down = (over: Record<string, unknown> = {}) =>
  ({ pointerType: "mouse", button: 0, clientX: 100, clientY: 100, ...over }) as unknown as PointerEvent<HTMLElement>;

describe("useLongPress (156)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires once after about 450 ms, not before", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));
    act(() => result.current.bind.onPointerDown(down()));
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS - 1));
    expect(onLongPress).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onLongPress).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(2000));
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("uses 450 ms by default", () => {
    expect(LONG_PRESS_MS).toBe(450);
  });

  it("is cancelled by a pointer up before the threshold", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));
    act(() => result.current.bind.onPointerDown(down()));
    act(() => vi.advanceTimersByTime(200));
    act(() => result.current.bind.onPointerUp(down()));
    act(() => vi.advanceTimersByTime(1000));
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("is cancelled when the pointer leaves the element", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));
    act(() => result.current.bind.onPointerDown(down()));
    act(() => result.current.bind.onPointerLeave(down()));
    act(() => vi.advanceTimersByTime(1000));
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("is cancelled by a pointer cancel (browser took over the touch, e.g. scroll)", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));
    act(() => result.current.bind.onPointerDown(down({ pointerType: "touch" })));
    act(() => result.current.bind.onPointerCancel(down({ pointerType: "touch" })));
    act(() => vi.advanceTimersByTime(1000));
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("is cancelled by moving beyond the tolerance, kept while the movement is small", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));
    act(() => result.current.bind.onPointerDown(down()));
    act(() => result.current.bind.onPointerMove(down({ clientX: 104, clientY: 103 })));
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
    expect(onLongPress).toHaveBeenCalledTimes(1);

    onLongPress.mockClear();
    act(() => result.current.bind.onPointerDown(down()));
    act(() => result.current.bind.onPointerMove(down({ clientX: 130, clientY: 100 })));
    act(() => vi.advanceTimersByTime(1000));
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("ignores secondary mouse buttons", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));
    act(() => result.current.bind.onPointerDown(down({ button: 2 })));
    act(() => vi.advanceTimersByTime(1000));
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("works for touch holds too", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));
    act(() => result.current.bind.onPointerDown(down({ pointerType: "touch", button: 0 })));
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("takeLongPress reports the fired press once, so the click after it is ignored", () => {
    const { result } = renderHook(() => useLongPress(vi.fn()));
    act(() => result.current.bind.onPointerDown(down()));
    expect(result.current.takeLongPress()).toBe(false);
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
    act(() => result.current.bind.onPointerUp(down()));
    expect(result.current.takeLongPress()).toBe(true);
    expect(result.current.takeLongPress()).toBe(false);
  });

  it("calls the latest callback without restarting the timer", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(({ cb }) => useLongPress(cb), { initialProps: { cb: first } });
    act(() => result.current.bind.onPointerDown(down()));
    rerender({ cb: second });
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("clears a pending press on unmount", () => {
    const onLongPress = vi.fn();
    const { result, unmount } = renderHook(() => useLongPress(onLongPress));
    act(() => result.current.bind.onPointerDown(down()));
    unmount();
    act(() => vi.advanceTimersByTime(1000));
    expect(onLongPress).not.toHaveBeenCalled();
  });
});
