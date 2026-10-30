import assert from "node:assert/strict"
import test from "node:test"
import { OPENROUTER_SYSTEM_PROMPT, validateOpenRouterTurn } from "../lib/openrouter-contract.ts"
const state = { draft: {}, captured_fields: [], locale: "en" }
const turn = { message: "What decision should the study support?", draft_patch: { mode: "prospective" }, blocks: [], next_action: "review" }
test("free model cannot advance an incomplete study to review", () => {
 const result = validateOpenRouterTurn(turn, state)
 assert.equal(result.ready_to_freeze, false)
 assert.equal(result.next_action, "collect")
 assert.equal(result.provider, "openrouter")
 assert.ok(result.missing_fields.includes("business_question"))
 assert.ok(result.blocks[0].fields.length)
})
test("suggested answers stay unconfirmed until accepted by the user", () => {
 const result = validateOpenRouterTurn({ ...turn, draft_patch: { business_question: "Suggested decision" }, blocks: [{ type: "form", id: "decision", title: "Decision", fields: [{ id: "business_question", control: "textarea", label: "Decision?", suggested_value: "Suggested decision" }] }] }, state)
 assert.equal(result.draft_patch.business_question, undefined)
 assert.equal(result.captured_fields.includes("business_question"), false)
})
test("model output rejects fabricated analysis fields and invalid values", () => {
 assert.throws(() => validateOpenRouterTurn({ ...turn, draft_patch: { p_value: 0.01 } }, state))
 assert.throws(() => validateOpenRouterTurn({ ...turn, draft_patch: { allocation_treatment: 1.5 } }, state))
 assert.throws(() => validateOpenRouterTurn({ ...turn, draft_patch: { mode: "invented" } }, state))
})
test("a radio form must provide enough choices", () => {
 assert.throws(() => validateOpenRouterTurn({ ...turn, blocks: [{ type: "form", id: "mode", title: "Mode", fields: [{ id: "mode", label: "Mode?", control: "radio", options: [] }] }] }, state))
})
test("empty guardrails are confirmed and completeness is computed locally", () => {
 const draft = { mode: "prospective", business_question: "Should onboarding launch?", hypothesis: "It improves activation", population: "New users", intervention: "Guided onboarding", comparison: "Current onboarding", primary_metric: "activation", metric_type: "binary", primary_direction: "increase", success_threshold: 0.01, guardrails: [], design_type: "rct", randomization_unit: "user_id", control_group: "control", treatment_group: "treatment", metric_window_days: 7, allocation_treatment: 0.5, baseline_rate: 0.2, traffic_per_day: 1000 }
 const result = validateOpenRouterTurn({ ...turn, draft_patch: {}, next_action: "collect" }, { ...state, draft, captured_fields: Object.keys(draft) })
 assert.equal(result.ready_to_freeze, true)
 assert.deepEqual(result.blocks, [])
 assert.equal(result.next_action, "review")
})
test("the recovery form and system prompt stay English under a Chinese locale", () => {
 const cjk = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/u
 const result = validateOpenRouterTurn({ ...turn, message: "继续", draft_patch: {}, blocks: [], next_action: "collect" }, { draft: {}, captured_fields: [], locale: "zh-CN" })
 const block = result.blocks[0]
 const copy = [block.title, block.description, block.submit_label, ...block.fields.flatMap(field => [field.label, field.placeholder, field.helper_text])].filter(Boolean).join(" ")
 assert.equal(block.title, "Study details")
 assert.equal(block.submit_label, "Continue")
 assert.equal(block.fields[0].label, "Is this study prospective or retrospective?")
 assert.ok(!cjk.test(copy), copy)
 assert.ok(OPENROUTER_SYSTEM_PROMPT.includes("Always reply in English"))
 assert.ok(!cjk.test(OPENROUTER_SYSTEM_PROMPT))
})
