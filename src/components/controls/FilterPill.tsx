import StringUtils from "@utils/StringUtils";
import type { ComponentProps, ReactNode } from "react";

type FilterPillProps = Omit<ComponentProps<"button">, "type"> & {
  selected: boolean;
  icon?: ReactNode;
  count?: number;
};

export default function FilterPill({
  selected,
  icon,
  count,
  children,
  className,
  ...args
}: FilterPillProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={StringUtils.JoinClassName(
        "inline-flex min-h-11 cursor-pointer items-center gap-space-xs rounded-lg border px-space-md font-sans text-body-md transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-container",
        selected
          ? "border-primary-container bg-primary-container text-on-primary-container shadow-glow-primary"
          : "border-outline-variant/40 bg-surface-container-low text-on-surface-variant hover:text-on-surface",
        className,
      )}
      {...args}
    >
      {icon}
      <span>{children}</span>
      {count !== undefined && <span className="font-mono text-label-caps">{count}</span>}
    </button>
  );
}
