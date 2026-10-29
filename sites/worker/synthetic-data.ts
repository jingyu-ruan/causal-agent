import { scenarioEffect, type LabScenario } from "../lib/scenario-lab.ts";

/** Frozen-design synthetic inputs; truth stays in a separate generator manifest. */
type Metric = {
  name: string;
  kind: string;
  direction: string;
  minimum_effect: number;
};
type Field = { logical_name: string; role: string };
export type FrozenStudy = {
  id?: string;
  study_id: string;
  contract: { unit: string; primary_metric: Metric; guardrails: Metric[] };
  design: {
    design_type: string;
    allocations: { label: string; fraction: number; required_n?: number }[];
    alpha?: number;
    fixed_random_seed: number;
    minimum_pre_periods: number;
    minimum_group_size: number;
    treatment_start: string | number | null;
    cuped_covariate?: string;
  };
  data_contract: { fields: Field[] };
};
export type SyntheticParameters = {
  baseline_value?: number;
  outcome_standard_deviation?: number;
  scenario?: LabScenario;
};
export type Scenario = "go" | "hold" | "insufficient_evidence";

export function randomGenerator(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function csvCell(value: unknown) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}

export function generateCsv(
  study: FrozenStudy,
  parameters: SyntheticParameters = {},
  scenario?: Scenario,
) {
  const { contract, design, data_contract: dataContract } = study;
  const random = randomGenerator(design.fixed_random_seed);
  const normal = () =>
    Math.sqrt(-2 * Math.log(Math.max(random(), 1e-12))) *
    Math.cos(2 * Math.PI * random());
  const role = (name: string) => {
    const field = dataContract.fields.find((field) => field.role === name);
    if (!field)
      throw new Error("The frozen contract is missing the " + name + " field.");
    return field.logical_name;
  };
  const did = design.design_type === "difference_in_differences";
  const unit = role("unit");
  const treatment = role("treatment");
  const time = did ? role("time") : "";
  const metrics = [contract.primary_metric, ...contract.guardrails];
  const dimensions = did
    ? ["region_type"]
    : ["platform", "audience", "prior_activity"];
  const columns = [
    unit,
    treatment,
    ...(did ? [time] : []),
    ...metrics.map((metric) => metric.name),
    ...(design.cuped_covariate ? [design.cuped_covariate] : []),
    ...dimensions,
  ];
  const rows: Record<string, string | number>[] = [];
  const requested = design.allocations.reduce(
    (sum, group) => sum + (group.required_n ?? 200),
    0,
  );
  const total = Math.max(40, Math.min(requested, 100000));
  const controlN = Math.max(
    20,
    Math.round(total * design.allocations[0].fraction),
  );
  const counts = did
    ? [
        Math.max(20, design.minimum_group_size),
        Math.max(20, design.minimum_group_size),
      ]
    : [controlN, Math.max(20, total - controlN)];
  const prePeriods = Math.max(3, design.minimum_pre_periods);
  const periods = did ? prePeriods + Math.max(5, prePeriods) : 1;
  const timeValue = (index: number) => {
    const start = design.treatment_start;
    if (
      start !== null &&
      String(start).trim() &&
      Number.isFinite(Number(start))
    )
      return Number(start) + index - prePeriods;
    const date = new Date(String(start));
    if (!Number.isFinite(date.getTime()))
      throw new Error("A valid treatment start is required for panel data.");
    date.setUTCDate(date.getUTCDate() + (index - prePeriods) * 7);
    return date.toISOString().slice(0, 10);
  };
  let unitIndex = 0;
  for (let groupIndex = 0; groupIndex < 2; groupIndex++) {
    for (let member = 0; member < counts[groupIndex]; member++, unitIndex++) {
      const identity = "synthetic_" + String(unitIndex).padStart(7, "0");
      const platform = random() < 0.5 ? "web" : "mobile";
      const audience = random() < 0.5 ? "new" : "established";
      const priorActivity = Math.floor(random() * 10);
      for (let period = 0; period < periods; period++) {
        const row: Record<string, string | number> = {
          [unit]: identity,
          [treatment]: design.allocations[groupIndex].label,
        };
        if (did) row[time] = timeValue(period);
        else {
          row.platform = platform;
          row.audience = audience;
          row.prior_activity = priorActivity;
        }
        for (let metricIndex = 0; metricIndex < metrics.length; metricIndex++) {
          const metric = metrics[metricIndex];
          const primary = metricIndex === 0;
          const baseline = primary
            ? (parameters.baseline_value ??
              (metric.kind === "binary" ? 0.2 : 10))
            : metric.kind === "binary"
              ? 0.05
              : 1;
          const multiplier =
            scenario === "go" || scenario === "insufficient_evidence"
              ? 3
              : scenario === "hold"
                ? 0.25
                : 1.5;
          const effect = primary
            ? !did && parameters.scenario
              ? scenarioEffect(row, metric, parameters)
              : metric.minimum_effect *
                multiplier *
                (metric.direction === "higher_is_better" ? 1 : -1)
            : 0;
          const applied =
            groupIndex === 1 && (!did || period >= prePeriods) ? effect : 0;
          const trend = did
            ? (metric.kind === "binary" ? 0.005 : 0.3) * period
            : 0;
          const unitEffect = did
            ? (metric.kind === "binary" ? 0.002 : 0.2) * member
            : 0;
          const mean = baseline + applied + trend + unitEffect;
          row[metric.name] =
            metric.kind === "binary"
              ? Number(random() < Math.max(0.02, Math.min(0.98, mean)))
              : mean +
                normal() *
                  (primary
                    ? (parameters.outcome_standard_deviation ??
                      (did ? 0.2 : 0.5))
                    : 0.5);
        }
        if (design.cuped_covariate) row[design.cuped_covariate] = normal();
        if (did) row.region_type = member % 2 === 0 ? "urban" : "regional";
        else {
          row.platform = platform;
          row.audience = audience;
        }
        rows.push(row);
      }
    }
  }
  // Shuffle with the same generator, retaining determinism and a mixed preview.
  for (let index = rows.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [rows[index], rows[other]] = [rows[other], rows[index]];
  }
  if (scenario === "insufficient_evidence" && rows.length > 1)
    rows[1][unit] = rows[0][unit];
  return {
    csv:
      [
        columns.map(csvCell).join(","),
        ...rows.map((row) =>
          columns.map((column) => csvCell(row[column])).join(","),
        ),
      ].join("\n") + "\n",
    rows: rows.length,
    columns,
  };
}
