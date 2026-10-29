import { Suspense } from "react";
import { ResearchCompare } from "@/components/research/research-compare";
export default function ComparePage() {
  return (
    <Suspense
      fallback={<div className="page-shell py-12">Loading comparison…</div>}
    >
      <ResearchCompare />
    </Suspense>
  );
}
