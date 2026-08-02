"use client"

import { useState } from "react"
import Link from "next/link"
import {
  Check,
  FolderKanban,
  Home,
  MessageSquare,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  Workflow,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import type { ConversationSummary } from "@/lib/conversation-api"
import { cn } from "@/lib/utils"

type ConversationHistorySidebarProps = {
  conversations: ConversationSummary[]
  activeConversationId: string | null
  loading: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (conversationId: string) => void
  onNew: () => void
  onRename: (conversationId: string, title: string) => Promise<void>
  onDelete: (conversationId: string) => Promise<void>
}

export function ConversationHistorySidebar(props: ConversationHistorySidebarProps) {
  return (
    <>
      <aside className="hidden h-dvh w-[280px] shrink-0 border-r border-border/80 bg-[#f4f4f2] lg:flex lg:flex-col dark:bg-[#17191d]">
        <SidebarContent {...props} />
      </aside>
      {props.open && (
        <div className="fixed inset-0 z-50 bg-slate-950/25 backdrop-blur-sm lg:hidden" onClick={() => props.onOpenChange(false)}>
          <aside className="flex h-full w-[min(86vw,320px)] flex-col border-r border-border bg-[#f4f4f2] shadow-2xl dark:bg-[#17191d]" onClick={(event) => event.stopPropagation()}>
            <Button type="button" variant="ghost" size="icon-sm" className="absolute left-[min(calc(86vw-2.75rem),276px)] top-3 z-10 rounded-lg" onClick={() => props.onOpenChange(false)} aria-label="Close conversation history">
              <X className="h-4 w-4" />
            </Button>
            <SidebarContent {...props} onNavigate={() => props.onOpenChange(false)} />
          </aside>
        </div>
      )}
    </>
  )
}

function SidebarContent(props: ConversationHistorySidebarProps & { onNavigate?: () => void }) {
  return (
    <>
      <div className="flex h-14 items-center gap-2.5 px-3.5">
        <Link href="/" className="flex min-w-0 items-center gap-2.5 rounded-lg px-1.5 py-1.5" onClick={props.onNavigate}>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950"><Workflow className="h-4 w-4" /></span>
          <span className="truncate text-sm font-bold tracking-tight">Causal Decision</span>
        </Link>
      </div>

      <div className="px-3 pb-3">
        <Button data-testid="new-conversation-button" type="button" variant="outline" className="h-10 w-full justify-start rounded-xl bg-white/75 px-3 shadow-none dark:bg-white/[0.055]" onClick={() => { props.onNew(); props.onNavigate?.() }} disabled={props.loading}>
          <Plus className="h-4 w-4" /> New conversation
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-2.5 pb-3">
        <p className="px-2 pb-2 pt-1 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Recent</p>
        {props.loading && props.conversations.length === 0 ? (
          <p className="px-2 py-4 text-xs text-muted-foreground">Loading conversations…</p>
        ) : props.conversations.length === 0 ? (
          <p className="px-2 py-4 text-xs leading-5 text-muted-foreground">Your conversation history will appear here.</p>
        ) : (
          <nav aria-label="Conversation history" className="space-y-0.5">
            {props.conversations.map((conversation) => (
              <ConversationHistoryItem
                key={conversation.id}
                conversation={conversation}
                active={conversation.id === props.activeConversationId}
                onSelect={() => { props.onSelect(conversation.id); props.onNavigate?.() }}
                onRename={(title) => props.onRename(conversation.id, title)}
                onDelete={() => props.onDelete(conversation.id)}
              />
            ))}
          </nav>
        )}
      </div>

      <div className="mt-auto border-t border-border/70 p-2.5">
        <nav aria-label="Workspace navigation" className="space-y-0.5">
          <WorkspaceLink href="/" label="Overview" icon={Home} onClick={props.onNavigate} />
          <WorkspaceLink href="/studies" label="Studies" icon={FolderKanban} onClick={props.onNavigate} />
          <WorkspaceLink href="/settings" label="Settings" icon={Settings2} onClick={props.onNavigate} />
        </nav>
      </div>
    </>
  )
}

function ConversationHistoryItem({
  conversation,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  conversation: ConversationSummary
  active: boolean
  onSelect: () => void
  onRename: (title: string) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [mode, setMode] = useState<"idle" | "rename" | "delete">("idle")
  const [title, setTitle] = useState(conversation.title)
  const [pending, setPending] = useState(false)

  const rename = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextTitle = title.trim()
    if (!nextTitle || pending) return
    setPending(true)
    try {
      await onRename(nextTitle)
      setMode("idle")
    } catch {
      // The parent renders the sync error without discarding the inline edit.
    } finally {
      setPending(false)
    }
  }

  const remove = async () => {
    if (pending) return
    setPending(true)
    try {
      await onDelete()
    } catch {
      // The parent renders the sync error and keeps the confirmation visible.
    } finally {
      setPending(false)
    }
  }

  if (mode === "rename") {
    return (
      <form onSubmit={(event) => void rename(event)} className="flex items-center gap-1 rounded-lg bg-white p-1 shadow-sm dark:bg-white/[0.08]">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setTitle(conversation.title)
              setMode("idle")
            }
          }}
          autoFocus
          maxLength={160}
          className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-slate-400"
          aria-label={`Rename ${conversation.title}`}
        />
        <Button type="submit" variant="ghost" size="icon-sm" className="h-7 w-7 rounded-md" disabled={!title.trim() || pending} aria-label="Save conversation name"><Check className="h-3.5 w-3.5" /></Button>
        <Button type="button" variant="ghost" size="icon-sm" className="h-7 w-7 rounded-md" onClick={() => { setTitle(conversation.title); setMode("idle") }} disabled={pending} aria-label="Cancel rename"><X className="h-3.5 w-3.5" /></Button>
      </form>
    )
  }

  if (mode === "delete") {
    return (
      <div className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 dark:border-rose-900/60 dark:bg-rose-950/25">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-rose-800 dark:text-rose-200">Delete this conversation?</span>
        <Button type="button" variant="ghost" size="icon-sm" className="h-7 w-7 rounded-md text-rose-700 hover:bg-rose-100 dark:text-rose-200 dark:hover:bg-rose-900/40" onClick={() => void remove()} disabled={pending} aria-label="Confirm delete conversation"><Trash2 className="h-3.5 w-3.5" /></Button>
        <Button type="button" variant="ghost" size="icon-sm" className="h-7 w-7 rounded-md" onClick={() => setMode("idle")} disabled={pending} aria-label="Cancel delete"><X className="h-3.5 w-3.5" /></Button>
      </div>
    )
  }

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "page" : undefined}
        title={conversation.id}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 pr-16 text-left text-sm transition-colors",
          active
            ? "bg-white text-foreground shadow-sm dark:bg-white/[0.08]"
            : "text-muted-foreground hover:bg-white/65 hover:text-foreground dark:hover:bg-white/[0.055]",
        )}
      >
        <MessageSquare className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{conversation.title}</span>
      </button>
      <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-md bg-inherit opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
        <Button data-testid={`rename-conversation-${conversation.id}`} type="button" variant="ghost" size="icon-sm" className="h-7 w-7 rounded-md bg-background/80 text-muted-foreground backdrop-blur" onClick={() => { setTitle(conversation.title); setMode("rename") }} aria-label={`Rename ${conversation.title}`} title="Rename"><Pencil className="h-3.5 w-3.5" /></Button>
        <Button data-testid={`delete-conversation-${conversation.id}`} type="button" variant="ghost" size="icon-sm" className="h-7 w-7 rounded-md bg-background/80 text-muted-foreground backdrop-blur hover:text-rose-600" onClick={() => setMode("delete")} aria-label={`Delete ${conversation.title}`} title="Delete"><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  )
}

function WorkspaceLink({ href, label, icon: Icon, onClick }: { href: string; label: string; icon: typeof Home; onClick?: () => void }) {
  return (
    <Link href={href} onClick={onClick} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition hover:bg-white/65 hover:text-foreground dark:hover:bg-white/[0.055]">
      <Icon className="h-4 w-4" /> {label}
    </Link>
  )
}
