import Link from "@/components/page-link"
import { ArrowRight, ArrowUpRight, Braces, Check, Database, FileCheck2, FlaskConical, GitBranch, MessageSquareText, Network, Play, ShieldCheck } from "lucide-react"

import { CausalDiagram } from "@/components/causal-mark"
import { Button } from "@/components/ui/button"

const workflow = [
  { title: "Frame the question", detail: "Define the decision and hypothesis.", icon: MessageSquareText },
  { title: "Freeze the design", detail: "Commit assumptions and thresholds.", icon: FileCheck2 },
  { title: "Prepare the evidence", detail: "Load data and review its quality.", icon: Database },
  { title: "Run the analysis", detail: "Estimate effects and test diagnostics.", icon: Braces },
  { title: "Inspect the decision", detail: "Trace the result to its evidence.", icon: ShieldCheck },
]

const researchTools = [
  { title: "Causal graph studio", detail: "Express causal assumptions, inspect backdoor paths, and review adjustment variables.", href: "/research/graph", icon: Network },
  { title: "Critic & robustness", detail: "Challenge effects with placebo dates, event windows, balance, and attrition checks.", href: "/research/case/did-pretrend?section=critic", icon: ShieldCheck },
  { title: "Simulation & calibration", detail: "Control the true effect and confounding. Measure bias, RMSE, and interval coverage.", href: "/research/lab", icon: FlaskConical },
  { title: "Observational AIPW", detail: "Compare naive associations with cross-fitted doubly robust estimates and overlap diagnostics.", href: "/research/case/aipw-confounding", icon: Braces },
  { title: "Ask the evidence", detail: "Ask in English or Chinese. Inspect the exact fields supporting each answer.", href: "/research/case/rct-stop?section=ask", icon: MessageSquareText },
  { title: "Research branches", detail: "Preserve frozen designs, create exploratory branches, and compare changes side by side.", href: "/research/compare", icon: GitBranch },
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
        <h2 id="demo-title">Twelve studies.<br />Every side of the evidence.</h2>
        <p>See when to proceed, when to wait, and when a convincing-looking result fails. Explore experiments, regional rollouts, and observational studies with known synthetic truth.</p>
        <div className="mt-6 flex flex-wrap gap-2.5">
          <Button asChild className="h-11 rounded-lg px-4 shadow-none"><Link href="/cases"><Play className="h-4 w-4" />Explore the case collection<ArrowRight className="h-4 w-4" /></Link></Button>
          <Button asChild variant="outline" className="h-11 rounded-lg bg-card px-4 shadow-none"><Link href="/research/lab">Open simulation lab<ArrowUpRight className="h-4 w-4" /></Link></Button>
        </div>
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[14px] text-muted-foreground"><span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5" />Built-in synthetic data</span><span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5" />Reproducible effect estimates</span><span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5" />API key optional</span></div>
      </div>
      <div className="overview-demo-visual"><div className="flex items-center justify-between text-[14px] text-muted-foreground"><span className="inline-flex items-center gap-1.5"><FlaskConical className="h-3.5 w-3.5" />The research question</span><span className="rounded-md border border-border bg-card px-2 py-1">Causal inference</span></div><CausalDiagram /><div className="border-t border-border pt-4 text-[14px] leading-5 text-muted-foreground"><span className="font-medium text-foreground">Should we expand guided onboarding?</span><br />Evaluate the effect before making the rollout decision.</div></div>
    </section>

    <section className="mt-10" aria-labelledby="research-tools-title"><div className="section-heading"><div><p className="section-kicker">An inspectable research system</p><h2 id="research-tools-title">Model. Estimate. Challenge. Explain.</h2></div><Link href="/studies/new" className="inline-flex items-center gap-2 text-primary">Start a guided conversation<ArrowRight className="h-4 w-4" /></Link></div><div className="research-tool-grid">{researchTools.map(({ title, detail, href, icon: Icon }) => <Link href={href} className="research-tool-card" key={title}><Icon className="h-6 w-6 text-primary" /><h3>{title}</h3><p>{detail}</p><span className="mt-4 inline-flex items-center gap-2 font-medium text-primary">Explore tool<ArrowRight className="h-4 w-4" /></span></Link>)}</div></section>

    <section className="mt-10" aria-labelledby="workflow-title">
      <div className="section-heading"><div><p className="section-kicker">The workflow</p><h2 id="workflow-title">Follow the evidence, step by step.</h2></div><span className="text-[14px] text-muted-foreground">Human review at the decision points</span></div>
      <ol className="workflow-overview">{workflow.map(({ title, detail, icon: Icon }, index) => <li key={title}><div className="flex items-center justify-between"><Icon className="h-[19px] w-[19px] text-primary" /><span className="text-[14px] tabular-nums text-muted-foreground/70">0{index + 1}</span></div><h3>{title}</h3><p>{detail}</p></li>)}</ol>
    </section>

    <section className="mt-10" aria-labelledby="methods-title">
      <div className="section-heading"><div><p className="section-kicker">Three study designs</p><h2 id="methods-title">Choose how to ask the question.</h2></div></div>
      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/studies/replay?method=rct" className="method-card group"><div className="flex items-center gap-2.5 text-[14px] font-medium text-primary"><span className="method-dot bg-blue-500" />Randomized experiment</div><h3>What changes when we randomize?</h3><p>Compare treatment and control, check allocation and guardrails, and estimate the average treatment effect.</p><div className="mt-5 flex items-center justify-between border-t border-border pt-4"><span className="text-[14px] text-muted-foreground">A/B test / Guided onboarding</span><ArrowUpRight className="h-4 w-4 text-primary transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></div></Link>
        <Link href="/studies/replay?method=did" className="method-card group"><div className="flex items-center gap-2.5 text-[14px] font-medium text-teal-700 dark:text-teal-300"><span className="method-dot bg-teal-500" />Difference-in-differences</div><h3>What changes after a rollout?</h3><p>Compare trends across regions, inspect pre-intervention periods, and estimate the effect of a phased rollout.</p><div className="mt-5 flex items-center justify-between border-t border-border pt-4"><span className="text-[14px] text-muted-foreground">Panel study / Regional rollout</span><ArrowUpRight className="h-4 w-4 text-teal-600 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></div></Link>
        <Link href="/research/lab?case=aipw-confounding" className="method-card group"><div className="flex items-center gap-2.5 text-sm font-medium text-amber-700 dark:text-amber-300"><span className="method-dot bg-amber-500" />Observational AIPW</div><h3>What if assignment was not random?</h3><p>Adjust for measured confounders, inspect propensity overlap and balance, and estimate a cross-fitted ATE.</p><div className="mt-5 flex items-center justify-between border-t border-border pt-4"><span className="text-sm text-muted-foreground">Observational study / Targeted promotion</span><ArrowUpRight className="h-4 w-4 text-amber-600" /></div></Link>
      </div>
    </section>

    <footer className="overview-footer"><span>Causal Agent <span className="mx-2 text-border">/</span> Research workspace</span><Link href="/studies" className="inline-flex items-center gap-1.5 text-primary">Explore evidence records<ArrowRight className="h-3.5 w-3.5" /></Link></footer>
  </div>
}
