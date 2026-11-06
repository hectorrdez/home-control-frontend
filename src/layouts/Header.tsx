import PathUtils from "@utils/PathUtils";
import { NavLink } from "react-router-dom";

export default function Header() {
  return (
    <header className="flex h-16 items-center gap-6 px-4">
      <span className="font-semibold">HOME CONTROL</span>
      <nav aria-label="Main">
        <ul className="flex gap-4">
          <li>
            <NavLink to={PathUtils.getRoutePath("home")}>Home 3D</NavLink>
          </li>
          <li>
            <NavLink to={PathUtils.getRoutePath("telemetry")}>Telemetry</NavLink>
          </li>
        </ul>
      </nav>
    </header>
  );
}
