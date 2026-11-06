import type { Page } from "@/types/page";
import { ROUTE_PATHS } from "@pages/routePaths";
import { Route } from "react-router-dom";

export default class PathUtils {
  public static getRoutePath(name: string) {
    return ROUTE_PATHS[name] ?? "#";
  }

  public static generateRoutes(routes: Array<Page>) {
    return routes.map((r) => (
      <Route key={r.path} path={r.path} element={r.component} />
    ));
  }
}
