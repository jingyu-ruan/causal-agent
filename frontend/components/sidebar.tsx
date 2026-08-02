"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import {
  ArrowUpRight,
  BookOpenCheck,
  FilePlus2,
  FolderKanban,
  Home,
  Menu,
  Moon,
  Settings2,
  Sun,
  Workflow,
  X,
} from "lucide-react"

import { BackendStatusPill } from "@/components/backend-readiness"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const navigation = [
  { name: "Overview", href: "/", icon: Home },
  { name: "Studies", href: "/studies", icon: FolderKanban },
  { name: "Settings", href: "/settings", icon: Settings2 },
]

function isCurrent(pathname: string, href: string) {
  if (href === "/") return pathname === "/"
  return pathname === href || (pathname.startsWith(`${href}/`) && pathname !== "/studies/new")
}

function Brand({ onClick }: { onClick?: () => void }) {
  return (
    <Link href="/" onClick={onClick} className="group flex items-center gap-3 rounded-xl" aria-label="Causal Decision home">
      <span className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-[0.65rem] bg-slate-900 text-slate-200 shadow-[0_8px_22px_-14px_rgba(15,23,42,0.65)] dark:bg-slate-200 dark:text-slate-950">
        <Workflow className="h-[18px] w-[18px]" strokeWidth={2.1} />
        <span className="absolute inset-x-1 bottom-0 h-px bg-slate-300/70 dark:bg-slate-950/40" />
      </span>
      <span className="leading-none">
        <span className="block text-[13px] font-extrabold tracking-[-0.03em]">Causal Decision</span>
        <span className="mt-1 block font-mono text-[8px] font-semibold uppercase tracking-[0.2em] text-slate-700/60 dark:text-slate-200/60">Evidence OS</span>
      </span>
    </Link>
  )
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const dark = resolvedTheme === "dark"
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={() => setTheme(dark ? "light" : "dark")}
      className="rounded-full text-muted-foreground hover:bg-black/[0.05] hover:text-foreground dark:hover:bg-white/10"
      aria-label="Toggle color theme"
      title="Toggle color theme"
    >
      <Moon className="h-4 w-4 dark:hidden" />
      <Sun className="hidden h-4 w-4 dark:block" />
    </Button>
  )
}

function Navigation({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Primary navigation" className="flex flex-col gap-1 md:flex-row md:items-center">
      {navigation.map((item) => {
        const active = isCurrent(pathname, item.href)
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors",
              active
                ? "bg-slate-950 text-white dark:bg-slate-300 dark:text-slate-950"
                : "text-muted-foreground hover:bg-black/[0.05] hover:text-foreground dark:hover:bg-white/[0.07]",
            )}
          >
            <Icon className="h-4 w-4 md:hidden" />
            {item.name}
          </Link>
        )
      })}
    </nav>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open])

  if (pathname === "/studies/new") return null

  return (
    <header className="sticky top-0 z-50 border-b border-slate-950/10 bg-[#f7f7f5]/90 backdrop-blur-xl dark:border-white/10 dark:bg-[#17191d]/90">
      <div className="page-shell flex h-[68px] items-center justify-between gap-4">
        <Brand onClick={() => setOpen(false)} />

        <div className="hidden items-center gap-1 rounded-full border border-slate-950/10 bg-white/55 p-1 shadow-sm shadow-slate-950/[0.03] md:flex dark:border-white/10 dark:bg-white/[0.04]">
          <Navigation pathname={pathname} />
        </div>

        <div className="hidden items-center gap-2 sm:flex">
          <BackendStatusPill className="hidden xl:inline-flex" />
          <ThemeToggle />
          <Button asChild size="sm" className="h-9 rounded-lg bg-slate-900 px-4 text-white hover:bg-slate-800 dark:bg-slate-200 dark:text-slate-950 dark:hover:bg-white">
            <Link href="/studies/new">
              <FilePlus2 className="h-4 w-4" />
              New study
            </Link>
          </Button>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setOpen((value) => !value)}
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          aria-controls="mobile-navigation"
          className="rounded-full sm:hidden"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {open && (
        <div className="fixed inset-x-0 top-[68px] z-50 min-h-[calc(100vh-68px)] bg-slate-950/25 p-3 backdrop-blur-sm sm:hidden" onClick={() => setOpen(false)}>
          <div
            id="mobile-navigation"
            className="surface-card mx-auto max-w-md bg-[#fbfaf4] p-3 shadow-2xl dark:bg-[#172a21]"
            onClick={(event) => event.stopPropagation()}
          >
            <Navigation pathname={pathname} onNavigate={() => setOpen(false)} />
            <div className="my-3 h-px bg-slate-950/10 dark:bg-white/10" />
            <Button asChild className="h-11 w-full justify-between rounded-xl bg-slate-950 px-4 text-white dark:bg-slate-300 dark:text-slate-950">
              <Link href="/studies/new" onClick={() => setOpen(false)}>
                <span className="flex items-center gap-2"><FilePlus2 className="h-4 w-4" /> New study</span>
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-950/[0.045] px-3 py-2.5 dark:bg-white/[0.05]">
              <BackendStatusPill />
              <ThemeToggle />
            </div>
            <Link href="/studies?demo=rct" onClick={() => setOpen(false)} className="mt-1 flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.05]">
              <span className="flex items-center gap-2"><BookOpenCheck className="h-4 w-4" /> Verified RCT demo</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}
    </header>
  )
}
