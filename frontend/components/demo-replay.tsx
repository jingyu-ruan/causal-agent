"use client"

import { useEffect, useRef, useState } from "react"
import Link from "@/components/page-link"
import { AlertCircle, ArrowRight, ArrowUpRight, Check, ChevronDown, Database, Download, FileCheck2, FlaskConical, LoaderCircle, RotateCcw, ShieldCheck } from "lucide-react"

import { useBackendReadiness } from "@/components/backend-readiness"
import { DataPreparationPanel } from "@/components/data-preparation-panel"
import { normalizeEvidence } from "@/components/study-evidence"
import { StudyReport } from "@/components/study-report"
import { Button } from "@/components/ui/button"
import { defaultMapping } from "@/lib/column-mapping"
import { API_BASE_URL } from "@/lib/config"
import { analyzeStudy, createStudyDesign, generateSyntheticDataset, getStudy, getStudyId, profileStudyDataset, type DatasetPreparationProfile, type StudyDesignInput, type StudyRecord } from "@/lib/studies-api"
import { cloneTemplate } from "@/lib/study-templates"
import { cn } from "@/lib/utils"

type Method = "rct" | "did"
type StepStatus = "pending" | "running" | "done" | "review" | "error"
type Preview = { columns: string[]; rows: string[][] }

const STEPS = [
  { title: "Research question", detail: "Specify the question and hypothesis." },
  { title: "Frozen design", detail: "Validate the contract and commit the policy." },
  { title: "Demo dataset", detail: "Generate reproducible data from the design." },
  { title: "Evidence checks", detail: "Review preparation and run deterministic analysis." },
  { title: "Decision report", detail: "Persist the result and its provenance." },
]

function demoInput(method: Method): StudyDesignInput {
  const input = cloneTemplate(method === "did" ? "regional-rollout" : "onboarding")
  input.name = method === "did" ? "Regional rollout study" : "Guided onboarding study"
  input.notes = "Synthetic demonstration generated from a frozen study design."
  if (method === "rct") input.guardrails = [{ name: "support_contact_rate", direction: "increase", tolerance: 0.01 }]
  return input
}

// Generated CSV uses simple scalar fields with no quoted delimiters.
async function previewGeneratedFile(file: File): Promise<Preview> {
  const text = await file.slice(0, 16384).text()
  const lines = text.trim().split(/\r?\n/)
  return { columns: lines[0].split(","), rows: lines.slice(1, 7).map((line) => line.split(",")) }
}

function displayValue(value: string) {
  const numeric = Number(value)
  return value.trim() !== "" && Number.isFinite(numeric) && value.includes(".") ? numeric.toFixed(4) : value
}

export function DemoReplay({ initialMethod = "rct" }: { initialMethod?: Method }) {
  const readiness = useBackendReadiness()
  const [method, setMethod] = useState<Method>(initialMethod)
  const [input, setInput] = useState<StudyDesignInput>(() => demoInput(initialMethod))
  const [statuses, setStatuses] = useState<StepStatus[]>(STEPS.map(() => "pending"))
  const [study, setStudy] = useState<StudyRecord | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [profile, setProfile] = useState<DatasetPreparationProfile | null>(null)
  const [operationIds, setOperationIds] = useState<string[]>([])
  const [dimensions, setDimensions] = useState<string[]>([])
  const [lineageConfirmed, setLineageConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState("")
  const [activeView, setActiveView] = useState<"data" | "report">("data")
  const reportRef = useRef<HTMLDivElement>(null)
  const requestActive = useRef(false)
  const studyId = study ? getStudyId(study) : ""
  const evidence = study ? normalizeEvidence(study) : null
  const locked = busy || Boolean(profile)
  const requiredColumns = [input.randomization_unit, "treatment", ...(method === "did" ? ["time"] : []), input.primary_metric, ...input.guardrails.map((guardrail) => guardrail.name)]
  const isReady = readiness.state === "ready"

  useEffect(() => {
    if (!file) { setDownloadUrl(""); return }
    const url = URL.createObjectURL(file)
    setDownloadUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  useEffect(() => {
    if (complete && activeView === "report") reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [complete, activeView])

  function reset(nextMethod = method) {
    if (requestActive.current) return
    setMethod(nextMethod)
    setInput(demoInput(nextMethod))
    setStatuses(STEPS.map(() => "pending"))
    setStudy(null)
    setFile(null)
    setPreview(null)
    setProfile(null)
    setOperationIds([])
    setDimensions([])
    setLineageConfirmed(false)
    setComplete(false)
    setError(null)
    setActiveView("data")
  }

  function updateStep(index: number, status: StepStatus) {
    setStatuses((current) => current.map((value, item) => item === index ? status : value))
  }

  async function prepare() {
    if (requestActive.current || !isReady || !input.business_question.trim() || !input.hypothesis.trim()) return
    requestActive.current = true
    setBusy(true)
    setError(null)
    setProfile(null)
    setStudy(null)
    setFile(null)
    setPreview(null)
    setLineageConfirmed(false)
    setStatuses(["done", "running", "pending", "pending", "pending"])
    let step = 1
    try {
      const frozen = await createStudyDesign(input)
      const id = getStudyId(frozen)
      if (!id) throw new Error("The design service returned no study identifier.")
      setStudy(frozen)
      updateStep(1, "done")
      step = 2
      updateStep(2, "running")
      const generated = await generateSyntheticDataset(id, { baseline_value: input.baseline_rate, outcome_standard_deviation: input.outcome_standard_deviation })
      setFile(generated)
      setPreview(await previewGeneratedFile(generated))
      updateStep(2, "done")
      step = 3
      updateStep(3, "running")
      const prepared = await profileStudyDataset(id, generated, defaultMapping(input))
      setProfile(prepared)
      setOperationIds(prepared.operations.map((operation) => operation.id))
      setDimensions(prepared.suggested_dimensions)
      updateStep(3, "review")
    } catch (caught) {
      updateStep(step, "error")
      setError(caught instanceof Error ? caught.message : "Data preparation failed. Try loading the demo again.")
    } finally {
      requestActive.current = false
      setBusy(false)
    }
  }

  async function analyze() {
    if (requestActive.current || !study || !file || !profile || !lineageConfirmed || profile.blocking_issues.length) return
    requestActive.current = true
    setBusy(true)
    setError(null)
    updateStep(3, "running")
    let step = 3
    try {
      const operations = profile.operations.filter((operation) => operationIds.includes(operation.id)).map((operation) => ({
        operation: operation.operation,
        columns: operation.operation === "fill_missing_dimensions"
          ? operation.columns.filter((column) => dimensions.includes(column))
          : operation.operation === "trim_string_values"
            ? operation.columns.filter((column) => !profile.suggested_dimensions.includes(column) || dimensions.includes(column))
            : operation.columns,
      })).filter((operation) => operation.operation === "drop_exact_duplicates" || operation.columns.length > 0)
      const result = await analyzeStudy(studyId, file, { ...defaultMapping(input), dimension_cols: dimensions }, {
        transformation_log: [],
        cleaning_plan: { source_sha256: profile.source_sha256, operations },
      })
      updateStep(3, "done")
      step = 4
      updateStep(4, "running")
      // The persisted record includes the frozen contract and immutable run.
      const persisted = await getStudy(studyId).catch(() => ({ ...study, ...result }))
      setStudy(persisted)
      updateStep(4, "done")
      setComplete(true)
      setActiveView("report")
    } catch (caught) {
      updateStep(step, "error")
      setError(caught instanceof Error ? caught.message : "Analysis failed. The prepared dataset is available for retry.")
    } finally {
      requestActive.current = false
      setBusy(false)
    }
  }

  return <div className="page-shell">
    <header className="page-heading">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="eyebrow">Live demonstration</p><span className="rounded-md border border-border bg-card px-2.5 py-1 text-[11px] text-muted-foreground">Synthetic data</span></div>
      <h1>Run the complete study.</h1>
      <p className="page-description max-w-2xl">Start with a sample question and dataset. Review the preparation plan, then follow the analysis all the way to a saved evidence report.</p>
    </header>

    <div className="demo-layout">
      <div className="min-w-0 space-y-5">
        <section className="study-panel" aria-labelledby="demo-setup-title">
          <div className="panel-heading"><h2 id="demo-setup-title" className="flex items-center gap-2"><FlaskConical className="h-4 w-4 text-primary" />Study setup</h2><span className="text-[11px] text-muted-foreground">01 / Define the question</span></div>
          <div className="panel-body">
            <div className="segmented-control mb-5" aria-label="Demonstration method">
              <button type="button" aria-pressed={method === "rct"} disabled={busy} onClick={() => { if (method !== "rct") reset("rct") }}>Randomized A/B</button>
              <button type="button" aria-pressed={method === "did"} disabled={busy} onClick={() => { if (method !== "did") reset("did") }}>Difference-in-differences</button>
            </div>
            <label className="study-label" htmlFor="demo-question">Research question</label>
            <textarea id="demo-question" className="study-input min-h-20 resize-y" rows={2} value={input.business_question} disabled={locked} maxLength={1000} onChange={(event) => setInput((current) => ({ ...current, business_question: event.target.value }))} />
            <label className="study-label mt-4" htmlFor="demo-hypothesis">Working hypothesis</label>
            <textarea id="demo-hypothesis" className="study-input resize-y" rows={2} value={input.hypothesis} disabled={locked} maxLength={2000} onChange={(event) => setInput((current) => ({ ...current, hypothesis: event.target.value }))} />

            <details className="mt-5 rounded-lg border border-border">
              <summary className="flex cursor-pointer list-none items-center justify-between px-3.5 py-3 text-[12px] font-medium">Study assumptions<span className="inline-flex items-center gap-2 text-[11px] font-normal text-muted-foreground">{method === "rct" ? "ATE / Binary outcome" : "ATT / Panel outcome"}<ChevronDown className="h-3.5 w-3.5" /></span></summary>
              <div className="grid gap-4 border-t border-border p-4 sm:grid-cols-2">
                <label><span className="study-label">Primary metric</span><input className="study-input" value={input.primary_metric} readOnly /></label>
                <label><span className="study-label">Analysis unit</span><input className="study-input" value={input.randomization_unit} readOnly /></label>
                <label><span className="study-label">Baseline {method === "rct" ? "(%)" : "(outcome units)"}</span><input className="study-input" type="number" min={method === "rct" ? 1 : undefined} max={method === "rct" ? 90 : undefined} step={method === "rct" ? 1 : 0.1} required disabled={locked} value={method === "rct" ? Math.round((input.baseline_rate ?? 0.2) * 100) : input.baseline_rate ?? 10} onChange={(event) => { const value = event.target.valueAsNumber; if (Number.isFinite(value)) setInput((current) => ({ ...current, baseline_rate: method === "rct" ? Math.max(0.01, Math.min(0.9, value / 100)) : value })) }} /></label>
                <label><span className="study-label">Minimum effect {method === "rct" ? "(percentage points)" : "(outcome units)"}</span><input className="study-input" type="number" min={0.1} max={method === "rct" ? 5 : 20} step={0.1} required disabled={locked} value={method === "rct" ? Number((input.success_threshold * 100).toFixed(2)) : input.success_threshold} onChange={(event) => { const value = event.target.valueAsNumber; if (Number.isFinite(value) && value > 0) setInput((current) => ({ ...current, success_threshold: method === "rct" ? Math.min(0.05, Math.max(0.001, value / 100)) : Math.min(20, value) })) }} /></label>
                <p className="text-[11px] leading-5 text-muted-foreground sm:col-span-2">{method === "rct" ? "Equal allocation. 95% confidence interval. The support-contact guardrail permits at most a 1 percentage point increase." : "Five pre-intervention periods. Region and time fixed effects. Uncertainty clustered by region. The pre-trend gate is evaluated before the decision."} These are assumptions for the simulated study.</p>
              </div>
            </details>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              {!profile ? <Button type="button" onClick={() => void prepare()} disabled={busy || !isReady || !input.business_question.trim() || !input.hypothesis.trim()} className="h-10 rounded-lg shadow-none">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}{busy ? "Preparing the study…" : "Load demo data"}{!busy && <ArrowRight className="h-4 w-4" />}</Button> : <span className="inline-flex items-center gap-2 text-[12px] text-primary"><FileCheck2 className="h-4 w-4" />Design frozen and dataset prepared</span>}
              <button type="button" onClick={() => reset()} disabled={busy} className="inline-flex min-h-9 items-center gap-1.5 text-[12px] text-muted-foreground hover:text-primary disabled:opacity-50"><RotateCcw className="h-3.5 w-3.5" />Reset study</button>
            </div>
            {!isReady && <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground" role="status">{readiness.state === "unavailable" ? <><AlertCircle className="h-3.5 w-3.5" />Analysis engine unavailable.<button type="button" onClick={readiness.retry} className="text-primary underline underline-offset-4">Retry connection</button></> : <><LoaderCircle className="h-3.5 w-3.5 animate-spin" />Connecting to the analysis engine…</>}</div>}
          </div>
        </section>

        {error && <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[12px] leading-6 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"><AlertCircle className="mt-1 h-4 w-4 shrink-0" /><span>{error}</span></div>}

        {!preview && <section className="study-panel" aria-labelledby="expected-data-title"><div className="panel-heading"><h2 id="expected-data-title">The dataset you will explore</h2><span className="text-[11px] text-muted-foreground">Generated from the study contract</span></div><div className="panel-body"><div className="flex flex-wrap gap-2">{requiredColumns.map((column) => <code key={column} className="rounded-md border border-border bg-muted/50 px-2.5 py-1.5 text-[11px] text-muted-foreground">{column}</code>)}</div><p className="mt-4 text-[12px] leading-6 text-muted-foreground">{method === "rct" ? "One row per user, with treatment assignment, seven-day activation, and support-contact outcome." : "One row per region and period, with treatment assignment and a continuous target outcome."} The preview will display the generated rows once you load the data.</p></div></section>}

        {preview && <section className="study-panel" aria-labelledby="data-preview-title"><div className="panel-heading"><div><h2 id="data-preview-title" className="flex items-center gap-2"><Database className="h-4 w-4 text-primary" />Your demo dataset</h2><p className="mt-1 text-[11px] text-muted-foreground">{profile ? profile.row_count.toLocaleString() + " rows / " + profile.column_count + " columns" : "Profiling generated data…"} / Preview of the first {preview.rows.length} rows</p></div>{downloadUrl && <a href={downloadUrl} download={method + "-demo.csv"} className="inline-flex min-h-8 items-center gap-1.5 text-[12px] text-primary"><Download className="h-3.5 w-3.5" />Download CSV</a>}</div><div className="data-table-scroll" tabIndex={0} aria-label="Generated demo data preview"><table className="data-table"><thead><tr>{preview.columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead><tbody>{preview.rows.map((row, index) => <tr key={index}>{row.map((value, column) => <td key={column} className="tabular-nums">{displayValue(value)}</td>)}</tr>)}</tbody></table></div></section>}

        {profile && <div className="segmented-control" aria-label="Demonstration results view"><button type="button" aria-pressed={activeView === "data"} onClick={() => setActiveView("data")}>Data preparation</button><button type="button" aria-pressed={activeView === "report"} disabled={!complete} onClick={() => setActiveView("report")} className="disabled:opacity-40">Evidence report{complete && <Check className="ml-2 inline h-3 w-3 text-primary" />}</button></div>}

        {profile && activeView === "data" && <section className="study-panel"><div className="panel-heading"><h2>Review before analysis</h2><span className="text-[11px] text-muted-foreground">{complete ? "Confirmed plan" : "Your confirmation is required"}</span></div><div className="panel-body">{complete ? <div className="flex items-center justify-between gap-3 text-[12px]"><span className="inline-flex items-center gap-2 text-primary"><ShieldCheck className="h-4 w-4" />The confirmed plan ran on a copy of the synthetic data.</span><Button variant="outline" size="sm" onClick={() => setActiveView("report")}>View report<ArrowRight className="h-3.5 w-3.5" /></Button></div> : <><p className="text-[12px] leading-6 text-muted-foreground">This file was generated from the frozen design. Inspect its quality and proposed operations, then confirm the recorded preparation plan.</p><DataPreparationPanel profile={profile} selectedOperationIds={operationIds} selectedDimensions={dimensions} lineageConfirmed={lineageConfirmed} busy={busy} onToggleOperation={(id, checked) => setOperationIds((current) => checked ? [...new Set([...current, id])] : current.filter((item) => item !== id))} onToggleDimension={(dimension, checked) => setDimensions((current) => checked ? [...new Set([...current, dimension])] : current.filter((item) => item !== dimension))} onLineageConfirmed={setLineageConfirmed} onConfirm={() => void analyze()} /></>}</div></section>}

        {complete && activeView === "report" && evidence && <div ref={reportRef} id="live-report" className="study-panel"><div className="panel-heading"><div><h2 className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" />Evidence report</h2><p className="mt-1 text-[11px] text-muted-foreground">Synthetic study / Result saved in the study library</p></div><Link href={"/studies/" + studyId} className="inline-flex items-center gap-1.5 text-[12px] text-primary">Open full report<ArrowUpRight className="h-3.5 w-3.5" /></Link></div><div className="panel-body"><StudyReport evidence={evidence} /></div></div>}
      </div>

      <aside className="demo-aside" aria-label="Live study progress">
        <section className="study-panel"><div className="panel-heading"><h2>Study progress</h2><span className="text-[11px] text-muted-foreground">{statuses.filter((status) => status === "done").length} / 5</span></div><div className="panel-body"><ol className="demo-step-list" aria-live="polite">{STEPS.map((step, index) => <li key={step.title} className="demo-step" data-status={statuses[index]} aria-current={statuses[index] === "running" || statuses[index] === "review" ? "step" : undefined}><span className="demo-step-indicator">{statuses[index] === "done" ? <Check className="h-3 w-3" /> : statuses[index] === "running" ? <LoaderCircle className="h-3 w-3 animate-spin" /> : statuses[index] === "error" ? <AlertCircle className="h-3 w-3" /> : index + 1}</span><div><h3>{step.title}</h3><p>{statuses[index] === "review" ? "Review the plan and confirm to continue." : step.detail}</p></div></li>)}</ol></div></section>
        <div className="demo-notes mt-5 px-1 text-[11px] leading-6 text-muted-foreground"><p className="font-medium text-foreground">Explore the study</p><p className="mt-2">Load a sample dataset, review its preparation plan, and inspect the resulting evidence.</p><p className="mt-3">The generated data describes a simulated study. Start a conversation to analyze your own dataset.</p><Link href={"/studies/new?template=" + (method === "did" ? "regional-rollout" : "onboarding")} className="mt-4 flex items-center gap-1.5 text-primary">Use this study in conversation<ArrowUpRight className="h-3.5 w-3.5" /></Link>{studyId && <a href={API_BASE_URL + "/api/studies/" + encodeURIComponent(studyId) + "/artifact"} download className="mt-3 flex items-center gap-1.5 text-primary">Download frozen design<Download className="h-3.5 w-3.5" /></a>}</div>
      </aside>
    </div>
  </div>
}
