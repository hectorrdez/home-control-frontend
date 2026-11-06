import pkg from "../../package.json";

export default function Footer() {
  return (
    <footer className="flex flex-col gap-space-sm border-t border-outline-variant/30 bg-surface-container-lowest px-gutter py-space-md font-mono text-label-caps text-on-surface-variant md:flex-row md:items-center md:justify-between md:px-gutter-tablet xl:px-gutter-desktop">
      <span>HOME CONTROL // HUD</span>
      <span>v{pkg.version}</span>
    </footer>
  );
}
