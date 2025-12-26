"use client"

import { useTheme } from "next-themes"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Moon, Sun, User, Shield, Bell } from "lucide-react"
import { useEffect, useState } from "react"
import { getSettings, saveSettings, AppSettings } from "@/lib/settings"

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const [settings, setSettings] = useState<AppSettings>({
    openaiApiKey: "",
    openaiBaseUrl: "",
    openaiModel: ""
  })

  useEffect(() => {
    setSettings(getSettings())
  }, [])

  const handleSaveApi = () => {
    saveSettings(settings)
    // Optional: show toast
    alert("API Settings Saved")
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Settings</h1>
        <p className="text-slate-500 dark:text-slate-400">Manage your account preferences and system configuration.</p>
      </div>

      <div className="grid gap-6">
        {/* Appearance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sun className="h-5 w-5" />
              Appearance
            </CardTitle>
            <CardDescription>Customize the look and feel of the application.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Dark Mode</Label>
                <p className="text-sm text-slate-500">Switch between light and dark themes.</p>
              </div>
              <div className="flex items-center gap-2">
                <Sun className="h-4 w-4 text-slate-500" />
                <Switch 
                    checked={theme === "dark"}
                    onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
                />
                <Moon className="h-4 w-4 text-slate-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Account */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Account
            </CardTitle>
            <CardDescription>Update your personal information.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Full Name</Label>
                    <Input defaultValue="User" />
                </div>
                <div className="space-y-2">
                    <Label>Email</Label>
                    <Input defaultValue="user@example.com" />
                </div>
            </div>
            <Button variant="outline">Save Changes</Button>
          </CardContent>
        </Card>
        
        {/* System */}
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    API Configuration
                </CardTitle>
                <CardDescription>Configure LLM API connections.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label>API Key</Label>
                    <Input 
                        type="password" 
                        value={settings.openaiApiKey}
                        onChange={(e) => setSettings({...settings, openaiApiKey: e.target.value})}
                        placeholder="sk-..." 
                    />
                </div>
                 <div className="space-y-2">
                    <Label>Base URL</Label>
                    <Input 
                        value={settings.openaiBaseUrl}
                        onChange={(e) => setSettings({...settings, openaiBaseUrl: e.target.value})}
                        placeholder="https://api.openai.com/v1" 
                    />
                </div>
                 <div className="space-y-2">
                    <Label>Model</Label>
                    <Input 
                        value={settings.openaiModel}
                        onChange={(e) => setSettings({...settings, openaiModel: e.target.value})}
                        placeholder="gpt-4" 
                    />
                </div>
                <Button onClick={handleSaveApi}>Save API Settings</Button>
            </CardContent>
        </Card>
      </div>
    </div>
  )
}
