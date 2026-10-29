"use client";

import { Input } from "@/components/ui/input";

import { useEffect, useState } from "react";
import Link from "@/components/page-link";
import {
  ArrowRight,
  FlaskConical,
  GitBranch,
  Network,
  Search,
  ShieldCheck,
} from "lucide-react";
import { METHOD_LABELS, type ResearchCase } from "@/lib/research-api";

export function CaseLibrary() {
  const [cases, setCases] = useState<ResearchCase[]>([]),
    [error, setError] = useState("");
  const [method, setMethod] = useState("all"),
    [outcome, setOutcome] = useState("all"),
    [query, setQuery] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/research/cases.json", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Case catalog could not be loaded.");
        return response.json();
      })
      .then((payload: unknown) => { if (!Array.isArray(payload)) throw new Error("Invalid case catalog."); setCases(payload as ResearchCase[]); })
      .catch((caught) => {
        if (!controller.signal.aborted) setError(String(caught));
      });
    return () => controller.abort();
  }, []);
  const visible = cases.filter(
    (item) =>
      (method === "all" || item.method === method) &&
      (outcome === "all" || item.expected === outcome) &&
      `${item.title} ${item.question} ${item.theme}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div className="page-shell research-page">
      <header className="page-heading">
        <p className="eyebrow">The causal research collection</p>
        <h1>
          Different evidence.
          <br />
          Different decisions.
        </h1>
        <p className="page-description max-w-3xl">
          Explore 12 reproducible studies, from a successful experiment to an
          association that disappears after adjustment. Every case includes
          actual synthetic rows, known generating assumptions, a computed
          estimate, and a Critic review.
        </p>
      </header>
      <div className="research-feature-strip">
        <Link href="/research/graph">
          <Network />
          Build a causal graph
          <ArrowRight />
        </Link>
        <Link href="/research/lab">
          <FlaskConical />
          Create a simulation
          <ArrowRight />
        </Link>
        <Link href="/research/compare">
          <GitBranch />
          Compare research branches
          <ArrowRight />
        </Link>
      </div>
      <div className="research-filter-bar">
        <label className="relative min-w-52 flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="study-input pl-10"
            type="search"
            aria-label="Search research cases"
            placeholder="Search a question or failure mode"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select
          className="study-input !w-auto"
          aria-label="Filter by method"
          value={method}
          onChange={(event) => setMethod(event.target.value)}
        >
          <option value="all">All methods</option>
          <option value="rct">Randomized A/B</option>
          <option value="did">DiD</option>
          <option value="aipw">Observational AIPW</option>
        </select>
        <select
          className="study-input !w-auto"
          aria-label="Filter by outcome"
          value={outcome}
          onChange={(event) => setOutcome(event.target.value)}
        >
          <option value="all">All decisions</option>
          {["go", "hold", "stop", "insufficient_evidence"].map((status) => (
            <option key={status} value={status}>
              {status.replaceAll("_", " ").toUpperCase()}
            </option>
          ))}
        </select>
      </div>
      <p className="research-note mb-5">
        {cases.length
          ? `${visible.length} of ${cases.length} cases`
          : "Loading case collection…"}{" "}
        · Fixed-seed synthetic data · No model key required
      </p>
      {error && (
        <p className="research-error" role="alert">
          {error}
        </p>
      )}
      <div className="research-case-grid">
        {visible.map((item, index) => (
          <article className="research-case-card" key={item.id}>
            <div className="flex items-center justify-between gap-3">
              <span className="research-note font-medium">
                {METHOD_LABELS[item.method]}
              </span>
              <DecisionBadge status={item.expected} />
            </div>
            <p className="research-case-number">
              {String(index + 1).padStart(2, "0")} / {item.theme}
            </p>
            <h2>{item.title}</h2>
            <p className="mt-3">{item.question}</p>
            <p className="research-note mt-4">{item.lesson}</p>
            <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
              <Link
                href={`/research/case/${item.id}`}
                className="inline-flex items-center gap-2 font-medium text-primary"
              >
                Explore evidence
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                className="text-sm text-muted-foreground hover:text-primary"
                href={`/research/lab?case=${item.id}`}
              >
                Customize & run
              </Link>
            </div>
          </article>
        ))}
      </div>
      {cases.length > 0 && visible.length === 0 && (
        <div className="study-panel p-10 text-center">
          No cases match these filters.
        </div>
      )}
      <div className="research-callout mt-8">
        <ShieldCheck className="mb-3 h-5 w-5 text-primary" />
        <p className="font-semibold">
          Start with the evidence, including when it says “we do not know.”
        </p>
        <p className="mt-2">
          Reference cases are computed by the Python analysis engine and ship as
          labelled snapshots. Customize a case in the simulation lab to run a
          new study and save its own provenance.
        </p>
      </div>
    </div>
  );
}

export function DecisionBadge({ status }: { status: string }) {
  return (
    <span className={`research-decision-badge decision-${status}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}
