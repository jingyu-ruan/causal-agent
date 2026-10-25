import { API_BASE_URL } from "@/lib/config"

export type ConversationSummary = {
  id: string
  title: string
  status: string
  model: string
  study_id?: string | null
  created_at: string
  updated_at: string
}

export type PersistedConversation<TState extends Record<string, unknown> = Record<string, unknown>> = ConversationSummary & {
  state: TState
}

type ConversationWrite<TState extends Record<string, unknown>> = {
  title?: string
  status?: string
  model?: string
  study_id?: string | null
  state?: TState
}

const CONVERSATIONS_API = `${API_BASE_URL}/api/conversations`
const WORKSPACE_KEY = "causal-agent-workspace-key"
let volatileWorkspaceKey = ""

function workspaceKey(): string {
  if (volatileWorkspaceKey) return volatileWorkspaceKey
  try {
    const existing = window.localStorage.getItem(WORKSPACE_KEY)
    if (existing) {
      volatileWorkspaceKey = existing
      return existing
    }
    const created = `ws_${crypto.randomUUID()}`
    window.localStorage.setItem(WORKSPACE_KEY, created)
    volatileWorkspaceKey = created
    return created
  } catch {
    volatileWorkspaceKey = `ws_${crypto.randomUUID()}`
    return volatileWorkspaceKey
  }
}

function headers(withBody = false): HeadersInit {
  return {
    ...(withBody ? { "Content-Type": "application/json" } : {}),
    "X-Workspace-Key": workspaceKey(),
  }
}

async function conversationError(response: Response): Promise<Error> {
  try {
    const payload = (await response.json()) as { detail?: unknown }
    if (typeof payload.detail === "string") return new Error(payload.detail)
  } catch {
    // The API may be waking or an upstream proxy may return HTML.
  }
  return new Error(`Conversation request failed (${response.status}).`)
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const response = await fetch(CONVERSATIONS_API, { headers: headers(), cache: "no-store" })
  if (!response.ok) throw await conversationError(response)
  const payload = await response.json()
  return Array.isArray(payload) ? payload as ConversationSummary[] : []
}

export async function getConversation<TState extends Record<string, unknown>>(
  conversationId: string,
): Promise<PersistedConversation<TState>> {
  const response = await fetch(`${CONVERSATIONS_API}/${encodeURIComponent(conversationId)}`, {
    headers: headers(),
    cache: "no-store",
  })
  if (!response.ok) throw await conversationError(response)
  return response.json() as Promise<PersistedConversation<TState>>
}

export async function createConversation<TState extends Record<string, unknown>>(
  payload: Required<Pick<ConversationWrite<TState>, "title" | "status" | "model" | "state">> & Pick<ConversationWrite<TState>, "study_id">,
): Promise<PersistedConversation<TState>> {
  const response = await fetch(CONVERSATIONS_API, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw await conversationError(response)
  return response.json() as Promise<PersistedConversation<TState>>
}

export async function updateConversation<TState extends Record<string, unknown>>(
  conversationId: string,
  payload: ConversationWrite<TState>,
): Promise<PersistedConversation<TState>> {
  const response = await fetch(`${CONVERSATIONS_API}/${encodeURIComponent(conversationId)}`, {
    method: "PUT",
    headers: headers(true),
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw await conversationError(response)
  return response.json() as Promise<PersistedConversation<TState>>
}

export async function deleteConversation(conversationId: string): Promise<void> {
  const response = await fetch(`${CONVERSATIONS_API}/${encodeURIComponent(conversationId)}`, {
    method: "DELETE",
    headers: headers(),
  })
  if (!response.ok) throw await conversationError(response)
}
