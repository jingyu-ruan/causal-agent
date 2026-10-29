import { Suspense } from "react";
import { ResearchEvidence } from "@/components/research/research-evidence";
export default async function CasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<div className="page-shell py-12">Loading case…</div>}>
      <ResearchEvidence caseId={id} />
    </Suspense>
  );
}
