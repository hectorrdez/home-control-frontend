import { describe, expect, it } from "vitest";
import { isValidElement, type ReactElement } from "react";
import PathUtils from "./PathUtils";
import { ROUTE_PATHS } from "@pages/routePaths";

describe("PathUtils.getRoutePath", () => {
  it("returns the registered path for a known route name", () => {
    const [name] = Object.keys(ROUTE_PATHS);
    expect(PathUtils.getRoutePath(name)).toBe(ROUTE_PATHS[name]);
  });

  it("falls back to '#' for an unknown route name", () => {
    expect(PathUtils.getRoutePath("does-not-exist")).toBe("#");
  });
});

describe("PathUtils.generateRoutes", () => {
  it("maps each page to a Route element with its path and component", () => {
    const home = { path: "/", name: "home", component: "HOME" };
    const telemetry = { path: "/telemetry", name: "telemetry", component: "TEL" };
    const routes = PathUtils.generateRoutes([home, telemetry]);

    expect(routes).toHaveLength(2);
    routes.forEach((route, i) => {
      expect(isValidElement(route)).toBe(true);
      const el = route as ReactElement<{ path: string; element: unknown }>;
      expect(el.props.path).toBe([home, telemetry][i].path);
      expect(el.props.element).toBe([home, telemetry][i].component);
    });
  });

  it("returns no routes for an empty page list", () => {
    expect(PathUtils.generateRoutes([])).toEqual([]);
  });
});
