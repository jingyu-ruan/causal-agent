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
  X,
} from "lucide-react"

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
    <Link href="/" onClick={onClick} className="group flex items-center rounded-xl" aria-label="Causal Agent home">
      <span className="leading-none">
        <span className="block text-[13px] font-extrabold tracking-[-0.03em]">Causal Agent</span>
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
    <header className="pointer-events-none sticky top-0 z-50">
      <div className="page-shell flex h-[76px] items-start justify-center pt-3">
        <div className="pointer-events-auto hidden items-center gap-1 rounded-[1.15rem] border border-slate-950/10 bg-background/82 p-1.5 shadow-[0_14px_42px_-24px_rgba(15,23,42,0.45)] backdrop-blur-xl md:flex dark:border-white/10 dark:bg-background/78">
          <div className="px-3">
            <Brand onClick={() => setOpen(false)} />
          </div>
          <span className="mx-1 h-5 w-px bg-slate-950/10 dark:bg-white/10" aria-hidden="true" />
          <Navigation pathname={pathname} />
          <span className="mx-1 h-5 w-px bg-slate-950/10 dark:bg-white/10" aria-hidden="true" />
          <ThemeToggle />
          <Button asChild size="sm" className="h-9 rounded-xl bg-slate-900 px-4 text-white hover:bg-slate-800 dark:bg-slate-200 dark:text-slate-950 dark:hover:bg-white">
            <Link href="/studies/new">
              <FilePlus2 className="h-4 w-4" />
              New study
            </Link>
          </Button>
        </div>

        <div className="pointer-events-auto flex w-full items-center justify-between gap-2 rounded-[1.15rem] border border-slate-950/10 bg-background/86 p-1.5 pl-3 shadow-[0_14px_42px_-24px_rgba(15,23,42,0.45)] backdrop-blur-xl md:hidden dark:border-white/10 dark:bg-background/82">
          <Brand onClick={() => setOpen(false)} />
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button asChild size="sm" className="h-9 rounded-xl bg-slate-900 px-3 text-white hover:bg-slate-800 dark:bg-slate-200 dark:text-slate-950 dark:hover:bg-white">
              <Link href="/studies/new" onClick={() => setOpen(false)}>
                <FilePlus2 className="h-4 w-4" />
                <span className="hidden min-[390px]:inline">New study</span>
              </Link>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setOpen((value) => !value)}
              aria-label={open ? "Close navigation" : "Open navigation"}
              aria-expanded={open}
              aria-controls="mobile-navigation"
              className="rounded-full"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>
      </div>

      {open && (
        <div className="pointer-events-auto fixed inset-x-0 top-[76px] z-50 min-h-[calc(100vh-76px)] bg-slate-950/25 p-3 backdrop-blur-sm md:hidden" onClick={() => setOpen(false)}>
          <div
            id="mobile-navigation"
            className="surface-card mx-auto max-w-md bg-popover p-3 shadow-2xl"
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
