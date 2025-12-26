"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import { useState, useEffect } from "react"
import { SettingsModal } from "@/components/settings-modal"
import { getSettings } from "@/lib/settings"

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  const [mounted, setMounted] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    setMounted(true)
    const settings = getSettings()
    if (!settings.openaiApiKey) {
      setShowSettings(true)
    }
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      {mounted ? (
        <NextThemesProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <SettingsModal open={showSettings} onOpenChange={setShowSettings} />
        </NextThemesProvider>
      ) : (
        children
      )}
    </QueryClientProvider>
  )
}
