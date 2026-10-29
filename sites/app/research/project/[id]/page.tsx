import { Suspense } from "react";
import { ResearchEvidence } from "@/components/research/research-evidence";
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<div className="page-shell py-12">Loading study…</div>}>
      <ResearchEvidence projectId={id} />
    </Suspense>
  );
}
