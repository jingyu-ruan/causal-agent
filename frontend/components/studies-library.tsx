"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  ArrowRight,
  CalendarDays,
  CircleDashed,
  FilePlus2,
  FlaskConical,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react"

import { useBackendReadiness } from "@/components/backend-readiness"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { getRctDemo, getStudyId, listStudies, type StudyRecord } from "@/lib/studies-api"

export function StudiesLibrary() {
  const readiness = useBackendReadiness()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [studies, setStudies] = useState<StudyRecord[]>([])
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [demoLoading, setDemoLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (readiness.state !== "ready") return
    setLoading(true)
    setError(null)
    try {
      setStudies(await listStudies())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load studies")
    } finally {
      setLoading(false)
    }
  }, [readiness.state])

  const openDemo = useCallback(async () => {
    if (readiness.state !== "ready") return
    setDemoLoading(true)
    setError(null)
    try {
      const demo = await getRctDemo()
      const id = getStudyId(demo)
      if (!id) throw new Error("The demo did not return a study identifier.")
      router.push(`/studies/${id}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not open the demo")
    } finally {
      setDemoLoading(false)
    }
  }, [readiness.state, router])

  useEffect(() => {
    if (readiness.state !== "ready") return
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [readiness.state, load])

  useEffect(() => {
    if (searchParams.get("demo") !== "rct" || readiness.state !== "ready") return
    const timer = window.setTimeout(() => void openDemo(), 0)
    return () => window.clearTimeout(timer)
  }, [searchParams, readiness.state, openDemo])

  const visibleStudies = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return studies
    return studies.filter((study) => {
      const contract = (study.contract ?? study.causal_contract ?? {}) as Record<string, unknown>
      const design = (study.design ?? study.design_spec ?? {}) as Record<string, unknown>
      return [study.name, study.status, contract.title, contract.business_question, design.design_type]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery))
    })
  }, [query, studies])

  return (
    <div className="page-shell py-10 lg:py-16">
      <div className="grid gap-8 border-b border-slate-950/10 pb-10 lg:grid-cols-[1fr_auto] lg:items-end dark:border-white/10">
        <div>
          <p className="eyebrow">Evidence workspace / Library</p>
          <h1 className="mt-4 text-4xl font-extrabold text-slate-950 sm:text-6xl dark:text-slate-100">Studies</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">Every record keeps the contract, frozen design, dataset version, diagnostics, and decision memo in one inspectable chain.</p>
        </div>
        <Button asChild size="lg" className="h-12 rounded-xl bg-slate-900 px-6 text-white hover:bg-slate-800 dark:bg-slate-200 dark:text-slate-950 dark:hover:bg-white">
          <Link href="/studies/new"><FilePlus2 /> New study</Link>
        </Button>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Link href="/studies/new?template=onboarding" className="interactive-card group flex min-h-[190px] flex-col justify-between rounded-[1.45rem] border border-slate-950 bg-slate-950 p-6 text-[#f6f4eb] sm:p-7">
          <div className="flex items-start justify-between"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-300 text-slate-950"><FlaskConical className="h-5 w-5" /></span><span className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-200/60">Prospective</span></div>
          <div className="mt-8 flex items-end justify-between gap-4"><div><p className="text-xl font-extrabold">Plan onboarding A/B</p><p className="mt-2 max-w-xl text-xs leading-5 text-white/50">Start with a complete product experiment contract.</p></div><ArrowRight className="h-5 w-5 text-slate-300 transition-transform group-hover:translate-x-1" /></div>
        </Link>
        <button type="button" onClick={() => void openDemo()} disabled={demoLoading || readiness.state !== "ready"} className="interactive-card group flex min-h-[190px] flex-col justify-between rounded-[1.45rem] border border-slate-950/12 bg-white/60 p-6 text-left disabled:opacity-60 sm:p-7 dark:border-white/10 dark:bg-white/[0.04]">
          <div className="flex items-start justify-between"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-200 text-slate-950"><ShieldCheck className="h-5 w-5" /></span><span className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-700/50 dark:text-slate-300/60">Verified record</span></div>
          <div className="mt-8 flex items-end justify-between gap-4"><div><p className="text-xl font-extrabold">{demoLoading ? "Opening demo…" : "Inspect a complete RCT"}</p><p className="mt-2 max-w-xl text-xs leading-5 text-muted-foreground">See the whole evidence chain without uploading data.</p></div>{demoLoading ? <LoaderCircle className="h-5 w-5 animate-spin text-slate-700" /> : <ArrowRight className="h-5 w-5 text-slate-700 transition-transform group-hover:translate-x-1 dark:text-slate-300" />}</div>
        </button>
      </div>

      <section className="mt-14" aria-labelledby="recent-studies-heading">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="eyebrow">Versioned records</p>
            <h2 id="recent-studies-heading" className="mt-2 text-2xl font-extrabold text-slate-950 dark:text-slate-100">Recent studies <span className="metric-number ml-2 text-base font-medium text-slate-950/30 dark:text-white/30">{studies.length.toString().padStart(2, "0")}</span></h2>
          </div>
          <div className="flex gap-2">
            <label className="relative block min-w-0 flex-1 md:w-72">
              <span className="sr-only">Search studies</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search records…" className="rounded-full bg-white/55 pl-10 dark:bg-white/[0.04]" />
            </label>
            <Button type="button" variant="outline" size="icon" onClick={() => void load()} disabled={loading || readiness.state !== "ready"} aria-label="Refresh studies" title="Refresh studies" className="h-11 w-11 rounded-full bg-white/55 dark:bg-white/[0.04]"><RefreshCw className={loading ? "animate-spin" : ""} /></Button>
          </div>
        </div>

        {error && <div role="alert" className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-100">{error}</div>}
        {readiness.state !== "ready" ? (
          <Empty icon={LoaderCircle} title="Analysis engine is warming" description="Study history will load automatically. You can start filling a new design now." spinning />
        ) : loading ? (
          <Empty icon={LoaderCircle} title="Loading studies" description="Retrieving versioned study records…" spinning />
        ) : studies.length === 0 ? (
          <Empty icon={CircleDashed} title="No saved studies yet" description="Create a prospective design or open the verified demo." />
        ) : visibleStudies.length === 0 ? (
          <Empty icon={Search} title="No matching studies" description={`Nothing in this workspace matches “${query}”.`} />
        ) : (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {visibleStudies.map((study, index) => {
              const id = getStudyId(study)
              const contract = (study.contract ?? study.causal_contract ?? {}) as Record<string, unknown>
              const design = (study.design ?? study.design_spec ?? {}) as Record<string, unknown>
              const title = String(study.name ?? contract.title ?? contract.business_question ?? "Untitled study")
              return (
                <Link key={id || index} href={`/studies/${id}`} className="group">
                  <Card className="interactive-card h-full overflow-hidden border-slate-950/10 bg-white/62 py-0 dark:border-white/10 dark:bg-white/[0.035]">
                    <CardHeader className="px-5 pb-5 pt-5 sm:px-6 sm:pt-6">
                      <div className="flex items-start justify-between gap-5">
                        <div className="min-w-0">
                          <div className="flex flex-wrap gap-2 font-mono text-[9px] font-semibold uppercase tracking-[0.13em]">
                            <span className="rounded-full bg-slate-950/[0.06] px-2.5 py-1 text-slate-700 dark:bg-white/[0.07] dark:text-slate-300">{String(design.design_type ?? "study").replaceAll("_", " ")}</span>
                            {study.status && <span className="rounded-full bg-slate-200/60 px-2.5 py-1 text-slate-950 dark:bg-slate-300/15 dark:text-slate-200">{study.status}</span>}
                          </div>
                          <CardTitle className="mt-5 line-clamp-1 text-lg font-extrabold">{title}</CardTitle>
                          <CardDescription className="mt-2 line-clamp-2 leading-6">{String(contract.business_question ?? "Causal evidence review")}</CardDescription>
                        </div>
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-950/10 text-slate-700 transition group-hover:translate-x-1 group-hover:bg-slate-300 group-hover:text-slate-950 dark:border-white/10 dark:text-slate-300"><ArrowRight className="h-4 w-4" /></span>
                      </div>
                    </CardHeader>
                    <CardContent className="flex items-center justify-between border-t border-slate-950/[0.07] px-5 py-3.5 text-[11px] text-muted-foreground sm:px-6 dark:border-white/[0.07]">
                      <span className="font-mono">{id ? id.slice(0, 10) : `record-${index + 1}`}</span>
                      {study.created_at && <span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{new Date(study.created_at).toLocaleDateString()}</span>}
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function Empty({ icon: Icon, title, description, spinning = false }: { icon: typeof LoaderCircle; title: string; description: string; spinning?: boolean }) {
  return <div className="mt-5 rounded-[1.35rem] border border-dashed border-slate-950/15 bg-white/45 px-6 py-16 text-center dark:border-white/10 dark:bg-white/[0.025]"><Icon className={`mx-auto h-6 w-6 text-slate-700/45 dark:text-slate-300/45 ${spinning ? "animate-spin" : ""}`} /><p className="mt-4 text-sm font-bold">{title}</p><p className="mt-1 text-xs text-muted-foreground">{description}</p></div>
}
