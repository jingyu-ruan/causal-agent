"use client";

import { Input } from "@/components/ui/input";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "@/components/page-link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  GitBranch,
  LoaderCircle,
  MessageSquareText,
  Network,
  Printer,
  Send,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { GraphVisual } from "./graph-editor";
import { DecisionBadge } from "./case-library";
import { PreparationPreview } from "./simulation-lab";
import {
  downloadResearch,
  METHOD_LABELS,
  researchRequest,
  saveBlob,
  type BalanceRow,
  type Estimate,
  type EvidenceAnswer,
  type ResearchProject,
  type ResearchResult,
  type ResearchRun,
} from "@/lib/research-api";
import { referenceAnswer } from "@/lib/evidence-answer";
import {
  createInteractiveReportHtml,
  type ReportView,
} from "@/lib/report-export";

export async function loadResearchProject(
  id: string,
): Promise<ResearchProject> {
  if (id.startsWith("reference-")) {
    const response = await fetch(
      `/research/${encodeURIComponent(id.slice("reference-".length))}.json`,
    );
    if (!response.ok) throw new Error("Reference case could not be loaded.");
    return response.json();
  }
  return researchRequest<ResearchProject>(
    `/projects/${encodeURIComponent(id)}`,
  );
}

export function ResearchEvidence({
  projectId,
  caseId,
}: {
  projectId?: string;
  caseId?: string;
}) {
  const router = useRouter(),
    search = useSearchParams();
  const reportRef = useRef<HTMLDivElement>(null);
  const [project, setProject] = useState<ResearchProject | null>(null),
    [error, setError] = useState("");
  const [tab, setTab] = useState(search.get("section") ?? "evidence"),
    [selectedRun, setSelectedRun] = useState(""),
    [busy, setBusy] = useState(false);
  const id = caseId ? `reference-${caseId}` : (projectId ?? "");
  useEffect(() => {
    let active = true;
    loadResearchProject(id)
      .then((value) => {
        if (active) {
          setProject(value);
          setSelectedRun(search.get("run") ?? value.runs?.[0]?.id ?? "");
        }
      })
      .catch((caught) => {
        if (active)
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load evidence.",
          );
      });
    return () => {
      active = false;
    };
  }, [id, search]);
  if (error && !project)
    return (
      <div className="page-shell py-12">
        <p className="research-error" role="alert">
          {error}
        </p>
        <Link href="/cases" className="mt-5 inline-block text-primary">
          Return to cases
        </Link>
      </div>
    );
  if (!project)
    return (
      <div className="page-shell flex items-center gap-3 py-16">
        <LoaderCircle className="h-5 w-5 animate-spin" />
        Loading the evidence record…
      </div>
    );
  const run =
    project.runs?.find((run) => run.id === selectedRun) ?? project.runs?.[0];
  async function branch() {
    if (!project) return;
    setBusy(true);
    setError("");
    try {
      const live =
        project.reference_snapshot && project.case_id
          ? await researchRequest<ResearchProject>(
              `/cases/${project.case_id}/open`,
              {},
            )
          : project;
      router.push(`/research/lab?parent=${live.id}`);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not create a branch.",
      );
      setBusy(false);
    }
  }
  async function download(kind: "data" | "artifact") {
    if (!project || !run) return;
    try {
      if (project.reference_snapshot) {
        if (kind === "artifact")
          saveBlob(
            new Blob([JSON.stringify(project, null, 2)], {
              type: "application/json",
            }),
            `${project.case_id}-evidence.json`,
          );
        else {
          const response = await fetch(`/research/${project.case_id}.csv`);
          if (!response.ok) throw new Error("Could not download dataset.");
          saveBlob(await response.blob(), `${project.case_id}.csv`);
        }
      } else
        await downloadResearch(
          kind === "artifact"
            ? `/projects/${project.id}/export`
            : `/projects/${project.id}/runs/${run.id}/data`,
          `${project.id}.${kind === "artifact" ? "json" : "csv"}`,
        );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Download failed.");
    }
  }
  async function exportHtml() {
    if (!project || !reportRef.current) return;
    setBusy(true);
    setError("");
    try {
      const html = await createInteractiveReportHtml(
        reportRef.current,
        {
          id: project.id,
          __research_project: project,
          __research_run: run?.id,
        },
        project.design.title,
      );
      saveBlob(
        new Blob([html], { type: "text/html" }),
        `${project.id}-interactive.html`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Report export failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  const tabs = [
    { id: "evidence", label: "Evidence", icon: CheckCircle2 },
    { id: "critic", label: "Critic review", icon: ShieldCheck },
    { id: "graph", label: "Causal graph", icon: Network },
    { id: "ask", label: "Ask the evidence", icon: MessageSquareText },
    { id: "versions", label: "Runs & branches", icon: GitBranch },
  ];
  return (
    <div
      className="page-shell research-page"
      ref={reportRef}
      data-research-tab={tab}
    >
      <header className="page-heading">
        <Link
          href="/cases"
          className="inline-flex items-center gap-2 text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Case collection
        </Link>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <span className="research-tag">
            {METHOD_LABELS[project.design.method]}
          </span>
          <span className="research-note">
            {project.reference_snapshot
              ? "Computed reference snapshot · synthetic data"
              : project.computation
                ? `On-device ${run?.source_kind === "upload" ? "upload" : "simulation"} · saved in this browser`
                : run?.source_kind === "upload"
                  ? "Uploaded data · saved run"
                  : "Live simulation · saved run"}
          </span>
          {project.design.exploratory && (
            <span className="research-tag">Exploratory / retrospective</span>
          )}
        </div>
        <h1>{project.design.title}</h1>
        <p className="page-description max-w-3xl">{project.design.question}</p>
        <div className="report-actions mt-6 flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => void exportHtml()}
            disabled={busy || !run}
          >
            <Download className="h-4 w-4" />
            Interactive HTML
          </Button>
          <Button
            variant="outline"
            onClick={() => void download("data")}
            disabled={!run || run.source_kind === "upload"}
          >
            <Download className="h-4 w-4" />
            Dataset CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => void download("artifact")}
            disabled={!run}
          >
            <Download className="h-4 w-4" />
            Evidence JSON
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Print / save PDF
          </Button>
          <Button onClick={() => void branch()} disabled={busy}>
            {busy ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <GitBranch className="h-4 w-4" />
            )}
            Create a research branch
          </Button>
        </div>
      </header>
      {error && (
        <p className="research-error mb-5" role="alert">
          {error}
        </p>
      )}
      <nav
        className="research-report-tabs"
        aria-label="Research report sections"
      >
        {tabs.map(({ id: tabId, label, icon: Icon }) => (
          <button
            type="button"
            key={tabId}
            aria-pressed={tab === tabId}
            onClick={() => setTab(tabId)}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>
      {!run ? (
        <div className="study-panel p-8">
          <h2 className="text-xl font-semibold">Your design is frozen.</h2>
          <p className="mt-3">
            Generate or upload a dataset in the lab to create an evidence run.
          </p>
          <Link
            className="mt-4 inline-flex items-center gap-2 text-primary"
            href={`/research/lab?parent=${project.id}`}
          >
            Continue in the lab
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <>
          {tab === "evidence" && <EvidenceOverview result={run.result} />}
          {tab === "critic" && <CriticPanel result={run.result} />}
          {tab === "graph" && (
            <section className="study-panel p-5 sm:p-7">
              <h2 className="text-xl font-semibold">
                Frozen causal assumptions
              </h2>
              {project.design.graph ? (
                <>
                  <GraphVisual graph={project.design.graph} />
                  <p className="research-note mt-4">
                    This graph was reviewed before this design was frozen.
                    Changing an arrow or an adjustment variable requires a new
                    branch. Graph checks evaluate the supplied assumptions;
                    observed data cannot verify every causal arrow.
                  </p>
                </>
              ) : (
                <p className="mt-4">No graph was attached to this design.</p>
              )}
              <p className="mt-5">
                Declared covariates:{" "}
                <strong>{project.design.covariates.join(", ")}</strong>
              </p>
              <p className="research-note mt-3 break-all">
                Frozen design SHA-256: {project.design.spec_hash}
              </p>
            </section>
          )}
          {tab === "ask" && (
            <EvidenceChat key={run.id} run={run} project={project} />
          )}
          {tab === "versions" && (
            <section className="study-panel p-5 sm:p-7">
              <h2 className="text-xl font-semibold">
                Immutable runs & research lineage
              </h2>
              {project.parent_id && (
                <p className="mt-4">
                  Parent:{" "}
                  <Link
                    className="text-primary"
                    href={`/research/project/${project.parent_id}`}
                  >
                    {project.parent_id}
                  </Link>
                </p>
              )}
              {project.branch_reason && (
                <p className="research-note mt-3">
                  Branch reason: {project.branch_reason}
                </p>
              )}
              <p className="research-note mt-3">
                Every run preserves its source hash, frozen design, parameters,
                and decision. Changing assumptions after seeing results creates
                an explicitly exploratory branch.
              </p>
              <div className="data-table-scroll mt-6">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Run</th>
                      <th>Source</th>
                      <th>Decision</th>
                      <th>Rows</th>
                      <th>Source SHA-256</th>
                      <th>Select</th>
                    </tr>
                  </thead>
                  <tbody>
                    {project.runs?.map((item) => (
                      <tr key={item.id}>
                        <td>{item.id.slice(-12)}</td>
                        <td>{item.filename}</td>
                        <td>
                          <DecisionBadge status={item.result.decision.status} />
                        </td>
                        <td>{item.result.dataset.row_count}</td>
                        <td>{item.source_sha256.slice(0, 16)}…</td>
                        <td>
                          <button
                            className="text-primary"
                            onClick={() => {
                              setSelectedRun(item.id);
                              setTab("evidence");
                            }}
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button asChild className="mt-6" variant="outline">
                <Link href={`/research/compare?left=${project.id}`}>
                  <GitBranch className="h-4 w-4" />
                  Compare versions and cases
                </Link>
              </Button>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function EvidenceOverview({
  result,
  initialTruth = false,
  initialAudience = "",
}: {
  result: ResearchResult;
  initialTruth?: boolean;
  initialAudience?: string;
}) {
  const [truthVisible, setTruthVisible] = useState(initialTruth);
  const [audience, setAudience] = useState(initialAudience);
  const effect = result.primary_estimate;
  const forest = [
    result.truth && truthVisible
      ? {
          label: "Generator truth",
          effect: result.truth.true_effect,
          ci_lower: result.truth.true_effect,
          ci_upper: result.truth.true_effect,
        }
      : null,
    result.naive_estimate
      ? {
          label:
            result.design.method === "did"
              ? "Raw pooled difference"
              : "Naive difference",
          ...result.naive_estimate,
        }
      : null,
    effect ? { label: METHOD_LABELS[result.design.method], ...effect } : null,
  ].filter((row): row is NonNullable<typeof row> => row !== null);
  return (
    <div
      className="space-y-6 research-report-state"
      data-truth={truthVisible}
      data-audience={audience}
    >
      <section
        className={`research-decision-hero hero-${result.decision.status}`}
      >
        <div>
          <DecisionBadge status={result.decision.status} />
          <h2 className="mt-5 text-3xl font-semibold">
            {result.decision.summary}
          </h2>
          <ul className="mt-5 space-y-2">
            {result.decision.rationale.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
        <div className="research-primary-number">
          <span>Estimated causal effect</span>
          <strong>{effect ? signed(effect.effect) : "—"}</strong>
          <p>
            {effect
              ? `95% CI [${effect.ci_lower.toFixed(3)}, ${effect.ci_upper.toFixed(3)}]`
              : "No estimable causal effect"}
          </p>
          <p className="mt-2">
            Minimum beneficial effect: {result.design.minimum_effect.toFixed(3)}
          </p>
        </div>
      </section>
      <div className="research-stat-grid">
        {[
          ["Analyzed rows", result.dataset.row_count.toLocaleString()],
          [
            "Known generating effect",
            result.truth
              ? truthVisible
                ? signed(result.truth.true_effect)
                : "Hidden"
              : "Unknown",
          ],
          ["Critic review", result.critic.status],
          [
            "Guardrail effect",
            result.guardrail_estimate
              ? signed(result.guardrail_estimate.effect)
              : "Unavailable",
          ],
        ].map(([label, value]) => (
          <div className="research-stat" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      {result.truth && (
        <Button
          variant="outline"
          onClick={() => setTruthVisible((value) => !value)}
        >
          {truthVisible ? "Hide generator truth" : "Reveal generator truth"}
        </Button>
      )}
      {effect && (
        <section className="study-panel p-5 sm:p-7">
          <h2 className="text-xl font-semibold">
            Association, estimation & known truth
          </h2>
          <p className="research-note mt-3">
            {result.design.method === "did"
              ? "The pooled raw difference ignores the intervention boundary and is shown only as a descriptive comparison."
              : "The naive difference ignores assignment bias. The causal estimate uses the declared study design."}
            {result.truth?.heterogeneous
              ? " Generator truth is the central effect parameter; subgroup effects vary around it."
              : ""}
          </p>
          <EstimateForest
            rows={forest}
            threshold={result.design.minimum_effect}
          />
          <div className="data-table-scroll mt-5">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Method</th>
                  <th>Effect</th>
                  <th>95% CI</th>
                  <th>p-value</th>
                </tr>
              </thead>
              <tbody>
                {[result.naive_estimate, effect]
                  .filter((item): item is Estimate => !!item)
                  .map((item) => (
                    <tr key={item.method}>
                      <td>{item.method.replaceAll("_", " ")}</td>
                      <td>{signed(item.effect)}</td>
                      <td>
                        [{item.ci_lower.toFixed(3)}, {item.ci_upper.toFixed(3)}]
                      </td>
                      <td>{formatP(item.p_value)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {result.event_study.length > 0 && (
        <section className="study-panel p-5 sm:p-7">
          <h2 className="text-xl font-semibold">DiD event study</h2>
          <p className="research-note mt-3">
            Inspect pre-treatment coefficients before the post-treatment effect.
            Period −1 is the reference; intervals are pointwise 95% intervals.
          </p>
          <EstimateForest
            rows={result.event_study.map((point) => ({
              label: `Period ${point.relative_period}${point.is_reference ? " · reference" : ""}`,
              effect: point.effect,
              ci_lower: point.ci_lower ?? 0,
              ci_upper: point.ci_upper ?? 0,
            }))}
          />
        </section>
      )}
      {result.observational && (
        <section className="study-panel p-5 sm:p-7">
          <h2 className="text-xl font-semibold">
            Observational identification / AIPW
          </h2>
          <p className="research-note mt-3">
            Two-fold cross-fitting with logistic propensity and arm-specific
            linear outcome models. Propensities are clipped to [0.01, 0.99] for
            numerical stability; poor overlap still blocks rollout claims.
          </p>
          <div className="research-stat-grid mt-5">
            {[
              [
                "Propensity tail fraction",
                `${(result.observational.tail_fraction * 100).toFixed(1)}%`,
              ],
              [
                "Effective weighted sample",
                result.observational.effective_sample_size.toFixed(0),
              ],
              [
                "Clipped propensities",
                `${(result.observational.clipped_fraction * 100).toFixed(1)}%`,
              ],
            ].map(([label, value]) => (
              <div className="research-stat" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <h3 className="mt-7 font-semibold">Propensity overlap</h3>
          <div className="research-overlap-chart mt-4">
            {result.observational.histogram.map((bin) => {
              const max = Math.max(
                1,
                ...result.observational!.histogram.flatMap((item) => [
                  item.control,
                  item.treatment,
                ]),
              );
              return (
                <div key={bin.bin}>
                  <div className="research-histogram-bars">
                    <span
                      style={{ height: `${(bin.control / max) * 100}%` }}
                      title={`Control: ${bin.control}`}
                    />
                    <span
                      style={{ height: `${(bin.treatment / max) * 100}%` }}
                      title={`Treatment: ${bin.treatment}`}
                    />
                  </div>
                  <span>{bin.bin}</span>
                </div>
              );
            })}
          </div>
          <p className="research-note mt-3">
            First series: control · Second series: treatment · Propensity score
            bins
          </p>
          <BalanceTable
            rows={result.observational.balance}
            threshold={result.design.balance_threshold}
          />
          <details className="mt-5">
            <summary className="cursor-pointer font-medium">
              Identification assumptions
            </summary>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              {result.observational.assumptions.map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
            </ul>
          </details>
        </section>
      )}
      {result.dimension_analyses.map((dimension) => (
        <section className="study-panel p-5 sm:p-7" key={dimension.dimension}>
          <h2 className="text-xl font-semibold">
            Audience differences / {dimension.dimension}
          </h2>
          <p className="research-note mt-3">
            Exploratory subgroup estimates with Holm-adjusted tests.{" "}
            {dimension.consistency
              ? `Cochran’s Q p=${formatP(dimension.consistency.p_value)}. ${dimension.consistency.consistent ? "Heterogeneity was not detected." : "Heterogeneity was detected."}`
              : "No supported heterogeneity test is available."}
          </p>
          <EstimateForest
            rows={dimension.subgroups.map((group) => ({
              label: group.level,
              ...group.estimate,
            }))}
          />
          <label className="mt-5 block">
            <span className="study-label">Inspect audience</span>
            <select
              className="study-input"
              value={audience}
              aria-label="Inspect audience"
              onChange={(event) => setAudience(event.target.value)}
            >
              <option value="">All audiences</option>
              {dimension.subgroups.map((group) => (
                <option key={group.level} value={group.level}>
                  {group.level}
                </option>
              ))}
            </select>
          </label>
          {dimension.subgroups
            .filter((group) => group.level === audience)
            .map((group) => (
              <div className="research-callout mt-4" key={group.level}>
                <p className="font-medium">
                  {group.level}: {signed(group.estimate.effect)} · 95% CI [
                  {group.estimate.ci_lower.toFixed(3)},{" "}
                  {group.estimate.ci_upper.toFixed(3)}]
                </p>
                <p className="mt-2">{group.recommendation}</p>
              </div>
            ))}
          <div className="data-table-scroll mt-4">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Audience</th>
                  <th>Effect</th>
                  <th>Holm p</th>
                  <th>Follow-up</th>
                </tr>
              </thead>
              <tbody>
                {dimension.subgroups.map((group) => (
                  <tr key={group.level}>
                    <td>{group.level}</td>
                    <td>{signed(group.estimate.effect)}</td>
                    <td>{formatP(group.adjusted_p_value)}</td>
                    <td className="!whitespace-normal min-w-64">
                      {group.recommendation}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      <section className="study-panel p-5 sm:p-7">
        <h2 className="text-xl font-semibold">Preparation & source lineage</h2>
        <PreparationPreview profile={result.profile} />
        <p className="research-note mt-5 break-all">
          Analyzed dataset SHA-256: {result.dataset.sha256}
        </p>
      </section>
    </div>
  );
}

function CriticPanel({ result }: { result: ResearchResult }) {
  return (
    <div className="space-y-6">
      <div className="research-callout">
        <h2 className="text-xl font-semibold">
          The estimate is one piece of the decision.
        </h2>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span>Before Critic</span>
          <DecisionBadge status={result.critic.base_decision} />
          <ArrowRight className="h-4 w-4" />
          <span>After Critic</span>
          <DecisionBadge status={result.critic.final_decision} />
        </div>
        <p className="research-note mt-4">
          Policy {result.critic.policy_version} was frozen with the design.
          Warnings can downgrade GO to HOLD; identification failures block a
          causal claim. Credible harm remains STOP.
        </p>
      </div>
      {result.critic.checks.map((check) => (
        <section className="study-panel p-5 sm:p-7" key={check.code}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{check.title}</h2>
            <span className={`research-check-badge check-${check.status}`}>
              {check.status}
            </span>
          </div>
          <p className="mt-3 leading-7">{check.message}</p>
          {Array.isArray(check.details.balance) && (
            <BalanceTable
              rows={check.details.balance as BalanceRow[]}
              threshold={result.design.balance_threshold}
            />
          )}
          {check.code === "differential_missingness" && (
            <div className="mt-4 flex flex-wrap gap-5">
              <span>
                Observed gap: {(Number(check.details.gap) * 100).toFixed(1)}%
              </span>
              <span>
                Frozen tolerance:{" "}
                {(Number(check.details.threshold) * 100).toFixed(1)}%
              </span>
            </div>
          )}
          {check.code === "placebo_date" && (
            <p className="mt-4 font-medium">
              Fake intervention: period {String(check.details.treatment_start)}{" "}
              · Effect {Number(check.details.effect).toFixed(3)} · p=
              {formatP(Number(check.details.p_value))}
            </p>
          )}
        </section>
      ))}
      {result.critic.windows.length > 0 && (
        <section className="study-panel p-5 sm:p-7">
          <h2 className="text-xl font-semibold">
            Predeclared robustness windows
          </h2>
          <EstimateForest
            rows={result.critic.windows}
            threshold={result.design.minimum_effect}
          />
        </section>
      )}
      <section className="study-panel p-5 sm:p-7">
        <h2 className="text-xl font-semibold">
          Identification & data-quality gates
        </h2>
        <div className="data-table-scroll mt-5">
          <table className="data-table">
            <thead>
              <tr>
                <th>Check</th>
                <th>Status</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {result.diagnostics.map((check) => (
                <tr key={check.code}>
                  <td>{check.code.replaceAll("_", " ")}</td>
                  <td>
                    <span
                      className={`research-check-badge check-${check.status}`}
                    >
                      {check.status}
                    </span>
                  </td>
                  <td className="!whitespace-normal min-w-72">
                    {check.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="research-note mt-5">{result.critic.limitation}</p>
      </section>
    </div>
  );
}

function EvidenceChat({
  run,
  project,
}: {
  run: ResearchRun;
  project: ResearchProject;
}) {
  const [question, setQuestion] = useState(""),
    [messages, setMessages] = useState<
      { question: string; response: EvidenceAnswer }[]
    >([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);
  async function ask(value: string) {
    if (!value.trim() || busy) return;
    setBusy(true);
    setError("");
    setQuestion("");
    try {
      const response = project.reference_snapshot
        ? referenceAnswer(run.result, value, run.id)
        : await researchRequest<EvidenceAnswer>(`/projects/${project.id}/ask`, {
            question: value,
            run_id: run.id,
            context: messages.slice(-6).map((message) => message.question),
          });
      setMessages((current) => [...current, { question: value, response }]);
      setTimeout(
        () =>
          end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
        100,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Question could not be answered.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="study-panel p-5 sm:p-7">
      <h2 className="text-xl font-semibold">Ask this evidence record</h2>
      <p className="research-note mt-3">
        A bounded evidence assistant retrieves facts from this selected run.
        Questions are understood in English and Chinese; answers are always in
        English. Answers include exact field citations; unsupported claims are
        declined. Mode: deterministic retrieval.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        {[
          "Why this decision?",
          "What is the causal effect?",
          "What are the limitations?",
          "Which audience differs?",
          "What should we do next?",
        ].map((prompt) => (
          <button
            className="research-edge-chip"
            key={prompt}
            disabled={busy}
            onClick={() => void ask(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>
      <div className="mt-7 space-y-6" aria-live="polite">
        {messages.map((message, index) => (
          <div key={index}>
            <div className="ml-auto max-w-2xl rounded-xl bg-accent p-4">
              <p className="font-medium">{message.question}</p>
            </div>
            <div className="mt-4 max-w-3xl">
              <p className="whitespace-pre-wrap leading-7">
                {message.response.answer}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {message.response.tools.map((tool) => (
                  <span key={tool} className="research-tag">
                    {tool.replaceAll("_", " ")}
                  </span>
                ))}
              </div>
              {message.response.citations.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-primary">
                    Inspect {message.response.citations.length} evidence
                    citations
                  </summary>
                  <div className="mt-3 space-y-3">
                    {message.response.citations.map((citation) => (
                      <div
                        className="rounded-lg border border-border p-3"
                        key={citation.path}
                      >
                        <p className="font-mono text-sm font-semibold">
                          {citation.path}
                        </p>
                        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-sm">
                          {JSON.stringify(citation.value, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form
        className="mt-7 flex gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void ask(question);
        }}
      >
        <Input
          className="study-input flex-1"
          placeholder="Why is this the decision? What limits this conclusion?"
          aria-label="Ask about the selected evidence run"
          value={question}
          maxLength={1000}
          onChange={(event) => setQuestion(event.target.value)}
        />
        <Button disabled={busy || !question.trim()} type="submit">
          {busy ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Ask
        </Button>
      </form>
      {error && (
        <p className="research-error mt-4" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export function EstimateForest({
  rows,
  threshold,
}: {
  rows: { label: string; effect: number; ci_lower: number; ci_upper: number }[];
  threshold?: number;
}) {
  if (!rows.length) return null;
  const minimum = Math.min(0, ...rows.map((row) => row.ci_lower)),
    maximum = Math.max(threshold ?? 0, ...rows.map((row) => row.ci_upper));
  const padding = Math.max(0.1, (maximum - minimum) * 0.15),
    min = minimum - padding,
    max = maximum + padding;
  const x = (value: number) => 230 + ((value - min) / (max - min)) * 430;
  const height = rows.length * 48 + 65;
  return (
    <div className="research-forest mt-5" tabIndex={0}>
      <svg
        role="img"
        aria-label="Effect estimates with 95 percent confidence intervals"
        viewBox={`0 0 800 ${height}`}
        style={{ minWidth: 700 }}
      >
        <line
          x1={x(0)}
          x2={x(0)}
          y1="10"
          y2={height - 45}
          stroke="var(--muted-foreground)"
          strokeDasharray="4 4"
        />
        {threshold !== undefined && (
          <line
            x1={x(threshold)}
            x2={x(threshold)}
            y1="10"
            y2={height - 45}
            stroke="#d97706"
            strokeDasharray="3 4"
          />
        )}
        {rows.map((row, index) => {
          const y = 30 + index * 48;
          return (
            <g key={row.label}>
              <text x="4" y={y + 5} fill="currentColor" fontSize="15">
                {row.label}
              </text>
              <line
                x1={x(row.ci_lower)}
                x2={x(row.ci_upper)}
                y1={y}
                y2={y}
                stroke="var(--primary)"
                strokeWidth="3"
              />
              <line
                x1={x(row.ci_lower)}
                x2={x(row.ci_lower)}
                y1={y - 6}
                y2={y + 6}
                stroke="var(--primary)"
              />
              <line
                x1={x(row.ci_upper)}
                x2={x(row.ci_upper)}
                y1={y - 6}
                y2={y + 6}
                stroke="var(--primary)"
              />
              <circle cx={x(row.effect)} cy={y} r="5" fill="var(--primary)" />
              <text x="690" y={y + 5} fill="currentColor" fontSize="15">
                {signed(row.effect)}
              </text>
            </g>
          );
        })}
        <text
          x={x(0)}
          y={height - 15}
          textAnchor="middle"
          fill="currentColor"
          fontSize="14"
        >
          Zero
        </text>
        {threshold !== undefined && (
          <text x="490" y={height - 15} fill="#b45309" fontSize="14">
            Dashed amber: business threshold
          </text>
        )}
      </svg>
    </div>
  );
}
function BalanceTable({
  rows,
  threshold,
}: {
  rows: BalanceRow[];
  threshold: number;
}) {
  return (
    <div className="data-table-scroll mt-5">
      <table className="data-table">
        <thead>
          <tr>
            <th>Pre-treatment covariate</th>
            <th>SMD before</th>
            <th>SMD after weighting</th>
            <th>Frozen tolerance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.covariate}>
              <td>{row.covariate}</td>
              <td>{row.before.toFixed(3)}</td>
              <td>
                {row.after === null ? "Not adjusted" : row.after.toFixed(3)}
              </td>
              <td>±{threshold.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function signed(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(3)}`;
}
function formatP(value: number) {
  return value < 0.001 ? "<0.001" : value.toFixed(3);
}

/** The same panels, without route transitions or network-dependent questions. */
export function StandaloneResearchReport({
  project,
  runId,
  initialView,
}: {
  project: ResearchProject;
  runId?: string;
  initialView?: ReportView;
}) {
  const [tab, setTab] = useState(
    initialView?.researchTab === "versions"
      ? "evidence"
      : (initialView?.researchTab ?? "evidence"),
  );
  const [selectedRun, setSelectedRun] = useState(
    runId ?? project.runs?.[0]?.id ?? "",
  );
  const run =
    project.runs?.find((item) => item.id === selectedRun) ?? project.runs?.[0];
  if (!run) return <p>No saved run is available.</p>;
  return (
    <div className="research-page research-standalone">
      <header className="page-heading">
        <p className="research-note">
          Self-contained research evidence ·{" "}
          {project.computation ?? "Python reference"}
        </p>
        <h1>{project.design.title}</h1>
        <p className="page-description">{project.design.question}</p>
        {project.design.exploratory && (
          <p className="research-note mt-3">
            Exploratory / retrospective branch
          </p>
        )}
      </header>
      <nav
        className="research-report-tabs"
        aria-label="Research report sections"
      >
        {["evidence", "critic", "graph", "ask"].map((name) => (
          <button
            key={name}
            aria-pressed={tab === name}
            onClick={() => setTab(name)}
          >
            {name === "ask"
              ? "Ask the evidence"
              : name === "critic"
                ? "Critic review"
                : name === "graph"
                  ? "Causal graph"
                  : "Evidence"}
          </button>
        ))}
      </nav>
      {(project.runs?.length ?? 0) > 1 && (
        <label className="mb-5 block">
          <span className="study-label">Saved run</span>
          <select
            className="study-input"
            value={selectedRun}
            onChange={(event) => setSelectedRun(event.target.value)}
          >
            {project.runs?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.id} / {item.result.decision.status}
              </option>
            ))}
          </select>
        </label>
      )}
      {tab === "evidence" && (
        <EvidenceOverview
          key={run.id}
          result={run.result}
          initialTruth={initialView?.researchTruth}
          initialAudience={initialView?.researchAudience}
        />
      )}
      {tab === "critic" && <CriticPanel result={run.result} />}
      {tab === "graph" && project.design.graph && (
        <GraphVisual graph={project.design.graph} />
      )}
      {tab === "ask" && (
        <EvidenceChat
          key={run.id}
          run={run}
          project={{ ...project, reference_snapshot: true }}
        />
      )}
      <footer className="research-note mt-7 break-all">
        Frozen design SHA-256: {project.design.spec_hash}
        <br />
        Source SHA-256: {run.source_sha256}
      </footer>
    </div>
  );
}
