import { Suspense } from "react";
import { SimulationLab } from "@/components/research/simulation-lab";
export default function LabPage() {
  return (
    <Suspense
      fallback={<div className="page-shell py-12">Loading research lab…</div>}
    >
      <SimulationLab />
    </Suspense>
  );
}
