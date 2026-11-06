import PathUtils from "@utils/PathUtils";
import StringUtils from "@utils/StringUtils";
import { Activity, Box, type LucideIcon } from "lucide-react";
import { NavLink } from "react-router-dom";

type NavItem = { label: string; name: string; icon: LucideIcon };

const items: Array<NavItem> = [
  { label: "Home 3D", name: "home", icon: Box },
  { label: "Telemetry", name: "telemetry", icon: Activity },
];

export function TopNav() {
  return (
    <nav
      aria-label="Main"
      className="hidden items-center rounded-xl border border-outline-variant/40 bg-surface-container-low p-space-xs md:flex"
    >
      {items.map((item) => (
        <NavLink
          key={item.name}
          to={PathUtils.getRoutePath(item.name)}
          end
          className={({ isActive }) =>
            StringUtils.JoinClassName(
              "flex min-h-9 items-center rounded-lg px-space-md py-space-xs font-sans text-body-md transition-colors",
              isActive
                ? "bg-primary-container font-medium text-on-primary-container shadow-glow-primary"
                : "text-on-surface-variant hover:text-on-surface",
            )
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function BottomRail() {
  return (
    <nav
      aria-label="Bottom navigation"
      className="fixed inset-x-0 bottom-0 z-50 flex border-t border-outline-variant/30 bg-surface-container-lowest/90 backdrop-blur-xl md:hidden"
    >
      {items.map((item) => (
        <NavLink
          key={item.name}
          to={PathUtils.getRoutePath(item.name)}
          end
          className={({ isActive }) =>
            StringUtils.JoinClassName(
              "flex min-h-11 flex-1 flex-col items-center justify-center gap-space-xs py-space-xs font-mono text-label-caps uppercase",
              isActive ? "text-primary-container" : "text-on-surface-variant",
            )
          }
        >
          <item.icon size={20} aria-hidden="true" />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
