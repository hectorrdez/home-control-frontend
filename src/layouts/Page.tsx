import { Outlet } from "react-router-dom";
import Footer from "./Footer";
import Header from "./Header";
import { BottomRail } from "./Navigation";

export default function Page() {
  return (
    <>
      <Header />
      <div className="flex min-h-screen flex-col pt-16 pb-20 md:pb-0">
        <main className="flex flex-1 flex-col">
          <Outlet />
        </main>
        <Footer />
      </div>
      <BottomRail />
    </>
  );
}
