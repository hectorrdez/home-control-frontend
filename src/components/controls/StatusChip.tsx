import StringUtils from "@utils/StringUtils";
import type { ComponentProps } from "react";

type StatusChipProps = ComponentProps<"span"> & {
  tone?: "neutral" | "primary" | "secondary" | "tertiary" | "error";
  beacon?: boolean;
};

const tones = {
  neutral: "border-outline-variant/40 bg-surface-container-low text-on-surface-variant",
  primary: "border-primary-container/30 bg-primary-container/10 text-primary-container",
  secondary: "border-secondary/30 bg-secondary/10 text-secondary",
  tertiary: "border-tertiary-fixed-dim/30 bg-tertiary-fixed-dim/10 text-tertiary-fixed-dim",
  error: "border-error/30 bg-error/10 text-error",
};

export default function StatusChip({
  tone = "neutral",
  beacon = false,
  className,
  children,
  ...args
}: StatusChipProps) {
  return (
    <span
      className={StringUtils.JoinClassName(
        "inline-flex h-6 items-center gap-space-xs rounded border px-space-sm font-mono text-label-caps uppercase",
        tones[tone],
        className,
      )}
      {...args}
    >
      {beacon && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
