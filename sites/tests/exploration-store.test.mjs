import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier)) {
      try {
        return next(specifier + ".ts", context);
      } catch {}
    }
    return next(specifier, context);
  },
});
const { enrichAnalysis, restoreExploration, saveArtifact, sha256 } =
  await import("../worker/exploration-store.ts");
const { generateCsv } = await import("../worker/synthetic-data.ts");
function dbFixture() {
  const records = new Map();
  return {
    records,
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async run() {
              const [id, study_id, dataset_hash, kind, payload, created_at] =
                values;
              if (!records.has(id))
                records.set(id, {
                  id,
                  study_id,
                  dataset_hash,
                  kind,
                  payload,
                  created_at,
                });
            },
            async first() {
              const record = records.get(values[0]);
              if (!record) return null;
              if (
                sql.includes("kind = 'manifest'") &&
                record.kind !== "manifest"
              )
                return null;
              if (
                sql.includes("kind = 'exploration'") &&
                (record.kind !== "exploration" ||
                  record.study_id !== values[1] ||
                  record.dataset_hash !== values[2])
              )
                return null;
              return record;
            },
          };
        },
      };
    },
  };
}
const frozen = {
  study_id: "study_a",
  contract: {
    unit: "id",
    primary_metric: {
      name: "y",
      kind: "continuous",
      direction: "higher_is_better",
      minimum_effect: 1,
    },
    guardrails: [],
  },
  design: {
    design_type: "randomized_ab",
    allocations: [
      { label: "control", fraction: 0.5, required_n: 10000 },
      { label: "treatment", fraction: 0.5, required_n: 10000 },
    ],
    fixed_random_seed: 42,
    minimum_pre_periods: 3,
    minimum_group_size: 20,
    treatment_start: null,
  },
  data_contract: {
    fields: [
      { logical_name: "id", role: "unit" },
      { logical_name: "t", role: "treatment" },
    ],
  },
};
function response(id = "run_a") {
  return {
    id: "study_a",
    analysis: {
      dataset: { sha256: "working_hash" },
      primary_estimate: { effect: 1 },
      diagnostics: [],
    },
    runs: [{ id, result: { dataset: { sha256: "working_hash" } } }],
  };
}
function form(csv) {
  const form = new FormData();
  form.append("file", new File([csv], "demo.csv", { type: "text/csv" }));
  form.append(
    "mapping_json",
    JSON.stringify({
      unit_col: "id",
      treatment_col: "t",
      metric_cols: { y: "y" },
      dimension_cols: ["audience", "platform"],
    }),
  );
  form.append("options_json", JSON.stringify({ explore_effects: true }));
  return form;
}
test("hosted analysis persists an aggregate artifact and restores it for the exact immutable run", async () => {
  const db = dbFixture(),
    parameters = {
      scenario: "mixed",
      baseline_value: 10,
      outcome_standard_deviation: 0.5,
    },
    csv = generateCsv(frozen, parameters).csv,
    hash = await sha256(csv);
  await saveArtifact(
    db,
    "study_a:" + hash,
    "study_a",
    hash,
    "manifest",
    parameters,
  );
  const enriched = await enrichAnalysis(db, form(csv), frozen, response());
  assert(
    enriched.analysis.exploration.leaves.some(
      (l) => l.significant && l.effect < -2,
    ),
  );
  assert.equal(enriched.analysis.exploration.truth.scenario, "mixed");
  const restored = await restoreExploration(db, response());
  assert.deepEqual(
    restored.analysis.exploration,
    enriched.analysis.exploration,
  );
  assert.deepEqual(
    restored.runs[0].result.exploration,
    enriched.analysis.exploration,
  );
  const newer = await restoreExploration(
    db,
    response("run_without_exploration"),
  );
  assert.equal(newer.analysis.exploration, undefined);
  const altered = await enrichAnalysis(
    db,
    form(csv + "\n"),
    frozen,
    response("run_modified"),
  );
  assert.equal(altered.analysis.exploration.truth, undefined);
  assert(
    ![...db.records.values()].some((r) =>
      r.payload.includes("synthetic_0000000"),
    ),
  );
});
test("hosted failed evidence gate refuses tree and policy inference", async () => {
  const db = dbFixture(),
    payload = response();
  payload.analysis.diagnostics = [{ status: "fail", code: "srm" }];
  const enriched = await enrichAnalysis(
    db,
    form("id,t,y\n1,control,0\n"),
    frozen,
    payload,
  );
  assert(enriched.analysis.exploration.reason);
  assert.deepEqual(enriched.analysis.exploration.leaves, []);
});
