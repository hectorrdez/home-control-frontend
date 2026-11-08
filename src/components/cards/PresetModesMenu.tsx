import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import Button from "@components/controls/Button";
import type { Preset } from "@/api/types";

// Feature 143: the MODES menu of a cover on Home 3D. Lists its saved positions (142) as role="menu" items.
// It floats in a portal, so the device card does not grow. Arrows move, Enter applies (native button click),
// Esc or a click outside closes and returns focus to MODES. Scrolling or resizing keeps it on its trigger.
interface PresetModesMenuProps {
  presets: Preset[]; // already sorted (142)
  disabled: boolean;
  busy: boolean;
  onApply: (preset: Preset) => void;
}

const GAP = 4;

export default function PresetModesMenu({ presets, disabled, busy, onApply }: PresetModesMenuProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  const place = () => {
    const trigger = buttonRef.current?.getBoundingClientRect();
    if (!trigger) return;
    const menu = menuRef.current?.getBoundingClientRect();
    const height = menu?.height ?? 0;
    const width = menu?.width ?? 0;
    const below = trigger.bottom + GAP;
    const top = window.innerHeight - below >= height + GAP ? below : Math.max(GAP, trigger.top - height - GAP);
    const left = Math.max(GAP, Math.min(trigger.left, window.innerWidth - width - GAP));
    setCoords({ top, left });
  };

  const openMenu = () => {
    const trigger = buttonRef.current?.getBoundingClientRect();
    if (trigger) setCoords({ top: trigger.bottom + GAP, left: trigger.left });
    setActive(0);
    setOpen(true);
  };

  // Measured after the portal renders: the flip above the trigger needs the real menu height.
  useLayoutEffect(() => {
    if (open) place();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) itemRefs.current[active]?.focus();
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      close(false);
    };
    // Keep the menu on its trigger when the page or a list scrolls (it is fixed-positioned).
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", place);
    document.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", place);
      document.removeEventListener("scroll", place, true);
    };
    // close only reads refs and setters, so it is stable enough for this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const count = presets.length;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (i + 1) % count);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i - 1 + count) % count);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "Tab") {
      close(false);
    }
  };

  return (
    <>
      <Button
        ref={buttonRef}
        variant="secondary"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        busy={busy}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            openMenu();
          }
        }}
      >
        MODES
      </Button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label="Modes"
            onKeyDown={onMenuKey}
            style={{ position: "fixed", top: coords.top, left: coords.left }}
            className="z-50 flex min-w-48 flex-col gap-space-xs rounded-lg border border-primary-container/20 bg-surface-container-high p-space-xs"
          >
            {presets.map((preset, index) => (
              <button
                key={preset.id}
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                type="button"
                role="menuitem"
                tabIndex={index === active ? 0 : -1}
                onClick={() => {
                  close(true);
                  onApply(preset);
                }}
                className="flex min-h-11 items-center rounded px-space-sm font-mono text-label-caps uppercase text-on-surface hover:bg-surface-container-highest focus-visible:outline-2 focus-visible:outline-primary-container"
              >
                {`${preset.name} ${preset.percent}%`}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
