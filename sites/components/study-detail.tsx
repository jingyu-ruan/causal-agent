"use client"

import { useEffect, useState } from "react"
import Link from "@/components/page-link"
import { ArrowLeft, CheckCircle2, CircleDot, LoaderCircle } from "lucide-react"

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
  if (error || !study) return <div className="mx-auto max-w-xl px-6 py-24 text-center"><p className="text-lg font-semibold">Study unavailable</p><p className="mt-2 text-sm text-muted-foreground">{error ?? "No record was returned."}</p><Button asChild variant="outline" className="mt-6 rounded-full"><Link href="/studies"><ArrowLeft /> Back to studies</Link></Button></div>

  const evidence = normalizeEvidence(study)
  return (
    <div className="page-shell py-8 lg:py-10">
      <div className="mx-auto max-w-[1080px]">
        <header className="border-b border-border pb-8">
          <Link href="/studies" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />All studies</Link>
          <div className="mt-7 flex flex-wrap items-center gap-2">
            <p className="tabular-nums text-[11px] normal-case tracking-normal text-muted-foreground">Evidence report</p>
            <span className="tabular-nums text-[11px] text-muted-foreground/60">{studyId.slice(0, 12)}</span>
            <span className="h-1 w-1 rounded-full bg-slate-400" aria-hidden />
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold normal-case tracking-normal text-slate-700 dark:bg-slate-900 dark:text-slate-300">
              {String(evidence.decision.status ?? "pending").toLowerCase().includes("go") ? <CheckCircle2 className="h-3 w-3 text-emerald-600" /> : <CircleDot className="h-3 w-3" />}
              {String(evidence.decision.status ?? "pending").replaceAll("_", " ")}
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{String(evidence.contract.title ?? study.name ?? "Causal evidence report").replace(/^Capstone(?: reference)?\s*\/\s*/i, "")}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{String(evidence.contract.business_question ?? "Versioned contract, diagnostics, estimate, and decision.")}</p>
          <div className="report-actions mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-primary">
            <a className="underline decoration-border underline-offset-4 hover:decoration-foreground" href={`${API_BASE_URL}/api/studies/${encodeURIComponent(studyId)}/artifact`} download>Download design JSON</a>
            {Object.keys(evidence.decision).length > 0 && <a className="underline decoration-border underline-offset-4 hover:decoration-foreground" href={`${API_BASE_URL}/api/studies/${encodeURIComponent(studyId)}/memo`} download>Download decision memo</a>}
            <Link className="underline decoration-border underline-offset-4 hover:decoration-foreground" href="/studies/new">Start a new study</Link>
          </div>
        </header>
        <div className="study-panel mt-7 p-5 sm:p-7">
          <StudyReport evidence={evidence} />
        </div>
      </div>
    </div>
  )
}
