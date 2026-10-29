"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "@/components/page-link";
import { ArrowRight, GitBranch, LoaderCircle } from "lucide-react";
import { DecisionBadge } from "./case-library";
import { EstimateForest, loadResearchProject } from "./research-evidence";
import {
  METHOD_LABELS,
  researchRequest,
  type ResearchCase,
  type ResearchProject,
  type ResearchRun,
} from "@/lib/research-api";

type Choice = { id: string; title: string };
export function ResearchCompare() {
  const search = useSearchParams();
  const [choices, setChoices] = useState<Choice[]>([]),
    [leftId, setLeftId] = useState(search.get("left") ?? "reference-rct-go"),
    [rightId, setRightId] = useState(
      search.get("right") ?? "reference-rct-stop",
    );
  const [left, setLeft] = useState<ResearchProject | null>(null),
    [right, setRight] = useState<ResearchProject | null>(null);
  const [leftRunId, setLeftRunId] = useState(""),
    [rightRunId, setRightRunId] = useState("");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [liveUnavailable, setLiveUnavailable] = useState(false);
  useEffect(() => {
    let active = true;
    const load = async () => {
      const catalog = (await fetch("/research/cases.json").then((response) =>
        response.json(),
      )) as ResearchCase[];
      let live: ResearchProject[] = [];
      try {
        live = await researchRequest<ResearchProject[]>("/projects");
      } catch {
        if (active) setLiveUnavailable(true);
      }
      if (active)
        setChoices([
          ...live.map((project) => ({
            id: project.id,
            title: `${project.design.exploratory ? "Branch" : "Saved"} / ${project.design.title}`,
          })),
          ...catalog.map((item) => ({
            id: `reference-${item.id}`,
            title: `Reference / ${item.title}`,
          })),
        ]);
    };
    void load().catch((caught) => {
      if (active) setError(String(caught));
    });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    Promise.all([loadResearchProject(leftId), loadResearchProject(rightId)])
      .then(([a, b]) => {
        if (active) {
          setLeft(a);
          setRight(b);
          setLeftRunId(a.runs?.[0]?.id ?? "");
          setRightRunId(b.runs?.[0]?.id ?? "");
        }
      })
      .catch((caught) => {
        if (active)
          setError(
            caught instanceof Error
              ? caught.message
              : "Comparison could not be loaded.",
          );
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [leftId, rightId]);
  const leftRun = left?.runs?.find((run) => run.id === leftRunId),
    rightRun = right?.runs?.find((run) => run.id === rightRunId);
  const comparisons =
    left && right
      ? [
          [
            "Method",
            METHOD_LABELS[left.design.method],
            METHOD_LABELS[right.design.method],
          ],
          [
            "Minimum effect",
            left.design.minimum_effect,
            right.design.minimum_effect,
          ],
          [
            "Harm tolerance",
            left.design.harm_tolerance,
            right.design.harm_tolerance,
          ],
          [
            "Covariates",
            left.design.covariates.join(", "),
            right.design.covariates.join(", "),
          ],
          [
            "Balance tolerance",
            left.design.balance_threshold,
            right.design.balance_threshold,
          ],
          [
            "Attrition gap tolerance",
            left.design.missingness_gap_threshold,
            right.design.missingness_gap_threshold,
          ],
          [
            "Overlap tail tolerance",
            left.design.overlap_tail_threshold,
            right.design.overlap_tail_threshold,
          ],
          [
            "Exploratory",
            left.design.exploratory ? "Yes" : "No",
            right.design.exploratory ? "Yes" : "No",
          ],
          [
            "Graph",
            JSON.stringify(left.design.graph),
            JSON.stringify(right.design.graph),
          ],
        ]
      : [];
  const comparable =
    left && right && left.design.method === right.design.method;
  return (
    <div className="page-shell research-page">
      <header className="page-heading">
        <p className="eyebrow">Version comparison</p>
        <h1>
          What changed?
          <br />
          What changed the conclusion?
        </h1>
        <p className="page-description max-w-3xl">
          Compare frozen designs, source datasets, assumptions, and immutable
          runs. A post-outcome branch remains visibly exploratory.
        </p>
      </header>
      <div className="grid gap-5 md:grid-cols-2">
        {[
          {
            label: "Study A",
            value: leftId,
            change: setLeftId,
            project: left,
            runId: leftRunId,
            changeRun: setLeftRunId,
          },
          {
            label: "Study B",
            value: rightId,
            change: setRightId,
            project: right,
            runId: rightRunId,
            changeRun: setRightRunId,
          },
        ].map((item) => (
          <div className="study-panel p-5" key={item.label}>
            <label className="study-label" htmlFor={item.label}>
              {item.label}
            </label>
            <select
              className="study-input"
              id={item.label}
              value={item.value}
              onChange={(event) => {
                setBusy(true);
                setError("");
                item.change(event.target.value);
              }}
            >
              {!choices.some((choice) => choice.id === item.value) && (
                <option value={item.value}>{item.value}</option>
              )}
              {choices.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.title}
                </option>
              ))}
            </select>
            {item.project?.runs && item.project.runs.length > 0 && (
              <label className="mt-4 block">
                <span className="study-label">Saved run</span>
                <select
                  className="study-input"
                  value={item.runId}
                  onChange={(event) => item.changeRun(event.target.value)}
                >
                  {item.project.runs.map((run) => (
                    <option key={run.id} value={run.id}>
                      {run.id.slice(-12)} / {run.result.decision.status} /{" "}
                      {run.filename}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {item.project?.parent_id && (
              <p className="research-note mt-4">
                Parent branch: {item.project.parent_id}
              </p>
            )}
          </div>
        ))}
      </div>
      {liveUnavailable && (
        <p className="research-note mt-4">
          Saved live projects could not be loaded from the research service. The
          computed reference cases remain available for comparison.
        </p>
      )}
      {busy && (
        <p className="mt-8 flex items-center gap-3">
          <LoaderCircle className="h-5 w-5 animate-spin" />
          Loading frozen records…
        </p>
      )}
      {error && (
        <p role="alert" className="research-error mt-6">
          {error}
        </p>
      )}
      {!busy && left && right && (
        <div className="mt-7 space-y-6">
          <div className="grid gap-5 md:grid-cols-2">
            <ComparisonSummary title="Study A" project={left} run={leftRun} />
            <ComparisonSummary title="Study B" project={right} run={rightRun} />
          </div>
          <section className="study-panel p-5 sm:p-7">
            <h2 className="text-xl font-semibold">Effect comparison</h2>
            <p className="research-note mt-3">
              {comparable
                ? "Descriptive comparison of the selected runs. Differences between estimates are not themselves a tested causal contrast."
                : "These studies use different designs or estimands. Compare assumptions and interpretation before comparing coefficients."}
            </p>
            <EstimateForest
              rows={[
                leftRun?.result.primary_estimate
                  ? { label: "Study A", ...leftRun.result.primary_estimate }
                  : null,
                rightRun?.result.primary_estimate
                  ? { label: "Study B", ...rightRun.result.primary_estimate }
                  : null,
              ].filter((row): row is NonNullable<typeof row> => row !== null)}
            />
          </section>
          <section className="study-panel p-5 sm:p-7">
            <h2 className="text-xl font-semibold">Frozen design differences</h2>
            <div className="data-table-scroll mt-5">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Study A</th>
                    <th>Study B</th>
                    <th>Changed</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisons.map(([label, a, b]) => (
                    <tr key={String(label)}>
                      <td>{label}</td>
                      <td className="max-w-80 !whitespace-normal break-words">
                        {label === "Graph"
                          ? `${left.design.graph?.nodes.length ?? 0} nodes / ${left.design.graph?.edges.length ?? 0} edges`
                          : String(a)}
                      </td>
                      <td className="max-w-80 !whitespace-normal break-words">
                        {label === "Graph"
                          ? `${right.design.graph?.nodes.length ?? 0} nodes / ${right.design.graph?.edges.length ?? 0} edges`
                          : String(b)}
                      </td>
                      <td>{a === b ? "—" : "Changed"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="research-note mt-5 break-all">
              A: {left.design.spec_hash}
              <br />
              B: {right.design.spec_hash}
            </p>
          </section>
          {leftRun?.simulation && rightRun?.simulation && (
            <section className="study-panel p-5 sm:p-7">
              <h2 className="text-xl font-semibold">
                Synthetic data differences
              </h2>
              <div className="data-table-scroll mt-5">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Generating parameter</th>
                      <th>Study A</th>
                      <th>Study B</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(leftRun.simulation).map(([key, value]) => (
                      <tr key={key}>
                        <td>{key.replaceAll("_", " ")}</td>
                        <td>{String(value)}</td>
                        <td
                          className={
                            value !==
                            rightRun.simulation?.[
                              key as keyof typeof rightRun.simulation
                            ]
                              ? "font-semibold text-primary"
                              : ""
                          }
                        >
                          {String(
                            rightRun.simulation?.[
                              key as keyof typeof rightRun.simulation
                            ],
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          <div className="research-callout">
            <GitBranch className="mb-3 h-5 w-5" />
            <p>
              Branching preserves the original evidence. Changing a threshold
              after observing outcomes cannot turn an exploratory analysis into
              a preregistered decision.
            </p>
            <Link
              className="mt-4 inline-flex items-center gap-2 text-primary"
              href="/research/lab"
            >
              Start a new research design
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
function ComparisonSummary({
  title,
  project,
  run,
}: {
  title: string;
  project: ResearchProject;
  run?: ResearchRun;
}) {
  return (
    <section className="study-panel p-5">
      <p className="research-note">{title}</p>
      <h2 className="mt-2 text-xl font-semibold">{project.design.title}</h2>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {run && <DecisionBadge status={run.result.decision.status} />}
        <span className="research-tag">
          {project.design.exploratory
            ? "Exploratory branch"
            : project.reference_snapshot
              ? "Reference snapshot"
              : "Frozen study"}
        </span>
      </div>
      <p className="research-note mt-4">
        {project.branch_reason ?? project.design.question}
      </p>
      {run && (
        <p className="research-note mt-4 break-all">
          Source SHA-256: {run.source_sha256.slice(0, 20)}…<br />
          Analyzed rows: {run.result.dataset.row_count}
        </p>
      )}
      <Link
        className="mt-4 inline-flex items-center gap-2 text-primary"
        href={
          project.reference_snapshot
            ? `/research/case/${project.case_id}`
            : `/research/project/${project.id}`
        }
      >
        Open evidence
        <ArrowRight className="h-4 w-4" />
      </Link>
    </section>
  );
}
