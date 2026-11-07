import { lazy, Suspense } from "react";
import DevicePanel from "@components/panels/DevicePanel";
import PageGrid from "@layouts/PageGrid";

// three.js is a separate chunk (106): loaded by `/` only.
const HouseStage = lazy(() => import("@/house/HouseStage"));

export default function HomePage() {
  return (
    <PageGrid className="min-h-0 flex-1 grid-rows-[minmax(0,13fr)_minmax(0,7fr)] xl:grid-rows-1">
      <h1 className="sr-only">Home 3D</h1>
      <DevicePanel />
      <Suspense
        fallback={
          <section
            aria-label="House view"
            aria-busy="true"
            className="col-span-12 min-h-0 animate-pulse rounded-xl bg-surface-container-low motion-reduce:animate-none xl:col-span-8"
          />
        }
      >
        <HouseStage />
      </Suspense>
    </PageGrid>
  );
}
