# Product roadmap

The project is optimized for an interview demonstration: one credible end-to-end
decision workflow is more valuable than a catalog of partially implemented
estimators.

## Shipped in v0.3

- Domain-neutral positioning with product and game templates.
- Prospective and retrospective entry points.
- Frozen causal, design, and data contracts.
- Production-quality RCT and Difference-in-Differences golden paths.
- Diagnostics-first decisions: go, hold, stop, or insufficient evidence.
- Dataset/design hashes, immutable runs, trace, design export, and decision memo.
- Render-aware readiness UX, scoped DeepSeek credential handling, Docker, and CI gates.
- Model-driven intake with a validated interactive-form protocol and independent
  server-side completeness checks.

## P1 — make real datasets safer

1. Add a data-profile step before analysis: inferred types, missingness,
   duplicates, treatment support, grain, ranges, and a column-level preview.
2. Let the agent propose a transformation plan, but require explicit user
   approval and persist every operation in `transformation_log`.
3. Add attrition and missing-outcome policies to the frozen design so the tool
   can distinguish a precommitted rule from post-outcome cleaning.

Success criterion: a user can explain exactly why every analyzed row and column
is present, changed, or excluded.

## P2 — strengthen causal criticism

1. DiD placebo intervention dates and alternative event windows.
2. RCT covariate balance, attrition-by-arm, and repeated-peeking policy.
3. Multiple-testing policy for guardrails and declared secondary metrics.
4. Sensitivity summaries that can change GO to HOLD without changing the point
   estimate.

Success criterion: the demo includes at least one plausible-looking dataset that
the critic correctly refuses to turn into a rollout claim.

## P3 — evaluate the agent layer

1. Build a fixture set of business questions, valid routes, missing information,
   and expected clarifying questions.
2. Score route selection, contract completeness, assumption coverage, numerical
   faithfulness, and refusal behavior.
3. Evaluate the structured DeepSeek intake adapter against contract fixtures,
   then add an optional explanation adapter that receives only contracts and
   aggregate result objects and verifies every cited number.

Success criterion: agent quality is measured with repeatable evaluations rather
than a hand-picked chat transcript.

## P4 — expand methods selectively

Only add a method when it has a structured intake contract, data contract,
identification diagnostics, deterministic estimator, decision policy,
simulation-based ground truth tests, and failure-case fixtures. Candidate order:

1. Regression discontinuity.
2. Doubly robust observational estimation with overlap diagnostics.
3. Synthetic control for a single treated unit.

## Explicit non-priorities

- Training a foundation model or custom causal language model.
- A generic chatbot or broad RAG knowledge base.
- Adding many estimator names without identification gates.
- Autonomous data cleaning or silent method fallback.
- Enterprise collaboration/auth features before the single-user evidence flow is
  demonstrably reliable.
