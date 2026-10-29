import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { chiSquareP, deviceAipw, deviceAnalyze, deviceDid, deviceGenerate, deviceNaive, parseResearchCsv, rowsToCsv, studentCritical, studentP } from "../lib/research-numerics.ts"

test("Student t and chi-square tails agree with SciPy reference values", () => {
  assert.ok(Math.abs(studentP(2, 20) - 0.05926553544657) < 1e-10)
  assert.ok(Math.abs(studentCritical(20) - 2.08596344726584) < 1e-10)
  assert.ok(Math.abs(chiSquareP(5.99146454710798, 2) - 0.05) < 1e-12)
  assert.ok(Math.abs(chiSquareP(3.84145882069413, 1) - 0.05) < 1e-12)
})

test("device DiD effect and clustered interval match the Python oracle on identical rows", async () => {
  const project = JSON.parse(await readFile(new URL("../public/research/did-go.json", import.meta.url), "utf8"))
  const rows = parseResearchCsv(await readFile(new URL("../public/research/did-go.csv", import.meta.url), "utf8"))
  const expected = project.runs[0].result.primary_estimate
  const actual = deviceDid(rows, 6)
  for (const key of ["effect", "standard_error", "ci_lower", "ci_upper"]) assert.ok(Math.abs(actual[key] - expected[key]) < 1e-7, `${key}: ${actual[key]} vs ${expected[key]}`)
})

test("device AIPW removes a large confounded association on the Python null dataset", async () => {
  const project = JSON.parse(await readFile(new URL("../public/research/aipw-null.json", import.meta.url), "utf8"))
  const rows = parseResearchCsv(await readFile(new URL("../public/research/aipw-null.csv", import.meta.url), "utf8"))
  const actual = deviceAipw(rows, ["engagement", "age_score"])
  assert.ok(deviceNaive(rows).effect > 0.5)
  assert.ok(Math.abs(actual.estimate.effect) < 0.1)
  assert.ok(Math.abs(actual.estimate.effect - project.runs[0].result.primary_estimate.effect) < 0.04)
  assert.ok(actual.info.tail_fraction < 0.1)
})

test("device generator is reproducible, CSV quoting round trips, and duplicates block a decision", async () => {
  const project = JSON.parse(await readFile(new URL("../public/research/rct-go.json", import.meta.url), "utf8"))
  const simulation = { ...project.runs[0].simulation, duplicate_units: true }
  const rows = deviceGenerate(project.design, simulation)
  assert.deepEqual(rows, deviceGenerate(project.design, simulation))
  const result = await deviceAnalyze(rows, project.design, true, simulation)
  assert.equal(result.decision.status, "insufficient_evidence")
  const quoted = [{ unit_id: "id,1", treatment: "control", outcome: 2.5, guardrail: null, segment: 'A "quote"' }]
  assert.deepEqual(parseResearchCsv(rowsToCsv(quoted)), quoted)
})
