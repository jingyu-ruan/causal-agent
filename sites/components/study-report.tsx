"use client"

import { useMemo, useState, type ReactNode } from "react"
import { CheckCircle2, CircleDot, Database, Layers3, ShieldAlert, Sparkles } from "lucide-react"

import type { NormalizedEvidence } from "@/components/study-evidence"

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function finite(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN
  return Number.isFinite(number) ? number : null
}

function formatP(value: unknown): string {
  const number = finite(value)
  if (number === null) return "—"
  if (number < 0.001) return "<0.001"
  return number.toFixed(3)
}

function formatEffect(value: unknown, binary: boolean): string {
  const number = finite(value)
  if (number === null) return "—"
  return binary ? `${(number * 100).toFixed(2)} pp` : number.toLocaleString(undefined, { maximumFractionDigits: 3 })
}

function formatMean(value: unknown, binary: boolean): string {
  const number = finite(value)
  if (number === null) return "—"
  return binary ? `${(number * 100).toFixed(2)}%` : number.toLocaleString(undefined, { maximumFractionDigits: 3 })
}

function formatSignedEffect(value: unknown, binary: boolean): string {
  const number = finite(value)
  if (number === null) return "—"
  const sign = number > 0 ? "+" : ""
  return binary ? `${sign}${(number * 100).toFixed(2)} pp` : `${sign}${number.toLocaleString(undefined, { maximumFractionDigits: 3 })}`
}

function formatInterval(lower: unknown, upper: unknown, binary: boolean): string {
  return `[${formatEffect(lower, binary)}, ${formatEffect(upper, binary)}]`
}

function text(value: unknown, fallback = "—"): string {
  if (value === null || value === undefined || value === "") return fallback
  return String(value)
}

function label(value: unknown): string {
  return text(value).replaceAll("_", " ")
}

export function StudyReport({ evidence }: { evidence: NormalizedEvidence }) {
  const primaryMetric = asRecord(evidence.contract.primary_metric)
  const effect = asRecord(evidence.effect)
  const binary = String(primaryMetric.kind ?? "").toLowerCase() === "binary"
  const rawDecisionStatus = String(evidence.decision.status ?? "insufficient_evidence").toLowerCase()
  const decisionStatus = label(rawDecisionStatus)
  const rationale = asArray(evidence.decision.rationale)
  const transformations = asArray(evidence.dataset.transformations).map(asRecord)
  const dataContract = asRecord(evidence.dataContract)
  const dataFields = asArray(dataContract.fields ?? dataContract.columns ?? evidence.dataContract).map((item) => typeof item === "string" ? { name: item } : asRecord(item))
  const dimensions = evidence.dimensionAnalyses
  const reportOffset = evidence.eventStudy.length > 0 ? 1 : 0
  const guardrailOffset = evidence.guardrailEffects.length > 0 ? 1 : 0
  const drilldownIndex = 2 + reportOffset
  const lineageIndex = 3 + reportOffset
  const diagnosticsIndex = 4 + reportOffset
  const guardrailIndex = 5 + reportOffset
  const contractIndex = 5 + reportOffset + guardrailOffset
  const traceIndex = 6 + reportOffset + guardrailOffset
  const normalizedDesign = String(evidence.design.design_type ?? evidence.contract.design_type ?? "").trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_")
  const isDid = normalizedDesign === "did" || normalizedDesign === "difference_in_differences"
  const passed = evidence.diagnostics.filter((item) => item.status === "pass").length
  const warnings = evidence.diagnostics.filter((item) => item.status === "warn").length
  const blocking = evidence.diagnostics.filter((item) => item.status === "fail").length
  const isGo = ["go", "proceed", "ship"].some((token) => rawDecisionStatus.includes(token))
  const isStopped = ["stop", "rollback", "reject"].some((token) => rawDecisionStatus.includes(token))
  const isHold = rawDecisionStatus.includes("hold")
  const tone = isGo
    ? {
        hero: "border-border bg-card text-foreground",
        muted: "text-muted-foreground",
        badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
        panel: "border-border bg-muted/55",
      }
    : isStopped
      ? {
          hero: "border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-900/70 dark:bg-rose-950/25 dark:text-rose-100",
          muted: "text-rose-950/65 dark:text-rose-100/65",
          badge: "bg-rose-200 text-rose-950 dark:bg-rose-900/70 dark:text-rose-100",
          panel: "border-rose-200/80 bg-white/50 dark:border-rose-900/60 dark:bg-black/10",
        }
      : isHold
        ? {
            hero: "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/25 dark:text-amber-100",
            muted: "text-amber-950/65 dark:text-amber-100/65",
            badge: "bg-amber-200 text-amber-950 dark:bg-amber-900/70 dark:text-amber-100",
            panel: "border-amber-200/80 bg-white/50 dark:border-amber-900/60 dark:bg-black/10",
          }
        : {
            hero: "border-slate-200 bg-slate-50 text-slate-950 dark:border-slate-800 dark:bg-slate-900/45 dark:text-slate-100",
            muted: "text-slate-950/60 dark:text-slate-100/65",
            badge: "bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-slate-100",
            panel: "border-slate-200/80 bg-white/70 dark:border-slate-800 dark:bg-black/10",
          }
  const DecisionIcon = isGo ? CheckCircle2 : isStopped ? ShieldAlert : CircleDot
  const [requestedDimension, setRequestedDimension] = useState("")
  const [activeLevel, setActiveLevel] = useState("")

  const dimension = useMemo(
    () => dimensions.find((item) => text(item.dimension, "") === requestedDimension) ?? dimensions[0],
    [requestedDimension, dimensions],
  )
  const subgroups = asArray(dimension?.subgroups).map(asRecord)
  const selectedSubgroup = subgroups.find((item) => text(item.level, "") === activeLevel)
  const consistency = asRecord(dimension?.consistency)

  const snapshot = [
    { label: "Primary outcome", value: text(primaryMetric.name, "Outcome"), detail: binary ? "Binary metric" : "Continuous metric", icon: Sparkles },
    { label: "Diagnostics", value: blocking > 0 ? `${blocking} blocked` : `${passed} passed`, detail: blocking > 0 ? `${blocking} blocking check${blocking === 1 ? "" : "s"}` : warnings > 0 ? `${warnings} review item${warnings === 1 ? "" : "s"}` : "No blocking checks", icon: CheckCircle2 },
    { label: "Analyzed rows", value: finite(evidence.dataset.row_count)?.toLocaleString() ?? "—", detail: `${text(evidence.dataset.column_count)} columns in snapshot`, icon: Database },
    { label: "Drilldown", value: dimensions.length ? `${dimensions.length} dimension${dimensions.length === 1 ? "" : "s"}` : "None selected", detail: "Holm adjusted subgroup tests", icon: Layers3 },
  ]

  return (
    <article className="text-sm leading-6">
      <nav className="mb-8 flex flex-wrap items-center gap-1.5 rounded-2xl border border-border bg-muted/25 p-1.5" aria-label="Report sections">
        <span className="px-2.5 py-1.5 tabular-nums text-[11px] font-semibold normal-case tracking-normal text-muted-foreground">Report view</span>
        {["decision", "primary-result", ...(evidence.eventStudy.length > 0 ? ["event-study"] : []), "drilldown", "lineage", "diagnostics", "contract"].map((section) => (
          <a key={section} href={`#${section}`} className="rounded-xl px-2.5 py-1.5 text-xs font-semibold capitalize text-muted-foreground transition hover:bg-background hover:text-foreground">{section.replaceAll("-", " ")}</a>
        ))}
      </nav>

      <section id="decision" className={`overflow-hidden rounded-xl border p-5 sm:p-6 ${tone.hero}`} aria-labelledby="report-decision">
        <div className="report-decision-grid grid gap-6 lg:grid-cols-[1fr_18rem] lg:items-stretch">
          <div className="flex min-h-[14rem] flex-col justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="flex items-center gap-2 tabular-nums text-[11px] font-semibold normal-case tracking-normal opacity-70"><DecisionIcon className="h-3.5 w-3.5" /> Decision brief</p>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold normal-case tracking-normal ${tone.badge}`}>{decisionStatus}</span>
              </div>
              <h2 id="report-decision" className="mt-5 text-3xl font-semibold capitalize tracking-[-0.04em] sm:text-4xl">{decisionStatus}</h2>
              <p className={`mt-4 max-w-2xl text-sm leading-7 ${tone.muted}`}>{text(evidence.decision.summary, evidence.memo || "The analysis is not complete.")}</p>
            </div>
            {rationale.length > 0 && <ul className={`mt-6 space-y-2 text-xs ${tone.muted}`}>{rationale.slice(0, 3).map((item, index) => <li key={`${text(item)}-${index}`} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70" /><span>{text(item)}</span></li>)}</ul>}
          </div>

          <div className={`rounded-2xl border p-5 ${tone.panel}`}>
            <p className="tabular-nums text-[11px] font-semibold normal-case tracking-normal opacity-65">Primary effect</p>
            <p className="metric-number mt-3 text-4xl font-semibold tracking-[-0.025em]">{formatSignedEffect(effect.estimate, binary)}</p>
            <p className="mt-2 tabular-nums text-[11px] opacity-70">95% CI {formatInterval(effect.ci_lower, effect.ci_upper, binary)}</p>
            <ConfidenceInterval lower={effect.ci_lower} upper={effect.ci_upper} estimate={effect.estimate} binary={binary} dark={false} />
            <div className="mt-4 grid grid-cols-2 gap-4 border-t border-current/15 pt-4">
              <div><p className="tabular-nums text-[11px] normal-case tracking-normal opacity-60">p-value</p><p className="mt-1 tabular-nums text-sm">{formatP(effect.p_value)}</p></div>
              <div><p className="tabular-nums text-[11px] normal-case tracking-normal opacity-60">Metric</p><p className="mt-1 truncate tabular-nums text-sm">{text(primaryMetric.name, "Outcome")}</p></div>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {snapshot.map((item) => {
          const Icon = item.icon
          return <div key={item.label} className="rounded-2xl border border-border bg-card/75 p-4"><div className="flex items-center justify-between gap-3"><p className="tabular-nums text-[11px] font-semibold normal-case tracking-normal text-muted-foreground">{item.label}</p><Icon className="h-3.5 w-3.5 text-muted-foreground" /></div><p className="mt-3 truncate text-base font-semibold tracking-tight">{item.value}</p><p className="mt-1 text-[11px] text-muted-foreground">{item.detail}</p></div>
        })}
      </div>

      <ReportSection id="primary-result" index="01" title="Primary result">
        <Table>
          <thead><tr><Th>Metric</Th><Th>Effect</Th><Th>95% CI</Th><Th>p-value</Th><Th>Control</Th><Th>Treatment</Th></tr></thead>
          <tbody><tr><Td mono>{text(primaryMetric.name, "Primary outcome")}</Td><Td mono>{formatEffect(effect.estimate, binary)}</Td><Td mono>{formatInterval(effect.ci_lower, effect.ci_upper, binary)}</Td><Td mono>{formatP(effect.p_value)}</Td><Td mono>{formatMean(effect.control_mean, binary)}</Td><Td mono>{formatMean(effect.treatment_mean, binary)}</Td></tr></tbody>
        </Table>
        <p className="mt-3 text-xs text-muted-foreground">Numerical results and the rollout status come from deterministic estimators and the frozen decision policy.</p>
      </ReportSection>

      {evidence.eventStudy.length > 0 && (
        <ReportSection id="event-study" index="02" title="Event study and pre-trend view">
          <div className="rounded-2xl border border-border bg-card/70 p-4 sm:p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div><p className="text-sm font-semibold">Effect relative to the reference period</p><p className="mt-1 text-xs leading-5 text-muted-foreground">The reference period is shown at zero. Read the pre-period points first, then inspect the post-rollout path.</p></div>
              <span className="w-fit rounded-full bg-sky-100 px-2.5 py-1 tabular-nums text-[11px] font-semibold normal-case tracking-normal text-sky-800 dark:bg-sky-950/60 dark:text-sky-300">{isDid ? "DiD method" : "Event study"}</span>
            </div>
            <EventStudyChart points={evidence.eventStudy} />
          </div>
        </ReportSection>
      )}

      <ReportSection id="drilldown" index={String(drilldownIndex).padStart(2, "0")} title="Dimension consistency and drilldown">
        {dimensions.length === 0 ? <div className="rounded-2xl border border-dashed border-border px-5 py-6 text-sm text-muted-foreground">No drilldown dimensions were selected or estimable for this run.</div> : (
          <>
            <nav className="flex flex-wrap gap-2" aria-label="Drilldown dimensions">
              {dimensions.map((item) => {
                const name = text(item.dimension)
                const active = name === text(dimension?.dimension)
                const subgroupCount = asArray(item.subgroups).length
                return <button key={name} type="button" onClick={() => { setRequestedDimension(name); setActiveLevel("") }} className={`rounded-xl border px-3 py-2 text-left transition ${active ? "border-slate-950 bg-slate-950 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950" : "border-border bg-card text-muted-foreground hover:border-slate-400 hover:text-foreground"}`}><span className="block text-xs font-semibold">{name}</span><span className="mt-0.5 block tabular-nums text-[11px] opacity-65">{subgroupCount} levels</span></button>
              })}
            </nav>

            {Object.keys(consistency).length > 0 ? (
              <div className={`mt-5 flex flex-col gap-4 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${consistency.consistent ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/20" : "border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/20"}`}>
                <div><p className="font-semibold">{consistency.consistent ? "Effects are consistent across levels" : "Effects vary across levels"}</p><p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{text(consistency.interpretation, "Review the subgroup estimates before making a rollout decision.")}</p></div>
                <div className="flex shrink-0 gap-4 tabular-nums text-xs"><span>Q {finite(consistency.statistic)?.toFixed(3) ?? "—"}</span><span>p {formatP(consistency.p_value)}</span></div>
              </div>
            ) : <p className="mt-5 rounded-2xl border border-dashed border-border px-4 py-4 text-xs text-muted-foreground">{text(dimension?.skipped_reason, "Consistency testing requires at least three estimable, mutually exclusive subgroups.")}</p>}

            {subgroups.length > 0 && (
              <Table className="mt-5">
                <thead><tr><Th>Level</Th><Th>Effect</Th><Th>95% CI</Th><Th>Raw p</Th><Th>Holm p</Th><Th>Result</Th></tr></thead>
                <tbody>{subgroups.map((subgroup) => {
                  const estimate = asRecord(subgroup.estimate)
                  const level = text(subgroup.level)
                  return (
                    <tr key={level} className="border-b border-border last:border-b-0">
                      <Td><button type="button" onClick={() => setActiveLevel(level)} className="tabular-nums font-semibold underline decoration-border underline-offset-4 hover:decoration-foreground">{level}</button></Td>
                      <Td mono>{formatEffect(estimate.effect, binary)}</Td><Td mono>{formatInterval(estimate.ci_lower, estimate.ci_upper, binary)}</Td><Td mono>{formatP(estimate.p_value)}</Td><Td mono>{formatP(subgroup.adjusted_p_value)}</Td><Td><span className={subgroup.significant ? "font-semibold text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}>{subgroup.significant ? `${label(subgroup.direction)} · significant` : "not significant"}</span></Td>
                    </tr>
                  )
                })}</tbody>
              </Table>
            )}
            {selectedSubgroup && (
              <div className="mt-5 rounded-2xl border-l-2 border-slate-950 bg-muted/35 px-4 py-3 dark:border-slate-100">
                <p className="font-semibold">{text(dimension?.dimension)} = {text(selectedSubgroup.level)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{text(selectedSubgroup.recommendation)}</p>
                <p className="mt-1 tabular-nums text-[11px] text-muted-foreground">Control n = {text(asRecord(selectedSubgroup.estimate).n_control)}, treatment n = {text(asRecord(selectedSubgroup.estimate).n_treatment)}</p>
              </div>
            )}
            {dimension?.skipped_reason && Object.keys(consistency).length > 0 && <p className="mt-3 text-xs text-muted-foreground">{text(dimension.skipped_reason)}</p>}
          </>
        )}
      </ReportSection>

      <ReportSection id="lineage" index={String(lineageIndex).padStart(2, "0")} title="Data preparation and lineage">
        <Table>
          <thead><tr><Th>Source rows</Th><Th>Analyzed rows</Th><Th>Columns</Th><Th>Dataset SHA-256</Th></tr></thead>
          <tbody><tr><Td mono>{transformations[0] ? text(transformations[0].rows_before) : text(evidence.dataset.row_count)}</Td><Td mono>{text(evidence.dataset.row_count)}</Td><Td mono>{text(evidence.dataset.column_count)}</Td><Td mono>{text(evidence.dataset.sha256).slice(0, 16)}…</Td></tr></tbody>
        </Table>
        {transformations.length > 0 ? (
          <Table className="mt-4">
            <thead><tr><Th>#</Th><Th>Operation</Th><Th>Columns</Th><Th>Rows before</Th><Th>Rows after</Th></tr></thead>
            <tbody>{transformations.map((operation, index) => <tr key={`${text(operation.operation)}-${index}`} className="border-b border-border last:border-b-0"><Td mono>{text(operation.sequence, String(index + 1))}</Td><Td>{label(operation.operation)}</Td><Td mono>{asArray(operation.columns).map((item) => text(item)).join(", ") || "all columns"}</Td><Td mono>{text(operation.rows_before)}</Td><Td mono>{text(operation.rows_after)}</Td></tr>)}</tbody>
          </Table>
        ) : <p className="mt-3 text-xs text-muted-foreground">The confirmed plan made no transformation to the working copy.</p>}
      </ReportSection>

      <ReportSection id="diagnostics" index={String(diagnosticsIndex).padStart(2, "0")} title="Diagnostics">
        {evidence.diagnostics.length === 0 ? <p className="text-muted-foreground">No diagnostics are available.</p> : (
          <Table><thead><tr><Th>Check</Th><Th>Status</Th><Th>Message</Th></tr></thead><tbody>{evidence.diagnostics.map((diagnostic) => <tr key={diagnostic.name} className="border-b border-border last:border-b-0"><Td mono>{diagnostic.name}</Td><Td><DiagnosticStatus status={diagnostic.status} /></Td><Td>{diagnostic.message || "—"}</Td></tr>)}</tbody></Table>
        )}
      </ReportSection>

      {evidence.guardrailEffects.length > 0 && (
        <ReportSection id="guardrails" index={String(guardrailIndex).padStart(2, "0")} title="Guardrails">
          <Table><thead><tr><Th>Metric</Th><Th>Effect</Th><Th>95% CI</Th><Th>p-value</Th></tr></thead><tbody>{evidence.guardrailEffects.map((guardrail, index) => {
            const guardrailBinary = String(guardrail.metric_kind ?? "") === "binary"
            return <tr key={`${text(guardrail.metric_name)}-${index}`} className="border-b border-border last:border-b-0"><Td mono>{text(guardrail.metric_name)}</Td><Td mono>{formatEffect(guardrail.effect, guardrailBinary)}</Td><Td mono>{formatInterval(guardrail.ci_lower, guardrail.ci_upper, guardrailBinary)}</Td><Td mono>{formatP(guardrail.p_value)}</Td></tr>
          })}</tbody></Table>
        </ReportSection>
      )}

      <ReportSection id="contract" index={String(contractIndex).padStart(2, "0")} title="Frozen contract">
        <Table><tbody>
          <KeyValue name="Question" value={evidence.contract.business_question} />
          <KeyValue name="Hypothesis" value={evidence.contract.hypothesis} />
          <KeyValue name="Population" value={evidence.contract.population} />
          <KeyValue name="Intervention" value={evidence.contract.intervention} />
          <KeyValue name="Comparator" value={evidence.contract.comparator} />
          <KeyValue name="Estimand" value={evidence.contract.estimand} mono />
          <KeyValue name="Design" value={evidence.design.design_type} mono />
          <KeyValue name="Spec hash" value={evidence.design.spec_hash} mono />
        </tbody></Table>
        {dataFields.length > 0 && <details className="mt-4"><summary className="cursor-pointer text-xs font-medium">Expected data schema</summary><Table className="mt-3"><thead><tr><Th>Field</Th><Th>Role</Th><Th>Type</Th><Th>Required</Th></tr></thead><tbody>{dataFields.map((field, index) => {
          const fieldName = field.name ?? field.logical_name ?? field.column
          return <tr key={`${text(fieldName)}-${index}`} className="border-b border-border last:border-b-0"><Td mono>{text(fieldName)}</Td><Td>{text(field.role)}</Td><Td mono>{text(field.type ?? field.dtype)}</Td><Td>{field.required === false ? "optional" : "yes"}</Td></tr>
        })}</tbody></Table></details>}
      </ReportSection>

      <ReportSection id="trace" index={String(traceIndex).padStart(2, "0")} title="Reproducibility trace">
        <details><summary className="cursor-pointer text-xs font-medium">Show {evidence.trace.length} recorded steps</summary><ol className="mt-3 list-decimal space-y-2 pl-5 text-xs text-muted-foreground">{evidence.trace.map((step, index) => <li key={`${step.step}-${index}`}><span className="tabular-nums text-foreground">{step.step}</span>{step.summary ? ` — ${step.summary}` : ""}</li>)}</ol></details>
      </ReportSection>
    </article>
  )
}

function EventStudyChart({ points }: { points: UnknownRecord[] }) {
  const chartPoints = points.map((point, index) => ({
    index,
    relative: finite(point.relative_period) ?? index,
    label: text(point.relative_period, String(index)),
    time: text(point.time_value, String(index)),
    effect: finite(point.effect) ?? 0,
    lower: finite(point.ci_lower),
    upper: finite(point.ci_upper),
    reference: point.is_reference === true,
  }))
  if (chartPoints.length < 2) return <p className="mt-5 text-xs text-muted-foreground">Event-study points are not sufficient to draw the method view.</p>

  const values = chartPoints.flatMap((point) => [point.effect, point.lower, point.upper]).filter((value): value is number => value !== null)
  const rawMin = Math.min(0, ...values)
  const rawMax = Math.max(0, ...values)
  const padding = Math.max((rawMax - rawMin) * 0.16, 0.1)
  const min = rawMin - padding
  const max = rawMax + padding
  const width = 760
  const height = 280
  const left = 50
  const right = 18
  const top = 18
  const bottom = 42
  const chartWidth = width - left - right
  const chartHeight = height - top - bottom
  const x = (index: number) => left + (index / Math.max(chartPoints.length - 1, 1)) * chartWidth
  const y = (value: number) => top + ((max - value) / (max - min)) * chartHeight
  const zeroY = y(0)
  const referenceIndex = chartPoints.findIndex((point) => point.reference)
  const ticks = [min, 0, max]

  return (
    <div className="mt-5 overflow-x-auto" aria-label="Event study chart">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[42rem] text-slate-950 dark:text-slate-100" role="img" aria-label="Event study effects by relative period">
        {ticks.map((tick) => <g key={tick}><line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} stroke="currentColor" strokeOpacity={tick === 0 ? 0.35 : 0.1} strokeDasharray={tick === 0 ? undefined : "3 5"} /><text x={left - 10} y={y(tick) + 4} textAnchor="end" className="fill-current tabular-nums text-[11px]" opacity="0.55">{tick.toFixed(1)}</text></g>)}
        {referenceIndex >= 0 && <line x1={x(referenceIndex)} x2={x(referenceIndex)} y1={top} y2={height - bottom} stroke="currentColor" strokeOpacity="0.22" strokeDasharray="4 5" />}
        <line x1={left} x2={width - right} y1={zeroY} y2={zeroY} stroke="currentColor" strokeOpacity="0.45" />
        {chartPoints.map((point) => {
          const pointX = x(point.index)
          const pointY = y(point.effect)
          return <g key={`${point.time}-${point.index}`}>
            {point.lower !== null && point.upper !== null && <><line x1={pointX} x2={pointX} y1={y(point.lower)} y2={y(point.upper)} stroke="currentColor" strokeWidth="2" strokeOpacity="0.55" /><line x1={pointX - 4} x2={pointX + 4} y1={y(point.lower)} y2={y(point.lower)} stroke="currentColor" strokeWidth="2" strokeOpacity="0.55" /><line x1={pointX - 4} x2={pointX + 4} y1={y(point.upper)} y2={y(point.upper)} stroke="currentColor" strokeWidth="2" strokeOpacity="0.55" /></>}
            <circle cx={pointX} cy={pointY} r={point.reference ? 5 : 4} fill={point.reference ? "currentColor" : "#38bdf8"} stroke="currentColor" strokeWidth={point.reference ? 2 : 1.5} />
            <text x={pointX} y={height - 20} textAnchor="middle" className="fill-current tabular-nums text-[11px]" opacity="0.65">{point.label}</text>
          </g>
        })}
        <text x={left} y={height - 3} className="fill-current tabular-nums text-[11px]" opacity="0.5">pre</text>
        <text x={width - right} y={height - 3} textAnchor="end" className="fill-current tabular-nums text-[11px]" opacity="0.5">post</text>
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 tabular-nums text-[11px] text-muted-foreground"><span>Relative period</span><span>● estimate</span><span>vertical bar 95% CI</span><span>reference = {chartPoints.find((point) => point.reference)?.label ?? "—"}</span></div>
    </div>
  )
}

function ConfidenceInterval({ lower, upper, estimate, binary, dark }: { lower: unknown; upper: unknown; estimate: unknown; binary: boolean; dark: boolean }) {
  const lowerNumber = finite(lower)
  const upperNumber = finite(upper)
  const estimateNumber = finite(estimate)
  if (lowerNumber === null || upperNumber === null || estimateNumber === null) return <div className="mt-6 rounded-xl border border-current/15 px-3 py-3 text-xs opacity-65">Confidence interval unavailable</div>
  const lowerValue = Math.min(lowerNumber, upperNumber, 0)
  const upperValue = Math.max(lowerNumber, upperNumber, 0)
  const padding = Math.max((upperValue - lowerValue) * 0.18, 0.0001)
  const minimum = lowerValue - padding
  const maximum = upperValue + padding
  const percentage = (value: number) => ((value - minimum) / (maximum - minimum)) * 100
  const left = Math.min(percentage(lowerNumber), percentage(upperNumber))
  const width = Math.abs(percentage(upperNumber) - percentage(lowerNumber))
  return (
    <div className="mt-5" aria-label={`95% confidence interval from ${formatEffect(lower, binary)} to ${formatEffect(upper, binary)}`}>
      <div className="relative h-8">
        <div className="absolute inset-x-0 top-1/2 h-px bg-current/20" />
        <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-current/55" style={{ left: `${left}%`, width: `${width}%` }} />
        <span className="absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-current/35" style={{ left: `${percentage(0)}%` }} aria-hidden />
        <span className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${dark ? "border-slate-950 bg-emerald-300" : "border-current bg-current"}`} style={{ left: `${percentage(estimateNumber)}%` }} aria-hidden />
      </div>
      <div className="relative mt-1 h-4 tabular-nums text-[11px] opacity-60"><span className="absolute -translate-x-1/2" style={{ left: `${percentage(0)}%` }}>0</span><span className="absolute right-0">{formatEffect(upper, binary)}</span></div>
    </div>
  )
}

function DiagnosticStatus({ status }: { status: string }) {
  const classes = status === "fail" ? "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300" : status === "warn" ? "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" : status === "pass" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-muted text-muted-foreground"
  return <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold normal-case tracking-normal ${classes}`}>{status}</span>
}

function ReportSection({ id, index, title, children }: { id: string; index: string; title: string; children: ReactNode }) {
  return <section id={id} className="mt-12 scroll-mt-8 border-t border-border pt-7"><div className="mb-4 flex items-baseline gap-3"><span className="tabular-nums text-[11px] text-muted-foreground">{index}</span><h2 className="text-lg font-semibold tracking-tight">{title}</h2></div>{children}</section>
}

function Table({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`overflow-x-auto ${className}`}><table className="w-full min-w-[42rem] border-collapse text-left text-xs">{children}</table></div>
}

function Th({ children }: { children: ReactNode }) {
  return <th className="border-b border-border py-2 pr-4 font-medium text-muted-foreground">{children}</th>
}

function Td({ children, mono = false }: { children: ReactNode; mono?: boolean }) {
  return <td className={`py-2.5 pr-4 align-top ${mono ? "tabular-nums" : ""}`}>{children}</td>
}

function KeyValue({ name, value, mono = false }: { name: string; value: unknown; mono?: boolean }) {
  return <tr className="border-b border-border last:border-b-0"><Td>{name}</Td><Td mono={mono}>{text(value)}</Td></tr>
}
