"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "@/components/page-link"
import { usePathname } from "next/navigation"
import { ChevronDown, FlaskConical, FolderOpen, GitBranch, LayoutGrid, Library, Menu, Network, Play, Plus, Settings2, X } from "lucide-react"

import { CausalMark } from "@/components/causal-mark"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Destination = {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  /** Route prefixes that also belong to this destination. */
  match?: string[]
  /** Route prefixes owned by a sibling destination. */
  except?: string[]
}

/** Row order: the first two sit before the Tools menu, the rest after it. */
const destinations: Destination[] = [
  { name: "Overview", href: "/", icon: LayoutGrid },
  { name: "Cases", href: "/cases", icon: Library, match: ["/cases", "/research/case"] },
  { name: "Studies", href: "/studies", icon: FolderOpen, except: ["/studies/replay", "/studies/new"] },
  { name: "Live demonstration", href: "/studies/replay", icon: Play },
]

const tools: Destination[] = [
  { name: "Causal graph studio", href: "/research/graph", icon: Network },
  { name: "Simulation lab", href: "/research/lab", icon: FlaskConical, match: ["/research/lab", "/research/project"] },
  { name: "Compare studies", href: "/research/compare", icon: GitBranch },
]

const settings: Destination = { name: "Settings", href: "/settings", icon: Settings2 }

function covers(prefix: string, pathname: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

function isCurrent(pathname: string, item: Destination) {
  if (item.href === "/") return pathname === "/"
  const owned = (item.match ?? [item.href]).some((prefix) => covers(prefix, pathname))
  return owned && !(item.except ?? []).some((prefix) => covers(prefix, pathname))
}

function roam(event: React.KeyboardEvent<HTMLDivElement>) {
  const keys = ["ArrowDown", "ArrowUp", "Home", "End"]
  if (!keys.includes(event.key)) return
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[data-nav-item]"))
  if (!items.length) return
  const index = items.indexOf(document.activeElement as HTMLElement)
  const next = event.key === "Home" ? 0
    : event.key === "End" ? items.length - 1
    : event.key === "ArrowDown" ? Math.min(index + 1, items.length - 1)
    : Math.max(index - 1, 0)
  event.preventDefault()
  items[index < 0 ? 0 : next].focus()
}

type TriggerProps = {
  ref: React.RefObject<HTMLButtonElement | null>
  "aria-expanded": boolean
  "aria-controls": string | undefined
  onClick: (event: React.MouseEvent) => void
  onKeyDown: (event: React.KeyboardEvent) => void
}

/**
 * One disclosure menu. The open state lives here and the navigation remounts
 * this component for every route, so no menu can survive or be revived by a
 * link, a programmatic push, or Back and Forward.
 */
function NavMenu({ id, items, pathname, action = false, onOpenChange, children }: {
  id: string
  items: Destination[]
  pathname: string
  action?: boolean
  /** Lets the navigation stay on screen while this panel is open. */
  onOpenChange?: (id: string, open: boolean) => void
  children: (trigger: TriggerProps, open: boolean) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  function focusFirstItem() {
    requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>("[data-nav-item]")?.focus())
  }

  // Report closed on unmount too, so the per-route remount cannot leave a hold.
  useEffect(() => {
    onOpenChange?.(id, open)
    return () => onOpenChange?.(id, false)
  }, [id, open, onOpenChange])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setOpen(false)
      trigger.current?.focus()
    }
    const onOutside = (event: Event) => {
      const target = event.target as Node
      if (panel.current?.contains(target) || trigger.current?.contains(target)) return
      setOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    document.addEventListener("pointerdown", onOutside)
    document.addEventListener("focusin", onOutside)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      document.removeEventListener("pointerdown", onOutside)
      document.removeEventListener("focusin", onOutside)
    }
  }, [open])

  const triggerProps: TriggerProps = {
    ref: trigger,
    "aria-expanded": open,
    "aria-controls": open ? id : undefined,
    onClick: (event) => {
      if (open) { setOpen(false); return }
      setOpen(true)
      // detail === 0 marks keyboard activation; move into the panel only then.
      if (event.detail === 0) focusFirstItem()
    },
    onKeyDown: (event) => {
      if (event.key !== "ArrowDown" || open) return
      event.preventDefault()
      setOpen(true)
      focusFirstItem()
    },
  }

  /** Keep the menu open for a modifier click that opens a new tab. */
  function dismiss(event: React.MouseEvent) {
    if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey)
      setOpen(false)
  }

  return <>
    {children(triggerProps, open)}
    {open && <div ref={panel} id={id} className="site-nav-panel" onKeyDown={roam}>
      {items.map((item, index) => {
        const current = isCurrent(pathname, item)
        return <Link
          key={item.href}
          href={item.href}
          data-nav-item
          style={{ "--i": index } as React.CSSProperties}
          aria-current={current ? "page" : undefined}
          className={cn("site-nav-item", current && "is-current")}
          onClick={dismiss}
        ><item.icon className="h-[17px] w-[17px]" />{item.name}</Link>
      })}
      {action && <>
        <div className="site-nav-rule" />
        <Link href="/studies/new" data-nav-item className="site-nav-item is-action" onClick={dismiss}><Plus className="h-[17px] w-[17px]" />New study</Link>
      </>}
    </div>}
  </>
}

/** Band at the top of the document where the navigation always stays. */
const TOP_BAND = 64
/** Travel needed to tuck the row away, and the shorter travel that returns it. */
const TUCK_TRAVEL = 12
const REVEAL_TRAVEL = 6

/** Scroll offset clamped to the real range, so overscroll cannot invert travel. */
function scrollOffset() {
  const limit = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
  return Math.min(Math.max(window.scrollY, 0), limit)
}

function keyboardFocus(target: EventTarget | null) {
  const node = target as HTMLElement | null
  try {
    return !!node?.matches?.(":focus-visible")
  } catch {
    return !!node
  }
}

/**
 * Tuck the navigation away on sustained downward scrolling and return it on the
 * first upward move. Movement below the thresholds keeps the previous baseline,
 * so jitter cannot flicker the row. `held` keeps it on screen for an open
 * disclosure or a keyboard-focused control, and the route resets the state.
 */
function useScrollReveal(held: boolean, route: string, active: boolean) {
  const [tucked, setTucked] = useState(false)
  const holding = useRef(held)

  useEffect(() => { holding.current = held }, [held])
  useEffect(() => { setTucked(false) }, [route])

  useEffect(() => {
    if (!active) return
    let baseline = scrollOffset()
    let previous = baseline
    let direction = 0
    let frame = 0

    const measure = () => {
      frame = 0
      const offset = scrollOffset()
      const nextDirection = Math.sign(offset - previous)
      // Count travel from the turn, including a reversal before the previous
      // direction reached its threshold. Upward reveal must stay responsive.
      if (nextDirection && nextDirection !== direction) {
        baseline = previous
        direction = nextDirection
      }
      previous = offset
      const travel = offset - baseline
      if (offset <= TOP_BAND) {
        baseline = offset
        setTucked(false)
      } else if (travel > TUCK_TRAVEL) {
        baseline = offset
        if (!holding.current) setTucked(true)
      } else if (travel < -REVEAL_TRAVEL) {
        baseline = offset
        setTucked(false)
      }
    }

    const onScroll = () => { frame ||= requestAnimationFrame(measure) }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [active, route])

  return tucked && !held
}

export function SiteNav() {
  const pathname = usePathname()
  const workbench = pathname === "/studies/new"
  const row = useRef<HTMLElement>(null)
  const [openPanels, setOpenPanels] = useState<Record<string, boolean>>({})
  const [focusHold, setFocusHold] = useState(false)
  const notePanel = useCallback((id: string, open: boolean) => {
    setOpenPanels((current) => (current[id] === open ? current : { ...current, [id]: open }))
  }, [])
  const held = focusHold || Object.values(openPanels).some(Boolean)
  const tucked = useScrollReveal(held, pathname, !workbench)

  // A focused control can disappear without a focusout; recheck on navigation.
  useEffect(() => {
    setFocusHold((hold) => hold && !!row.current?.contains(document.activeElement))
  }, [pathname])

  if (workbench) return null

  const toolsCurrent = tools.some((item) => isCurrent(pathname, item))
  const settingsCurrent = isCurrent(pathname, settings)

  const rowLink = (item: Destination) => {
    const current = isCurrent(pathname, item)
    return <Link key={item.href} href={item.href} aria-current={current ? "page" : undefined} className={cn("site-nav-link", current && "is-current")}>{item.name}</Link>
  }

  return <header
    ref={row}
    className={cn("site-nav", tucked && "is-tucked")}
    onFocus={(event) => { if (keyboardFocus(event.target)) setFocusHold(true) }}
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocusHold(false) }}
  >
    <div className="page-shell site-nav-inner">
      <Link href="/" className="site-brand"><CausalMark className="h-[22px] w-[22px]" />Causal Agent</Link>

      <nav className="site-nav-wide" aria-label="Workspace">
        {destinations.slice(0, 2).map(rowLink)}
        <div className="site-nav-group">
          <NavMenu key={pathname} id="site-nav-tools" items={tools} pathname={pathname} onOpenChange={notePanel}>
            {(trigger) => <button
              type="button"
              {...trigger}
              className={cn("site-nav-link site-nav-trigger", toolsCurrent && "is-current")}
            >Tools<ChevronDown className="site-nav-chevron h-3.5 w-3.5" /></button>}
          </NavMenu>
        </div>
        {destinations.slice(2).map(rowLink)}
      </nav>

      <div className="site-nav-end">
        <Button asChild variant="ghost" size="icon-sm" className={cn("site-nav-icon", settingsCurrent && "is-current")}>
          <Link href={settings.href} aria-label={settings.name} title={settings.name} aria-current={settingsCurrent ? "page" : undefined}><Settings2 className="h-4 w-4" /></Link>
        </Button>
        <ThemeToggle />
        <Button asChild size="sm" className="site-nav-action"><Link href="/studies/new"><Plus className="h-4 w-4" />New study</Link></Button>
        <nav className="site-nav-group site-nav-compact" aria-label="Workspace">
          <NavMenu key={pathname} id="site-nav-menu" items={[...destinations, ...tools, settings]} pathname={pathname} action onOpenChange={notePanel}>
            {(trigger, open) => <Button
              type="button"
              {...trigger}
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label={open ? "Close menu" : "Open menu"}
            >{open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}</Button>}
          </NavMenu>
        </nav>
      </div>
    </div>
  </header>
}
