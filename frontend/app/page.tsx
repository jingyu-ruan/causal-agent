import Link from "@/components/page-link"
import { ArrowRight, ArrowUpRight, Braces, Check, Database, FileCheck2, FlaskConical, MessageSquareText, Play, ShieldCheck } from "lucide-react"

import { CausalDiagram } from "@/components/causal-mark"
import { Button } from "@/components/ui/button"

const workflow = [
  { title: "Frame the question", detail: "Define the decision and hypothesis.", icon: MessageSquareText },
  { title: "Freeze the design", detail: "Commit assumptions and thresholds.", icon: FileCheck2 },
  { title: "Prepare the evidence", detail: "Load data and review its quality.", icon: Database },
  { title: "Run the analysis", detail: "Estimate effects and test diagnostics.", icon: Braces },
  { title: "Inspect the decision", detail: "Trace the result to its evidence.", icon: ShieldCheck },
]

export default function Home() {
  return <div className="page-shell overview-page">
    <header className="page-heading">
      <p className="eyebrow">Causal research workspace</p>
      <h1>From a causal question<br className="hidden sm:block" /> to an evidence-based decision.</h1>
      <p className="page-description max-w-[650px]">A research workbench for designing studies, checking assumptions, and turning data into a reproducible decision.</p>
    </header>

    <section className="overview-demo" aria-labelledby="demo-title">
      <div className="overview-demo-copy">
        <span className="section-kicker"><span className="h-1.5 w-1.5 rounded-full bg-primary" />Start exploring</span>
        <h2 id="demo-title">One dataset.<br />The complete research workflow.</h2>
        <p>Load a built-in study, review its data, and run the real analysis. Every step produces evidence you can inspect.</p>
        <div className="mt-6 flex flex-wrap gap-2.5">
          <Button asChild className="h-10 rounded-lg px-4 shadow-none"><Link href="/studies/replay"><Play className="h-3.5 w-3.5" />Open live demonstration<ArrowRight className="h-4 w-4" /></Link></Button>
          <Button asChild variant="outline" className="h-10 rounded-lg bg-card px-4 shadow-none"><Link href="/studies/new">Create a study<ArrowUpRight className="h-3.5 w-3.5" /></Link></Button>
        </div>
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-muted-foreground"><span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5" />Built-in synthetic data</span><span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5" />Reproducible Python analysis</span><span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5" />API key optional</span></div>
      </div>
      <div className="overview-demo-visual"><div className="flex items-center justify-between text-[11px] text-muted-foreground"><span className="inline-flex items-center gap-1.5"><FlaskConical className="h-3.5 w-3.5" />The research question</span><span className="rounded-md border border-border bg-card px-2 py-1">Causal inference</span></div><CausalDiagram /><div className="border-t border-border pt-4 text-[12px] leading-5 text-muted-foreground"><span className="font-medium text-foreground">Should we expand guided onboarding?</span><br />Evaluate the effect before making the rollout decision.</div></div>
    </section>

    <section className="mt-10" aria-labelledby="workflow-title">
      <div className="section-heading"><div><p className="section-kicker">The workflow</p><h2 id="workflow-title">Follow the evidence, step by step.</h2></div><span className="text-[12px] text-muted-foreground">Human review at the decision points</span></div>
      <ol className="workflow-overview">{workflow.map(({ title, detail, icon: Icon }, index) => <li key={title}><div className="flex items-center justify-between"><Icon className="h-[19px] w-[19px] text-primary" /><span className="text-[11px] tabular-nums text-muted-foreground/70">0{index + 1}</span></div><h3>{title}</h3><p>{detail}</p></li>)}</ol>
    </section>

    <section className="mt-10" aria-labelledby="methods-title">
      <div className="section-heading"><div><p className="section-kicker">Two study designs</p><h2 id="methods-title">Choose how to ask the question.</h2></div></div>
      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/studies/replay?method=rct" className="method-card group"><div className="flex items-center gap-2.5 text-[12px] font-medium text-primary"><span className="method-dot bg-blue-500" />Randomized experiment</div><h3>What changes when we randomize?</h3><p>Compare treatment and control, check allocation and guardrails, and estimate the average treatment effect.</p><div className="mt-5 flex items-center justify-between border-t border-border pt-4"><span className="text-[11px] text-muted-foreground">A/B test / Guided onboarding</span><ArrowUpRight className="h-4 w-4 text-primary transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></div></Link>
        <Link href="/studies/replay?method=did" className="method-card group"><div className="flex items-center gap-2.5 text-[12px] font-medium text-teal-700 dark:text-teal-300"><span className="method-dot bg-teal-500" />Difference-in-differences</div><h3>What changes after a rollout?</h3><p>Compare trends across regions, inspect pre-intervention periods, and estimate the effect of a phased rollout.</p><div className="mt-5 flex items-center justify-between border-t border-border pt-4"><span className="text-[11px] text-muted-foreground">Panel study / Regional rollout</span><ArrowUpRight className="h-4 w-4 text-teal-600 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></div></Link>
      </div>
    </section>

    <footer className="overview-footer"><span>Causal Agent <span className="mx-2 text-border">/</span> Research workspace</span><Link href="/studies" className="inline-flex items-center gap-1.5 text-primary">Explore evidence records<ArrowRight className="h-3.5 w-3.5" /></Link></footer>
  </div>
}
