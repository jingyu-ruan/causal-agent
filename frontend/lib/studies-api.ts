import { API_BASE_URL } from "@/lib/config"

export type StudyMode = "prospective" | "retrospective"
export type DesignType = "rct" | "did"
export type MetricType = "binary" | "continuous"

export interface GuardrailDefinition {
  name: string
  kind?: MetricType
  direction: "increase" | "decrease"
  tolerance: number
}

export interface StudyDesignInput {
  name: string
  mode: StudyMode
  business_question: string
  hypothesis: string
  population: string
  intervention: string
  comparison: string
  primary_metric: string
  metric_type: MetricType
  success_threshold: number
  guardrails: GuardrailDefinition[]
  design_type: DesignType
  randomization_unit: string
  baseline_rate?: number
  mde?: number
  alpha: number
  power?: number
  allocation_treatment?: number
  traffic_per_day?: number
  metric_window_days: number
  outcome_standard_deviation?: number
  cuped_covariate?: string
  cuped_expected_correlation?: number
  treatment_start?: string
  minimum_pre_periods?: number
  notes?: string
}

export interface DataField {
  name: string
  type?: string
  required?: boolean
  description?: string
  role?: string
}

export interface DiagnosticCheck {
  name: string
  status: "pass" | "warn" | "fail" | "unknown"
  value?: string | number | boolean | null
  threshold?: string | number | null
  message?: string
}

export interface AgentTraceStep {
  step: string
  status?: string
  summary?: string
  tool?: string
  timestamp?: string
}

export interface EffectEstimate {
  estimate?: number | null
  ci_lower?: number | null
  ci_upper?: number | null
  p_value?: number | null
  relative_lift?: number | null
  standard_error?: number | null
  estimand?: string
  unit?: string
  control_mean?: number | null
  treatment_mean?: number | null
}

export interface StudyRecord {
  id?: string
  study_id?: string
  name?: string
  status?: string
  mode?: StudyMode
  created_at?: string
  updated_at?: string
  causal_contract?: Record<string, unknown>
  design_spec?: Record<string, unknown>
  data_contract?: Record<string, unknown> | DataField[]
  sample_size?: Record<string, unknown>
  required_sample_size?: number
  estimated_duration_days?: number
  analysis?: Record<string, unknown>
  diagnostics?: DiagnosticCheck[] | Record<string, unknown>
  effect?: EffectEstimate
  decision?: Record<string, unknown>
  decision_memo?: string | Record<string, unknown>
  trace?: AgentTraceStep[]
  warnings?: string[]
  [key: string]: unknown
}

export interface AnalyzeOptions {
  transformation_log: Array<{
    sequence: number
    operation: string
    columns: string[]
    rows_before: number
    rows_after: number
    persisted: boolean
    details: Record<string, unknown>
  }>
}

export interface ColumnMappingPayload {
  unit_col: string
  treatment_col: string
  metric_cols: Record<string, string>
  time_col?: string
  covariate_cols: Record<string, string>
}

const STUDIES_API = `${API_BASE_URL}/api/studies`

async function apiError(response: Response, fallback: string): Promise<Error> {
  try {
    const payload = (await response.json()) as { detail?: unknown; message?: unknown }
    const detail = payload.detail ?? payload.message
    if (typeof detail === "string") return new Error(detail)
    if (detail) return new Error(JSON.stringify(detail))
  } catch {
    // The server may return an empty response while a free instance is waking.
  }
  return new Error(`${fallback} (${response.status})`)
}

export async function createStudyDesign(input: StudyDesignInput): Promise<StudyRecord> {
  const treatmentAllocation = input.allocation_treatment ?? 0.5
  const request = {
    title: input.name,
    business_question: input.business_question,
    hypothesis: input.hypothesis,
    design_type: input.design_type === "rct" ? "randomized_ab" : "difference_in_differences",
    population: input.population,
    unit: input.randomization_unit,
    intervention: input.intervention,
    comparator: input.comparison,
    primary_metric: {
      name: input.primary_metric,
      kind: input.metric_type,
      direction: "higher_is_better",
      minimum_effect: input.success_threshold,
      harm_tolerance: 0,
    },
    guardrails: input.guardrails.map((guardrail) => ({
      name: guardrail.name,
      kind: guardrail.kind ?? input.metric_type,
      direction: guardrail.direction === "increase" ? "lower_is_better" : "higher_is_better",
      minimum_effect: 0,
      harm_tolerance: guardrail.tolerance,
    })),
    estimand: input.design_type === "rct" ? "ate" : "att",
    retrospective: input.mode === "retrospective",
    control_group: "control",
    treatment_group: "treatment",
    expected_control_allocation: input.design_type === "rct" ? 1 - treatmentAllocation : undefined,
    expected_treatment_allocation: input.design_type === "rct" ? treatmentAllocation : undefined,
    baseline_value: input.design_type === "rct" ? input.baseline_rate : undefined,
    observation_window_days: input.metric_window_days,
    expected_daily_units: input.design_type === "rct" ? input.traffic_per_day : undefined,
    outcome_standard_deviation: input.design_type === "rct" && input.metric_type === "continuous"
      ? input.outcome_standard_deviation
      : undefined,
    alpha: input.alpha,
    power: input.design_type === "rct" ? input.power : undefined,
    cuped_covariate: input.design_type === "rct" && input.cuped_covariate ? input.cuped_covariate : undefined,
    cuped_expected_correlation: input.design_type === "rct" && input.cuped_covariate
      ? input.cuped_expected_correlation
      : undefined,
    treatment_start: input.design_type === "did" ? input.treatment_start : undefined,
    minimum_pre_periods: input.design_type === "did" ? input.minimum_pre_periods ?? 4 : undefined,
    notes: input.notes ?? "",
  }
  const response = await fetch(`${STUDIES_API}/design`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  })
  if (!response.ok) throw await apiError(response, "Could not create the study design")
  return response.json()
}

export async function analyzeStudy(
  studyId: string,
  file: File,
  mapping: ColumnMappingPayload,
  options: AnalyzeOptions,
): Promise<StudyRecord> {
  const formData = new FormData()
  formData.append("file", file)
  formData.append("mapping_json", JSON.stringify(mapping))
  formData.append("options_json", JSON.stringify(options))

  const response = await fetch(`${STUDIES_API}/${encodeURIComponent(studyId)}/analyze`, {
    method: "POST",
    body: formData,
  })
  if (!response.ok) throw await apiError(response, "Analysis could not be completed")
  return response.json()
}

export async function listStudies(): Promise<StudyRecord[]> {
  const response = await fetch(STUDIES_API, { cache: "no-store" })
  if (!response.ok) throw await apiError(response, "Could not load studies")
  const payload = await response.json()
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.studies)) return payload.studies
  if (Array.isArray(payload?.items)) return payload.items
  return []
}

export async function getStudy(studyId: string): Promise<StudyRecord> {
  const response = await fetch(`${STUDIES_API}/${encodeURIComponent(studyId)}`, {
    cache: "no-store",
  })
  if (!response.ok) throw await apiError(response, "Could not load this study")
  return response.json()
}

export async function getRctDemo(): Promise<StudyRecord> {
  const response = await fetch(`${STUDIES_API}/demo/rct`, { cache: "no-store" })
  if (!response.ok) throw await apiError(response, "Could not load the verified demo")
  return response.json()
}

export async function checkBackendReady(signal?: AbortSignal): Promise<boolean> {
  const response = await fetch(`${API_BASE_URL}/ready`, {
    cache: "no-store",
    signal,
  })
  if (!response.ok) return false
  const payload = await response.json().catch(() => null)
  return payload?.status === "ready" || payload?.ready === true || payload?.status === "ok"
}

export function getStudyId(study: StudyRecord): string {
  const nested = study.study
  const nestedId = nested && typeof nested === "object" && !Array.isArray(nested)
    ? (nested as { id?: unknown; study_id?: unknown }).id ?? (nested as { study_id?: unknown }).study_id
    : undefined
  return String(study.id || study.study_id || nestedId || "")
}

export function unwrapStudy(payload: StudyRecord): StudyRecord {
  const nested = payload.study
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return { ...payload, ...(nested as StudyRecord) }
  }
  return payload
}
