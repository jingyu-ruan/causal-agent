"use client"

import { useEffect, useState } from "react"
import Link from "@/components/page-link"
import { usePathname } from "next/navigation"
import { FlaskConical, FolderOpen, GitBranch, LayoutGrid, Network, Menu, Plus, Settings2, X } from "lucide-react"

import { CausalMark } from "@/components/causal-mark"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const navigation = [
  { name: "Overview", href: "/", icon: LayoutGrid },
  { name: "Case collection", href: "/cases", icon: FolderOpen },
  { name: "Causal graph studio", href: "/research/graph", icon: Network },
  { name: "Simulation lab", href: "/research/lab", icon: FlaskConical },
  { name: "Compare studies", href: "/research/compare", icon: GitBranch },
  { name: "Live demonstration", href: "/studies/replay", icon: FlaskConical },
  { name: "Study library", href: "/studies", icon: FolderOpen },
  { name: "Settings", href: "/settings", icon: Settings2 },
]

function currentPage(path: string) {
  if (path.startsWith("/research/case/")) return "Case evidence"
  if (path.startsWith("/research/project/")) return "Research evidence"
  if (path.startsWith("/studies/replay")) return "Live demonstration"
  if (path.startsWith("/studies/")) return "Evidence report"
  return navigation.find((item) => item.href === path)?.name ?? "Workspace"
}

export function Sidebar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false) }
    window.addEventListener("keydown", close)
    return () => window.removeEventListener("keydown", close)
  }, [open])

  if (pathname === "/studies/new") return null

  return <>
    {open && <button type="button" className="nav-scrim" aria-label="Close navigation" onClick={() => setOpen(false)} />}
    <aside className={cn("workspace-nav", open && "is-open")} aria-label="Workspace navigation" id="workspace-navigation">
      <Link href="/" className="workspace-brand">
        <CausalMark className="h-8 w-8 text-primary" />
        <span><strong>Causal Agent</strong><span>Research workspace</span></span>
      </Link>
      <nav className="space-y-1">
        {navigation.map(({ href, name, icon: Icon }) => {
          const active = href === "/studies" ? pathname.startsWith("/studies") && !pathname.startsWith("/studies/replay") : pathname === href
          return <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined} className={cn("workspace-nav-link", active && "is-current")}><Icon className="h-[17px] w-[17px]" />{name}</Link>
        })}
      </nav>
      <Button asChild className="mt-5 h-10 justify-start rounded-lg shadow-none"><Link href="/studies/new"><Plus className="h-4 w-4" />New study</Link></Button>
    </aside>
    <header className="workspace-topbar">
      <div className="flex min-w-0 items-center gap-2.5">
        <Button type="button" variant="ghost" size="icon" className="-ml-2 lg:hidden" onClick={() => setOpen((value) => !value)} aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="workspace-navigation">{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</Button>
        <span className="truncate text-[14px] font-medium">{currentPage(pathname)}</span>
      </div>
      <ThemeToggle />
    </header>
  </>
}
