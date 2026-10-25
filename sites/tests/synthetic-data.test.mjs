import test from "node:test"
import assert from "node:assert/strict"
import { generateCsv } from "../worker/synthetic-data.ts"

function fixture(method = "randomized_ab") {
  const did = method === "difference_in_differences"
  return {
    study_id: "study_test",
    contract: { unit: "unit_id", primary_metric: { name: "outcome", kind: did ? "continuous" : "binary", direction: "higher_is_better", minimum_effect: did ? 1 : 0.01 }, guardrails: [] },
    design: { design_type: method, allocations: [{ label: "control", fraction: 0.4, required_n: 400 }, { label: "treatment", fraction: 0.6, required_n: 600 }], fixed_random_seed: 20250802, minimum_pre_periods: 5, minimum_group_size: 20, treatment_start: "2026-09-01" },
    data_contract: { fields: [{ logical_name: "unit_id", role: "unit" }, { logical_name: "treatment", role: "treatment" }, ...(did ? [{ logical_name: "time", role: "time" }] : []), { logical_name: "outcome", role: "metric" }] },
  }
}
function records(csv) {
  const [header, ...lines] = csv.trim().split("\n")
  const columns = header.split(",")
  return lines.map((line) => Object.fromEntries(line.split(",").map((value, index) => [columns[index], value])))
}

test("generation is reproducible and respects the declared allocation, grain and binary bounds", () => {
  const study = fixture()
  const first = generateCsv(study, { baseline_value: 0.2 })
  assert.equal(first.csv, generateCsv(study, { baseline_value: 0.2 }).csv)
  const rows = records(first.csv)
  assert.equal(rows.length, 1000)
  assert.equal(rows.filter((row) => row.treatment === "control").length, 400)
  assert.equal(rows.filter((row) => row.treatment === "treatment").length, 600)
  assert.equal(new Set(rows.map((row) => row.unit_id)).size, 1000)
  assert(rows.every((row) => ["0", "1"].includes(row.outcome)))
  assert(rows.every((row) => row.platform && row.audience))
  assert.notEqual(first.csv, generateCsv(study, { baseline_value: 0.8 }).csv)
})

test("panel generation preserves unit-period grain, treatment boundary and stable dimensions", () => {
  const result = generateCsv(fixture("difference_in_differences"), { baseline_value: 10, outcome_standard_deviation: 0.2 })
  const rows = records(result.csv)
  assert.equal(rows.length, 400)
  assert.equal(new Set(rows.map((row) => row.unit_id + ":" + row.time)).size, 400)
  assert.equal(new Set(rows.map((row) => row.time)).size, 10)
  assert(rows.some((row) => row.time === "2026-09-01"))
  for (const id of new Set(rows.map((row) => row.unit_id))) {
    const unitRows = rows.filter((row) => row.unit_id === id)
    assert.equal(unitRows.length, 10)
    assert.equal(new Set(unitRows.map((row) => row.region_type)).size, 1)
    assert.equal(new Set(unitRows.map((row) => row.treatment)).size, 1)
  }
  const before = rows.filter((row) => row.treatment === "treatment" && row.time < "2026-09-01")
  const after = rows.filter((row) => row.treatment === "treatment" && row.time >= "2026-09-01")
  const average = (rs) => rs.reduce((sum, row) => sum + Number(row.outcome), 0) / rs.length
  assert(average(after) - average(before) > 2)
})

test("the evidence-gate reference deliberately introduces a conflicting analysis unit", () => {
  const { csv } = generateCsv(fixture(), {}, "insufficient_evidence")
  const rows = records(csv)
  assert.equal(rows.length - new Set(rows.map((row) => row.unit_id)).size, 1)
})

test("CSV headers and identifiers are escaped, and incomplete contracts fail explicitly", () => {
  const study = fixture()
  study.contract.primary_metric.name = "outcome, seven day"
  assert.match(generateCsv(study).csv.split("\n")[0], /"outcome, seven day"/)
  study.data_contract.fields = []
  assert.throws(() => generateCsv(study), /missing the unit field/)
})

test("the fixed-seed GO fixture contains a larger treatment lift than the HOLD fixture", () => {
  const study = fixture()
  study.design.allocations = [{ label: "control", fraction: 0.5, required_n: 25000 }, { label: "treatment", fraction: 0.5, required_n: 25000 }]
  const lift = (scenario) => {
    const rows = records(generateCsv(study, { baseline_value: 0.2 }, scenario).csv)
    const mean = (group) => {
      const members = rows.filter((row) => row.treatment === group)
      return members.reduce((sum, row) => sum + Number(row.outcome), 0) / members.length
    }
    return mean("treatment") - mean("control")
  }
  assert(lift("go") > 0.02)
  assert(lift("hold") < 0.01)
})
