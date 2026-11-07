import type { Page } from "@/types/page";
import { ROUTE_PATHS } from "@pages/routePaths";
import { Route } from "react-router-dom";

export default class PathUtils {
  public static getRoutePath(name: string) {
    return ROUTE_PATHS[name] ?? "#";
  }

  // Feature 122: concrete URL of one device's detail page. The id is encoded, RR7 decodes it for useParams.
  public static deviceDetailPath(entityId: string) {
    return `/devices/${encodeURIComponent(entityId)}`;
  }

  public static generateRoutes(routes: Array<Page>) {
    return routes.map((r) => (
      <Route key={r.path} path={r.path} element={r.component} />
    ));
  }
}
