"use client"

import { useState } from "react"
import { CheckCircle2, KeyRound, Trash2 } from "lucide-react"

import { AgentSettingsForm } from "@/components/agent-settings"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  clearAgentSettings,
  useAgentSettings,
} from "@/lib/agent-settings"

export default function SettingsPage() {
  const settings = useAgentSettings()
  const [saved, setSaved] = useState(false)

  return (
    <div className="page-shell py-10 sm:py-14">
      <div className="mx-auto max-w-2xl">
        <div className="mb-7">
          <p className="eyebrow"><KeyRound className="h-4 w-4" /> Agent configuration</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">DeepSeek settings</h1>
          <p className="mt-3 max-w-xl text-sm leading-7 text-muted-foreground">
            Configure the model that interprets study answers and creates interactive follow-up
            forms. Analysis and causal calculations remain in deterministic tools.
          </p>
        </div>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Study Agent</CardTitle>
            <CardDescription>
              The same settings are available from the popup on the New study page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AgentSettingsForm
              key={`${settings.model}-${settings.remember}-${settings.apiKey ? "configured" : "empty"}`}
              initialSettings={settings}
              onSaved={() => {
                setSaved(true)
                window.setTimeout(() => setSaved(false), 2200)
              }}
            />
            {saved && (
              <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300" role="status">
                <CheckCircle2 className="h-4 w-4" /> Settings saved.
              </p>
            )}
            {settings.apiKey && (
              <div className="mt-6 border-t border-border pt-5">
                <Button
                  type="button"
                  variant="outline"
                  className="text-rose-700 hover:text-rose-800 dark:text-rose-300"
                  onClick={() => {
                    clearAgentSettings()
                    setSaved(false)
                  }}
                >
                  <Trash2 className="h-4 w-4" /> Remove saved key
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
