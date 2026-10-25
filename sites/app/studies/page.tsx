import { Suspense } from "react"

import { StudiesLibrary } from "@/components/studies-library"

export default function StudiesPage() {
  return <Suspense fallback={<div className="grid min-h-[60vh] place-items-center text-sm text-muted-foreground">Loading studies…</div>}><StudiesLibrary /></Suspense>
}
