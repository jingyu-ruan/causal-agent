import type { AgentDraft, AgentDraftField, AgentHistoryMessage, AgentTurnResponse } from "@/lib/agent-api"
import { missingOpenRouterFields, OPENROUTER_SYSTEM_PROMPT, validateOpenRouterTurn } from "./openrouter-contract"

type OpenRouterIntake = { messages: AgentHistoryMessage[]; draft: AgentDraft; captured_fields: AgentDraftField[]; locale: string }

/** Keep this user's key on their device and send it only to the fixed OpenRouter origin. */
export async function runOpenRouterIntake(payload: OpenRouterIntake, apiKey: string): Promise<AgentTurnResponse> {
  if (!/^sk-or-v1-[a-zA-Z0-9_-]+$/.test(apiKey.trim())) throw new Error("Configure a valid OpenRouter API key before starting the Agent.")
  const captured = new Set(payload.captured_fields)
  const messages = [
    { role: "system", content: OPENROUTER_SYSTEM_PROMPT },
    ...payload.messages.slice(-24),
    { role: "user", content: `APPLICATION STATE\nRequested locale: ${payload.locale}\nConfirmed draft JSON: ${JSON.stringify(Object.fromEntries(Object.entries(payload.draft).filter(([key]) => captured.has(key as AgentDraftField))))}\nCurrently missing fields: ${JSON.stringify(missingOpenRouterFields(payload.draft, captured))}\nAnalyze the conversation and return the next JSON response.` },
  ]
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey.trim()}` },
      body: JSON.stringify({ model: "openrouter/free", messages, response_format: { type: "json_object" }, max_tokens: 6000, provider: { max_price: { prompt: 0, completion: 0 } } }),
      credentials: "omit", redirect: "error", signal: AbortSignal.timeout(90000),
    })
    if (!response.ok) {
      const errors: Record<number, string> = {
        401: "OpenRouter rejected the API key. Check the saved key.",
        402: "OpenRouter rejected this key's credit limit. Check its allowance for free models.",
        403: "OpenRouter denied this request. Check your account's model and data-policy permissions.",
        404: "No free model is currently available for these request requirements. Try again later or check OpenRouter's data-policy settings.",
        429: "OpenRouter's free usage limit was reached. Please try again later.",
      }
      throw new Error(errors[response.status] ?? `OpenRouter could not complete the request (${response.status}). Please try again.`)
    }
    const result = await response.json() as { choices?: { message?: { content?: string } }[] }
    try {
      return validateOpenRouterTurn(JSON.parse(result.choices?.[0]?.message?.content ?? ""), payload)
    } catch {
      messages.push({ role: "user", content: "The previous reply did not match the required JSON schema. Return one complete valid JSON object with message, draft_patch, blocks, and next_action. Use only the allowed fields and enum values. Keep previously confirmed inputs." })
    }
  }
  throw new Error("The free model returned an invalid study form. Your confirmed inputs are preserved. Please retry.")
}
