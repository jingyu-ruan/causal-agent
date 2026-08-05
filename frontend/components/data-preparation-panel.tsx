"use client"

import { AlertCircle, ArrowRight, CheckCircle2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import type { DatasetPreparationProfile } from "@/lib/studies-api"

const OPERATION_LABELS: Record<string, string> = {
  trim_string_values: "Trim surrounding whitespace",
  drop_exact_duplicates: "Remove exact duplicate rows",
  drop_missing_required: "Remove rows missing required causal fields",
  drop_invalid_metric_values: "Remove rows with invalid metric values",
  fill_missing_dimensions: "Keep missing dimensions as an explicit level",
}

export function DataPreparationPanel({
  profile,
  selectedOperationIds,
  selectedDimensions,
  lineageConfirmed,
  busy,
  onToggleOperation,
  onToggleDimension,
  onLineageConfirmed,
  onConfirm,
}: {
  profile: DatasetPreparationProfile
  selectedOperationIds: string[]
  selectedDimensions: string[]
  lineageConfirmed: boolean
  busy: boolean
  onToggleOperation: (id: string, checked: boolean) => void
  onToggleDimension: (dimension: string, checked: boolean) => void
  onLineageConfirmed: (checked: boolean) => void
  onConfirm: () => void
}) {
  const blocked = profile.blocking_issues.length > 0

  return (
    <section className="mt-4 border-y border-border py-5" aria-labelledby="data-preparation-title">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 id="data-preparation-title" className="text-base font-semibold">Data preparation</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{profile.agent_summary}</p>
        </div>
        <code className="text-[10px] text-muted-foreground">{profile.source_sha256.slice(0, 10)}…</code>
      </div>

      <table className="mt-4 w-full border-collapse text-left text-xs">
        <thead className="border-y border-border text-muted-foreground">
          <tr><th className="py-2 pr-4 font-medium">Rows</th><th className="py-2 pr-4 font-medium">Columns</th><th className="py-2 pr-4 font-medium">Exact duplicates</th><th className="py-2 font-medium">Grain conflicts</th></tr>
        </thead>
        <tbody><tr><td className="py-2.5 pr-4 font-mono">{profile.row_count.toLocaleString()}</td><td className="py-2.5 pr-4 font-mono">{profile.column_count}</td><td className="py-2.5 pr-4 font-mono">{profile.exact_duplicate_rows}</td><td className="py-2.5 font-mono">{profile.duplicate_grain_rows}</td></tr></tbody>
      </table>

      {blocked && (
        <div className="mt-4 border-l-2 border-rose-500 pl-3 text-xs text-rose-700 dark:text-rose-300">
          <p className="flex items-center gap-2 font-semibold"><AlertCircle className="h-3.5 w-3.5" />Resolve before analysis</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">{profile.blocking_issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
        </div>
      )}

      <div className="mt-5">
        <h3 className="text-xs font-semibold">Agent cleaning plan</h3>
        {profile.operations.length === 0 ? (
          <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5" />No transformation is proposed.</p>
        ) : (
          <div className="mt-2 divide-y divide-border border-y border-border">
            {profile.operations.map((operation) => (
              <label key={operation.id} className="grid cursor-pointer grid-cols-[auto_1fr_auto] gap-3 py-3 text-xs">
                <Checkbox checked={selectedOperationIds.includes(operation.id)} onCheckedChange={(checked) => onToggleOperation(operation.id, checked === true)} className="mt-0.5" />
                <span><span className="block font-medium">{OPERATION_LABELS[operation.operation] ?? operation.operation}</span><span className="mt-1 block leading-5 text-muted-foreground">{operation.reason}</span></span>
                <span className="font-mono text-muted-foreground">{operation.affected_rows} row{operation.affected_rows === 1 ? "" : "s"}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="mt-5">
        <h3 className="text-xs font-semibold">Interactive drilldown dimensions</h3>
        {profile.suggested_dimensions.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">No stable low-cardinality dimension was detected automatically.</p> : (
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
            {profile.suggested_dimensions.map((dimension) => (
              <label key={dimension} className="flex cursor-pointer items-center gap-2 text-xs"><Checkbox checked={selectedDimensions.includes(dimension)} onCheckedChange={(checked) => onToggleDimension(dimension, checked === true)} /><code>{dimension}</code></label>
            ))}
          </div>
        )}
      </div>

      <label className="mt-5 flex cursor-pointer items-start gap-3 border-t border-border pt-4 text-xs leading-5">
        <Checkbox checked={lineageConfirmed} onCheckedChange={(checked) => onLineageConfirmed(checked === true)} className="mt-0.5" />
        <span>I confirm there is no unrecorded outcome-dependent cleaning, deletion, imputation, or window change upstream. The selected operations may run on a copy of this upload.</span>
      </label>

      <div className="mt-4 flex justify-end">
        <Button type="button" size="sm" className="rounded-lg" onClick={onConfirm} disabled={busy || blocked || !lineageConfirmed}>
          Confirm plan and analyze <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </section>
  )
}
