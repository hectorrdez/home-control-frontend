import { describe, expect, it } from "vitest";
import { isValidElement, type ReactElement } from "react";
import PathUtils from "./PathUtils";
import { ROUTE_PATHS } from "@pages/routePaths";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, useParams } from "react-router-dom";

// Feature 122: the detail route is a param route; the page reads the decoded id with useParams.
function EntityProbe() {
  const { entityId } = useParams();
  return <p>{`id=${entityId}`}</p>;
}

describe("PathUtils.deviceDetailPath", () => {
  it("builds the detail URL of a device", () => {
    expect(PathUtils.deviceDetailPath("light.office_desk")).toBe("/devices/light.office_desk");
  });

  it("encodes ids with a slash, a space and a hash", () => {
    expect(PathUtils.deviceDetailPath("a/b c#d")).toBe("/devices/a%2Fb%20c%23d");
  });

  it("a generated :entityId route exposes the decoded id via useParams, also after a reload of the URL", () => {
    const routes = PathUtils.generateRoutes([
      { name: "deviceDetail", path: ROUTE_PATHS.deviceDetail, component: <EntityProbe /> },
    ]);
    render(
      <MemoryRouter initialEntries={[PathUtils.deviceDetailPath("a/b c")]}>
        <Routes>{routes}</Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("id=a/b c")).toBeTruthy();
  });
});

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
