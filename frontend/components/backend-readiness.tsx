"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { AlertCircle, CheckCircle2, LoaderCircle, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { checkBackendReady } from "@/lib/studies-api"
import { cn } from "@/lib/utils"

type ReadinessState = "checking" | "warming" | "ready" | "unavailable"

type ReadinessContextValue = {
  state: ReadinessState
  elapsedSeconds: number
  retry: () => void
}

const ReadinessContext = createContext<ReadinessContextValue | null>(null)
const COLD_START_BUDGET_SECONDS = 150

export function BackendReadinessProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ReadinessState>("checking")
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const startedAt = useRef<number | null>(null)

  const retry = useCallback(() => {
    startedAt.current = Date.now()
    setElapsedSeconds(0)
    setState("checking")
    setAttempt((value) => value + 1)
  }, [])

  useEffect(() => {
    let active = true
    let pollTimer: ReturnType<typeof setTimeout> | undefined
    if (startedAt.current === null) startedAt.current = Date.now()

    const poll = async () => {
      const controller = new AbortController()
      const abortTimer = setTimeout(() => controller.abort(), 4500)
      try {
        const ready = await checkBackendReady(controller.signal)
        if (!active) return
        if (ready) {
          setState("ready")
          clearInterval(clockTimer)
          return
        }
      } catch {
        // Connection errors are expected while a free Render instance wakes.
      } finally {
        clearTimeout(abortTimer)
      }

      if (!active) return
      const elapsed = Math.floor((Date.now() - (startedAt.current ?? Date.now())) / 1000)
      setElapsedSeconds(elapsed)
      setState(elapsed >= COLD_START_BUDGET_SECONDS ? "unavailable" : "warming")
      pollTimer = setTimeout(poll, elapsed >= COLD_START_BUDGET_SECONDS ? 15000 : 5000)
    }

    const clockTimer = setInterval(() => {
      if (!active) return
      setElapsedSeconds(Math.floor((Date.now() - (startedAt.current ?? Date.now())) / 1000))
    }, 1000)
    void poll()

    return () => {
      active = false
      if (pollTimer) clearTimeout(pollTimer)
      clearInterval(clockTimer)
    }
  }, [attempt])

  const value = useMemo(
    () => ({ state, elapsedSeconds, retry }),
    [state, elapsedSeconds, retry],
  )

  return <ReadinessContext.Provider value={value}>{children}</ReadinessContext.Provider>
}

export function useBackendReadiness() {
  const context = useContext(ReadinessContext)
  if (!context) throw new Error("useBackendReadiness must be used within BackendReadinessProvider")
  return context
}

export function BackendStatusPill({ className }: { className?: string }) {
  const { state, retry } = useBackendReadiness()

  const content = {
    checking: { label: "Checking engine", icon: LoaderCircle, style: "text-slate-700 bg-slate-200/60 dark:bg-white/[0.07] dark:text-white/65" },
    warming: { label: "Engine warming", icon: LoaderCircle, style: "text-amber-800 bg-amber-100/70 dark:bg-amber-300/10 dark:text-amber-200" },
    ready: { label: "Engine ready", icon: CheckCircle2, style: "text-emerald-800 bg-emerald-50 dark:bg-emerald-300/10 dark:text-emerald-300" },
    unavailable: { label: "Engine unavailable", icon: AlertCircle, style: "text-rose-800 bg-rose-100/70 dark:bg-rose-300/10 dark:text-rose-200" },
  }[state]
  const Icon = content.icon
  const pillClassName = cn(
    "inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.1em]",
    content.style,
    className,
  )

  if (state === "unavailable") {
    return (
      <button type="button" className={cn(pillClassName, "transition-opacity hover:opacity-80")} onClick={retry} title="Retry engine connection" aria-label="Engine unavailable. Retry connection">
        <Icon className="h-3.5 w-3.5" />
        {content.label}
      </button>
    )
  }

  return (
    <div
      className={pillClassName}
      role="status"
      aria-live="polite"
    >
      <Icon className={cn("h-3.5 w-3.5", (state === "checking" || state === "warming") && "animate-spin")} />
      {content.label}
    </div>
  )
}

export function BackendStatusBanner() {
  const { state, elapsedSeconds, retry } = useBackendReadiness()
  if (state === "ready") return null

  const isUnavailable = state === "unavailable"
  return (
    <div
      className={cn(
        "border-b px-4 py-2.5 text-xs sm:px-6 lg:px-8",
        isUnavailable
          ? "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100"
          : "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
      )}
      role={isUnavailable ? "alert" : "status"}
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isUnavailable ? (
            <AlertCircle className="h-4 w-4 shrink-0" />
          ) : (
            <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" />
          )}
          <span>
            {isUnavailable
              ? "The analysis engine did not become ready. Your draft is safe in this page; retry when convenient."
              : `Waking the analysis engine — free hosting can take up to 2 minutes${elapsedSeconds > 0 ? ` (${elapsedSeconds}s)` : ""}. You can keep designing while it starts.`}
          </span>
        </div>
        {isUnavailable && (
          <Button type="button" variant="outline" size="sm" onClick={retry} className="h-7 rounded-full bg-white/70">
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </Button>
        )}
      </div>
    </div>
  )
}
