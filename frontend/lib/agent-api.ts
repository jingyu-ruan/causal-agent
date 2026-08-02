import { API_BASE_URL } from "@/lib/config"
import type { DeepSeekModel } from "@/lib/agent-settings"
import type { StudyDesignInput } from "@/lib/studies-api"

export type AgentDraftField =
  | "name"
  | "mode"
  | "business_question"
  | "hypothesis"
  | "population"
  | "intervention"
  | "comparison"
  | "primary_metric"
  | "metric_type"
  | "success_threshold"
  | "guardrails"
  | "design_type"
  | "randomization_unit"
  | "baseline_rate"
  | "outcome_standard_deviation"
  | "traffic_per_day"
  | "metric_window_days"
  | "treatment_start"
  | "minimum_pre_periods"
  | "notes"

export type AgentDraft = Partial<Pick<StudyDesignInput, AgentDraftField>>

export type AgentHistoryMessage = {
  role: "assistant" | "user"
  content: string
}

export type AgentOption = {
  value: string
  label: string
  description?: string | null
}

export type AgentField = {
  id: AgentDraftField
  label: string
  control: "text" | "textarea" | "number" | "date" | "radio" | "checkbox_group" | "select"
  required: boolean
  placeholder?: string | null
  helper_text?: string | null
  options: AgentOption[]
  min?: number | null
  max?: number | null
  step?: number | null
}

export type AgentFormBlock = {
  type: "form"
  id: string
  title: string
  description?: string | null
  submit_label: string
  fields: AgentField[]
}

export type AgentFormValue = string | string[]

export type AgentFormSubmission = {
  summary: string
  values: Partial<Record<AgentDraftField, AgentFormValue>>
}

export type AgentTurnResponse = {
  message: string
  draft_patch: AgentDraft
  captured_fields: AgentDraftField[]
  missing_fields: AgentDraftField[]
  blocks: AgentFormBlock[]
  next_action: "collect" | "review"
  ready_to_freeze: boolean
  provider: "deepseek"
  model: DeepSeekModel
}

const AGENT_DRAFT_FIELDS: AgentDraftField[] = [
  "name",
  "mode",
  "business_question",
  "hypothesis",
  "population",
  "intervention",
  "comparison",
  "primary_metric",
  "metric_type",
  "success_threshold",
  "guardrails",
  "design_type",
  "randomization_unit",
  "baseline_rate",
  "outcome_standard_deviation",
  "traffic_per_day",
  "metric_window_days",
  "treatment_start",
  "minimum_pre_periods",
  "notes",
]

export function toAgentDraft(input: StudyDesignInput): AgentDraft {
  return Object.fromEntries(
    AGENT_DRAFT_FIELDS
      .filter((field) => input[field] !== undefined)
      .map((field) => [field, input[field]]),
  ) as AgentDraft
}

async function agentError(response: Response): Promise<Error> {
  try {
    const payload = (await response.json()) as { detail?: unknown }
    if (typeof payload.detail === "string") return new Error(payload.detail)
  } catch {
    // A network proxy may return a non-JSON error page.
  }
  return new Error(`The Agent request failed (${response.status}).`)
}

export async function runIntakeAgent(
  payload: {
    messages: AgentHistoryMessage[]
    draft: AgentDraft
    captured_fields: AgentDraftField[]
    model: DeepSeekModel
    locale: string
  },
  apiKey: string,
): Promise<AgentTurnResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (apiKey.trim()) headers["X-DeepSeek-API-Key"] = apiKey.trim()

  const response = await fetch(`${API_BASE_URL}/api/agent/intake`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw await agentError(response)
  return response.json() as Promise<AgentTurnResponse>
}
