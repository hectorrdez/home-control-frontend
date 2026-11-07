import type { Page } from "@/types/page";
import { ROUTE_PATHS } from "@pages/routePaths";
import { Route } from "react-router-dom";

export default class PathUtils {
  public static getRoutePath(name: string) {
    return ROUTE_PATHS[name] ?? "#";
  }

  // Features 122/123: concrete URL of one device's detail page (device key or standalone entity id).
  // The key is encoded, RR7 decodes it for useParams.
  public static deviceDetailPath(deviceKey: string) {
    return `/devices/${encodeURIComponent(deviceKey)}`;
  }

  public static generateRoutes(routes: Array<Page>) {
    return routes.map((r) => (
      <Route key={r.path} path={r.path} element={r.component} />
    ));
  }
}
