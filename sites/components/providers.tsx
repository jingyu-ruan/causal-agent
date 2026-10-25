"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import { useState } from "react"
import { BackendReadinessProvider } from "@/components/backend-readiness"

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <NextThemesProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <BackendReadinessProvider>
          {children}
        </BackendReadinessProvider>
      </NextThemesProvider>
    </QueryClientProvider>
  )
}
