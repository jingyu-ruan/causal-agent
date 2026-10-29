"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "@/components/page-link"
import { useSearchParams } from "next/navigation"
import { AlertCircle, ArrowRight, ArrowUpRight, CheckCircle2, FilePlus2, FlaskConical, FolderOpen, LoaderCircle, RefreshCw, Search } from "lucide-react"

import { useBackendReadiness } from "@/components/backend-readiness"
import { Button } from "@/components/ui/button"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { DEMO_SCENARIOS, getDemoScenario, type DemoScenarioId } from "@/lib/demo-scenarios"
import { getDidDemo, getRctDemo, getStudyId, listStudies, type RctDemoScenario, type StudyRecord } from "@/lib/studies-api"

export function StudiesLibrary() {
  const readiness = useBackendReadiness()
  const searchParams = useSearchParams()
  const [studies, setStudies] = useState<StudyRecord[]>([])
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<"all" | "complete" | "designed">("all")
  const [loading, setLoading] = useState(true)
  const [demoLoading, setDemoLoading] = useState<DemoScenarioId | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (readiness.state !== "ready") return
    setLoading(true)
    setError(null)
    try { setStudies(await listStudies()) }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load studies") }
    finally { setLoading(false) }
  }, [readiness.state])

  const openDemo = useCallback(async (id: DemoScenarioId) => {
    if (readiness.state !== "ready") return
    setDemoLoading(id)
    setError(null)
    try {
      const study = id === "did" ? await getDidDemo() : await getRctDemo(id as RctDemoScenario)
      const studyId = getStudyId(study)
      if (!studyId) throw new Error("The demo did not return a study identifier.")
      window.location.assign("/studies/" + encodeURIComponent(studyId))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not open the demonstration")
    } finally { setDemoLoading(null) }
  }, [readiness.state])

  useEffect(() => {
    if (readiness.state !== "ready") return
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [readiness.state, load])

  useEffect(() => {
    const requested = searchParams.get("demo") === "did" ? "did" : searchParams.get("demo") === "rct" ? getDemoScenario(searchParams.get("case")).id : null
    if (!requested || readiness.state !== "ready") return
    const timer = window.setTimeout(() => void openDemo(requested), 0)
    return () => window.clearTimeout(timer)
  }, [searchParams, readiness.state, openDemo])

  const visibleStudies = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return studies.filter((study) => {
      const contract = (study.contract ?? study.causal_contract ?? {}) as Record<string, unknown>
      const design = (study.design ?? study.design_spec ?? {}) as Record<string, unknown>
      const designed = !study.status || study.status === "designed"
      const matchesFilter = filter === "all" || (filter === "designed" ? designed : !designed)
      return matchesFilter && (!normalizedQuery || [study.name, study.status, contract.title, contract.business_question, design.design_type].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalizedQuery)))
    })
  }, [query, studies, filter])

  return <div className="page-shell pb-12">
    <header className="page-heading">
      <p className="eyebrow">Research workspace / Evidence records</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-4"><h1 className="!mt-0">Study library</h1><div className="flex flex-wrap gap-2"><Button asChild variant="outline" className="h-9 rounded-lg bg-card shadow-none"><Link href="/studies/replay"><FlaskConical className="h-3.5 w-3.5" />Live demonstration</Link></Button><Button asChild className="h-9 rounded-lg shadow-none"><Link href="/studies/new"><FilePlus2 className="h-3.5 w-3.5" />New study</Link></Button></div></div>
      <p className="page-description max-w-2xl">Your frozen designs and analysis results. Each study connects its question, data, diagnostics, and decision in one evidence record.</p>
    </header>

    {error && <div role="alert" className="mb-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-[14px] text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}

    <section className="study-panel" aria-label="Saved studies">
      <div className="panel-heading">
        <SegmentedControl<"all" | "complete" | "designed"> label="Filter studies" value={filter} onValueChange={setFilter} options={[
          { value: "all", label: "All studies" },
          { value: "complete", label: "Analyzed" },
          { value: "designed", label: "Designs" },
        ]} />
        <div className="flex items-center gap-2"><label className="relative"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search studies" aria-label="Search studies" className="h-9 w-40 rounded-lg border border-border bg-background pl-9 pr-3 text-[14px] sm:w-48" /></label><Button type="button" variant="ghost" size="icon-sm" onClick={() => void load()} disabled={loading || readiness.state !== "ready"} aria-label="Refresh studies"><RefreshCw className="h-3.5 w-3.5" /></Button></div>
      </div>
      {readiness.state !== "ready" ? <div className="grid min-h-48 place-items-center p-8 text-center text-[14px] text-muted-foreground"><div><LoaderCircle className="mx-auto mb-3 h-5 w-5 animate-spin" />{readiness.state === "unavailable" ? "The analysis engine is unavailable." : "Connecting to the analysis engine…"}{readiness.state === "unavailable" && <button type="button" className="mt-3 block w-full text-primary" onClick={readiness.retry}>Retry connection</button>}</div></div> : loading ? <div className="flex min-h-48 items-center justify-center gap-2 text-[14px] text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" />Loading studies…</div> : visibleStudies.length === 0 ? <div className="px-6 py-14 text-center"><FolderOpen className="mx-auto h-7 w-7 text-muted-foreground/60" /><h2 className="mt-4 text-[15px] font-medium">{query || filter !== "all" ? "No matching studies" : "Your research starts here."}</h2><p className="mt-2 text-[14px] text-muted-foreground">{query || filter !== "all" ? "Adjust the search or filter to see more records." : "Run a demonstration or create a study to begin collecting evidence."}</p>{!query && filter === "all" && <Link href="/studies/replay" className="mt-5 inline-flex items-center gap-1.5 text-[14px] text-primary">Start the live demonstration<ArrowRight className="h-3.5 w-3.5" /></Link>}</div> : <div className="data-table-scroll"><table className="data-table"><thead><tr><th scope="col">Study</th><th scope="col">Method</th><th scope="col">Status</th><th scope="col">Updated</th><th scope="col"><span className="sr-only">Open report</span></th></tr></thead><tbody>{visibleStudies.map((study) => {
        const contract = (study.contract ?? study.causal_contract ?? {}) as Record<string, unknown>
        const design = (study.design ?? study.design_spec ?? {}) as Record<string, unknown>
        const id = getStudyId(study)
        const title = String(contract.title ?? study.name ?? "Untitled study").replace(/^Capstone(?: reference)?\s*\/\s*/i, "")
        const status = String(study.status ?? "designed")
        const did = String(design.design_type ?? study.design_type).includes("difference")
        const updated = study.updated_at ?? study.created_at
        return <tr key={id} className="hover:bg-muted/40"><td className="!py-4"><Link href={"/studies/" + id} className="block max-w-[380px] truncate text-[14px] font-medium text-foreground hover:text-primary">{title}</Link><p className="mt-1 max-w-[380px] truncate text-[14px] text-muted-foreground">{String(contract.business_question ?? "Frozen study design")}</p></td><td>{did ? "Difference-in-differences" : "Randomized A/B"}</td><td><span className={status === "go" ? "status-badge status-go" : status === "hold" ? "status-badge status-hold" : "status-badge"}>{status === "go" && <CheckCircle2 className="h-3 w-3" />}{status.replaceAll("_", " ")}</span></td><td className="text-muted-foreground">{updated ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(updated)) : "—"}</td><td><Link href={"/studies/" + id} aria-label={"Open " + title} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-primary"><ArrowUpRight className="h-4 w-4" /></Link></td></tr>
      })}</tbody></table><p className="border-t border-border px-4 py-3 text-[14px] text-muted-foreground">{visibleStudies.length} of {studies.length} studies</p></div>}
    </section>

    <section className="mt-9" aria-labelledby="reference-studies-title">
      <div className="section-heading"><div><p className="section-kicker">Reference studies</p><h2 id="reference-studies-title">Inspect how decisions change.</h2></div><span className="text-[14px] text-muted-foreground">Verified synthetic examples</span></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{DEMO_SCENARIOS.map((scenario) => <button key={scenario.id} type="button" onClick={() => void openDemo(scenario.id)} disabled={demoLoading !== null || readiness.state !== "ready"} className="rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 disabled:opacity-50"><div className="flex items-center justify-between gap-2"><span className={"status-badge " + (scenario.tone === "go" ? "status-go" : scenario.tone === "hold" ? "status-hold" : "")}>{scenario.status}</span>{demoLoading === scenario.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />}</div><h3 className="mt-4 text-[14px] font-medium">{scenario.label}</h3><p className="mt-2 text-[14px] leading-5 text-muted-foreground">{scenario.description}</p></button>)}</div>
    </section>
  </div>
}
