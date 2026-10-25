import assert from "node:assert/strict"
import test from "node:test"

import {
  defaultMapping,
  mappingIssues,
  parseMappingCorrections,
  suggestMapping,
} from "../lib/column-mapping.ts"

const input = {
  randomization_unit: "user_id",
  design_type: "rct",
  primary_metric: "次日留存率",
  guardrails: [],
  cuped_covariate: null,
}

test("maps a Chinese next-day retention metric to its unique English column", () => {
  const columns = [
    "user_id",
    "treatment",
    "next_day_retention_rate",
    "device_type",
    "acquisition_channel",
    "user_stage",
    "city_tier",
  ]
  const mapping = suggestMapping(defaultMapping(input), columns, input)

  assert.equal(mapping.metric_cols["次日留存率"], "next_day_retention_rate")
  assert.deepEqual(mappingIssues(mapping, columns, input), [])
})

test("keeps the metric unresolved when semantic matches are ambiguous", () => {
  const columns = ["user_id", "treatment", "next_day_retention_rate", "d1_retention_rate"]
  const mapping = suggestMapping(defaultMapping(input), columns, input)

  assert.equal(mapping.metric_cols["次日留存率"], "次日留存率")
  assert.deepEqual(mappingIssues(mapping, columns, input), ["primary metric (次日留存率)"])
})

test("accepts a Chinese role in a manual correction", () => {
  const corrected = parseMappingCorrections(defaultMapping(input), "主要指标=next_day_retention_rate", input)

  assert.equal(corrected.metric_cols["次日留存率"], "next_day_retention_rate")
})

test("accepts a Chinese physical column name in a manual correction", () => {
  const englishInput = { ...input, primary_metric: "next_day_retention_rate" }
  const corrected = parseMappingCorrections(defaultMapping(englishInput), "metric=次日留存率", englishInput)

  assert.equal(corrected.metric_cols.next_day_retention_rate, "次日留存率")
})
