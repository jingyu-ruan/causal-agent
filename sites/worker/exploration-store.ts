import {
  discoverEffects,
  parseCsv,
  type Row,
  type Exploration,
} from "../lib/effect-explorer";
import { scenarioEffect } from "../lib/scenario-lab";
import type { FrozenStudy, SyntheticParameters } from "./synthetic-data";

type Payload = Record<string, any>; // External Python compatibility boundary, validated before estimation.
export async function sha256(text: string | ArrayBuffer) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        typeof text === "string" ? new TextEncoder().encode(text) : text,
      ),
    ),
  ]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
export async function saveArtifact(
  db: D1Database | undefined,
  id: string,
  studyId: string,
  hash: string,
  kind: string,
  payload: unknown,
) {
  if (!db) throw new Error("Exploration storage is unavailable");
  await db
    .prepare(
      "INSERT INTO exploration_artifacts (id, study_id, dataset_hash, kind, payload, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING",
    )
    .bind(id, studyId, hash, kind, JSON.stringify(payload), Date.now())
    .run();
}
export async function restoreExploration(
  db: D1Database | undefined,
  payload: Payload,
) {
  const hash =
    payload.analysis?.dataset?.sha256 ?? payload.result?.dataset?.sha256;
  const runId = payload.runs?.[0]?.id;
  if (!db || !hash || !runId) return payload;
  const record = await db
    .prepare(
      "SELECT payload FROM exploration_artifacts WHERE id = ? AND study_id = ? AND dataset_hash = ? AND kind = 'exploration'",
    )
    .bind(runId, payload.id ?? payload.study_id, hash)
    .first<{ payload: string }>();
  if (record) {
    const exploration = JSON.parse(record.payload);
    payload.analysis = { ...(payload.analysis ?? payload.result), exploration };
    if (payload.runs?.[0]?.result)
      payload.runs[0].result.exploration = exploration;
  }
  return payload;
}
function clean(rows: Row[], operations: Payload[], metrics: Payload[]) {
  let result = rows;
  for (const operation of operations) {
    const columns: string[] = operation.columns ?? [];
    if (operation.operation === "trim_string_values")
      result = result.map((row) => ({
        ...row,
        ...Object.fromEntries(
          columns.map((c) => [c, String(row[c] ?? "").trim()]),
        ),
      }));
    if (operation.operation === "drop_exact_duplicates") {
      const seen = new Set<string>();
      result = result.filter((row) => {
        const key = JSON.stringify(row);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    if (operation.operation === "drop_missing_required")
      result = result.filter((row) =>
        columns.every(
          (c) => row[c] !== undefined && String(row[c]).trim() !== "",
        ),
      );
    if (operation.operation === "fill_missing_dimensions")
      result = result.map((row) => ({
        ...row,
        ...Object.fromEntries(
          columns.map((c) => [c, String(row[c] ?? "").trim() || "(missing)"]),
        ),
      }));
    if (operation.operation === "drop_invalid_metric_values")
      result = result.filter((row) =>
        columns.every((c) => {
          const metric = metrics.find((m) => m.column === c);
          const n = Number(row[c]);
          return (
            String(row[c]).trim() !== "" &&
            Number.isFinite(n) &&
            (metric?.kind !== "binary" || n === 0 || n === 1)
          );
        }),
      );
  }
  return result;
}
export async function enrichAnalysis(
  db: D1Database | undefined,
  form: FormData,
  frozen: FrozenStudy,
  payload: Payload,
) {
  const options = JSON.parse(String(form.get("options_json") ?? "{}"));
  if (!options.explore_effects) return payload;
  const file = form.get("file");
  if (!(file instanceof File))
    throw new Error("CSV file required for exploration");
  const analysis = payload.analysis ?? payload.result;
  const source = await file.text(),
    sourceHash = await sha256(await file.arrayBuffer()),
    studyId = payload.id ?? payload.study_id;
  let result: Exploration;
  if (
    !analysis?.primary_estimate ||
    analysis.diagnostics?.some((d: Payload) => d.status === "fail")
  )
    result = {
      version: 1,
      nodes: [],
      leaves: [],
      reason:
        "Resolve failed evidence gates before discovering treatment effects.",
    };
  else if (frozen.design.design_type !== "randomized_ab")
    result = {
      version: 1,
      nodes: [],
      leaves: [],
      reason: "Tree discovery currently supports randomized studies only.",
    };
  else if (!file.name.toLowerCase().endsWith(".csv"))
    result = {
      version: 1,
      nodes: [],
      leaves: [],
      reason:
        "Hosted tree discovery accepts CSV. Export Parquet to CSV for this exploratory chapter.",
    };
  else {
    const mapping = JSON.parse(String(form.get("mapping_json"))),
      metric = frozen.contract.primary_metric;
    const metrics = [metric, ...frozen.contract.guardrails].map((m) => ({
      ...m,
      column: mapping.metric_cols[m.name],
    }));
    const rows = clean(
      parseCsv(source),
      options.cleaning_plan?.operations ?? [],
      metrics,
    );
    const manifest = await db
      ?.prepare(
        "SELECT payload FROM exploration_artifacts WHERE id = ? AND kind = 'manifest'",
      )
      .bind(studyId + ":" + sourceHash)
      .first<{ payload: string }>();
    const parameters: SyntheticParameters | undefined = manifest
      ? JSON.parse(manifest.payload)
      : undefined;
    result = discoverEffects({
      rows,
      unit: mapping.unit_col,
      treatment: mapping.treatment_col,
      outcome: mapping.metric_cols[metric.name],
      treatmentLabel: frozen.design.allocations[1].label,
      probability: frozen.design.allocations[1].fraction,
      features: mapping.dimension_cols ?? [],
      excluded: [
        mapping.unit_col,
        mapping.treatment_col,
        mapping.time_col,
        ...Object.values(mapping.metric_cols),
        ...Object.values(mapping.covariate_cols ?? {}),
      ].filter(Boolean) as string[],
      seed: frozen.design.fixed_random_seed,
      alpha: frozen.design.alpha ?? 0.05,
      minimumEffect: metric.minimum_effect,
      benefitSign: metric.direction === "higher_is_better" ? 1 : -1,
      ...(parameters
        ? {
            truth: {
              scenario: parameters.scenario ?? "homogeneous",
              effect: (row: Row) => scenarioEffect(row, metric, parameters),
            },
          }
        : {}),
    });
  }
  const runId = payload.runs?.[0]?.id ?? crypto.randomUUID();
  await saveArtifact(
    db,
    runId,
    studyId,
    analysis.dataset.sha256,
    "exploration",
    result,
  );
  payload.analysis = { ...analysis, exploration: result };
  if (payload.runs?.[0]?.result) payload.runs[0].result.exploration = result;
  return payload;
}
