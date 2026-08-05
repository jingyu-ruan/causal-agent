"use client"

import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  Database,
  FileCode2,
  Fingerprint,
  Route,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { AgentTraceStep, DiagnosticCheck, EffectEstimate, StudyRecord } from "@/lib/studies-api"
import { unwrapStudy } from "@/lib/studies-api"
import { cn } from "@/lib/utils"

type UnknownRecord = Record<string, unknown>

export type NormalizedEvidence = {
  study: StudyRecord
  contract: UnknownRecord
  design: UnknownRecord
  dataContract: UnknownRecord | unknown[]
  diagnostics: DiagnosticCheck[]
  effect: EffectEstimate
  guardrailEffects: UnknownRecord[]
  dimensionAnalyses: UnknownRecord[]
  decision: UnknownRecord
  memo: string
  trace: AgentTraceStep[]
  dataset: UnknownRecord
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function pickRecord(...values: unknown[]): UnknownRecord {
  return values.map(asRecord).find((value) => Object.keys(value).length > 0) ?? {}
}

export function normalizeEvidence(payload: StudyRecord): NormalizedEvidence {
  const study = unwrapStudy(payload)
  const result = pickRecord(study.result, study.analysis, study.latest_run)
  const diagnosticsValue = study.diagnostics ?? result.diagnostics
  const rawDiagnostics = Array.isArray(diagnosticsValue)
    ? diagnosticsValue
    : Object.entries(asRecord(diagnosticsValue)).map(([code, value]) => ({
        code,
        ...(typeof value === "object" ? asRecord(value) : { value }),
      }))

  const diagnostics = rawDiagnostics.map((item, index) => {
    const record = asRecord(item)
    const details = asRecord(record.details)
    const rawStatus = String(record.status ?? "unknown").toLowerCase()
    const status: DiagnosticCheck["status"] = rawStatus === "passed" || rawStatus === "pass"
      ? "pass"
      : rawStatus === "failed" || rawStatus === "fail" || rawStatus === "blocked"
        ? "fail"
        : rawStatus === "warning" || rawStatus === "warn"
          ? "warn"
          : "unknown"
    return {
      name: String(record.name ?? record.code ?? `check_${index + 1}`),
      status,
      value: (record.value ?? details.value ?? details.statistic ?? details.p_value) as DiagnosticCheck["value"],
      threshold: (record.threshold ?? details.threshold ?? details.alpha) as DiagnosticCheck["threshold"],
      message: String(record.message ?? record.summary ?? ""),
    }
  })

  const primaryEstimate = pickRecord(study.effect, study.primary_estimate, result.primary_estimate, result.effect)
  const decision = pickRecord(study.decision, result.decision)
  const memoValue = study.decision_memo ?? result.decision_memo ?? decision.summary
  const traceValue = study.trace ?? result.trace

  return {
    study,
    contract: pickRecord(study.contract, study.causal_contract),
    design: pickRecord(study.design, study.design_spec),
    dataContract: (study.data_contract as UnknownRecord | unknown[]) ?? {},
    diagnostics,
    effect: primaryEstimate as EffectEstimate,
    guardrailEffects: asArray(study.guardrail_estimates ?? result.guardrail_estimates).map(asRecord),
    dimensionAnalyses: asArray(study.dimension_analyses ?? result.dimension_analyses).map(asRecord),
    decision,
    memo: typeof memoValue === "string" ? memoValue : "",
    trace: asArray(traceValue).map((item, index) => {
      const record = asRecord(item)
      return {
        step: String(record.action ?? record.stage ?? record.step ?? record.name ?? `Step ${index + 1}`),
        status: record.status ? String(record.status) : undefined,
        summary: record.message ? String(record.message) : record.summary ? String(record.summary) : undefined,
        tool: record.tool ? String(record.tool) : record.stage && record.action ? String(record.stage) : undefined,
        timestamp: record.timestamp ? String(record.timestamp) : undefined,
      }
    }),
    dataset: pickRecord(study.dataset, result.dataset),
  }
}

export function ContractEvidence({ evidence }: { evidence: NormalizedEvidence }) {
  const { contract, design } = evidence
  const primaryMetric = asRecord(contract.primary_metric)
  const requiredSample = numberValue(
    design.required_total_sample_size,
    design.total_sample_size,
    evidence.study.required_sample_size,
    asRecord(evidence.study.sample_size).total,
  )
  const allocation = asArray(design.allocations)
  const designType = String(design.design_type ?? contract.design_type ?? "Study design")
  const normalizedDesignType = designType.trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_")
  const isDid = ["did", "difference_in_differences"].includes(normalizedDesignType)
  const designDetails = isDid
    ? [
        { label: "Minimum pre-periods", value: formatNumber(design.minimum_pre_periods), mono: true },
        { label: "Alpha", value: formatNumber(design.alpha), mono: true },
        { label: "Pre-trend alpha", value: formatNumber(design.pretrend_alpha), mono: true },
        { label: "Spec hash", value: shortHash(design.spec_hash), mono: true },
      ]
    : [
        { label: "Power", value: formatPercent(design.power), mono: true },
        { label: "Alpha", value: formatNumber(design.alpha), mono: true },
        { label: "Allocation", value: allocationLabel(allocation, design), mono: true },
        { label: "Spec hash", value: shortHash(design.spec_hash), mono: true },
        ...(design.cuped_covariate
          ? [
              { label: "CUPED covariate", value: design.cuped_covariate, mono: true },
              { label: "Expected correlation", value: formatNumber(design.cuped_expected_correlation), mono: true },
            ]
          : []),
      ]

  return (
    <div className="space-y-5">
      <Card className="border-slate-900/10 shadow-none dark:border-white/10">
        <CardHeader>
          <div className="eyebrow">
            <Fingerprint className="h-4 w-4" /> Causal contract
          </div>
          <CardTitle className="text-xl font-extrabold">{String(contract.business_question ?? evidence.study.name ?? "Decision question")}</CardTitle>
          <CardDescription>Frozen definitions keep the analysis aligned with the decision.</CardDescription>
        </CardHeader>
        <CardContent>
          <EvidenceRows items={[
            { label: "Population", value: contract.population },
            { label: "Estimand", value: contract.estimand ?? "ATE", mono: true },
            { label: "Intervention", value: contract.intervention },
            { label: "Comparator", value: contract.comparator ?? contract.comparison },
            { label: "Primary metric", value: primaryMetric.name ?? contract.primary_metric, mono: true },
            { label: "Minimum effect", value: formatThreshold(primaryMetric.minimum_effect ?? contract.success_threshold, String(primaryMetric.kind ?? ""), String(primaryMetric.direction ?? "")), mono: true },
          ]} />
        </CardContent>
      </Card>

      <Card className="gap-0 overflow-hidden border-slate-900/10 py-0 shadow-none dark:border-white/10">
        <CardHeader className="border-b border-slate-900/[0.07] bg-slate-900/[0.035] p-6 dark:border-white/10 dark:bg-white/[0.035]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-600"><Route className="h-4 w-4" /> Design spec</div>
              <CardTitle className="mt-3 text-lg">{formatDesignType(designType)}</CardTitle>
            </div>
            {Boolean(design.is_frozen ?? true) && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Frozen</span>}
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{isDid ? "Treatment start" : "Required sample"}</p>
            <p className="metric-number mt-1 text-3xl font-semibold">{isDid ? String(design.treatment_start ?? "—") : requiredSample === null ? "—" : Math.round(requiredSample).toLocaleString()}</p>
            <p className="mt-1 text-xs text-slate-500">{isDid ? "pre-committed intervention boundary" : "total analysis units"}</p>
          </div>
          <div className="mt-6 border-t border-slate-900/[0.07] pt-2 dark:border-white/10">
            <EvidenceRows items={designDetails} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function DataContractEvidence({ evidence }: { evidence: NormalizedEvidence }) {
  const dataContract = evidence.dataContract
  const record = asRecord(dataContract)
  const fields = asArray(record.fields ?? record.columns ?? record.required_columns ?? dataContract)
  const fallbackFields = [
    { name: "unit", role: "analysis unit", required: true },
    { name: "treatment", role: "assignment", required: true },
    { name: "primary metric", role: "outcome", required: true },
  ]
  const renderedFields = fields.length > 0 ? fields : fallbackFields

  return (
    <Card className="border-slate-900/10 shadow-none dark:border-white/10">
      <CardHeader>
        <div className="eyebrow"><Database className="h-4 w-4" /> Data contract</div>
        <CardTitle className="text-xl">Expected evidence schema</CardTitle>
        <CardDescription>Uploaded data is checked against these roles before estimation.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-xl border border-slate-900/10 dark:border-white/10">
          <div className="grid grid-cols-[1fr_0.8fr_auto] gap-4 bg-slate-900/[0.04] px-4 py-2.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-muted-foreground dark:bg-white/[0.04]">
            <span>Logical field</span><span>Role / type</span><span>Required</span>
          </div>
          {renderedFields.map((field, index) => {
            const item = typeof field === "string" ? { name: field } : asRecord(field)
            return (
              <div key={`${String(item.name ?? item.logical_name ?? index)}-${index}`} className="grid grid-cols-[1fr_0.8fr_auto] gap-4 border-t border-slate-900/[0.07] px-4 py-3 text-sm dark:border-white/10">
                <code className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">{String(item.name ?? item.logical_name ?? item.column ?? `field_${index + 1}`)}</code>
                <span className="truncate text-xs text-slate-500">{String(item.role ?? item.type ?? item.dtype ?? "value")}</span>
                {item.required === false ? <span className="text-xs text-slate-400">Optional</span> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
              </div>
            )
          })}
        </div>
        {Object.keys(record).length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
            {record.unit_unique !== undefined && <ContractChip label="Unit unique" value={record.unit_unique} />}
            {record.allow_missing_outcome !== undefined && <ContractChip label="Missing outcome" value={record.allow_missing_outcome ? "allowed" : "blocked"} />}
            {record.metric_window_days !== undefined && <ContractChip label="Metric window" value={`${record.metric_window_days} days`} />}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function DiagnosticsEvidence({ evidence }: { evidence: NormalizedEvidence }) {
  const { diagnostics, dataset } = evidence
  const passed = diagnostics.filter((item) => item.status === "pass").length
  const blocking = diagnostics.filter((item) => item.status === "fail").length

  return (
    <div className="space-y-5">
      <Card className="border-slate-900/10 shadow-none dark:border-white/10">
        <CardHeader>
          <div className="eyebrow"><ShieldCheck className="h-4 w-4" /> Assumption checks</div>
          <CardTitle className="text-xl">Diagnostics before conclusions</CardTitle>
          <CardDescription>Blocking failures prevent the Agent from claiming a causal effect.</CardDescription>
        </CardHeader>
        <CardContent>
          {diagnostics.length === 0 ? (
            <EmptyEvidence icon={CircleDashed} title="No diagnostics yet" description="Upload data to run design-specific evidence checks." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {diagnostics.map((item) => <DiagnosticRow key={item.name} item={item} />)}
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="border-slate-900/10 shadow-none dark:border-white/10">
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><FileCode2 className="h-4 w-4 text-slate-500" /> Run summary</CardTitle><CardDescription>Diagnostic counts and the immutable dataset version used by this run.</CardDescription></CardHeader>
        <CardContent>
          <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
            <div><p className="font-mono text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Passed</p><p className="metric-number mt-1 text-3xl font-semibold text-emerald-700 dark:text-emerald-300">{passed}</p></div>
            <div><p className="font-mono text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Blocking</p><p className={cn("metric-number mt-1 text-3xl font-semibold", blocking > 0 ? "text-rose-600" : "text-muted-foreground/45")}>{blocking}</p></div>
          </div>
          <div className="mt-6 border-t border-slate-900/[0.07] pt-2 dark:border-white/10">
            <EvidenceRows items={[
              { label: "Rows", value: dataset.row_count, mono: true },
              { label: "Columns", value: dataset.column_count, mono: true },
              { label: "SHA-256", value: shortHash(dataset.sha256), mono: true },
            ]} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function DecisionEvidence({ evidence }: { evidence: NormalizedEvidence }) {
  const { effect, decision, memo, guardrailEffects } = evidence
  const contractMetric = asRecord(evidence.contract.primary_metric)
  const metricKind = String(contractMetric.kind ?? contractMetric.type ?? "binary")
  const status = String(decision.status ?? decision.recommendation ?? "insufficient_evidence").toLowerCase()
  const treatment = numberValue(effect.treatment_mean)
  const control = numberValue(effect.control_mean)

  return (
    <div className="space-y-5">
      <div className="space-y-5">
        <Card className="border-slate-900/10 shadow-none dark:border-white/10">
          <CardHeader>
            <div className="eyebrow"><ArrowUpRight className="h-4 w-4" /> Primary estimate</div>
            <CardTitle className="text-lg">{String(contractMetric.name ?? effect.estimand ?? "Treatment effect")}</CardTitle>
          </CardHeader>
          <CardContent>
            {numberValue(effect.estimate) === null ? (
              <EmptyEvidence icon={CircleDashed} title="No estimate available" description="The evidence gate may have blocked estimation." />
            ) : (
              <>
                <p className="metric-number text-4xl font-semibold">{formatEffect(effect.estimate, metricKind)}</p>
                <p className="mt-2 font-mono text-xs text-slate-500">95% CI {formatInterval(effect.ci_lower, effect.ci_upper, metricKind)}</p>
                <div className="mt-6 border-t border-slate-900/[0.07] pt-2 dark:border-white/10">
                  <EvidenceRows items={[
                    { label: "Control", value: formatMetricLevel(control, metricKind), mono: true },
                    { label: "Treatment", value: formatMetricLevel(treatment, metricKind), mono: true },
                    { label: "p-value", value: formatPValue(effect.p_value), mono: true },
                    { label: "Estimand", value: effect.estimand ?? evidence.contract.estimand ?? "ATE", mono: true },
                  ]} />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <DecisionMemo status={status} decision={decision} memo={memo} />
      </div>

      {guardrailEffects.length > 0 && (
        <Card className="border-slate-900/10 shadow-none dark:border-white/10">
          <CardHeader><CardTitle className="text-base">Guardrail evidence</CardTitle><CardDescription>Harm checks are evaluated separately from the primary outcome.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {guardrailEffects.map((guardrail, index) => (
              <div key={`${String(guardrail.metric ?? guardrail.name)}-${index}`} className="rounded-xl border border-slate-900/10 p-4 dark:border-white/10">
                <p className="text-xs font-semibold">{String(guardrail.metric_name ?? guardrail.metric ?? guardrail.name ?? `Guardrail ${index + 1}`)}</p>
                <p className="mt-2 font-mono text-lg font-semibold">{formatEffect(guardrail.effect ?? guardrail.estimate, String(guardrail.metric_kind ?? guardrail.kind ?? "continuous"))}</p>
                <p className="mt-1 text-xs text-slate-500">CI {formatInterval(guardrail.ci_lower, guardrail.ci_upper, String(guardrail.metric_kind ?? guardrail.kind ?? "continuous"))}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export function TraceEvidence({ evidence }: { evidence: NormalizedEvidence }) {
  return (
    <Card className="border-slate-900/10 shadow-none dark:border-white/10">
      <CardHeader>
        <div className="eyebrow"><FileCode2 className="h-4 w-4" /> Agent trace</div>
        <CardTitle className="text-xl">How this evidence was produced</CardTitle>
        <CardDescription>Structured steps make routing, tool use, and refusal behavior inspectable.</CardDescription>
      </CardHeader>
      <CardContent>
        {evidence.trace.length === 0 ? (
          <EmptyEvidence icon={CircleDashed} title="Trace begins after design" description="Every completed tool step will appear here." />
        ) : (
          <ol className="relative ml-2 space-y-0 border-l border-slate-900/10 dark:border-white/10">
            {evidence.trace.map((item, index) => (
              <li key={`${item.step}-${index}`} className="relative pb-6 pl-7 last:pb-0">
                <span className="absolute -left-[7px] top-0 grid h-3.5 w-3.5 place-items-center rounded-full border-2 border-white bg-slate-500 dark:border-[#1b1e24]" />
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold capitalize">{item.step.replaceAll("_", " ")}</p>
                  {item.tool && <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-900">{item.tool}</code>}
                  {item.status && <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">{item.status}</span>}
                </div>
                {item.summary && <p className="mt-1 text-xs leading-5 text-slate-500">{item.summary}</p>}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}

function DiagnosticRow({ item }: { item: DiagnosticCheck }) {
  const view = {
    pass: { icon: CheckCircle2, label: "Passed", classes: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" },
    warn: { icon: AlertTriangle, label: "Review", classes: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300" },
    fail: { icon: XCircle, label: "Blocking", classes: "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300" },
    unknown: { icon: CircleDashed, label: "Pending", classes: "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300" },
  }[item.status]
  const Icon = view.icon
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-900/10 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-white/10">
      <div className="min-w-0">
        <p className="text-sm font-semibold capitalize">{item.name.replaceAll("_", " ")}</p>
        {item.message && <p className="mt-1 text-xs leading-5 text-slate-500">{item.message}</p>}
      </div>
      <span className={cn("inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold", view.classes)}><Icon className="h-3.5 w-3.5" />{view.label}</span>
    </div>
  )
}

function DecisionMemo({ status, decision, memo }: { status: string; decision: UnknownRecord; memo: string }) {
  const insufficient = status.includes("insufficient")
  const hold = status.includes("hold")
  const stopped = status.includes("stop") || status.includes("rollback")
  const go = status.includes("go") || status.includes("proceed") || status.includes("ship")
  const Icon = stopped ? ShieldAlert : go ? ClipboardCheck : CircleDashed
  const tone = stopped
    ? "border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100"
    : go
      ? "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100"
      : "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
  const label = go ? "Proceed" : stopped ? "Stop / roll back" : hold ? "Hold & collect more data" : insufficient ? "Insufficient evidence" : "Decision pending"
  const rationale = asArray(decision.rationale)
  const blocking = asArray(decision.blocking_diagnostics)

  return (
    <Card className={cn("border shadow-none", tone)}>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]"><Icon className="h-4 w-4" /> Decision memo</div>
          <span className="rounded-full bg-white/60 px-2.5 py-1 text-[11px] font-semibold dark:bg-black/20">Policy evaluated</span>
        </div>
        <CardTitle className="text-2xl">{label}</CardTitle>
        <CardDescription className="text-current opacity-70">{String(decision.summary ?? memo ?? "Run the evidence checks to produce a recommendation.")}</CardDescription>
      </CardHeader>
      {(rationale.length > 0 || blocking.length > 0) && (
        <CardContent className="space-y-4 text-sm">
          {rationale.length > 0 && <MemoList label="Rationale" values={rationale} />}
          {blocking.length > 0 && <MemoList label="Blocking evidence" values={blocking} />}
        </CardContent>
      )}
    </Card>
  )
}

function MemoList({ label, values }: { label: string; values: unknown[] }) {
  return <div><p className="text-[10px] font-semibold uppercase tracking-wider opacity-60">{label}</p><ul className="mt-2 space-y-1.5">{values.map((value, index) => <li key={index} className="flex gap-2"><span aria-hidden>•</span><span>{typeof value === "string" ? value : JSON.stringify(value)}</span></li>)}</ul></div>
}

function EmptyEvidence({ icon: Icon, title, description }: { icon: typeof CircleDashed; title: string; description: string }) {
  return <div className="rounded-xl border border-dashed border-slate-900/10 px-5 py-8 text-center dark:border-white/10"><Icon className="mx-auto h-5 w-5 text-slate-400" /><p className="mt-3 text-sm font-semibold">{title}</p><p className="mt-1 text-xs text-slate-500">{description}</p></div>
}

function EvidenceField({ label, value, mono = false }: { label: string; value: unknown; mono?: boolean }) {
  const display = value === undefined || value === null || value === "" ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value)
  return <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p><p className={cn("mt-1.5 break-words text-sm text-slate-700 dark:text-slate-200", mono && "font-mono text-xs")}>{display}</p></div>
}

type EvidenceItem = { label: string; value: unknown; mono?: boolean }

function EvidenceRows({ items }: { items: EvidenceItem[] }) {
  const rows: EvidenceItem[][] = []
  for (let index = 0; index < items.length; index += 2) rows.push(items.slice(index, index + 2))

  return (
    <div>
      {rows.map((row, rowIndex) => (
        <div
          key={row.map((item) => item.label).join("-")}
          className={cn(
            "grid gap-x-8 gap-y-4 py-4 sm:grid-cols-2",
            rowIndex === 0 && "pt-0",
            rowIndex === rows.length - 1 && "pb-0",
            rowIndex < rows.length - 1 && "border-b border-slate-900/[0.07] dark:border-white/10",
          )}
        >
          {row.map((item) => (
            <EvidenceField key={item.label} label={item.label} value={item.value} mono={item.mono} />
          ))}
        </div>
      ))}
    </div>
  )
}

function ContractChip({ label, value }: { label: string; value: unknown }) {
  return <span className="rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-900"><span className="font-semibold">{label}:</span> {String(value)}</span>
}

function numberValue(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value)
  }
  return null
}

function formatNumber(value: unknown): string {
  const number = numberValue(value)
  return number === null ? "—" : number.toLocaleString(undefined, { maximumFractionDigits: 4 })
}

function formatPercent(value: unknown): string {
  const number = numberValue(value)
  return number === null ? "—" : `${(number * 100).toFixed(0)}%`
}

function formatThreshold(value: unknown, kind: string, direction: string): string {
  const number = numberValue(value)
  if (number === null) return "—"
  const arrow = direction.toLowerCase() === "lower_is_better" ? "↓" : "↑"
  return kind.toLowerCase() === "binary"
    ? `${arrow} ${(number * 100).toFixed(2)} pp`
    : `${arrow} ${number.toLocaleString(undefined, { maximumFractionDigits: 4 })}`
}

function formatEffect(value: unknown, kind: string): string {
  const number = numberValue(value)
  if (number === null) return "—"
  return kind === "binary"
    ? `${number >= 0 ? "+" : ""}${(number * 100).toFixed(2)} pp`
    : `${number >= 0 ? "+" : ""}${number.toLocaleString(undefined, { maximumFractionDigits: 3 })}`
}

function formatMetricLevel(value: unknown, kind: string): string {
  const number = numberValue(value)
  if (number === null) return "—"
  return kind === "binary" ? `${(number * 100).toFixed(2)}%` : number.toLocaleString(undefined, { maximumFractionDigits: 3 })
}

function formatInterval(lower: unknown, upper: unknown, kind: string): string {
  return `[${formatEffect(lower, kind)}, ${formatEffect(upper, kind)}]`
}

function formatPValue(value: unknown): string {
  const number = numberValue(value)
  if (number === null) return "—"
  return number < 0.001 ? "< 0.001" : number.toFixed(3)
}

function formatDesignType(value: string): string {
  const normalized = value.trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_")
  if (["rct", "randomized_ab", "randomized_a/b"].includes(normalized)) return "Randomized AB"
  if (["did", "difference_in_differences"].includes(normalized)) return "Difference-in-Differences"
  return value.replaceAll("_", " ")
}

function allocationLabel(allocations: unknown[], design: UnknownRecord): string {
  if (allocations.length > 0) {
    return allocations.map((item) => {
      const allocation = asRecord(item)
      const share = numberValue(allocation.fraction, allocation.share, allocation.allocation)
      return `${String(allocation.label ?? allocation.group ?? allocation.name ?? "group")} ${share === null ? "" : `${(share * 100).toFixed(0)}%`}`
    }).join(" / ")
  }
  const treatment = numberValue(design.expected_treatment_allocation, design.allocation_treatment)
  return treatment === null ? "—" : `${((1 - treatment) * 100).toFixed(0)} / ${(treatment * 100).toFixed(0)}`
}

function shortHash(value: unknown): string {
  if (!value) return "—"
  const text = String(value)
  return text.length > 14 ? `${text.slice(0, 8)}…${text.slice(-4)}` : text
}
