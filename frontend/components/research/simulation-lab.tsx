"use client";

import { Textarea } from "@/components/ui/textarea";

import { Input } from "@/components/ui/input";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "@/components/page-link";
import {
  ArrowRight,
  Download,
  FlaskConical,
  LoaderCircle,
  Network,
  Play,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { GraphEditor } from "./graph-editor";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { RESEARCH_ON_DEVICE } from "@/lib/config";
import {
  candidateGraph,
  DEFAULT_SIMULATION,
  defaultDesign,
  METHOD_LABELS,
  researchRequest,
  saveBlob,
  type Evaluation,
  type Method,
  type Profile,
  type ResearchCase,
  type ResearchDesign,
  type ResearchProject,
  type ResearchRun,
  type Simulation,
} from "@/lib/research-api";

const parameters: {
  key: keyof Simulation;
  label: string;
  min: number;
  max: number;
  step: number;
  hint: string;
}[] = [
  {
    key: "sample_size",
    label: "Sample size / DiD row budget",
    min: 100,
    max: 10000,
    step: 100,
    hint: "DiD uses 40–100 independent regions with repeated observations.",
  },
  {
    key: "true_effect",
    label: "True treatment effect",
    min: -3,
    max: 3,
    step: 0.1,
    hint: "The generator’s effect, in outcome units.",
  },
  {
    key: "confounding",
    label: "Baseline outcome / selection strength",
    min: 0,
    max: 5,
    step: 0.1,
    hint: "In observational studies this also controls treatment selection.",
  },
  {
    key: "noise",
    label: "Outcome noise standard deviation",
    min: 0.1,
    max: 3,
    step: 0.1,
    hint: "Higher noise increases uncertainty.",
  },
  {
    key: "missing_rate",
    label: "Outcome missingness in both arms",
    min: 0,
    max: 0.4,
    step: 0.01,
    hint: "Removal requires explicit confirmation.",
  },
  {
    key: "treatment_missing_extra",
    label: "Extra missingness in treatment",
    min: 0,
    max: 0.4,
    step: 0.01,
    hint: "Creates differential attrition.",
  },
  {
    key: "guardrail_effect",
    label: "Guardrail harm",
    min: -2,
    max: 2,
    step: 0.1,
    hint: "A positive value increases support cost.",
  },
  {
    key: "nonparallel_trend",
    label: "DiD differential trend per period",
    min: -0.5,
    max: 0.5,
    step: 0.05,
    hint: "A nonzero value violates the parallel-trends assumption.",
  },
  {
    key: "seed",
    label: "Random seed",
    min: 0,
    max: 2147483647,
    step: 1,
    hint: "The same design, parameters, and seed reproduce the data.",
  },
];

export function SimulationLab({ graphOnly = false }: { graphOnly?: boolean }) {
  const search = useSearchParams(),
    router = useRouter();
  const [design, setDesign] = useState<ResearchDesign>(() => ({
    ...defaultDesign("aipw"),
    graph: candidateGraph("aipw"),
  }));
  const [simulation, setSimulation] = useState<Simulation>({
    ...DEFAULT_SIMULATION,
  });
  const [project, setProject] = useState<ResearchProject | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null),
    [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null),
    [repetitions, setRepetitions] = useState(20);
  const [file, setFile] = useState<File | null>(null),
    [branchReason, setBranchReason] = useState(
      "Investigate a changed assumption in an exploratory branch.",
    );
  const inputRef = useRef<HTMLInputElement>(null);
  const sourceProject = useRef<string | null>(null);
  const caseId = search.get("case"),
    parentId = search.get("parent");
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        if (parentId) {
          const parent = await researchRequest<ResearchProject>(
            `/projects/${encodeURIComponent(parentId)}`,
          );
          if (!active) return;
          const { spec_hash: ignored, ...copy } = parent.design;
          void ignored;
          setDesign({ ...copy, exploratory: true, retrospective: true });
          sourceProject.current = parent.id;
          if (parent.runs?.[0]?.simulation)
            setSimulation(parent.runs[0].simulation);
        } else if (caseId) {
          const cases = (await fetch("/research/cases.json").then((response) =>
            response.json(),
          )) as ResearchCase[];
          const item = cases.find((item) => item.id === caseId);
          if (!active || !item) return;
          setDesign({
            ...defaultDesign(item.method),
            title: item.title,
            question: item.question,
            graph: item.graph,
          });
          setSimulation(item.simulation);
        }
      } catch (caught) {
        if (active)
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load study context.",
          );
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [caseId, parentId]);
  function changeMethod(method: Method) {
    setDesign((current) => ({
      ...current,
      method,
      retrospective: method === "aipw" || current.exploratory,
      graph: candidateGraph(method),
    }));
    invalidate();
  }
  function invalidate() {
    setProfile(null);
    setConfirmed(false);
    setEvaluation(null);
  }
  async function freeze() {
    setBusy("Freezing the research design");
    setError("");
    try {
      const { spec_hash: ignored, ...request } = design;
      void ignored;
      const frozen = sourceProject.current
        ? await researchRequest<ResearchProject>(
            `/projects/${encodeURIComponent(sourceProject.current)}/branch`,
            { design: request, reason: branchReason },
          )
        : await researchRequest<ResearchProject>("/projects", request);
      setProject(frozen);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Design could not be frozen.",
      );
    } finally {
      setBusy("");
    }
  }
  async function preview(selectedFile?: File) {
    if (!project) return;
    setBusy("Profiling the dataset");
    setError("");
    setConfirmed(false);
    try {
      const upload = selectedFile ?? file;
      if (upload) {
        const form = new FormData();
        form.append("file", upload);
        setProfile(
          await researchRequest<Profile>(
            `/projects/${project.id}/upload/profile`,
            form,
          ),
        );
      } else
        setProfile(
          await researchRequest<Profile>(
            `/projects/${project.id}/preview`,
            simulation,
          ),
        );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Profiling failed.");
    } finally {
      setBusy("");
    }
  }
  async function analyze() {
    if (!project || !profile || !confirmed) return;
    setBusy("Estimating effects and running the Critic");
    setError("");
    try {
      let run: ResearchRun;
      if (file) {
        const form = new FormData();
        form.append("file", file);
        run = await researchRequest<ResearchRun>(
          `/projects/${project.id}/upload?confirm_cleaning=true&source_sha256=${encodeURIComponent(profile.source_sha256 ?? "")}`,
          form,
        );
      } else
        run = await researchRequest<ResearchRun>(
          `/projects/${project.id}/runs`,
          { simulation, confirm_cleaning: true },
        );
      router.push(`/research/project/${project.id}?run=${run.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Analysis failed.");
    } finally {
      setBusy("");
    }
  }
  async function evaluate() {
    setBusy("Running repeated independent simulations");
    setError("");
    try {
      setEvaluation(
        await researchRequest<Evaluation>("/evaluate", {
          method: design.method,
          repetitions,
          simulation,
        }),
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Calibration failed.",
      );
    } finally {
      setBusy("");
    }
  }
  const validProfile =
    profile &&
    !profile.missing_columns.length &&
    !Object.keys(profile.invalid_numeric).length &&
    !profile.unknown_groups.length;
  return (
    <div className="page-shell research-page">
      <header className="page-heading">
        <p className="eyebrow">
          {graphOnly
            ? "Causal graph studio"
            : sourceProject.current
              ? "Exploratory research branch"
              : "Simulation & observational lab"}
        </p>
        <h1>
          {graphOnly
            ? "Make the assumptions visible."
            : "Know the truth. Test the inference."}
        </h1>
        <p className="page-description max-w-3xl">
          {graphOnly
            ? "Build a candidate DAG, inspect adjustment choices, and freeze your reviewed assumptions with a study."
            : "Design a study, generate a controlled dataset or upload your own, and compare the estimated effect with the evidence. All effects use deterministic estimators."}
        </p>
      </header>
      {RESEARCH_ON_DEVICE && (
        <div className="research-callout mb-6">
          <p className="font-medium">
            Calculate on this device. Keep your data here.
          </p>
          <p className="research-note mt-2">
            This lab computes estimates in your browser and saves study records
            in this browser’s storage. Export the evidence JSON to keep or share
            a copy. Reference cases use the Python engine; new device
            simulations record their own engine version and random seed.
          </p>
        </div>
      )}
      <div className="research-lab-layout">
        <div className="min-w-0 space-y-6">
          <section className="study-panel p-5 sm:p-7">
            <div className="research-section-title">
              <Network />
              <h2>01 / Question & causal assumptions</h2>
              {project && <span className="research-tag">Frozen</span>}
            </div>
            <fieldset disabled={!!project || !!busy} className="mt-5 space-y-5">
              <SegmentedControl
                label="Study design"
                value={design.method}
                onValueChange={changeMethod}
                options={(Object.keys(METHOD_LABELS) as Method[]).map(
                  (method) => ({ value: method, label: METHOD_LABELS[method] }),
                )}
              />
              <label className="block">
                <span className="study-label">Study title</span>
                <Input
                  className="study-input"
                  maxLength={200}
                  value={design.title}
                  onChange={(event) =>
                    setDesign({ ...design, title: event.target.value })
                  }
                />
              </label>
              <label className="block">
                <span className="study-label">Research question</span>
                <Textarea
                  className="study-input min-h-24"
                  maxLength={1000}
                  value={design.question}
                  onChange={(event) =>
                    setDesign({ ...design, question: event.target.value })
                  }
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="study-label">Minimum beneficial effect</span>
                  <Input
                    className="study-input"
                    type="number"
                    min={0.01}
                    max={10}
                    step={0.05}
                    value={design.minimum_effect}
                    onChange={(event) =>
                      setDesign({
                        ...design,
                        minimum_effect: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  <span className="study-label">Maximum guardrail harm</span>
                  <Input
                    className="study-input"
                    type="number"
                    min={0}
                    max={10}
                    step={0.05}
                    value={design.harm_tolerance}
                    onChange={(event) =>
                      setDesign({
                        ...design,
                        harm_tolerance: Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <p className="research-note">
                Outcomes are continuous, in customer-value units. RCT planning
                assumes an outcome standard deviation of 1, 80% power, and 95%
                confidence. DiD freezes intervention period 6.
              </p>
              {design.graph && (
                <GraphEditor
                  value={design.graph}
                  onChange={(graph) => setDesign({ ...design, graph })}
                />
              )}
              <label className="block">
                <span className="study-label">
                  Declared pre-treatment covariate columns
                </span>
                <Input
                  className="study-input"
                  value={design.covariates.join(", ")}
                  onChange={(event) =>
                    setDesign({
                      ...design,
                      covariates: event.target.value
                        .split(",")
                        .map((value) => value.trim())
                        .filter(Boolean),
                    })
                  }
                />
                <span className="research-note mt-2 block">
                  AIPW adjusts for these columns; RCT checks their baseline
                  balance. Use numeric pre-treatment variables only.
                </span>
              </label>
              <details>
                <summary className="cursor-pointer font-medium">
                  Frozen Critic thresholds
                </summary>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  {(
                    [
                      ["balance_threshold", "Maximum absolute SMD"],
                      ["missingness_gap_threshold", "Maximum attrition gap"],
                      [
                        "overlap_tail_threshold",
                        "Maximum propensity tail fraction",
                      ],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key}>
                      <span className="study-label">{label}</span>
                      <Input
                        className="study-input"
                        type="number"
                        min={0.01}
                        max={key === "overlap_tail_threshold" ? 0.5 : 1}
                        step={0.01}
                        value={design[key]}
                        onChange={(event) =>
                          setDesign({
                            ...design,
                            [key]: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
              </details>
              {parentId && (
                <label className="block">
                  <span className="study-label">
                    Reason for this exploratory branch
                  </span>
                  <Textarea
                    className="study-input"
                    value={branchReason}
                    onChange={(event) => setBranchReason(event.target.value)}
                  />
                </label>
              )}
            </fieldset>
            {!project ? (
              <Button
                className="mt-6"
                onClick={() => void freeze()}
                disabled={
                  !!busy ||
                  !design.graph?.confirmed ||
                  !design.title.trim() ||
                  !design.question.trim()
                }
              >
                {busy ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                Freeze reviewed design
              </Button>
            ) : (
              <div className="research-callout mt-5">
                <p className="font-medium">
                  Design frozen · {project.design.spec_hash?.slice(0, 16)}
                </p>
                <p className="research-note mt-1">
                  Changes require a new branch. Your assumptions and thresholds
                  remain attached to every result.
                </p>
                <Button
                  className="mt-3"
                  variant="outline"
                  onClick={() => {
                    sourceProject.current = project.id;
                    setProject(null);
                    invalidate();
                    setDesign((current) => ({
                      ...current,
                      retrospective: true,
                      exploratory: true,
                    }));
                  }}
                >
                  Create an exploratory design branch
                </Button>
              </div>
            )}
          </section>
          {!graphOnly && (
            <section className="study-panel p-5 sm:p-7">
              <div className="research-section-title">
                <FlaskConical />
                <h2>02 / Generate or upload data</h2>
              </div>
              <fieldset disabled={!!busy} className="mt-5">
                <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
                  {parameters
                    .filter(
                      (parameter) =>
                        parameter.key !== "nonparallel_trend" ||
                        design.method === "did",
                    )
                    .map((parameter) => (
                      <label key={parameter.key}>
                        <span className="study-label">{parameter.label}</span>
                        <Input
                          className="study-input"
                          type="number"
                          min={parameter.min}
                          max={parameter.max}
                          step={parameter.step}
                          value={simulation[parameter.key] as number}
                          disabled={!!file}
                          onChange={(event) => {
                            setSimulation({
                              ...simulation,
                              [parameter.key]: Number(event.target.value),
                            });
                            invalidate();
                          }}
                        />
                        <span className="research-note mt-1.5 block">
                          {parameter.hint}
                        </span>
                      </label>
                    ))}
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ["heterogeneous", "Different effects across audiences"],
                      ["overlap_failure", "Poor treatment overlap (AIPW)"],
                      ["imbalance", "Imbalanced baseline covariate (RCT)"],
                      ["duplicate_units", "Conflicting duplicate unit"],
                    ] as const
                  )
                    .filter(
                      ([key]) =>
                        key !== "overlap_failure" || design.method === "aipw",
                    )
                    .filter(
                      ([key]) => key !== "imbalance" || design.method === "rct",
                    )
                    .map(([key, label]) => (
                      <label className="flex items-center gap-3" key={key}>
                        <input
                          type="checkbox"
                          checked={simulation[key]}
                          disabled={!!file}
                          onChange={(event) => {
                            setSimulation({
                              ...simulation,
                              [key]: event.target.checked,
                            });
                            invalidate();
                          }}
                        />
                        {label}
                      </label>
                    ))}
                </div>
              </fieldset>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button
                  onClick={() => {
                    setFile(null);
                    void preview();
                  }}
                  disabled={!project || !!busy || !!file}
                >
                  <Play className="h-4 w-4" />
                  Generate & profile
                </Button>
                <Button
                  variant="outline"
                  disabled={!project || !!busy}
                  onClick={() => inputRef.current?.click()}
                >
                  <UploadCloud className="h-4 w-4" />
                  {RESEARCH_ON_DEVICE ? "Upload CSV" : "Upload CSV / Parquet"}
                </Button>
                {file && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setFile(null);
                      invalidate();
                    }}
                  >
                    Remove {file.name}
                  </Button>
                )}
              </div>
              <input
                className="hidden"
                ref={inputRef}
                type="file"
                accept={RESEARCH_ON_DEVICE ? ".csv" : ".csv,.parquet"}
                onChange={(event) => {
                  const selected = event.target.files?.[0];
                  if (selected) {
                    setFile(selected);
                    void preview(selected);
                  }
                  event.target.value = "";
                }}
              />
              <p className="research-note mt-4">
                Required columns: unit_id, treatment (control / treatment),
                outcome, guardrail, and declared covariates
                {design.method === "did" ? ", time (numeric period)" : ""}.
                Optional: segment. Uploaded rows are not retained.
              </p>
            </section>
          )}
          {profile && (
            <section className="study-panel p-5 sm:p-7">
              <h2 className="text-xl font-semibold">
                03 / Review the preparation plan
              </h2>
              <PreparationPreview profile={profile} />
              <label className="mt-5 flex items-start gap-3 rounded-lg border border-border p-4">
                <input
                  className="mt-1"
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span>
                  I confirm the recorded source and complete-case policy.{" "}
                  {profile.missing_rows
                    ? `${profile.missing_rows} rows with missing required values will be excluded.`
                    : "No required-value exclusions are proposed."}{" "}
                  Outcomes will not be imputed.
                </span>
              </label>
              <Button
                className="mt-5"
                disabled={!validProfile || !confirmed || !!busy}
                onClick={() => void analyze()}
              >
                <ShieldIcon />
                Confirm plan & analyze
                <ArrowRight className="h-4 w-4" />
              </Button>
            </section>
          )}
          {graphOnly && project && (
            <div className="research-callout">
              <h2 className="font-semibold">Continue to the evidence</h2>
              <p className="mt-2">
                Your reviewed graph and design are saved. Open the lab to create
                a linked research branch and generate or upload data.
              </p>
              <Button asChild className="mt-4">
                <Link href={`/research/lab?parent=${project.id}`}>
                  Continue in simulation lab
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          )}
          {!graphOnly && design.method !== "did" && (
            <section className="study-panel p-5 sm:p-7">
              <h2 className="text-xl font-semibold">
                Calibration / Repeated simulations
              </h2>
              <p className="research-note mt-3">
                Run independent seeds to measure bias, RMSE, and nominal 95%
                interval coverage. This is estimator evaluation; it does not
                measure a language model.
              </p>
              <div className="mt-5 flex flex-wrap items-end gap-3">
                <label>
                  <span className="study-label">Repetitions</span>
                  <Input
                    className="study-input !w-28"
                    type="number"
                    min={5}
                    max={50}
                    value={repetitions}
                    onChange={(event) =>
                      setRepetitions(Number(event.target.value))
                    }
                  />
                </label>
                <Button
                  variant="outline"
                  disabled={!!busy || simulation.duplicate_units}
                  onClick={() => void evaluate()}
                >
                  Run calibration
                </Button>
              </div>
              {evaluation && <CalibrationResult evaluation={evaluation} />}
            </section>
          )}
        </div>
        <aside className="research-lab-aside">
          <div className="study-panel p-5">
            <span className="research-tag">Research tools</span>
            <h2 className="mt-4 text-lg font-semibold">
              A study you can inspect.
            </h2>
            <ol className="mt-5 space-y-5">
              {[
                "Express causal assumptions",
                "Freeze thresholds and review policy",
                "Inspect generated or uploaded rows",
                "Estimate effects and challenge them",
                "Compare and ask about the evidence",
              ].map((step, index) => (
                <li className="flex gap-3" key={step}>
                  <span className="research-step-dot">{index + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <Link
              className="mt-6 flex items-center gap-2 text-primary"
              href="/cases"
            >
              Explore all 12 cases
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          {parentId && (
            <p className="research-note mt-4">
              This is a post-outcome exploration. It will be labelled
              retrospective and exploratory.
            </p>
          )}
        </aside>
      </div>
      {busy && (
        <div className="research-working" role="status">
          <LoaderCircle className="h-5 w-5 animate-spin" />
          {busy}…
        </div>
      )}
      {error && (
        <div className="research-error mt-5" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

function ShieldIcon() {
  return <Play className="h-4 w-4" />;
}
export function PreparationPreview({ profile }: { profile: Profile }) {
  return (
    <div className="mt-5 space-y-4">
      <div className="research-row-flow">
        <span>{profile.row_count.toLocaleString()} source rows</span>
        <ArrowRight />
        <span>{profile.missing_rows.toLocaleString()} exclusions proposed</span>
        <ArrowRight />
        <span>
          {(profile.row_count - profile.missing_rows).toLocaleString()} complete
          rows
        </span>
      </div>
      <div className="data-table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Arm</th>
              <th>Source</th>
              <th>Missing required values</th>
              <th>Missing rate</th>
              <th>Complete</th>
            </tr>
          </thead>
          <tbody>
            {profile.arms.map((arm) => (
              <tr key={arm.arm}>
                <td>{arm.arm}</td>
                <td>{arm.source_rows}</td>
                <td>{arm.excluded_rows}</td>
                <td>{(arm.missing_rate * 100).toFixed(1)}%</td>
                <td>{arm.analyzed_rows}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(profile.missing_columns.length > 0 ||
        Object.keys(profile.invalid_numeric).length > 0 ||
        profile.unknown_groups.length > 0) && (
        <p className="research-error">
          Resolve schema issues:{" "}
          {JSON.stringify({
            missing_columns: profile.missing_columns,
            invalid_numeric: profile.invalid_numeric,
            unknown_groups: profile.unknown_groups,
          })}
        </p>
      )}
      {profile.duplicate_grain_rows > 0 && (
        <p className="research-error">
          {profile.duplicate_grain_rows} rows share a conflicting unit grain.
          The analysis will record an evidence gate failure.
        </p>
      )}
      <details>
        <summary className="cursor-pointer font-medium">
          Inspect actual dataset rows
        </summary>
        <div className="data-table-scroll mt-3">
          <table className="data-table">
            <thead>
              <tr>
                {profile.columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {profile.preview.map((row, index) => (
                <tr key={index}>
                  {profile.columns.map((column) => (
                    <td key={column}>
                      {row[column] === null
                        ? "missing"
                        : typeof row[column] === "number"
                          ? Number(row[column])
                              .toFixed(3)
                              .replace(/\.000$/, "")
                          : String(row[column] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
function CalibrationResult({ evaluation }: { evaluation: Evaluation }) {
  return (
    <div className="mt-6">
      <div className="research-stat-grid">
        {[
          ["Bias", evaluation.bias.toFixed(3)],
          ["RMSE", evaluation.rmse.toFixed(3)],
          ["95% CI coverage", `${(evaluation.coverage * 100).toFixed(1)}%`],
          ["Naive RMSE", evaluation.naive_rmse.toFixed(3)],
        ].map(([label, value]) => (
          <div className="research-stat" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <p className="research-note mt-4">
        {evaluation.repetitions} independent seeds · Coverage Monte Carlo SE{" "}
        {(evaluation.coverage_monte_carlo_se * 100).toFixed(1)} percentage
        points. {evaluation.note}
      </p>
      <Button
        variant="outline"
        className="mt-4"
        onClick={() =>
          saveBlob(
            new Blob([JSON.stringify(evaluation, null, 2)], {
              type: "application/json",
            }),
            "calibration.json",
          )
        }
      >
        <Download className="h-4 w-4" />
        Download evaluation
      </Button>
      <div className="data-table-scroll mt-4 max-h-80">
        <table className="data-table">
          <thead>
            <tr>
              <th>Seed</th>
              <th>Truth</th>
              <th>Naive</th>
              <th>Estimate</th>
              <th>95% CI</th>
              <th>Covered</th>
            </tr>
          </thead>
          <tbody>
            {evaluation.runs.map((run) => (
              <tr key={run.seed}>
                <td>{run.seed}</td>
                <td>{run.truth.toFixed(3)}</td>
                <td>{run.naive.toFixed(3)}</td>
                <td>{run.estimate.toFixed(3)}</td>
                <td>
                  [{run.ci_lower.toFixed(3)}, {run.ci_upper.toFixed(3)}]
                </td>
                <td>{run.covered ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
