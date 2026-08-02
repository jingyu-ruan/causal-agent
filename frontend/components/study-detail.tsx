"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, FileJson2, FilePlus2, FileText, LoaderCircle } from "lucide-react"

import { useBackendReadiness } from "@/components/backend-readiness"
import { ContractEvidence, DataContractEvidence, DecisionEvidence, DiagnosticsEvidence, normalizeEvidence, TraceEvidence } from "@/components/study-evidence"
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
    <div className="page-shell py-10 lg:py-14">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="space-y-6 border-b border-slate-950/10 pb-8 dark:border-white/10"><div><Link href="/studies" className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground hover:text-slate-700 dark:hover:text-slate-300"><ArrowLeft className="h-3.5 w-3.5" /> All studies</Link><div className="mt-5 flex items-center gap-3"><span className="rounded-md bg-slate-200/70 px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-slate-950 dark:bg-slate-300/15 dark:text-slate-200">Evidence record</span><code className="text-[10px] text-muted-foreground">{studyId.slice(0, 12)}</code></div><h1 className="mt-3 text-3xl font-extrabold text-slate-950 sm:text-5xl dark:text-slate-100">{String(evidence.contract.title ?? study.name ?? "Causal evidence record")}</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{String(evidence.contract.business_question ?? "Versioned contract, diagnostics, estimate, and decision memo.")}</p></div><div className="flex flex-wrap gap-2"><Button asChild variant="outline" className="rounded-lg"><a href={`${API_BASE_URL}/api/studies/${encodeURIComponent(studyId)}/artifact`} download><FileJson2 /> Design JSON</a></Button>{Object.keys(evidence.decision).length > 0 && <Button asChild variant="outline" className="rounded-lg"><a href={`${API_BASE_URL}/api/studies/${encodeURIComponent(studyId)}/memo`} download><FileText /> Decision memo</a></Button>}<Button asChild className="rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-200 dark:text-slate-950 dark:hover:bg-white"><Link href="/studies/new"><FilePlus2 /> New study</Link></Button></div></div>
        <ContractEvidence evidence={evidence} />
        <DataContractEvidence evidence={evidence} />
        <DiagnosticsEvidence evidence={evidence} />
        <DecisionEvidence evidence={evidence} />
        <TraceEvidence evidence={evidence} />
      </div>
    </div>
  )
}
