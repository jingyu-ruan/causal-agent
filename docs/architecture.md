# Causal Decision Agent architecture

## Product boundary

Causal Decision Agent is a domain-neutral workbench for turning a decision
question into a reproducible causal study. It supports both prospective study
design and retrospective analysis, with RCT and Difference-in-Differences as the
first production-quality methods.

The intake Agent uses DeepSeek to interpret free-text and structured form
answers, while a server-owned protocol constrains the fields it can return and
independently checks contract completeness. Explicit human approval is required
before the identification strategy is frozen. Numeric results come from
deterministic Python estimators and are never invented by an LLM. Every result
remains linked to a frozen design artifact, a dataset hash, diagnostics,
assumptions, and a decision rule.

## Primary lifecycle

```mermaid
flowchart LR
    A["Decision question"] --> B["Causal contract"]
    B --> C{"Study entry"}
    C -->|"Plan new study"| D["RCT or DiD design"]
    C -->|"Analyze existing data"| E["Retrospective contract"]
    D --> F["Frozen DesignSpec"]
    E --> F
    F --> G["DataContract"]
    G --> H["Execute outside the tool"]
    H --> I["Upload analysis-ready data"]
    I --> J["Profile and validate"]
    J --> K{"Diagnostics credible?"}
    K -->|"No"| L["Insufficient evidence / redesign"]
    K -->|"Yes"| M["Deterministic estimate"]
    M --> N["Critic and decision rules"]
    N --> O{"Go / Hold / Stop"}
    O --> P["Memo, provenance, next iteration"]
    L --> P
```

## Responsibility split

| Layer | Responsibilities | Must not do |
| --- | --- | --- |
| Agent workflow | clarify the question, construct the contract, select a supported design, route checks, explain results | fabricate an effect, p-value, confidence interval, or diagnostic |
| Deterministic core | power, SRM, effect estimation, CUPED, fixed-effects DiD, clustered errors, pre-trend checks, decision rules | silently reinterpret columns or repair risky data |
| API and persistence | validate Agent JSON, restrict DeepSeek requests to the official host, validate uploads, freeze artifacts, hash datasets, persist runs, expose health/readiness | persist API keys, log API keys, or accept an arbitrary model endpoint |
| Web workbench | guide the lifecycle, render Agent-provided form controls, show assumptions and provenance, keep cold-start state honest | treat unconfirmed defaults as user answers or treat a slow free backend as a failed analysis |

## Supported contracts

### Randomized controlled trial

Required analysis data contains a stable unit identifier, treatment assignment,
the declared primary outcome, all declared guardrails, and any pre-period CUPED
covariates. The analyzer validates allocation, missingness, duplicates, support,
sample-ratio mismatch, and outcome type before estimating effects.

### Difference-in-Differences

Required analysis data contains a stable unit identifier, time, treatment-group
membership, the intervention boundary, the declared outcome, and guardrails.
The analyzer requires multiple pre-periods, estimates unit and time fixed effects
with clustered uncertainty, and reports a pre-trend/event-study diagnostic before
allowing an affirmative decision.

## Persistence model

- `StudyRecord` stores the frozen design artifact and latest analysis result.
- `StudyRunRecord` stores one immutable run, including filename, dataset SHA-256,
  row count, result, and timestamp.
- Source data is processed in memory and is not retained by the application in
  the current MVP.

## Deployment behavior

`/health` is a liveness probe. `/ready` verifies initialization and database
access. The web client polls readiness for up to two minutes because the Render
free instance can legitimately cold-start during that window.
