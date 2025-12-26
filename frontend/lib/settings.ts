export interface AppSettings {
  openaiApiKey: string;
  openaiBaseUrl: string;
  openaiModel: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  openaiApiKey: "",
  openaiBaseUrl: "https://api.deepseek.com",
  openaiModel: "deepseek-chat",
};

export const SETTINGS_KEY = "causal-agent-settings";

export function getSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  const stored = localStorage.getItem(SETTINGS_KEY);
  if (!stored) return DEFAULT_SETTINGS;
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function getApiHeaders() {
  const settings = getSettings();
  return {
    "X-OpenAI-Key": settings.openaiApiKey,
    "X-OpenAI-Base-URL": settings.openaiBaseUrl,
    "X-OpenAI-Model": settings.openaiModel,
  };
}
