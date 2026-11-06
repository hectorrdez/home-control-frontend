import { describe, expect, it } from "vitest";
import StringUtils from "./StringUtils";

describe("StringUtils.JoinClassName", () => {
  it("joins the truthy class names with single spaces", () => {
    expect(StringUtils.JoinClassName("a", "b", "c")).toBe("a b c");
  });

  it("drops undefined, empty and missing entries", () => {
    expect(StringUtils.JoinClassName("a", undefined, "", "b")).toBe("a b");
    expect(StringUtils.JoinClassName(undefined, undefined)).toBe("");
    expect(StringUtils.JoinClassName()).toBe("");
  });
});
