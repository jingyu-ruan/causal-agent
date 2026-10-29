/** IndexedDB research runtime for hosted demos and private on-device CSV analysis.
 * This is an explicit deployment mode, never an automatic estimator fallback.
 */
import { inspectGraph } from "./causal-graph";
import { referenceAnswer } from "./evidence-answer";
import {
  deviceAnalyze,
  deviceEvaluate,
  deviceGenerate,
  deviceProfile,
  numericalHash,
  parseResearchCsv,
  rowsToCsv,
  NUMERICAL_VERSION,
} from "./research-numerics";
import type {
  ResearchDesign,
  ResearchProject,
  ResearchRun,
  Simulation,
} from "./research-api";

type StoredProject = ResearchProject & {
  storage_key: string;
  workspace: string;
};
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("causal-research-device-v1", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("projects", { keyPath: "storage_key" });
    request.onerror = () =>
      reject(
        new Error(
          "Device research storage is unavailable. Allow browser storage or use the connected Python service.",
        ),
      );
    request.onsuccess = () => resolve(request.result);
  });
}
async function readProjects(workspace: string): Promise<ResearchProject[]> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("projects", "readonly"),
        request = transaction.objectStore("projects").getAll();
      request.onsuccess = () =>
        resolve(
          (request.result as StoredProject[])
            .filter((project) => project.workspace === workspace)
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .map(
              ({
                storage_key: ignoredKey,
                workspace: ignoredWorkspace,
                ...project
              }) => {
                void ignoredKey;
                void ignoredWorkspace;
                return project;
              },
            ),
        );
      request.onerror = () =>
        reject(new Error("Could not read saved research records."));
    });
  } finally {
    db.close();
  }
}
async function writeProject(project: ResearchProject, workspace: string) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("projects", "readwrite");
      transaction.objectStore("projects").put({
        ...project,
        workspace,
        storage_key: `${workspace}:${project.id}`,
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(
          new Error(
            "Could not save this research record. Export existing studies and free browser storage.",
          ),
        );
      transaction.onabort = () =>
        reject(new Error("Research storage transaction was interrupted."));
    });
  } finally {
    db.close();
  }
}
function validateSimulation(simulation: Simulation) {
  const bounds: [keyof Simulation, number, number][] = [
    ["seed", 0, 2147483647],
    ["sample_size", 100, 10000],
    ["true_effect", -3, 3],
    ["confounding", 0, 5],
    ["noise", 0.1, 3],
    ["missing_rate", 0, 0.4],
    ["treatment_missing_extra", 0, 0.4],
    ["guardrail_effect", -2, 2],
    ["nonparallel_trend", -0.5, 0.5],
  ];
  for (const [key, min, max] of bounds)
    if (
      typeof simulation[key] !== "number" ||
      !Number.isFinite(simulation[key]) ||
      Number(simulation[key]) < min ||
      Number(simulation[key]) > max
    )
      throw new Error(`Invalid simulation parameter: ${key}.`);
  if (
    !Number.isInteger(simulation.sample_size) ||
    !Number.isInteger(simulation.seed)
  )
    throw new Error("Sample size and seed must be integers.");
}
async function freeze(design: ResearchDesign): Promise<ResearchDesign> {
  const { spec_hash: ignored, ...copy } = design;
  void ignored;
  if (!copy.title.trim() || !copy.question.trim())
    throw new Error("Enter a title and research question.");
  if (!["rct", "did", "aipw"].includes(copy.method))
    throw new Error("Select a supported study design.");
  if (!copy.graph?.confirmed)
    throw new Error(
      "Review and confirm the causal graph before freezing this study.",
    );
  if (copy.graph.nodes.length > 12 || copy.graph.edges.length > 40)
    throw new Error("Use at most 12 graph nodes and 40 arrows.");
  const advice = inspectGraph(copy.graph, copy.covariates);
  if (copy.method === "aipw" && advice.unsafe_adjustment.length)
    throw new Error(
      "The adjustment set includes an unobserved, post-treatment, or unknown variable.",
    );
  if (
    new Set(copy.covariates).size !== copy.covariates.length ||
    copy.covariates.length > 6 ||
    (copy.method === "aipw" && !copy.covariates.length) ||
    copy.covariates.some(
      (name) =>
        !/^[A-Za-z][A-Za-z0-9_]*$/.test(name) ||
        ["unit_id", "treatment", "outcome", "guardrail", "time"].includes(name),
    )
  )
    throw new Error(
      "Declare up to six unique pre-treatment covariate columns.",
    );
  if (
    copy.graph.nodes.some(
      (node) =>
        ["mediator", "collider", "treatment", "outcome"].includes(node.role) &&
        copy.covariates.includes(node.id),
    )
  )
    throw new Error(
      "Do not adjust for treatment, outcome, mediators, or colliders.",
    );
  for (const [name, min, max] of [
    ["minimum_effect", 0, 10],
    ["harm_tolerance", -0.000001, 10],
    ["balance_threshold", 0, 1],
    ["missingness_gap_threshold", 0, 1],
    ["overlap_tail_threshold", 0, 0.5],
  ] as const)
    if (!Number.isFinite(copy[name]) || copy[name] <= min || copy[name] > max)
      throw new Error(`Invalid frozen threshold: ${name}.`);
  if (
    !Number.isInteger(copy.treatment_start) ||
    copy.treatment_start < 4 ||
    copy.treatment_start > 20
  )
    throw new Error(
      "DiD intervention period must be an integer between 4 and 20.",
    );
  return { ...copy, spec_hash: await numericalHash(copy) };
}
async function projectById(id: string, workspace: string) {
  const project = (await readProjects(workspace)).find(
    (project) => project.id === id,
  );
  if (!project)
    throw new Error("Research project not found in this browser workspace.");
  return project;
}
async function run(
  project: ResearchProject,
  workspace: string,
  simulation: Simulation | null,
  confirmed: boolean,
  file?: File,
) {
  if (simulation) validateSimulation(simulation);
  const content = file
    ? await file.text()
    : rowsToCsv(deviceGenerate(project.design, simulation!));
  const rows = file
    ? parseResearchCsv(content)
    : deviceGenerate(project.design, simulation!);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const result = await deviceAnalyze(
    rows,
    project.design,
    confirmed,
    simulation,
  );
  if (file) result.profile.preview = [];
  if (project.design.method === "aipw" && project.design.graph) {
    const advice = inspectGraph(
      project.design.graph,
      project.design.covariates,
    );
    result.diagnostics.push({
      code: "backdoor_adjustment",
      status: advice.backdoor_blocked ? "pass" : "fail",
      message: advice.explanation,
    });
    if (!advice.backdoor_blocked) {
      result.decision = {
        status: "insufficient_evidence",
        summary:
          "The declared graph does not support the selected adjustment set.",
        rationale: [advice.explanation],
      };
      result.critic.final_decision = "insufficient_evidence";
      result.critic.status = "blocked";
    }
  }
  const record: ResearchRun = {
    id: `rrun_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`,
    project_id: project.id,
    created_at: new Date().toISOString(),
    source_kind: file ? "upload" : "synthetic",
    filename: file?.name ?? "synthetic.csv",
    source_sha256: await numericalHash(
      file ? await file.arrayBuffer() : content,
    ),
    simulation,
    result,
  };
  project.runs = [record, ...(project.runs ?? [])];
  await writeProject(project, workspace);
  return record;
}
export async function deviceRequest<T>(
  path: string,
  body: unknown,
  workspace: string,
): Promise<T> {
  const url = new URL(path, "https://device.invalid"),
    route = url.pathname;
  const result = await (async () => {
    if (route === "/projects" && body === undefined)
      return readProjects(workspace);
    if (route === "/projects" && body !== undefined) {
      const design = await freeze(body as ResearchDesign),
        project: ResearchProject = {
          id: `research_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`,
          design,
          parent_id: null,
          branch_reason: null,
          case_id: null,
          created_at: new Date().toISOString(),
          runs: [],
          computation: NUMERICAL_VERSION,
        };
      await writeProject(project, workspace);
      return project;
    }
    if (route === "/evaluate") {
      const payload = body as {
        method: "rct" | "aipw";
        repetitions: number;
        simulation: Simulation;
      };
      validateSimulation(payload.simulation);
      if (!["rct", "aipw"].includes(payload.method))
        throw new Error("Calibration supports RCT and AIPW.");
      const design = {
        method: payload.method,
        covariates: ["engagement", "age_score"],
        overlap_tail_threshold: 0.1,
      } as ResearchDesign;
      return deviceEvaluate(design, payload.simulation, payload.repetitions);
    }
    const caseMatch = route.match(/^\/cases\/([^/]+)\/open$/);
    if (caseMatch) {
      const response = await fetch(
        `/research/${encodeURIComponent(caseMatch[1])}.json`,
      );
      if (!response.ok) throw new Error("Reference case not found.");
      const reference = (await response.json()) as ResearchProject;
      const existing = (await readProjects(workspace)).find(
        (project) => project.case_id === caseMatch[1] && !project.parent_id,
      );
      if (existing) return existing;
      const project: ResearchProject = {
        ...reference,
        id: `research_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`,
        reference_snapshot: false,
        created_at: new Date().toISOString(),
        runs: [],
        computation: NUMERICAL_VERSION,
      };
      await writeProject(project, workspace);
      await run(project, workspace, reference.runs![0].simulation, true);
      return project;
    }
    const match = route.match(/^\/projects\/([^/]+)(.*)$/);
    if (!match) throw new Error("Unknown on-device research operation.");
    const project = await projectById(match[1], workspace),
      operation = match[2];
    if (!operation) return project;
    if (operation === "/preview") {
      const simulation = body as Simulation;
      validateSimulation(simulation);
      return deviceProfile(
        deviceGenerate(project.design, simulation),
        project.design,
      );
    }
    if (operation === "/runs") {
      const payload = body as {
        simulation: Simulation;
        confirm_cleaning: boolean;
      };
      return run(
        project,
        workspace,
        payload.simulation,
        payload.confirm_cleaning,
      );
    }
    if (operation === "/branch") {
      const payload = body as { design: ResearchDesign; reason: string };
      if (payload.reason.trim().length < 3)
        throw new Error("Record a reason for this exploratory branch.");
      const design = await freeze({
          ...payload.design,
          exploratory: true,
          retrospective: true,
        }),
        branch: ResearchProject = {
          id: `research_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`,
          design,
          parent_id: project.id,
          branch_reason: payload.reason,
          case_id: project.case_id,
          created_at: new Date().toISOString(),
          runs: [],
          computation: NUMERICAL_VERSION,
        };
      await writeProject(branch, workspace);
      return branch;
    }
    if (operation === "/ask") {
      const payload = body as {
        run_id: string;
        question: string;
        context?: string[];
      };
      const record = project.runs?.find((run) => run.id === payload.run_id);
      if (!record) throw new Error("Selected run not found.");
      return referenceAnswer(record.result, payload.question, record.id);
    }
    if (operation === "/upload/profile" || operation === "/upload") {
      const file = (body as FormData).get("file");
      if (!(file instanceof File)) throw new Error("Attach a CSV dataset.");
      if (!file.name.toLowerCase().endsWith(".csv"))
        throw new Error(
          "On-device analysis accepts CSV. Use the connected Python service for Parquet.",
        );
      if (file.size > 10 * 1024 * 1024)
        throw new Error("Use a CSV smaller than 10 MB.");
      const content = await file.text(),
        source = await numericalHash(await file.arrayBuffer());
      if (operation === "/upload/profile")
        return {
          ...deviceProfile(parseResearchCsv(content), project.design),
          source_sha256: source,
        };
      if (url.searchParams.get("source_sha256") !== source)
        throw new Error("Profile and confirm this exact file first.");
      return run(
        project,
        workspace,
        null,
        url.searchParams.get("confirm_cleaning") === "true",
        file,
      );
    }
    throw new Error("Unknown on-device research operation.");
  })();
  return result as T;
}
export async function deviceArtifact(
  path: string,
  workspace: string,
): Promise<Blob> {
  const match = path.match(/^\/projects\/([^/]+)(.*)$/);
  if (!match) throw new Error("Unknown artifact.");
  const project = await projectById(match[1], workspace);
  if (match[2] === "/export")
    return new Blob([JSON.stringify(project, null, 2)], {
      type: "application/json",
    });
  const runId = match[2].match(/^\/runs\/([^/]+)\/data$/)?.[1],
    record = project.runs?.find((run) => run.id === runId);
  if (!record?.simulation)
    throw new Error("Uploaded rows are not retained. Use your original CSV.");
  const content = rowsToCsv(deviceGenerate(project.design, record.simulation));
  if ((await numericalHash(content)) !== record.source_sha256)
    throw new Error(
      "Generator version differs from this record; the original dataset cannot be reproduced.",
    );
  return new Blob([content], { type: "text/csv" });
}
