import DevicePanel from "@components/panels/DevicePanel";
import PageGrid from "@layouts/PageGrid";

export default function HomePage() {
  return (
    <PageGrid>
      <h1 className="sr-only">Home 3D</h1>
      <DevicePanel />
      <section aria-label="House view" className="col-span-12 min-h-64 xl:col-span-8" />
    </PageGrid>
  );
}
