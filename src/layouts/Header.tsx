import { House } from "lucide-react";
import Clock from "./Clock";
import HaStatusLine from "./HaStatusLine";
import { TopNav } from "./Navigation";

export default function Header() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 h-16 border-b border-outline-variant/30 bg-surface-container-lowest/90 backdrop-blur-xl">
      <div className="flex h-full items-center justify-between gap-space-md px-gutter md:px-gutter-tablet xl:px-gutter-desktop">
        <div className="flex min-w-0 items-center gap-space-md">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary-container/40 bg-surface-container shadow-glow-primary">
            <House size={22} className="text-primary-container" aria-hidden="true" />
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="font-sans text-title-md uppercase tracking-tight text-on-surface">
              Home Control
            </span>
            <HaStatusLine />
          </div>
        </div>
        <TopNav />
        <div className="flex items-center gap-space-md">
          <div data-slot="status-strip" className="hidden xl:flex" />
          <Clock />
        </div>
      </div>
    </header>
  );
}
