import StringUtils from "@utils/StringUtils";

// Feature 117: in-control loader for a pending action. Decorative: the control carries aria-busy and the
// live status text. Under prefers-reduced-motion it stays as a static ring (no spin), so the state is still visible.
type SpinnerProps = {
  size?: "sm" | "md";
  className?: string;
};

const sizes = {
  sm: "h-3 w-3 border",
  md: "h-4 w-4 border-2",
};

export default function Spinner({ size = "md", className }: SpinnerProps) {
  return (
    <span
      aria-hidden="true"
      data-testid="spinner"
      className={StringUtils.JoinClassName(
        "inline-block shrink-0 animate-spin rounded-full border-current border-t-transparent motion-reduce:animate-none",
        sizes[size],
        className,
      )}
    />
  );
}
