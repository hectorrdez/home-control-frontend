import { Outlet, useLocation } from "react-router-dom";
import { ROUTE_PATHS } from "@/pages/routePaths";
import StringUtils from "@utils/StringUtils";
import Footer from "./Footer";
import Header from "./Header";
import { BottomRail } from "./Navigation";

export default function Page() {
  // `/` (Home 3D) fits the viewport: only its device list scrolls (feature 119). Other routes keep page scroll.
  const { pathname } = useLocation();
  const fitViewport = pathname === ROUTE_PATHS.home;
  return (
    <>
      <Header />
      <div
        className={StringUtils.JoinClassName(
          "flex flex-col pt-16 pb-20 md:pb-0",
          fitViewport ? "h-dvh overflow-hidden" : "min-h-screen",
        )}
      >
        <main className={StringUtils.JoinClassName("flex flex-1 flex-col", fitViewport ? "min-h-0" : undefined)}>
          <Outlet />
        </main>
        <Footer />
      </div>
      <BottomRail />
    </>
  );
}
