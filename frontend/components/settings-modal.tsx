"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getSettings, saveSettings, AppSettings } from "@/lib/settings"

interface SettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const [settings, setSettings] = useState<AppSettings>({
    openaiApiKey: "",
    openaiBaseUrl: "",
    openaiModel: ""
  })

  useEffect(() => {
    if (open) {
      setSettings(getSettings())
    }
  }, [open])

  const handleSave = () => {
    saveSettings(settings)
    onOpenChange(false)
    window.location.reload() 
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>API Settings</DialogTitle>
          <DialogDescription>
            Configure your LLM API settings. These are stored locally in your browser.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="apiKey" className="text-right">
              API Key
            </Label>
            <Input
              id="apiKey"
              value={settings.openaiApiKey}
              onChange={(e) => setSettings({ ...settings, openaiApiKey: e.target.value })}
              className="col-span-3"
              type="password"
              placeholder="sk-..."
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="baseUrl" className="text-right">
              Base URL
            </Label>
            <Input
              id="baseUrl"
              value={settings.openaiBaseUrl}
              onChange={(e) => setSettings({ ...settings, openaiBaseUrl: e.target.value })}
              className="col-span-3"
              placeholder="https://api.openai.com/v1"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="model" className="text-right">
              Model
            </Label>
            <Input
              id="model"
              value={settings.openaiModel}
              onChange={(e) => setSettings({ ...settings, openaiModel: e.target.value })}
              className="col-span-3"
              placeholder="gpt-4"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
