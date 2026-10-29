import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { inspectGraph } from "../lib/causal-graph.ts"
import { referenceAnswer } from "../lib/evidence-answer.ts"

const candidate = { nodes: [{ id: "treatment", label: "T", role: "treatment" }, { id: "outcome", label: "Y", role: "outcome" }, { id: "x", label: "X", role: "confounder", observed: true }], edges: [{ source: "x", target: "treatment" }, { source: "x", target: "outcome" }, { source: "treatment", target: "outcome" }], confirmed: false }
test("backdoor check blocks measured confounding and refuses latent adjustment", () => {
  assert.equal(inspectGraph(candidate).backdoor_blocked, true)
  assert.equal(inspectGraph(candidate, []).backdoor_blocked, false)
  const latent = structuredClone(candidate)
  latent.nodes[2].observed = false
  assert.equal(inspectGraph(latent).backdoor_blocked, false)
  assert.equal(inspectGraph(latent, ["x"]).backdoor_blocked, false)
})
test("a directed cycle cannot be accepted as a causal graph", () => {
  const cyclic = structuredClone(candidate)
  cyclic.edges.push({ source: "outcome", target: "treatment" })
  assert.throws(() => inspectGraph(cyclic), /cycle/)
})
test("reference questions cite the selected calculated evidence and refuse unknown topics", async () => {
  const project = JSON.parse(await readFile(new URL("../public/research/rct-stop.json", import.meta.url), "utf8"))
  const run = project.runs[0]
  const decision = referenceAnswer(run.result, "Why this decision?", run.id)
  assert.deepEqual(decision.citations[0].value, run.result.decision)
  const guardrail = referenceAnswer(run.result, "Which guardrail caused harm?", run.id)
  assert.deepEqual(guardrail.citations[0].value, run.result.guardrail_estimate)
  assert.equal(referenceAnswer(run.result, "What is the weather?", run.id).supported, false)
})
