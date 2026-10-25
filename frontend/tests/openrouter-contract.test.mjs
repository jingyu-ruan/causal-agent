import assert from "node:assert/strict"
import test from "node:test"
import { validateOpenRouterTurn } from "../lib/openrouter-contract.ts"
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
