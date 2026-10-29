"use client"

import { useState } from "react"
import Link from "@/components/page-link"
import { ExternalLink, KeyRound, ShieldCheck, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  saveAgentSettings,
  type AgentSettings,
  type AgentModel,
} from "@/lib/agent-settings"

type AgentSettingsFormProps = {
  initialSettings: AgentSettings
  onSaved: (settings: AgentSettings) => void
  submitLabel?: string
}

export function AgentSettingsForm({
  initialSettings,
  onSaved,
  submitLabel = "Save settings",
}: AgentSettingsFormProps) {
  const [apiKey, setApiKey] = useState(initialSettings.apiKey)
  const [model, setModel] = useState<AgentModel>(initialSettings.model)
  const openRouter = model === "openrouter/free"
  const [remember, setRemember] = useState(initialSettings.remember)
  const [error, setError] = useState("")
  const [connection, setConnection] = useState<"idle" | "testing" | "verified">("idle")

  const testConnection = async () => {
    setError("")
    setConnection("testing")
    try {
      const { runIntakeAgent } = await import("@/lib/agent-api")
      await runIntakeAgent({ messages: [{ role: "user", content: "I am planning a prospective randomized experiment. Help me define its business question." }], draft: {}, captured_fields: [], model, locale: "en" }, apiKey)
      setConnection("verified")
    } catch (failure) {
      setConnection("idle")
      setError(failure instanceof Error ? failure.message : "The connection test failed. Please try again.")
    }
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!apiKey.trim()) {
      setError("Enter an API key to continue.")
      return
    }
    if (openRouter !== apiKey.trim().startsWith("sk-or-")) {
      setError(openRouter ? "Enter an OpenRouter key for the free model router." : "Select OpenRouter Free for an OpenRouter key.")
      return
    }
    setError("")
    onSaved(saveAgentSettings({ apiKey, model, remember }))
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="deepseek-api-key">{openRouter ? "OpenRouter API key" : "DeepSeek API key"}</Label>
          <a
            href={openRouter ? "https://openrouter.ai/workspaces/default/keys" : "https://platform.deepseek.com/api_keys"}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[14px] font-semibold text-muted-foreground hover:text-foreground"
          >
            Create a key <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <div className="relative">
          <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="deepseek-api-key"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(event) => { setApiKey(event.target.value); setConnection("idle") }}
            placeholder="sk-…"
            className="pl-10 font-mono"
            aria-invalid={Boolean(error)}
          />
        </div>
        {error && <p className="text-sm text-rose-600 dark:text-rose-300">{error}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="deepseek-model">Model</Label>
        <Select value={model} onValueChange={(value) => { setModel(value as AgentModel); setConnection("idle") }}>
          <SelectTrigger id="deepseek-model" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="openrouter/free">OpenRouter Free — automatic free model</SelectItem>
            <SelectItem value="deepseek-v4-pro">DeepSeek V4 Pro · best quality</SelectItem>
            <SelectItem value="deepseek-v4-flash">DeepSeek V4 Flash · faster</SelectItem>
          </SelectContent>
        </Select>
        {openRouter && <p className="text-sm leading-5 text-muted-foreground">OpenRouter selects a free model for each request. Your study conversation is sent directly to OpenRouter. Free usage has rate limits.</p>}
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/35 p-3.5">
        <Checkbox
          checked={remember}
          onCheckedChange={(checked) => setRemember(checked === true)}
          className="mt-0.5"
        />
        <span>
          <span className="block text-sm font-semibold">Remember on this device</span>
          <span className="mt-1 block text-[14px] leading-5 text-muted-foreground">
            Off by default. When off, the key lasts only for this browser session.
          </span>
        </span>
      </label>

      <p className="flex items-center gap-2 text-[14px] text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />Session-only by default. Device memory can be enabled above.</p>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 p-3.5">
        <div><p className="text-sm font-semibold">Just exploring the product?</p><p className="mt-1 text-[14px] leading-5 text-muted-foreground">Load synthetic data and run a complete study with the statistical engine.</p></div>
        <Button asChild type="button" variant="outline" size="sm" className="shrink-0 rounded-lg"><Link href="/studies/replay">Live demo</Link></Button>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_minmax(0,1fr)]">
        <Button type="button" variant="outline" className="min-w-0 w-full" disabled={!apiKey.trim() || connection === "testing"} onClick={testConnection}>
          {connection === "testing" ? "Testing connection…" : "Test connection"}
        </Button>
        <Button type="submit" className="min-w-0 w-full rounded-xl">
          <Sparkles className="h-4 w-4" /> {submitLabel}
        </Button>
      </div>
      {connection === "verified" && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">Connection verified. The Agent returned a valid study form.</p>}
    </form>
  )
}

type AgentSettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: AgentSettings
  onSaved: (settings: AgentSettings) => void
}

export function AgentSettingsDialog({
  open,
  onOpenChange,
  settings,
  onSaved,
}: AgentSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-xl">
        <div className="border-b border-border bg-muted/35 px-6 py-5">
          <DialogHeader>
            <div className="mb-1 grid h-10 w-10 place-items-center rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950">
              <Sparkles className="h-5 w-5" />
            </div>
            <DialogTitle>Connect the study Agent</DialogTitle>
            <DialogDescription className="leading-6">
              Add your OpenRouter or DeepSeek key so the Agent can interpret each answer and generate the next
              interactive question.
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="px-6 pb-6">
          <AgentSettingsForm
            initialSettings={settings}
            submitLabel="Save and start Agent"
            onSaved={(value) => {
              onSaved(value)
              onOpenChange(false)
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
