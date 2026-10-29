"use client"

import { flushSync } from "react-dom"
import { useTheme } from "next-themes"
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  function toggle() {
    const next = resolvedTheme === "dark" ? "light" : "dark"
    if (document.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      document.startViewTransition(() => { flushSync(() => setTheme(next)) })
    } else {
      setTheme(next)
    }
  }
  return <Button type="button" variant="ghost" size="icon-sm" onClick={toggle} aria-label="Toggle color theme" title="Toggle color theme" className="theme-toggle text-muted-foreground">
    <Moon className="h-4 w-4 dark:hidden" /><Sun className="hidden h-4 w-4 dark:block" />
  </Button>
}
