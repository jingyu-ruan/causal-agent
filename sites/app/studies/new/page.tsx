"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"

import { StudyWorkbench } from "@/components/study-workbench"

export default function NewStudyPage() {
  return (
    <Suspense fallback={<div className="grid min-h-[60vh] place-items-center text-sm text-muted-foreground">Preparing study workspace…</div>}>
      <WorkbenchRoute />
    </Suspense>
  )
}

function WorkbenchRoute() {
  const params = useSearchParams()
  return <StudyWorkbench key={`${params.get("template") ?? ""}:${params.get("mode") ?? ""}`} />
}
