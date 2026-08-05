import Link from "next/link"
import {
  ArrowRight,
  Bot,
  Braces,
  Check,
  CheckCircle2,
  Database,
  FlaskConical,
  Layers3,
  MessageSquareText,
  ShieldCheck,
  SquareTerminal,
  User,
} from "lucide-react"

import { Button } from "@/components/ui/button"

const principles = [
  { title: "Answer in conversation", body: "The Agent asks for one decision-critical detail at a time and turns each answer into a structured contract.", icon: MessageSquareText },
  { title: "Inspect the completed work", body: "Each API call, Python analysis, validation gate, and persisted artifact is recorded after that stage completes.", icon: SquareTerminal },
  { title: "Keep the evidence inspectable", body: "Every conclusion links back to the frozen design, dataset version, diagnostics, and decision policy.", icon: ShieldCheck },
]

export default function Home() {
  return (
    <div>
      <section className="border-b border-border/80">
        <div className="page-shell grid gap-12 py-16 lg:grid-cols-[0.86fr_1.14fr] lg:items-center lg:py-24">
          <div className="max-w-2xl">
            <p className="eyebrow"><span className="h-1.5 w-1.5 rounded-full bg-slate-500" /> Causal Agent</p>
            <h1 className="mt-6 text-balance text-5xl font-extrabold leading-[1.02] tracking-[-0.055em] text-slate-950 sm:text-6xl dark:text-slate-100">Build the study through conversation.</h1>
            <p className="mt-6 max-w-xl text-pretty text-lg leading-8 text-muted-foreground">Describe the decision in your own words. The Agent will clarify assumptions, compile the design, run the tools, and show you exactly where it is in the process.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="group rounded-xl bg-slate-900 px-6 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white">
                <Link href="/studies/new">Start a conversation <ArrowRight className="transition-transform group-hover:translate-x-1" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-xl bg-card/60 px-6"><Link href="/studies"><Layers3 /> Browse evidence records</Link></Button>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
              {[
                "No long intake form",
                "Auditable execution log",
                "Deterministic analysis",
              ].map((item) => <span key={item} className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5" />{item}</span>)}
            </div>
          </div>

          <AgentPreview />
        </div>
      </section>

      <section className="page-shell py-16 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr]">
          <div>
            <p className="eyebrow">A different interaction model</p>
            <h2 className="mt-4 text-3xl font-extrabold text-slate-950 sm:text-4xl dark:text-slate-100">The interface follows the Agent, not a form schema.</h2>
            <p className="mt-4 max-w-md text-sm leading-7 text-muted-foreground">You stay in one conversation while the right side becomes an inspectable record of planning, tool use, and evidence production.</p>
          </div>
          <div className="divide-y divide-border border-y border-border">
            {principles.map((item, index) => {
              const Icon = item.icon
              return <div key={item.title} className="grid gap-4 py-6 sm:grid-cols-[2.5rem_0.65fr_1fr] sm:items-start"><span className="font-mono text-[10px] text-muted-foreground">0{index + 1}</span><div className="flex items-center gap-3 text-sm font-bold"><span className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-card text-muted-foreground"><Icon className="h-4 w-4" /></span>{item.title}</div><p className="text-sm leading-6 text-muted-foreground">{item.body}</p></div>
            })}
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-slate-950 text-slate-100 dark:bg-black/25">
        <div className="page-shell grid gap-7 py-12 md:grid-cols-[1fr_auto] md:items-center">
          <div><p className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400">Prefer a head start?</p><h2 className="mt-2 text-2xl font-bold">Open a proven contract, then revise it in conversation.</h2></div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <TemplateLink href="/studies/new?template=onboarding" icon={FlaskConical} label="Onboarding A/B" />
            <TemplateLink href="/studies/new?template=game-rollout" icon={Database} label="Server rollout" />
          </div>
        </div>
      </section>
    </div>
  )
}

function AgentPreview() {
  const activities = [
    { label: "validate_request", tool: "tool", icon: CheckCircle2 },
    { label: "freeze_design_spec", tool: "python", icon: SquareTerminal },
    { label: "persist_artifact", tool: "api", icon: Braces },
  ]
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-900/15 bg-card shadow-[0_26px_70px_-42px_rgba(15,23,42,0.5)] dark:border-white/12">
      <div className="flex items-center justify-between border-b border-border bg-muted/35 px-4 py-3"><div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-md bg-slate-900 text-white dark:bg-slate-200 dark:text-slate-950"><Bot className="h-3.5 w-3.5" /></span><div><p className="text-[11px] font-bold">New causal study</p><p className="text-[9px] text-muted-foreground">Agent workspace</p></div></div><span className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-wider text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-blue-500" />Running</span></div>
      <div className="grid min-h-[410px] sm:grid-cols-[1fr_13rem]">
        <div className="flex flex-col border-border sm:border-r">
          <div className="flex-1 space-y-5 p-4 sm:p-5">
            <PreviewMessage agent text="What business decision should this study support? Describe it in ordinary language." />
            <PreviewMessage text="Should we roll out guided onboarding to all new users?" />
            <PreviewMessage agent text="Why do you expect it to change activation? I want to capture the causal mechanism before choosing a method." />
          </div>
          <div className="border-t border-border p-3"><div className="flex min-h-12 items-end gap-2 rounded-xl border border-border bg-background p-2"><span className="flex-1 px-2 py-1.5 text-[11px] text-muted-foreground">Reply to the Agent…</span><span className="grid h-7 w-7 place-items-center rounded-md bg-slate-900 text-white dark:bg-slate-200 dark:text-slate-950"><ArrowRight className="h-3.5 w-3.5" /></span></div></div>
        </div>
        <div className="hidden bg-muted/25 p-4 sm:block">
          <p className="font-mono text-[8px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Agent run</p>
          <div className="mt-4 space-y-3">
            {["Intake", "Design", "Data", "Diagnostics", "Decision"].map((step, index) => <div key={step} className="flex items-center gap-2.5"><span className={`grid h-4 w-4 place-items-center rounded-full border ${index < 2 ? "border-slate-600 bg-slate-700 text-white" : "border-border bg-card text-muted-foreground"}`}>{index < 2 ? <Check className="h-2.5 w-2.5" /> : null}</span><span className={`text-[10px] font-semibold ${index > 1 ? "text-muted-foreground" : ""}`}>{step}</span></div>)}
          </div>
          <div className="my-5 h-px bg-border" />
          <p className="font-mono text-[8px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Tool activity</p>
          <div className="mt-3 space-y-3">{activities.map((item) => { const Icon = item.icon; return <div key={item.label} className="flex gap-2"><span className="grid h-5 w-5 shrink-0 place-items-center rounded border border-border bg-card text-muted-foreground"><Icon className="h-3 w-3" /></span><div className="min-w-0"><code className="block truncate text-[8px] font-semibold">{item.label}</code><span className="mt-0.5 block font-mono text-[7px] uppercase text-muted-foreground">{item.tool}</span></div></div> })}</div>
        </div>
      </div>
    </div>
  )
}

function PreviewMessage({ agent = false, text }: { agent?: boolean; text: string }) {
  return <div className={`flex gap-2.5 ${agent ? "" : "justify-end"}`}>{agent && <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-slate-900 text-white dark:bg-slate-200 dark:text-slate-950"><Bot className="h-3 w-3" /></span>}<p className={`max-w-[85%] text-[11px] leading-5 ${agent ? "pt-0.5" : "rounded-xl rounded-br-sm bg-slate-900 px-3 py-2 text-white dark:bg-slate-200 dark:text-slate-950"}`}>{text}</p>{!agent && <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-border bg-card text-muted-foreground"><User className="h-3 w-3" /></span>}</div>
}

function TemplateLink({ href, icon: Icon, label }: { href: string; icon: typeof FlaskConical; label: string }) {
  return <Link href={href} className="group flex min-w-[190px] items-center justify-between gap-4 rounded-xl border border-white/15 bg-white/[0.045] px-4 py-3 transition hover:bg-white/[0.08]"><span className="flex items-center gap-2.5 text-xs font-semibold"><Icon className="h-4 w-4 text-slate-400" />{label}</span><ArrowRight className="h-3.5 w-3.5 text-slate-500 transition-transform group-hover:translate-x-1" /></Link>
}
