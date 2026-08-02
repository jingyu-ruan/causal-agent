import { Suspense } from "react"

import { StudyWorkbench } from "@/components/study-workbench"

export default function NewStudyPage() {
  return (
    <Suspense fallback={<div className="grid min-h-[60vh] place-items-center text-sm text-muted-foreground">Preparing study workspace…</div>}>
      <StudyWorkbench />
    </Suspense>
  )
}
