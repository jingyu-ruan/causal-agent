"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import {
  ArrowUpRight,
  Download,
  FileText,
  Printer,
  ChevronDown,
} from "lucide-react";
import type { NormalizedEvidence } from "@/components/study-evidence";
import { EffectExplorerPanel } from "@/components/effect-explorer-panel";
import { EventStudyChart } from "@/components/report-event-study";
import type { Exploration } from "@/lib/effect-explorer";
import {
  createInteractiveReportHtml,
  downloadReportFile,
  type ReportView,
} from "@/lib/report-export";
import { API_BASE_URL } from "@/lib/config";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, fallback = "Not specified") =>
  v == null || v === "" ? fallback : String(v);
const num = (v: unknown) =>
  v !== null && v !== undefined && Number.isFinite(Number(v))
    ? Number(v)
    : null;
const titleCase = (v: unknown) => str(v).replaceAll("_", " ");
const pText = (v: unknown) =>
  num(v) === null ? "—" : Number(v) < 0.001 ? "<0.001" : Number(v).toFixed(3);
const integer = (v: unknown) =>
  num(v) === null ? "—" : Math.round(Number(v)).toLocaleString();
function Section({
  id,
  index,
  title,
  description,
  children,
}: {
  id: string;
  index: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="report-section" id={id}>
      <div className="report-section-title">
        <span>{index}</span>
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
export function StudyReport({
  evidence,
  initialView,
  standalone = false,
}: {
  evidence: NormalizedEvidence;
  initialView?: ReportView;
  standalone?: boolean;
}) {
  const reportRef = useRef<HTMLElement>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const { study, contract, design, decision, diagnostics, dataset } = evidence;
  const result = obj(study.analysis ?? study.result),
    primary = obj(result.primary_estimate),
    metric = obj(contract.primary_metric);
  const binary = metric.kind === "binary",
    estimate = num(evidence.effect.estimate ?? primary.effect);
  const lower = num(evidence.effect.ci_lower ?? primary.ci_lower),
    upper = num(evidence.effect.ci_upper ?? primary.ci_upper);
  const threshold = num(metric.minimum_effect) ?? 0,
    sign = metric.direction === "lower_is_better" ? -1 : 1;
  const blocking = diagnostics.filter((d) => d.status === "fail"),
    warnings = diagnostics.filter((d) => d.status === "warn");
  const status = str(decision.status, "pending"),
    did = String(design.design_type).includes("differences");
  const confidence = Math.round(100 * (1 - Number(design.alpha ?? 0.05)));
  const exploration = (result.exploration ?? study.exploration) as
    | Exploration
    | undefined;
  useEffect(() => {
    const previous = document.title;
    document.title = `${str(contract.title ?? study.name, "Study")} | Analysis report`;
    return () => {
      document.title = previous;
    };
  }, [contract.title, study.name]);
  const [dimension, setDimension] = useState(initialView?.dimension ?? "");
  const dimensionAnalysis =
    evidence.dimensionAnalyses.find((d) => d.dimension === dimension) ??
    evidence.dimensionAnalyses[0];
  const subgroups = arr(dimensionAnalysis?.subgroups).map(obj);
  const transformations = arr(dataset.transformations).map(obj);
  const guardrails = arr(contract.guardrails).map(obj);
  const studyId = str(study.id ?? study.study_id, "");
  const synthetic =
    Boolean(exploration?.truth) ||
    /synthetic|simulat|demo|reference/i.test(str(contract.notes, ""));
  const fmt = (v: unknown) =>
    num(v) === null
      ? "—"
      : `${Number(v) > 0 ? "+" : ""}${(Number(v) * (binary ? 100 : 1)).toFixed(2)}${binary ? " pp" : ""}`;
  const rate = (v: unknown) =>
    num(v) === null
      ? "—"
      : `${(Number(v) * (binary ? 100 : 1)).toFixed(2)}${binary ? "%" : ""}`;
  const interval = (lo: unknown, hi: unknown) => `${fmt(lo)} to ${fmt(hi)}`;
  const updated = study.updated_at ?? study.created_at;
  const date =
    updated && !Number.isNaN(Date.parse(String(updated)))
      ? new Intl.DateTimeFormat("en-US", {
          dateStyle: "medium",
          timeZone: "America/Chicago",
        }).format(new Date(String(updated)))
      : "Date unavailable";
  const directions =
    estimate === null
      ? "unavailable"
      : estimate * sign > 0
        ? "favorable"
        : "adverse";
  const decisionText = blocking.length
    ? "Resolve the evidence gaps before making a rollout decision."
    : status === "go"
      ? "The study clears the frozen criteria for an overall rollout."
      : status === "stop"
        ? "The evidence supports stopping or reversing the intervention."
        : "Keep the rollout on hold until the frozen decision criteria are satisfied.";
  const sections = [
    ["executive-summary", "Executive decision"],
    ["business-context", "Business context"],
    ["primary-result", "Outcomes & guardrails"],
    ...(did ? [["event-study", "Event study"]] : []),
    ...(exploration
      ? [
          ["segments", "Treatment heterogeneity"],
          ...(exploration.policy_n ? [["rollout", "Rollout scenarios"]] : []),
          ...(exploration.truth
            ? [["simulation-truth", "Simulation validation"]]
            : []),
        ]
      : []),
    ["dimension-evidence", "Dimension drilldowns"],
    ["next-actions", "Limitations & next steps"],
    ["methods", "Methods & audit trail"],
  ];
  const sectionIndex = (id: string) =>
    String(sections.findIndex(([key]) => key === id) + 1).padStart(2, "0");
  function download() {
    const blob = new Blob([JSON.stringify(study, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${studyId || "study"}-analysis.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function exportHtml() {
    if (!reportRef.current || exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const html = await createInteractiveReportHtml(
        reportRef.current,
        study,
        document.title,
      );
      downloadReportFile(
        html,
        `${studyId || "study"}-report.html`,
        "text/html;charset=utf-8",
      );
    } catch (error) {
      setExportError(
        error instanceof Error
          ? error.message
          : "The HTML report could not be exported.",
      );
    } finally {
      setExporting(false);
    }
  }
  const extent =
    Math.max(Math.abs(lower ?? 0), Math.abs(upper ?? 0), threshold, 0.001) *
    1.3;
  const x = (v: number) => 50 + (v / extent) * 45;
  return (
    <article
      ref={reportRef}
      className="decision-report"
      data-dimension={String(dimensionAnalysis?.dimension ?? "")}
      aria-label="Business analysis report"
    >
      <header className="report-cover">
        <div className="report-cover-top">
          <span className="report-wordmark">
            <FileText size={17} />
            Causal Agent
          </span>
          <span className="report-edition">Analysis report · {date}</span>
        </div>
        <div className="report-cover-meta">
          <span className="report-pill">
            {did ? "Difference-in-differences" : "Randomized controlled trial"}
          </span>
          <span className="report-pill">
            {contract.retrospective ? "Retrospective" : "Prospective design"}
          </span>
          {synthetic && (
            <span className="report-pill simulation">Synthetic study</span>
          )}
        </div>
        <h1>
          {str(
            contract.title ?? study.name,
            "Causal impact assessment",
          ).replace(/^Capstone(?: reference)?\s*\/\s*/i, "")}
        </h1>
        <p className="report-deck">
          {str(
            contract.business_question,
            "Assess the intervention using the frozen study design and available evidence.",
          )}
        </p>
        <div className="report-cover-bottom">
          <p>
            <span>
              {studyId.slice(0, 18)} ·{" "}
              {str(
                contract.observation_window_days,
                str(design.observation_window_days, "—"),
              )}
              -day outcome window
            </span>
          </p>
          <div className="report-actions">
            <button
              type="button"
              className="report-button"
              onClick={() => void exportHtml()}
              disabled={exporting}
            >
              <Download size={15} />
              {exporting ? "Exporting…" : "Download HTML"}
            </button>
            <button
              type="button"
              className="report-button"
              onClick={() => window.print()}
            >
              <Printer size={15} />
              Print / save PDF
            </button>
            <button
              type="button"
              className="report-icon-button"
              onClick={download}
              aria-label="Download complete analysis JSON"
              title="Download analysis JSON"
            >
              <Download size={16} />
            </button>
          </div>
        </div>
        {exportError && (
          <p className="report-export-error" role="alert">
            {exportError}
          </p>
        )}
      </header>
      <div className="report-layout">
        <aside className="report-contents" aria-label="Report contents">
          <span>In this report</span>
          <nav>
            {sections.map(([id, name], i) => (
              <a href={`#${id}`} key={id}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                {name}
              </a>
            ))}
          </nav>
        </aside>
        <div className="report-body">
          <section
            className="report-section executive-section"
            id="executive-summary"
          >
            <div className="report-section-title">
              <span>01</span>
              <div>
                <h2>Executive decision</h2>
              </div>
              <span className={`report-status status-${status}`}>
                {titleCase(status)}
              </span>
            </div>
            <h3 className="executive-headline">{decisionText}</h3>
            {synthetic && (
              <p className="report-caption">
                This report describes a synthetic study. Its business
                implications illustrate the workflow within the simulated
                population.
              </p>
            )}
            <div className="report-key-metrics">
              <div>
                <span>Primary effect</span>
                <strong>{fmt(estimate)}</strong>
                <small>
                  {binary
                    ? "Absolute percentage-point difference"
                    : "Outcome units · treatment − control"}
                </small>
              </div>
              <div>
                <span>{confidence}% confidence interval</span>
                <strong className="interval-metric">
                  {interval(lower, upper)}
                </strong>
              </div>
              <div>
                <span>{did ? "Panel observations" : "Analysis units"}</span>
                <strong>{integer(dataset.row_count)}</strong>
                <small>
                  {did
                    ? "Unit-period observations"
                    : "One row per analysis unit"}
                </small>
              </div>
            </div>
            <div className="executive-implications">
              <h4>What this means for the business</h4>
              <p>
                {estimate === null
                  ? "No interpretable primary estimate is available. Address the diagnostics and rerun the analysis."
                  : blocking.length
                    ? "The estimated association is shown for transparency. Failed diagnostics prevent a credible causal rollout claim."
                    : binary
                      ? `For every 10,000 comparable eligible units treated, the estimate corresponds to ${Math.round(Math.abs(estimate) * 10000).toLocaleString()} ${estimate >= 0 ? "additional" : "fewer"} primary outcomes. The effect is ${directions} relative to the metric direction.`
                      : `The intervention changes the primary outcome by ${fmt(estimate)} per analysis unit, a ${directions} direction.`}
              </p>
              {exploration?.leaves.some(
                (l) => l.significant && l.direction === "harmful",
              ) && (
                <p className="effect-harm">
                  A discovered segment shows evidence of harm. Review the
                  segment chapter before interpreting the overall decision as
                  support for broad coverage.
                </p>
              )}
            </div>
            {arr(decision.rationale).length > 0 && (
              <ul className="report-rationale">
                {arr(decision.rationale).map((reason, i) => (
                  <li key={i}>{String(reason)}</li>
                ))}
              </ul>
            )}
          </section>
          <Section
            id="business-context"
            index={sectionIndex("business-context")}
            title="The business question and decision criteria"
          >
            <div className="report-context-grid">
              {[
                ["Population", contract.population],
                ["Intervention", contract.intervention],
                [
                  "Current alternative",
                  contract.comparator ?? contract.comparison,
                ],
                ["Working hypothesis", contract.hypothesis],
                ["Primary outcome", metric.name],
                [
                  "Success threshold",
                  `${fmt(sign * threshold)} in the beneficial direction`,
                ],
              ].map(([name, value]) => (
                <div key={String(name)}>
                  <dt>{String(name)}</dt>
                  <dd>{str(value)}</dd>
                </div>
              ))}
            </div>
            <div className="report-note">
              A favorable point estimate alone is insufficient: the frozen
              effect threshold, uncertainty, diagnostics and guardrail policy
              determine the overall decision.
            </div>
          </Section>
          <Section
            id="primary-result"
            index={sectionIndex("primary-result")}
            title="Primary outcome and guardrails"
            description={`The study estimates the ${did ? "average treatment effect on treated units" : "average treatment effect"} for ${str(metric.name, "the primary metric")}.`}
          >
            {estimate === null ? (
              <div className="report-note">
                No estimate is available. Review the diagnostic and data
                preparation appendix.
              </div>
            ) : (
              <>
                <div className="outcome-comparison">
                  <div>
                    <span>Control</span>
                    <strong>
                      {rate(
                        evidence.effect.control_mean ?? primary.control_mean,
                      )}
                    </strong>
                    <small>
                      {integer(primary.n_control)}{" "}
                      {did ? "unit-period observations" : "observations"}
                    </small>
                  </div>
                  <ArrowUpRight size={22} />
                  <div>
                    <span>Treatment</span>
                    <strong>
                      {rate(
                        evidence.effect.treatment_mean ??
                          primary.treatment_mean,
                      )}
                    </strong>
                    <small>
                      {integer(primary.n_treatment)}{" "}
                      {did ? "unit-period observations" : "observations"}
                    </small>
                  </div>
                  <div className="outcome-effect">
                    <span>Absolute effect</span>
                    <strong>{fmt(estimate)}</strong>
                    <small>
                      p {pText(evidence.effect.p_value ?? primary.p_value)}
                    </small>
                  </div>
                </div>
                <div className="primary-interval">
                  <div>
                    <strong>Effect and uncertainty</strong>
                    <span>
                      Zero = no effect · dashed line = success threshold
                    </span>
                  </div>
                  <svg
                    viewBox="0 0 100 18"
                    role="img"
                    aria-label={`Overall effect ${fmt(estimate)}, 95 percent interval ${interval(lower, upper)}`}
                  >
                    <line
                      x1="5"
                      x2="95"
                      y1="9"
                      y2="9"
                      stroke="var(--border)"
                      strokeWidth=".3"
                    />
                    <line
                      x1="50"
                      x2="50"
                      y1="2"
                      y2="16"
                      stroke="var(--muted-foreground)"
                      strokeWidth=".3"
                    />
                    <line
                      x1={x(sign * threshold)}
                      x2={x(sign * threshold)}
                      y1="2"
                      y2="16"
                      stroke="var(--primary)"
                      strokeWidth=".3"
                      strokeDasharray="1 1"
                    />
                    <line
                      x1={x(lower ?? estimate)}
                      x2={x(upper ?? estimate)}
                      y1="9"
                      y2="9"
                      stroke="var(--primary)"
                      strokeWidth=".7"
                    />
                    <circle
                      cx={x(estimate)}
                      cy="9"
                      r="1.5"
                      fill="var(--primary)"
                    />
                  </svg>
                  <div className="interval-labels">
                    <span>{fmt(-extent)}</span>
                    <span>0</span>
                    <span>{fmt(extent)}</span>
                  </div>
                </div>
              </>
            )}
            <h3 className="report-subtitle">Guardrail outcomes</h3>
            {evidence.guardrailEffects.length ? (
              <div className="report-table-scroll">
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Outcome</th>
                      <th>Effect</th>
                      <th>{confidence}% CI</th>
                      <th>Harm tolerance</th>
                      <th>Assessment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evidence.guardrailEffects.map((g, i) => {
                      const spec =
                        guardrails.find((s) => s.name === g.metric_name) ?? {};
                      const tol = Number(spec.harm_tolerance ?? 0);
                      const low = Number(g.ci_lower),
                        high = Number(g.ci_upper);
                      const higher = spec.direction === "higher_is_better";
                      const safe = higher ? low >= -tol : high <= tol;
                      const harm = higher ? high < -tol : low > tol;
                      const scale = g.metric_kind === "binary" ? 100 : 1;
                      const f = (v: unknown) =>
                        `${(Number(v) * scale).toFixed(2)}${scale === 100 ? " pp" : ""}`;
                      return (
                        <tr key={i}>
                          <td>{str(g.metric_name)}</td>
                          <td>{f(g.effect)}</td>
                          <td>
                            {f(g.ci_lower)} to {f(g.ci_upper)}
                          </td>
                          <td>{f(tol)}</td>
                          <td>
                            <span
                              className={`report-assessment ${safe ? "safe" : harm ? "harm" : ""}`}
                            >
                              {safe
                                ? "Within tolerance"
                                : harm
                                  ? "Evidence of harm"
                                  : "Inconclusive"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="report-caption">
                {guardrails.length
                  ? "Guardrail estimates are unavailable for this run."
                  : "No guardrail outcomes were declared in this study."}
              </p>
            )}
          </Section>
          {evidence.eventStudy.length > 0 && (
            <Section
              id="event-study"
              index={sectionIndex("event-study")}
              title="How the effect evolves over time"
              description="Inspect pre-intervention evidence before interpreting the post-intervention trajectory."
            >
              <EventStudyChart
                points={evidence.eventStudy}
                confidence={confidence}
              />
              <p className="report-caption">
                Intervals use the study’s clustered uncertainty. A
                non-significant pre-trend test does not establish parallel
                counterfactual trends.
              </p>
            </Section>
          )}
          {exploration && (
            <EffectExplorerPanel
              exploration={exploration}
              initialView={initialView}
              binary={binary}
              indices={{
                segments: sectionIndex("segments"),
                rollout: sectionIndex("rollout"),
                truth: sectionIndex("simulation-truth"),
              }}
            />
          )}
          <Section
            id="dimension-evidence"
            index={sectionIndex("dimension-evidence")}
            title="Declared dimension drilldowns"
          >
            {!dimensionAnalysis ? (
              <p className="report-caption">
                No dimension drilldowns were selected for this run.
              </p>
            ) : (
              <>
                <div
                  className="report-dimension-tabs"
                  role="group"
                  aria-label="Select drilldown dimension"
                >
                  {evidence.dimensionAnalyses.map((d) => (
                    <button
                      key={String(d.dimension)}
                      type="button"
                      aria-pressed={d.dimension === dimensionAnalysis.dimension}
                      onClick={() => setDimension(String(d.dimension))}
                    >
                      {String(d.dimension)}
                    </button>
                  ))}
                </div>
                <div className="report-table-scroll">
                  <table className="report-table">
                    <thead>
                      <tr>
                        <th>Group</th>
                        <th>Effect</th>
                        <th>{confidence}% CI</th>
                        <th>Holm p</th>
                        <th>Assessment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subgroups.map((g, i) => {
                        const e = obj(g.estimate);
                        return (
                          <tr key={i}>
                            <td>{String(g.level)}</td>
                            <td>{fmt(e.effect)}</td>
                            <td>{interval(e.ci_lower, e.ci_upper)}</td>
                            <td>{pText(g.adjusted_p_value)}</td>
                            <td>
                              {g.significant
                                ? `${titleCase(g.direction)} signal`
                                : "Uncertain"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="report-caption">
                  {str(
                    obj(dimensionAnalysis.consistency).interpretation,
                    str(
                      dimensionAnalysis.skipped_reason,
                      "Holm correction is applied within each declared dimension.",
                    ),
                  )}
                </p>
              </>
            )}
          </Section>
          <Section
            id="next-actions"
            index={sectionIndex("next-actions")}
            title="Limitations and recommended next actions"
          >
            <ol className="report-next-actions">
              <li>
                <span>1</span>
                <div>
                  <h3>
                    {blocking.length
                      ? "Repair the evidence gaps"
                      : "Review the overall decision with the study owner"}
                  </h3>
                  <p>
                    {blocking.length
                      ? blocking.map((d) => d.message || d.name).join(" ")
                      : decisionText}
                  </p>
                </div>
              </li>
              {exploration?.leaves.length ? (
                <li>
                  <span>2</span>
                  <div>
                    <h3>Validate the discovered targeting rule</h3>
                    <p>
                      Use a new randomized study in the selected population.
                      Precommit the subgroup definition, success threshold,
                      guardrails and sample size before observing new outcomes.
                    </p>
                  </div>
                </li>
              ) : null}
              <li>
                <span>{exploration?.leaves.length ? 3 : 2}</span>
                <div>
                  <h3>Confirm operational assumptions before deployment</h3>
                  <p>
                    {synthetic
                      ? "This demonstration uses synthetic data. Real decisions require representative evidence, credible treatment assignment and operational guardrails."
                      : "Confirm that the study population, outcome window and delivery conditions match the intended rollout."}{" "}
                    {warnings.length
                      ? `${warnings.length} diagnostic warning(s) require review below.`
                      : ""}
                  </p>
                </div>
              </li>
            </ol>
          </Section>
          <Section
            id="methods"
            index={sectionIndex("methods")}
            title="Methods and audit appendix"
          >
            <div className="report-methods">
              <div>
                <span>Estimator</span>
                <strong>
                  {str(
                    primary.method,
                    did
                      ? "Unit and time fixed effects"
                      : "Difference in group means",
                  )}
                </strong>
              </div>
              <div>
                <span>Estimand</span>
                <strong>
                  {str(contract.estimand, did ? "ATT" : "ATE").toUpperCase()}
                </strong>
              </div>
              <div>
                <span>Significance level</span>
                <strong>{str(design.alpha, "0.05")}</strong>
              </div>
              <div>
                <span>Retrospective status</span>
                <strong>
                  {contract.retrospective
                    ? "Retrospective contract"
                    : "Prospective contract"}
                </strong>
              </div>
            </div>
            {exploration?.leaves.length ? (
              <p className="report-body-copy">
                HTE uses a depth-limited tree fitted to transformed outcomes
                with the known randomized allocation. Units are split 40% / 30%
                / 30% for discovery, effect estimation and policy evaluation.
                Leaf intervals are pointwise normal approximations;
                Holm-adjusted tests control multiplicity within the reported
                leaf family and separately within pairwise comparisons. The
                discovery tree is exploratory.
              </p>
            ) : null}
            <h3 className="report-subtitle">Diagnostic checks</h3>
            <div className="report-table-scroll">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Check</th>
                    <th>Result</th>
                    <th>Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {diagnostics.map((d, i) => (
                    <tr key={i}>
                      <td>{titleCase(d.name)}</td>
                      <td>
                        <span className={`report-check check-${d.status}`}>
                          {d.status}
                        </span>
                      </td>
                      <td>{d.message || "No diagnostic detail provided."}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <details className="report-appendix">
              <summary>
                Data preparation and transformation lineage{" "}
                <ChevronDown size={16} />
              </summary>
              {transformations.length ? (
                <ol>
                  {transformations.map((t, i) => (
                    <li key={i}>
                      <strong>{titleCase(t.operation)}</strong>
                      <span>
                        {integer(t.rows_before)} → {integer(t.rows_after)} rows
                        · {arr(t.columns).join(", ") || "Dataset"}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>No transformations were recorded.</p>
              )}
            </details>
            <details className="report-appendix">
              <summary>
                Analysis trace <ChevronDown size={16} />
              </summary>
              <ol>
                {evidence.trace.map((event, i) => (
                  <li key={i}>
                    <strong>{titleCase(event.step)}</strong>
                    <span>{event.summary ?? ""}</span>
                  </li>
                ))}
              </ol>
            </details>
            <div className="report-hashes">
              <div>
                <span>Frozen design SHA-256</span>
                <code>{str(design.spec_hash, "Not available")}</code>
              </div>
              <div>
                <span>Analyzed dataset SHA-256</span>
                <code>{str(dataset.sha256, "Not available")}</code>
              </div>
            </div>
            <div
              className={`report-appendix-links report-actions ${standalone ? "is-standalone" : ""}`}
            >
              <a
                href={`${API_BASE_URL}/api/studies/${encodeURIComponent(studyId)}/artifact`}
                download
              >
                <Download size={14} />
                Frozen design JSON
              </a>
              <a
                href={`${API_BASE_URL}/api/studies/${encodeURIComponent(studyId)}/memo`}
                download
              >
                <Download size={14} />
                Decision memo
              </a>
              <button type="button" onClick={download}>
                <Download size={14} />
                Complete analysis JSON
              </button>
            </div>
          </Section>
          <footer className="report-footer">
            <span>Causal Agent</span>
            <span>{date}</span>
          </footer>
        </div>
      </div>
    </article>
  );
}
