import { Suspense } from "react";
import { SimulationLab } from "@/components/research/simulation-lab";
export default function GraphPage() {
  return (
    <Suspense
      fallback={<div className="page-shell py-12">Loading graph studio…</div>}
    >
      <SimulationLab graphOnly />
    </Suspense>
  );
}
