"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, LoaderCircle } from "lucide-react"

import { useBackendReadiness } from "@/components/backend-readiness"
import { normalizeEvidence } from "@/components/study-evidence"
import { StudyReport } from "@/components/study-report"
import { Button } from "@/components/ui/button"
import { API_BASE_URL } from "@/lib/config"
import { getStudy, type StudyRecord } from "@/lib/studies-api"

export function StudyDetail({ studyId }: { studyId: string }) {
  const readiness = useBackendReadiness()
  const [study, setStudy] = useState<StudyRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (readiness.state !== "ready") return
    let active = true
    getStudy(studyId).then((value) => { if (active) setStudy(value) }).catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Could not load study") }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [readiness.state, studyId])

  if (readiness.state !== "ready" || loading) return <div className="grid min-h-[65vh] place-items-center text-sm text-muted-foreground"><span className="flex items-center gap-2"><LoaderCircle className="h-4 w-4 animate-spin" />{readiness.state === "ready" ? "Loading evidence record…" : "Waiting for analysis engine…"}</span></div>
  if (error || !study) return <div className="mx-auto max-w-xl px-6 py-24 text-center"><p className="text-lg font-extrabold">Study unavailable</p><p className="mt-2 text-sm text-muted-foreground">{error ?? "No record was returned."}</p><Button asChild variant="outline" className="mt-6 rounded-full"><Link href="/studies"><ArrowLeft /> Back to studies</Link></Button></div>

  const evidence = normalizeEvidence(study)
  return (
    <div className="px-5 py-10 sm:px-8 lg:py-14">
      <div className="mx-auto max-w-4xl">
        <header className="border-b border-border pb-8">
          <Link href="/studies" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />All studies</Link>
          <p className="mt-7 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Evidence report · {studyId.slice(0, 12)}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{String(evidence.contract.title ?? study.name ?? "Causal evidence report")}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{String(evidence.contract.business_question ?? "Versioned contract, diagnostics, estimate, and decision.")}</p>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs">
            <a className="underline decoration-border underline-offset-4 hover:decoration-foreground" href={`${API_BASE_URL}/api/studies/${encodeURIComponent(studyId)}/artifact`} download>Download design JSON</a>
            {Object.keys(evidence.decision).length > 0 && <a className="underline decoration-border underline-offset-4 hover:decoration-foreground" href={`${API_BASE_URL}/api/studies/${encodeURIComponent(studyId)}/memo`} download>Download decision memo</a>}
            <Link className="underline decoration-border underline-offset-4 hover:decoration-foreground" href="/studies/new">Start a new study</Link>
          </div>
        </header>
        <main className="pt-8">
          <StudyReport evidence={evidence} />
        </main>
      </div>
    </div>
  )
}
