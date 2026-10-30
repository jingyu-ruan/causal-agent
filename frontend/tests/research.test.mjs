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
test("Chinese questions keep their routing and citations but are answered in English", async () => {
  const project = JSON.parse(await readFile(new URL("../public/research/rct-stop.json", import.meta.url), "utf8"))
  const run = project.runs[0]
  const cjk = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/u
  const pairs = [
    ["为什么是这个决策？", "Why this decision?"],
    ["护栏指标受到了什么影响？", "Which guardrail caused harm?"],
    ["分群结果有什么差异？", "Which audience differs?"],
    ["效应估计是多少？", "What is the causal effect?"],
    ["数据清洗做了什么？", "What data was cleaned?"],
    ["下一步建议是什么？", "What should we do next?"],
    ["有哪些假设和局限？", "What are the limitations?"],
    ["这能保证对个人有效吗？", "Does this guarantee an individual effect?"],
    ["今天的天气怎么样？", "What is the weather?"],
  ]
  for (const [chinese, english] of pairs) {
    const answer = referenceAnswer(run.result, chinese, run.id)
    const reference = referenceAnswer(run.result, english, run.id)
    assert.equal(answer.tools[0], reference.tools[0], chinese)
    assert.equal(answer.supported, reference.supported, chinese)
    assert.deepEqual(answer.citations, reference.citations, chinese)
    assert.equal(answer.answer, reference.answer, chinese)
    assert.ok(answer.answer.length > 0, chinese)
    assert.ok(!cjk.test(answer.answer), `${chinese} -> ${answer.answer}`)
  }
})
