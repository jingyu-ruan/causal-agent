"use client"

import { useMemo, useState } from "react"

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
  const binary = String(primaryMetric.kind ?? "").toLowerCase() === "binary"
  const decisionStatus = label(evidence.decision.status ?? "insufficient evidence")
  const rationale = asArray(evidence.decision.rationale)
  const transformations = asArray(evidence.dataset.transformations).map(asRecord)
  const dataContract = asRecord(evidence.dataContract)
  const dataFields = asArray(dataContract.fields ?? dataContract.columns ?? evidence.dataContract).map((item) => typeof item === "string" ? { name: item } : asRecord(item))
  const dimensions = evidence.dimensionAnalyses
  const [requestedDimension, setRequestedDimension] = useState("")
  const [activeLevel, setActiveLevel] = useState("")

  const dimension = useMemo(
    () => dimensions.find((item) => text(item.dimension, "") === requestedDimension) ?? dimensions[0],
    [requestedDimension, dimensions],
  )
  const subgroups = asArray(dimension?.subgroups).map(asRecord)
  const selectedSubgroup = subgroups.find((item) => text(item.level, "") === activeLevel)
  const consistency = asRecord(dimension?.consistency)

  return (
    <article className="text-sm leading-6">
      <section aria-labelledby="report-decision">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Overall decision</p>
        <h2 id="report-decision" className="mt-1 text-2xl font-semibold capitalize">{decisionStatus}</h2>
        <p className="mt-3 max-w-3xl">{text(evidence.decision.summary, evidence.memo || "The analysis is not complete.")}</p>
        {rationale.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-muted-foreground">{rationale.map((item, index) => <li key={`${text(item)}-${index}`}>{text(item)}</li>)}</ul>}
      </section>

      <ReportSection title="Primary result">
        <Table>
          <thead><tr><Th>Metric</Th><Th>Effect</Th><Th>95% CI</Th><Th>p-value</Th><Th>Control</Th><Th>Treatment</Th></tr></thead>
          <tbody><tr><Td mono>{text(primaryMetric.name, "Primary outcome")}</Td><Td mono>{formatEffect(evidence.effect.estimate, binary)}</Td><Td mono>{formatInterval(evidence.effect.ci_lower, evidence.effect.ci_upper, binary)}</Td><Td mono>{formatP(evidence.effect.p_value)}</Td><Td mono>{formatEffect(evidence.effect.control_mean, binary)}</Td><Td mono>{formatEffect(evidence.effect.treatment_mean, binary)}</Td></tr></tbody>
        </Table>
        <p className="mt-3 text-xs text-muted-foreground">Numerical results and the rollout status come from deterministic estimators and the frozen decision policy.</p>
      </ReportSection>

      <ReportSection title="Dimension consistency and drilldown">
        {dimensions.length === 0 ? <p className="text-muted-foreground">No drilldown dimensions were selected or estimable for this run.</p> : (
          <>
            <nav className="flex flex-wrap gap-x-5 gap-y-2 border-b border-border" aria-label="Drilldown dimensions">
              {dimensions.map((item) => {
                const name = text(item.dimension)
                const active = name === text(dimension?.dimension)
                return <button key={name} type="button" onClick={() => { setRequestedDimension(name); setActiveLevel("") }} className={`border-b-2 px-0.5 pb-2 text-xs font-medium transition ${active ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{name}</button>
              })}
            </nav>

            {Object.keys(consistency).length > 0 ? (
              <div className="py-4">
                <p className="font-medium">{consistency.consistent ? "No heterogeneity detected" : "Heterogeneity detected"}</p>
                <p className="mt-1 text-xs text-muted-foreground">Cochran’s Q = {finite(consistency.statistic)?.toFixed(3) ?? "—"}, df = {text(consistency.degrees_freedom)}, p = {formatP(consistency.p_value)}. {text(consistency.interpretation, "")}</p>
              </div>
            ) : <p className="py-4 text-xs text-muted-foreground">{text(dimension?.skipped_reason, "Consistency testing requires at least three estimable, mutually exclusive subgroups.")}</p>}

            {subgroups.length > 0 && (
              <Table>
                <thead><tr><Th>Level</Th><Th>Effect</Th><Th>95% CI</Th><Th>Raw p</Th><Th>Holm p</Th><Th>Result</Th></tr></thead>
                <tbody>{subgroups.map((subgroup) => {
                  const estimate = asRecord(subgroup.estimate)
                  const level = text(subgroup.level)
                  return (
                    <tr key={level} className="border-b border-border last:border-b-0">
                      <Td><button type="button" onClick={() => setActiveLevel(level)} className="font-mono underline decoration-border underline-offset-4 hover:decoration-foreground">{level}</button></Td>
                      <Td mono>{formatEffect(estimate.effect, binary)}</Td><Td mono>{formatInterval(estimate.ci_lower, estimate.ci_upper, binary)}</Td><Td mono>{formatP(estimate.p_value)}</Td><Td mono>{formatP(subgroup.adjusted_p_value)}</Td><Td>{subgroup.significant ? `${label(subgroup.direction)} · significant` : "not significant"}</Td>
                    </tr>
                  )
                })}</tbody>
              </Table>
            )}
            {selectedSubgroup && (
              <div className="mt-4 border-l-2 border-foreground pl-4">
                <p className="font-medium">{text(dimension?.dimension)} = {text(selectedSubgroup.level)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{text(selectedSubgroup.recommendation)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Control n = {text(asRecord(selectedSubgroup.estimate).n_control)}, treatment n = {text(asRecord(selectedSubgroup.estimate).n_treatment)}.</p>
              </div>
            )}
            {dimension?.skipped_reason && Object.keys(consistency).length > 0 && <p className="mt-3 text-xs text-muted-foreground">{text(dimension.skipped_reason)}</p>}
          </>
        )}
      </ReportSection>

      <ReportSection title="Data preparation and lineage">
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

      <ReportSection title="Diagnostics">
        {evidence.diagnostics.length === 0 ? <p className="text-muted-foreground">No diagnostics are available.</p> : (
          <Table><thead><tr><Th>Check</Th><Th>Status</Th><Th>Message</Th></tr></thead><tbody>{evidence.diagnostics.map((diagnostic) => <tr key={diagnostic.name} className="border-b border-border last:border-b-0"><Td mono>{diagnostic.name}</Td><Td><span className={diagnostic.status === "fail" ? "text-rose-600 dark:text-rose-400" : diagnostic.status === "warn" ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"}>{diagnostic.status}</span></Td><Td>{diagnostic.message || "—"}</Td></tr>)}</tbody></Table>
        )}
      </ReportSection>

      {evidence.guardrailEffects.length > 0 && (
        <ReportSection title="Guardrails">
          <Table><thead><tr><Th>Metric</Th><Th>Effect</Th><Th>95% CI</Th><Th>p-value</Th></tr></thead><tbody>{evidence.guardrailEffects.map((guardrail, index) => {
            const guardrailBinary = String(guardrail.metric_kind ?? "") === "binary"
            return <tr key={`${text(guardrail.metric_name)}-${index}`} className="border-b border-border last:border-b-0"><Td mono>{text(guardrail.metric_name)}</Td><Td mono>{formatEffect(guardrail.effect, guardrailBinary)}</Td><Td mono>{formatInterval(guardrail.ci_lower, guardrail.ci_upper, guardrailBinary)}</Td><Td mono>{formatP(guardrail.p_value)}</Td></tr>
          })}</tbody></Table>
        </ReportSection>
      )}

      <ReportSection title="Frozen contract">
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
        {dataFields.length > 0 && <details className="mt-4"><summary className="cursor-pointer text-xs font-medium">Expected data schema</summary><Table className="mt-3"><thead><tr><Th>Field</Th><Th>Role</Th><Th>Type</Th><Th>Required</Th></tr></thead><tbody>{dataFields.map((field, index) => <tr key={`${text(field.name)}-${index}`} className="border-b border-border last:border-b-0"><Td mono>{text(field.name)}</Td><Td>{text(field.role)}</Td><Td mono>{text(field.type ?? field.dtype)}</Td><Td>{field.required === false ? "optional" : "yes"}</Td></tr>)}</tbody></Table></details>}
      </ReportSection>

      <ReportSection title="Reproducibility trace">
        <details><summary className="cursor-pointer text-xs font-medium">Show {evidence.trace.length} recorded steps</summary><ol className="mt-3 list-decimal space-y-2 pl-5 text-xs text-muted-foreground">{evidence.trace.map((step, index) => <li key={`${step.step}-${index}`}><span className="font-mono text-foreground">{step.step}</span>{step.summary ? ` — ${step.summary}` : ""}</li>)}</ol></details>
      </ReportSection>
    </article>
  )
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mt-10 border-t border-border pt-6"><h2 className="mb-4 text-lg font-semibold">{title}</h2>{children}</section>
}

function Table({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`overflow-x-auto ${className}`}><table className="w-full min-w-[42rem] border-collapse text-left text-xs">{children}</table></div>
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="border-b border-border py-2 pr-4 font-medium text-muted-foreground">{children}</th>
}

function Td({ children, mono = false }: { children: React.ReactNode; mono?: boolean }) {
  return <td className={`py-2.5 pr-4 align-top ${mono ? "font-mono" : ""}`}>{children}</td>
}

function KeyValue({ name, value, mono = false }: { name: string; value: unknown; mono?: boolean }) {
  return <tr className="border-b border-border last:border-b-0"><Td>{name}</Td><Td mono={mono}>{text(value)}</Td></tr>
}
