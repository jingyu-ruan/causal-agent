import { useSyncExternalStore } from "react"

export type DeepSeekModel = "deepseek-v4-pro" | "deepseek-v4-flash"

export interface AgentSettings {
  apiKey: string
  model: DeepSeekModel
  remember: boolean
}

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  apiKey: "",
  model: "deepseek-v4-pro",
  remember: false,
}

const SESSION_KEY = "causal-agent-deepseek-session"
const PERSISTED_KEY = "causal-agent-deepseek-persisted"
const CHANGE_EVENT = "causal-agent-settings-changed"

let cachedSession: string | null | undefined
let cachedPersisted: string | null | undefined
let cachedSettings: AgentSettings = DEFAULT_AGENT_SETTINGS
let volatileSettings: AgentSettings | null = null

function parseSettings(raw: string | null): AgentSettings | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<AgentSettings>
    const model = value.model === "deepseek-v4-flash" ? value.model : "deepseek-v4-pro"
    return {
      apiKey: typeof value.apiKey === "string" ? value.apiKey : "",
      model,
      remember: value.remember === true,
    }
  } catch {
    return null
  }
}

export function loadAgentSettings(): AgentSettings {
  if (typeof window === "undefined") return DEFAULT_AGENT_SETTINGS
  try {
    const session = window.sessionStorage.getItem(SESSION_KEY)
    const persisted = window.localStorage.getItem(PERSISTED_KEY)
    if (session === cachedSession && persisted === cachedPersisted) return cachedSettings
    cachedSession = session
    cachedPersisted = persisted
    cachedSettings = parseSettings(session) ?? parseSettings(persisted) ?? volatileSettings ?? DEFAULT_AGENT_SETTINGS
    return cachedSettings
  } catch {
    return volatileSettings ?? DEFAULT_AGENT_SETTINGS
  }
}

export function saveAgentSettings(settings: AgentSettings): AgentSettings {
  const normalized: AgentSettings = {
    apiKey: settings.apiKey.trim(),
    model: settings.model,
    remember: settings.remember,
  }
  if (typeof window === "undefined") return normalized

  volatileSettings = normalized
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(normalized))
    if (normalized.remember) {
      window.localStorage.setItem(PERSISTED_KEY, JSON.stringify(normalized))
    } else {
      window.localStorage.removeItem(PERSISTED_KEY)
    }
  } catch {
    // In-memory settings still keep the current page usable when storage is blocked.
  }
  cachedSession = undefined
  cachedPersisted = undefined
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
  return normalized
}

export function clearAgentSettings() {
  if (typeof window === "undefined") return
  volatileSettings = null
  try {
    window.sessionStorage.removeItem(SESSION_KEY)
    window.localStorage.removeItem(PERSISTED_KEY)
  } catch {
    // Storage may be unavailable in a privacy-restricted browser context.
  }
  cachedSession = undefined
  cachedPersisted = undefined
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
}

function subscribe(listener: () => void) {
  if (typeof window === "undefined") return () => undefined
  window.addEventListener(CHANGE_EVENT, listener)
  window.addEventListener("storage", listener)
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener)
    window.removeEventListener("storage", listener)
  }
}

export function useAgentSettings() {
  return useSyncExternalStore(subscribe, loadAgentSettings, () => DEFAULT_AGENT_SETTINGS)
}
