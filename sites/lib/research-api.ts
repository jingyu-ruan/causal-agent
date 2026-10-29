import { API_BASE_URL, RESEARCH_ON_DEVICE } from "@/lib/config";
import { workspaceKey } from "@/lib/conversation-api";

export type Method = "rct" | "did" | "aipw";
export type GraphNode = {
  id: string;
  label: string;
  role:
    | "treatment"
    | "outcome"
    | "confounder"
    | "mediator"
    | "collider"
    | "context";
  observed?: boolean;
};
export type CausalGraph = {
  nodes: GraphNode[];
  edges: { source: string; target: string }[];
  confirmed: boolean;
};
export type ResearchDesign = {
  title: string;
  question: string;
  method: Method;
  minimum_effect: number;
  harm_tolerance: number;
  covariates: string[];
  graph: CausalGraph | null;
  retrospective: boolean;
  exploratory: boolean;
  balance_threshold: number;
  missingness_gap_threshold: number;
  overlap_tail_threshold: number;
  treatment_start: number;
  spec_hash?: string;
};
export type Simulation = {
  seed: number;
  sample_size: number;
  true_effect: number;
  confounding: number;
  noise: number;
  missing_rate: number;
  treatment_missing_extra: number;
  guardrail_effect: number;
  nonparallel_trend: number;
  heterogeneous: boolean;
  overlap_failure: boolean;
  imbalance: boolean;
  duplicate_units: boolean;
};
export type ResearchCase = {
  id: string;
  title: string;
  question: string;
  method: Method;
  expected: string;
  theme: string;
  lesson: string;
  simulation: Simulation;
  graph: CausalGraph;
};
export type Estimate = {
  effect: number;
  standard_error: number;
  ci_lower: number;
  ci_upper: number;
  p_value: number;
  method: string;
  control_mean: number;
  treatment_mean: number;
  metric_name: string;
  n_control: number;
  n_treatment: number;
};
export type BalanceRow = {
  covariate: string;
  before: number;
  after: number | null;
};
export type Profile = {
  row_count: number;
  columns: string[];
  missing_columns: string[];
  invalid_numeric: Record<string, number>;
  unknown_groups: string[];
  missing_rows: number;
  duplicate_grain_rows: number;
  arms: {
    arm: string;
    source_rows: number;
    excluded_rows: number;
    analyzed_rows: number;
    missing_rate: number;
  }[];
  preview: Record<string, unknown>[];
  policy: string;
  source_sha256?: string;
};
export type CriticCheck = {
  code: string;
  status: string;
  title: string;
  message: string;
  details: Record<string, unknown>;
};
export type ResearchResult = {
  design: ResearchDesign;
  profile: Profile;
  dataset: {
    sha256: string;
    row_count: number;
    source_rows: number;
    excluded_rows: number;
  };
  primary_estimate: Estimate | null;
  guardrail_estimate: Estimate | null;
  naive_estimate: Estimate | null;
  observational: {
    tail_fraction: number;
    clipped_fraction: number;
    effective_sample_size: number;
    balance: BalanceRow[];
    histogram: { bin: string; control: number; treatment: number }[];
    assumptions: string[];
    folds: number;
    propensity_clip: number[];
  } | null;
  diagnostics: { code: string; status: string; message: string }[];
  event_study: {
    relative_period: number;
    effect: number;
    ci_lower: number | null;
    ci_upper: number | null;
    is_reference: boolean;
  }[];
  dimension_analyses: {
    dimension: string;
    consistency: { consistent: boolean; p_value: number } | null;
    subgroups: {
      level: string;
      estimate: Estimate;
      adjusted_p_value: number;
      significant: boolean;
      recommendation: string;
    }[];
  }[];
  decision: { status: string; summary: string; rationale: string[] };
  critic: {
    status: string;
    checks: CriticCheck[];
    windows: (Estimate & { label: string })[];
    base_decision: string;
    final_decision: string;
    policy_version: string;
    limitation: string;
  };
  truth: {
    true_effect: number;
    known: boolean;
    heterogeneous: boolean;
    note: string;
  } | null;
  trace: { tool: string; status: string }[];
};
export type ResearchRun = {
  id: string;
  project_id: string;
  created_at: string;
  source_kind: string;
  filename: string;
  source_sha256: string;
  simulation: Simulation | null;
  result: ResearchResult;
};
export type ResearchProject = {
  id: string;
  design: ResearchDesign;
  parent_id: string | null;
  branch_reason: string | null;
  case_id: string | null;
  created_at: string;
  runs?: ResearchRun[];
  reference_snapshot?: boolean;
  computation?: string;
};
export type EvidenceAnswer = {
  answer: string;
  supported: boolean;
  citations: { path: string; value: unknown }[];
  tools: string[];
  mode: string;
  run_id: string;
};
export type Evaluation = {
  method: string;
  repetitions: number;
  bias: number;
  rmse: number;
  naive_bias: number;
  naive_rmse: number;
  coverage: number;
  coverage_monte_carlo_se: number;
  overlap_flag_rate: number;
  runs: {
    seed: number;
    truth: number;
    estimate: number;
    naive: number;
    ci_lower: number;
    ci_upper: number;
    covered: boolean;
  }[];
  note: string;
};
export type GraphAdvice = {
  suggested_adjustment: string[];
  selected_adjustment: string[];
  backdoor_blocked: boolean;
  unsafe_adjustment: string[];
  unobserved: string[];
  warnings: string[];
  explanation: string;
  limitation: string;
};

export const METHOD_LABELS: Record<Method, string> = {
  rct: "Randomized A/B",
  did: "Difference-in-differences",
  aipw: "Observational · AIPW",
};
export const DEFAULT_SIMULATION: Simulation = {
  seed: 42,
  sample_size: 1200,
  true_effect: 0.6,
  confounding: 1.2,
  noise: 1,
  missing_rate: 0,
  treatment_missing_extra: 0,
  guardrail_effect: 0,
  nonparallel_trend: 0,
  heterogeneous: false,
  overlap_failure: false,
  imbalance: false,
  duplicate_units: false,
};
export function defaultDesign(method: Method = "rct"): ResearchDesign {
  return {
    title: "A new causal study",
    question:
      "Does the treatment improve customer value without increasing support cost?",
    method,
    minimum_effect: 0.2,
    harm_tolerance: 0.5,
    covariates: ["engagement", "age_score"],
    graph: null,
    retrospective: method === "aipw",
    exploratory: false,
    balance_threshold: 0.2,
    missingness_gap_threshold: 0.05,
    overlap_tail_threshold: 0.1,
    treatment_start: 6,
  };
}
export function candidateGraph(method: Method): CausalGraph {
  const graph: CausalGraph = {
    nodes: [
      {
        id: "engagement",
        label: "Prior engagement",
        role: method === "aipw" ? "confounder" : "context",
        observed: true,
      },
      {
        id: "age_score",
        label: "Account tenure",
        role: method === "aipw" ? "confounder" : "context",
        observed: true,
      },
      {
        id: "treatment",
        label: "Treatment",
        role: "treatment",
        observed: true,
      },
      { id: "outcome", label: "Outcome", role: "outcome", observed: true },
    ],
    edges: [
      { source: "treatment", target: "outcome" },
      { source: "engagement", target: "outcome" },
      { source: "age_score", target: "outcome" },
    ],
    confirmed: false,
  };
  if (method === "aipw")
    graph.edges.push(
      { source: "engagement", target: "treatment" },
      { source: "age_score", target: "treatment" },
    );
  return graph;
}

export async function researchRequest<T>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  if (RESEARCH_ON_DEVICE)
    return (await import("./research-device")).deviceRequest<T>(
      path,
      body,
      workspaceKey(),
    );
  const response = await fetch(`${API_BASE_URL}/api/research${path}`, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: {
      "X-Workspace-Key": workspaceKey(),
      ...(body instanceof FormData || body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
    },
    body:
      body instanceof FormData
        ? body
        : body === undefined
          ? undefined
          : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      detail?: unknown;
    } | null;
    throw new Error(
      typeof data?.detail === "string"
        ? data.detail
        : data?.detail
          ? JSON.stringify(data.detail)
          : `Research service unavailable (${response.status}).`,
    );
  }
  return response.json() as Promise<T>;
}
export async function downloadResearch(path: string, filename: string) {
  if (RESEARCH_ON_DEVICE) {
    saveBlob(
      await (
        await import("./research-device")
      ).deviceArtifact(path, workspaceKey()),
      filename,
    );
    return;
  }
  const response = await fetch(`${API_BASE_URL}/api/research${path}`, {
    headers: { "X-Workspace-Key": workspaceKey() },
  });
  if (!response.ok)
    throw new Error("Could not download this research artifact.");
  saveBlob(await response.blob(), filename);
}
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
