"use client"

import { useState } from "react"
import { ExternalLink, KeyRound, ShieldCheck, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  type DeepSeekModel,
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
  const [model, setModel] = useState<DeepSeekModel>(initialSettings.model)
  const [remember, setRemember] = useState(initialSettings.remember)
  const [error, setError] = useState("")

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!apiKey.trim()) {
      setError("Enter a DeepSeek API key to continue.")
      return
    }
    setError("")
    onSaved(saveAgentSettings({ apiKey, model, remember }))
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="deepseek-api-key">DeepSeek API key</Label>
          <a
            href="https://platform.deepseek.com/api_keys"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
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
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="sk-…"
            className="pl-10 font-mono"
            aria-invalid={Boolean(error)}
          />
        </div>
        {error && <p className="text-xs text-rose-600 dark:text-rose-300">{error}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="deepseek-model">Model</Label>
        <Select value={model} onValueChange={(value) => setModel(value as DeepSeekModel)}>
          <SelectTrigger id="deepseek-model" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="deepseek-v4-pro">DeepSeek V4 Pro · best quality</SelectItem>
            <SelectItem value="deepseek-v4-flash">DeepSeek V4 Flash · faster</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/35 p-3.5">
        <Checkbox
          checked={remember}
          onCheckedChange={(checked) => setRemember(checked === true)}
          className="mt-0.5"
        />
        <span>
          <span className="block text-sm font-semibold">Remember on this device</span>
          <span className="mt-1 block text-[11px] leading-5 text-muted-foreground">
            Off by default. When off, the key lasts only for this browser session.
          </span>
        </span>
      </label>

      <div className="flex gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-[11px] leading-5 text-emerald-950 dark:border-emerald-900/70 dark:bg-emerald-950/25 dark:text-emerald-100">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          The key is never saved to the study database or logs. Requests are restricted to
          DeepSeek&apos;s official API host.
        </p>
      </div>

      <DialogFooter className="sm:justify-stretch">
        <Button type="submit" className="w-full rounded-xl">
          <Sparkles className="h-4 w-4" /> {submitLabel}
        </Button>
      </DialogFooter>
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
              Add your DeepSeek key so the Agent can interpret each answer and generate the next
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
