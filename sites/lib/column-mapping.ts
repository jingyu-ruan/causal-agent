export type ColumnMapping = {
  unit_col: string
  treatment_col: string
  time_col: string
  metric_cols: Record<string, string>
  covariate_cols: Record<string, string>
  dimension_cols: string[]
}

type MappingInput = {
  randomization_unit: string
  design_type: string
  primary_metric: string
  guardrails: Array<{ name: string }>
  cuped_covariate?: string | null
}

type MetricConcept = {
  metricTerms: string[]
  columnTerms: string[]
}

const METRIC_CONCEPTS: MetricConcept[] = [
  {
    metricTerms: ["次日", "翌日", "next day", "day 1", "d1"],
    columnTerms: ["next day", "day 1", "d1"],
  },
  {
    metricTerms: ["留存", "retention", "retained"],
    columnTerms: ["retention", "retained"],
  },
  {
    metricTerms: ["转化", "conversion", "converted"],
    columnTerms: ["conversion", "converted"],
  },
  {
    metricTerms: ["点击", "click through", "clickthrough", "ctr"],
    columnTerms: ["click through", "clickthrough", "ctr"],
  },
  {
    metricTerms: ["激活", "activation", "activated"],
    columnTerms: ["activation", "activated"],
  },
  {
    metricTerms: ["崩溃", "crash"],
    columnTerms: ["crash"],
  },
  {
    metricTerms: ["率", "比例", "占比", "rate", "ratio", "share"],
    columnTerms: ["rate", "ratio", "share"],
  },
]

function normalizeMappingToken(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")
}

function semanticMetricColumn(metric: string, columns: string[]): string {
  const normalizedMetric = normalizeMappingToken(metric)
  const concepts = METRIC_CONCEPTS.filter((concept) => concept.metricTerms.some((term) => normalizedMetric.includes(normalizeMappingToken(term))))
  if (concepts.length < 2) return ""

  const matches = columns.filter((column) => {
    const normalizedColumn = normalizeMappingToken(column)
    return concepts.every((concept) => concept.columnTerms.some((term) => normalizedColumn.includes(normalizeMappingToken(term))))
  })
  return matches.length === 1 ? matches[0] : ""
}

export function defaultMapping(input: MappingInput): ColumnMapping {
  return {
    unit_col: input.randomization_unit,
    treatment_col: "treatment",
    time_col: input.design_type === "did" ? "time" : "",
    metric_cols: Object.fromEntries([[input.primary_metric, input.primary_metric], ...input.guardrails.map((item) => [item.name, item.name])].filter(([name]) => Boolean(name))),
    covariate_cols: input.cuped_covariate ? { [input.cuped_covariate]: input.cuped_covariate } : {},
    dimension_cols: [],
  }
}

export function suggestMapping(current: ColumnMapping, columns: string[], input: MappingInput): ColumnMapping {
  const normalized = columns.map((column) => ({ column, normalized: normalizeMappingToken(column) }))
  const find = (...candidates: string[]) => {
    for (const candidate of candidates.filter(Boolean)) {
      const exact = normalized.find((item) => item.normalized === normalizeMappingToken(candidate))
      if (exact) return exact.column
    }
    for (const candidate of candidates.filter(Boolean)) {
      const normalizedCandidate = normalizeMappingToken(candidate)
      const partial = normalized.find((item) => normalizedCandidate.length >= 3 && item.normalized.includes(normalizedCandidate))
      if (partial) return partial.column
    }
    return ""
  }
  return {
    unit_col: find(input.randomization_unit, "user_id", "unit_id", "account_id", "server_id", "id") || current.unit_col,
    treatment_col: find("treatment", "variant", "group", "treated") || current.treatment_col,
    time_col: input.design_type === "did" ? find("time", "date", "period", "week") || current.time_col : "",
    metric_cols: Object.fromEntries(Object.keys(current.metric_cols).map((metric) => [
      metric,
      find(metric) || semanticMetricColumn(metric, columns) || find("outcome", "metric") || current.metric_cols[metric],
    ])),
    covariate_cols: Object.fromEntries(Object.keys(current.covariate_cols).map((metric) => [metric, find(metric) || current.covariate_cols[metric]])),
    dimension_cols: current.dimension_cols ?? [],
  }
}

export function mappingIssues(mapping: ColumnMapping, columns: string[], input: MappingInput): string[] {
  const valid = (value: string) => Boolean(value) && (columns.length === 0 || columns.includes(value))
  const issues: string[] = []
  if (!valid(mapping.unit_col)) issues.push("analysis unit")
  if (!valid(mapping.treatment_col)) issues.push("treatment assignment")
  if (input.design_type === "did" && !valid(mapping.time_col)) issues.push("time")
  if (!valid(mapping.metric_cols[input.primary_metric] ?? "")) issues.push(`primary metric (${input.primary_metric})`)
  for (const guardrail of input.guardrails) if (!valid(mapping.metric_cols[guardrail.name] ?? "")) issues.push(`guardrail (${guardrail.name})`)
  return issues
}

export function mappingSummary(mapping: ColumnMapping, input: MappingInput): string {
  const parts = [`unit → ${mapping.unit_col}`, `treatment → ${mapping.treatment_col}`, `metric → ${mapping.metric_cols[input.primary_metric]}`]
  if (input.design_type === "did") parts.push(`time → ${mapping.time_col}`)
  return parts.join("; ")
}

export function parseMappingCorrections(current: ColumnMapping, answer: string, input: MappingInput): ColumnMapping {
  const next = { ...current, metric_cols: { ...current.metric_cols }, covariate_cols: { ...current.covariate_cols } }
  const pairs = [...answer.matchAll(/([\p{L}\p{N}_ ]+?)\s*(?:=|:|：|\bis\b)\s*([\p{L}\p{N}_.-]+)/giu)]
  for (const match of pairs) {
    const role = match[1].trim().toLocaleLowerCase()
    const normalizedRole = normalizeMappingToken(role)
    const column = match[2].trim()
    const namedMetric = [input.primary_metric, ...input.guardrails.map((item) => item.name)]
      .find((metric) => normalizedRole.includes(normalizeMappingToken(metric)))

    if (namedMetric) next.metric_cols[namedMetric] = column
    else if (/unit|\bid\b|单位|主键|用户标识/i.test(role)) next.unit_col = column
    else if (/treatment|group|variant|实验组|处理组|分组/i.test(role)) next.treatment_col = column
    else if (/time|date|period|时间|日期|周期/i.test(role)) next.time_col = column
    else if (/metric|outcome|指标|结局|结果/i.test(role)) next.metric_cols[input.primary_metric] = column
  }
  return next
}
