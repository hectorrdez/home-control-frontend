import StringUtils from "@utils/StringUtils";
import type { ComponentProps } from "react";

type SwitchProps = Omit<ComponentProps<"button">, "onChange" | "value"> & {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
};

export default function Switch({
  checked,
  onCheckedChange,
  className,
  disabled = false,
  ...args
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={StringUtils.JoinClassName(
        "relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-container disabled:cursor-not-allowed disabled:opacity-50",
        checked
          ? "border-primary-container bg-primary-container/20"
          : "border-outline-variant bg-surface-container-highest",
        className,
      )}
      {...args}
    >
      <span
        aria-hidden="true"
        className={StringUtils.JoinClassName(
          "absolute left-1 top-1 h-5 w-5 rounded-full transition-transform duration-200",
          checked ? "translate-x-5 bg-primary-container" : "bg-on-surface-variant",
        )}
      />
    </button>
  );
}
