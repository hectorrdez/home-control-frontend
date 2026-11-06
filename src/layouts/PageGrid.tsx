import StringUtils from "@utils/StringUtils";
import type { ComponentProps } from "react";

export default function PageGrid({ className, ...args }: ComponentProps<"div">) {
  return (
    <div
      className={StringUtils.JoinClassName(
        "grid w-full grid-cols-12 gap-gutter px-gutter py-space-md md:gap-gutter-tablet md:px-gutter-tablet xl:gap-gutter-desktop xl:px-gutter-desktop",
        className,
      )}
      {...args}
    />
  );
}
