import StringUtils from "@utils/StringUtils";
import type { ComponentProps } from "react";
import Spinner from "./Spinner";

type ButtonProps = ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "destructive";
  busy?: boolean; // 117: an action is in flight; a loader shows before the label
};

const variants = {
  primary: "bg-primary-container text-on-primary-container hover:bg-primary-fixed-dim",
  secondary:
    "border border-outline-variant bg-surface-container-high text-on-surface hover:bg-surface-container-highest",
  destructive: "border border-error bg-error-container text-on-error-container hover:opacity-90",
};

export default function Button({
  variant = "primary",
  children,
  className,
  type = "button",
  busy = false,
  ...args
}: ButtonProps) {
  const newClassName = StringUtils.JoinClassName(
    "inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-space-xs rounded px-space-md py-space-xs font-sans text-body-md font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-container disabled:cursor-not-allowed disabled:opacity-50",
    variants[variant],
    className,
  );

  return (
    <button type={type} className={newClassName} aria-busy={busy || undefined} {...args}>
      {busy && <Spinner size="sm" />}
      {children}
    </button>
  );
}
