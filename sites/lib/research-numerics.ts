/** Portable deterministic estimators used by the on-device research lab.
 * All outcomes are continuous. Python/SciPy oracle tests verify inference.
 */
import type {
  BalanceRow,
  CriticCheck,
  Estimate,
  Evaluation,
  Profile,
  ResearchDesign,
  ResearchResult,
  Simulation,
} from "./research-api";
export type ResearchRow = Record<string, number | string | null>;
export const NUMERICAL_VERSION = "research-device-1.0";
export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
const variance = (x: number[]) => {
  const m = mean(x);
  return x.reduce((a, b) => a + (b - m) ** 2, 0) / (x.length - 1);
};
const dot = (a: number[], b: number[]) =>
  a.reduce((s, x, i) => s + x * b[i], 0);
const sigmoid = (x: number) =>
  1 / (1 + Math.exp(-Math.max(-35, Math.min(35, x))));
function logGamma(z: number): number {
  const c = [
    676.5203681218851, -1259.1392167224028, 771.3234287776531,
    -176.6150291621406, 12.507343278686905, -0.13857109526572012,
    9.984369578019572e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5)
    return (
      Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z)
    );
  z--;
  let x = 0.9999999999998099;
  c.forEach((v, i) => (x += v / (z + i + 1)));
  const t = z + 7.5;
  return (
    0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
  );
}
function betaFraction(a: number, b: number, x: number) {
  const tiny = 1e-30;
  let c = 1,
    d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m < 240; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-12) break;
  }
  return h;
}
function beta(a: number, b: number, x: number) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    logGamma(a + b) -
      logGamma(a) -
      logGamma(b) +
      a * Math.log(x) +
      b * Math.log1p(-x),
  );
  return x < (a + 1) / (a + b + 2)
    ? (bt * betaFraction(a, b, x)) / a
    : 1 - (bt * betaFraction(b, a, 1 - x)) / b;
}
export function studentP(t: number, df: number) {
  return Math.max(0, Math.min(1, beta(df / 2, 0.5, df / (df + t * t))));
}
export function studentCritical(df: number) {
  let low = 0,
    high = 100;
  for (let i = 0; i < 65; i++) {
    const middle = (low + high) / 2;
    if (studentP(middle, df) > 0.05) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}
export function normalP(z: number) {
  const x = Math.abs(z) / Math.sqrt(2),
    t = 1 / (1 + 0.3275911 * x);
  const erf =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return Math.max(0, Math.min(1, 1 - erf));
}
export function chiSquareP(value: number, df: number) {
  if (value <= 0) return 1;
  const a = df / 2,
    x = value / 2,
    g = logGamma(a);
  if (x < a + 1) {
    let sum = 1 / a,
      delta = sum;
    for (let i = 1; i < 400; i++) {
      delta *= x / (a + i);
      sum += delta;
      if (Math.abs(delta) < Math.abs(sum) * 1e-14) break;
    }
    return Math.max(0, 1 - sum * Math.exp(-x + a * Math.log(x) - g));
  }
  let b = x + 1 - a,
    c = 1e30,
    d = 1 / b,
    h = d;
  for (let i = 1; i < 400; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = b + an / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-14) break;
  }
  return Math.max(0, Math.min(1, Math.exp(-x + a * Math.log(x) - g) * h));
}
export function invert(matrix: number[][]): number[][] {
  const n = matrix.length,
    a = matrix.map((row, i) => [
      ...row,
      ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
    ]);
  for (let k = 0; k < n; k++) {
    let pivot = k;
    for (let i = k + 1; i < n; i++)
      if (Math.abs(a[i][k]) > Math.abs(a[pivot][k])) pivot = i;
    if (Math.abs(a[pivot][k]) < 1e-10)
      throw new Error(
        "The design matrix is singular; identification is not supported.",
      );
    [a[k], a[pivot]] = [a[pivot], a[k]];
    const scale = a[k][k];
    for (let j = 0; j < 2 * n; j++) a[k][j] /= scale;
    for (let i = 0; i < n; i++)
      if (i !== k) {
        const factor = a[i][k];
        for (let j = 0; j < 2 * n; j++) a[i][j] -= factor * a[k][j];
      }
  }
  return a.map((row) => row.slice(n));
}
function regression(x: number[][], y: number[], ridge = 0) {
  const p = x[0].length,
    xtx = Array.from({ length: p }, () => Array(p).fill(0) as number[]),
    xty = Array(p).fill(0) as number[];
  for (let i = 0; i < x.length; i++)
    for (let j = 0; j < p; j++) {
      xty[j] += x[i][j] * y[i];
      for (let k = 0; k < p; k++) xtx[j][k] += x[i][j] * x[i][k];
    }
  for (let j = 0; j < p; j++) xtx[j][j] += ridge;
  const inverse = invert(xtx);
  return { coefficients: inverse.map((row) => dot(row, xty)), inverse };
}
function logistic(x: number[][], t: number[]) {
  const p = x[0].length,
    b = Array(p).fill(0) as number[];
  for (let iteration = 0; iteration < 80; iteration++) {
    const h = Array.from({ length: p }, () => Array(p).fill(0) as number[]),
      g = Array(p).fill(0) as number[];
    for (let i = 0; i < x.length; i++) {
      const probability = sigmoid(dot(x[i], b)),
        weight = Math.max(1e-8, probability * (1 - probability));
      for (let j = 0; j < p; j++) {
        g[j] += x[i][j] * (t[i] - probability);
        for (let k = 0; k < p; k++) h[j][k] += weight * x[i][j] * x[i][k];
      }
    }
    for (let j = 1; j < p; j++) {
      h[j][j] += 0.01;
      g[j] -= 0.01 * b[j];
    }
    h[0][0] += 1e-8;
    const step = invert(h).map((row) => dot(row, g));
    for (let j = 0; j < p; j++) b[j] += step[j];
    if (Math.max(...step.map(Math.abs)) < 1e-8) break;
  }
  return b;
}
function summarize(
  effect: number,
  se: number,
  y0: number[],
  y1: number[],
  method: string,
  df?: number,
): Estimate {
  const critical = df ? studentCritical(df) : 1.959963984540054;
  return {
    effect,
    standard_error: se,
    ci_lower: effect - critical * se,
    ci_upper: effect + critical * se,
    p_value:
      se > 0
        ? df
          ? studentP(effect / se, df)
          : normalP(effect / se)
        : effect === 0
          ? 1
          : 0,
    method,
    control_mean: mean(y0),
    treatment_mean: mean(y1),
    n_control: y0.length,
    n_treatment: y1.length,
    metric_name: "outcome",
  };
}
export function deviceNaive(rows: ResearchRow[], metric = "outcome") {
  const y0 = rows
      .filter((row) => row.treatment === "control")
      .map((row) => Number(row[metric])),
    y1 = rows
      .filter((row) => row.treatment === "treatment")
      .map((row) => Number(row[metric]));
  if (Math.min(y0.length, y1.length) < 2)
    throw new Error(
      "At least two complete observations are needed in each arm.",
    );
  const v0 = variance(y0) / y0.length,
    v1 = variance(y1) / y1.length,
    df =
      (v0 + v1) ** 2 /
      ((v0 * v0) / (y0.length - 1) + (v1 * v1) / (y1.length - 1));
  return {
    ...summarize(
      mean(y1) - mean(y0),
      Math.sqrt(v0 + v1),
      y0,
      y1,
      "device_welch_difference",
      Math.max(1, df),
    ),
    metric_name: metric,
  };
}
export function deviceBalance(
  rows: ResearchRow[],
  covariates: string[],
  propensity?: number[],
): BalanceRow[] {
  return covariates.map((covariate) => {
    const c = rows
        .filter((row) => row.treatment === "control")
        .map((row) => Number(row[covariate])),
      t = rows
        .filter((row) => row.treatment === "treatment")
        .map((row) => Number(row[covariate]));
    const sd = Math.sqrt((variance(c) + variance(t)) / 2),
      difference = mean(t) - mean(c);
    let after = null;
    if (propensity) {
      let csum = 0,
        tsum = 0,
        cw = 0,
        tw = 0;
      rows.forEach((row, i) => {
        const p = Math.max(0.01, Math.min(0.99, propensity[i]));
        if (row.treatment === "treatment") {
          tsum += Number(row[covariate]) / p;
          tw += 1 / p;
        } else {
          csum += Number(row[covariate]) / (1 - p);
          cw += 1 / (1 - p);
        }
      });
      const delta = tsum / tw - csum / cw;
      after = sd ? delta / sd : delta ? 1e6 : 0;
    }
    return {
      covariate,
      before: sd ? difference / sd : difference ? 1e6 : 0,
      after,
    };
  });
}
export function deviceAipw(
  rows: ResearchRow[],
  covariates: string[],
  metric = "outcome",
) {
  const n = rows.length,
    t = rows.map((row) => (row.treatment === "treatment" ? 1 : 0)) as number[],
    y = rows.map((row) => Number(row[metric]));
  if (
    Math.min(
      t.reduce((a, b) => a + b, 0),
      t.filter((value) => !value).length,
    ) < 20
  )
    throw new Error(
      "AIPW requires at least 20 complete observations in each arm.",
    );
  const folds = Array(n).fill(0),
    random = seededRandom(2718);
  for (const arm of [0, 1]) {
    const indices = t
      .map((value, i) => (value === arm ? i : -1))
      .filter((i) => i >= 0);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    indices.forEach((i, k) => (folds[i] = k % 2));
  }
  const propensity = Array(n).fill(0),
    mu0 = Array(n).fill(0),
    mu1 = Array(n).fill(0);
  for (const fold of [0, 1]) {
    const train = rows.map((_, i) => i).filter((i) => folds[i] !== fold),
      test = rows.map((_, i) => i).filter((i) => folds[i] === fold);
    const means = covariates.map((name) =>
        mean(train.map((i) => Number(rows[i][name]))),
      ),
      scales = covariates.map(
        (name, j) =>
          Math.sqrt(
            mean(train.map((i) => (Number(rows[i][name]) - means[j]) ** 2)),
          ) || 1,
      );
    const transform = (i: number) => [
      1,
      ...covariates.map(
        (name, j) => (Number(rows[i][name]) - means[j]) / scales[j],
      ),
    ];
    const x = train.map(transform),
      b = logistic(
        x,
        train.map((i) => t[i]),
      );
    test.forEach((i) => (propensity[i] = sigmoid(dot(transform(i), b))));
    for (const arm of [0, 1]) {
      const selected = train.filter((i) => t[i] === arm),
        model = regression(
          selected.map(transform),
          selected.map((i) => y[i]),
          1e-8,
        );
      test.forEach(
        (i) => ((arm ? mu1 : mu0)[i] = dot(transform(i), model.coefficients)),
      );
    }
  }
  const scores = y.map((value, i) => {
    const p = Math.max(0.01, Math.min(0.99, propensity[i]));
    return (
      mu1[i] -
      mu0[i] +
      (t[i] * (value - mu1[i])) / p -
      ((1 - t[i]) * (value - mu0[i])) / (1 - p)
    );
  });
  const effect = mean(scores),
    se = Math.sqrt(variance(scores) / n),
    y0 = y.filter((_, i) => !t[i]),
    y1 = y.filter((_, i) => t[i]);
  const weights = t.map((arm, i) => {
    const p = Math.max(0.01, Math.min(0.99, propensity[i]));
    return arm ? 1 / p : 1 / (1 - p);
  });
  return {
    estimate: {
      ...summarize(effect, se, y0, y1, "device_cross_fitted_aipw_ate"),
      metric_name: metric,
    },
    info: {
      tail_fraction: propensity.filter((p) => p < 0.05 || p > 0.95).length / n,
      clipped_fraction:
        propensity.filter((p) => p < 0.01 || p > 0.99).length / n,
      effective_sample_size:
        weights.reduce((a, b) => a + b, 0) ** 2 /
        weights.reduce((a, b) => a + b * b, 0),
      balance: deviceBalance(rows, covariates, propensity),
      histogram: Array.from({ length: 10 }, (_, i) => ({
        bin: `${(i / 10).toFixed(1)}–${((i + 1) / 10).toFixed(1)}`,
        control: propensity.filter(
          (p, j) =>
            !t[j] && p >= i / 10 && (i === 9 ? p <= 1 : p < (i + 1) / 10),
        ).length,
        treatment: propensity.filter(
          (p, j) =>
            t[j] && p >= i / 10 && (i === 9 ? p <= 1 : p < (i + 1) / 10),
        ).length,
      })),
      assumptions: [
        "No unmeasured confounding given declared pre-treatment covariates",
        "Positivity",
        "Consistency and no interference",
        "At least one nuisance model correctly specified; inference also requires adequate nuisance convergence",
      ],
      folds: 2,
      propensity_clip: [0.01, 0.99],
    },
  };
}
function clusterRegression(x: number[][], y: number[], clusters: string[]) {
  const model = regression(x, y),
    p = x[0].length,
    unique = [...new Set(clusters)],
    scores = new Map(unique.map((id) => [id, Array(p).fill(0) as number[]]));
  if (unique.length < 4 || y.length <= p)
    throw new Error("Insufficient cluster degrees of freedom.");
  x.forEach((row, i) => {
    const residual = y[i] - dot(row, model.coefficients),
      score = scores.get(clusters[i])!;
    row.forEach((value, j) => (score[j] += value * residual));
  });
  const factor =
    ((unique.length / (unique.length - 1)) * (y.length - 1)) / (y.length - p);
  const covariance = (a: number, b: number) =>
    [...scores.values()].reduce(
      (sum, score) =>
        sum + dot(model.inverse[a], score) * dot(model.inverse[b], score),
      0,
    ) * factor;
  return { ...model, covariance, df: unique.length - 1 };
}
function fixedEffectMatrix(rows: ResearchRow[], extras: number[][]) {
  const units = [...new Set(rows.map((row) => String(row.unit_id)))],
    times = [...new Set(rows.map((row) => Number(row.time)))].sort(
      (a, b) => a - b,
    );
  const unitIndex = new Map(units.map((id, i) => [id, i])),
    timeIndex = new Map(times.map((time, i) => [time, i]));
  return rows.map((row, i) => [
    1,
    ...units
      .slice(1)
      .map((_, j) => (unitIndex.get(String(row.unit_id)) === j + 1 ? 1 : 0)),
    ...times
      .slice(1)
      .map((_, j) => (timeIndex.get(Number(row.time)) === j + 1 ? 1 : 0)),
    ...extras[i],
  ]);
}
export function deviceDid(
  rows: ResearchRow[],
  start: number,
  metric = "outcome",
) {
  const extras = rows.map((row) => [
      row.treatment === "treatment" && Number(row.time) >= start ? 1 : 0,
    ]),
    x = fixedEffectMatrix(rows, extras),
    y = rows.map((row) => Number(row[metric])),
    model = clusterRegression(
      x,
      y,
      rows.map((row) => String(row.unit_id)),
    ),
    index = x[0].length - 1;
  const y0 = rows
      .filter((row) => row.treatment === "control" && Number(row.time) >= start)
      .map((row) => Number(row[metric])),
    y1 = rows
      .filter(
        (row) => row.treatment === "treatment" && Number(row.time) >= start,
      )
      .map((row) => Number(row[metric]));
  return {
    ...summarize(
      model.coefficients[index],
      Math.sqrt(Math.max(0, model.covariance(index, index))),
      y0,
      y1,
      "device_twfe_unit_clustered_se",
      model.df,
    ),
    metric_name: metric,
  };
}
function eventStudy(rows: ResearchRow[], start: number) {
  const times = [...new Set(rows.map((row) => Number(row.time)))].sort(
      (a, b) => a - b,
    ),
    pre = times.filter((time) => time < start),
    reference = pre.at(-1)!,
    included = times.filter((time) => time !== reference),
    extras = rows.map((row) =>
      included.map((time) =>
        row.treatment === "treatment" && Number(row.time) === time ? 1 : 0,
      ),
    ),
    x = fixedEffectMatrix(rows, extras),
    model = clusterRegression(
      x,
      rows.map((row) => Number(row.outcome)),
      rows.map((row) => String(row.unit_id)),
    ),
    offset = x[0].length - included.length,
    critical = studentCritical(model.df);
  const preIndices = included
    .map((time, i) => (time < reference ? offset + i : -1))
    .filter((i) => i >= 0);
  let preP = 0;
  try {
    const coefficients = preIndices.map((i) => model.coefficients[i]),
      covariance = preIndices.map((i) =>
        preIndices.map((j) => model.covariance(i, j)),
      ),
      inverse = invert(covariance);
    preP = chiSquareP(
      dot(
        coefficients,
        inverse.map((row) => dot(row, coefficients)),
      ),
      preIndices.length,
    );
  } catch {
    preP = preIndices.every((i) => Math.abs(model.coefficients[i]) < 1e-8)
      ? 1
      : 0;
  }
  return {
    preP,
    points: times.map((time, index) => {
      if (time === reference)
        return {
          relative_period: index - pre.length,
          effect: 0,
          ci_lower: null,
          ci_upper: null,
          is_reference: true,
        };
      const coefficient = offset + included.indexOf(time),
        effect = model.coefficients[coefficient],
        se = Math.sqrt(Math.max(0, model.covariance(coefficient, coefficient)));
      return {
        relative_period: index - pre.length,
        effect,
        ci_lower: effect - critical * se,
        ci_upper: effect + critical * se,
        is_reference: false,
      };
    }),
  };
}
export function deviceGenerate(
  design: ResearchDesign,
  config: Simulation,
): ResearchRow[] {
  const random = seededRandom(config.seed),
    normal = () =>
      Math.sqrt(-2 * Math.log(Math.max(1e-15, random()))) *
      Math.cos(2 * Math.PI * random());
  const rows: ResearchRow[] = [];
  if (design.method === "did") {
    const periods = design.treatment_start + 6;
    let units = Math.max(
      40,
      Math.min(100, Math.floor(config.sample_size / periods)),
    );
    units -= units % 2;
    const unitNoise = Array.from({ length: units }, normal);
    for (let unit = 0; unit < units; unit++) {
      const treated = unit >= units / 2,
        age = normal(),
        segment = unit % 3;
      for (let period = 0; period < periods; period++) {
        const effect =
          config.true_effect + (config.heterogeneous ? (segment - 1) * 0.8 : 0);
        rows.push({
          unit_id: `region_${String(unit).padStart(4, "0")}`,
          treatment: treated ? "treatment" : "control",
          time: period,
          outcome:
            10 +
            unitNoise[unit] +
            0.15 * period +
            config.nonparallel_trend * Number(treated) * period +
            effect * Number(treated && period >= design.treatment_start) +
            normal() * config.noise,
          guardrail:
            2 +
            config.guardrail_effect *
              Number(treated && period >= design.treatment_start) +
            normal() * 0.3,
          engagement: unitNoise[unit],
          age_score: age,
          segment: ["New", "Returning", "Power"][segment],
        });
      }
    }
  } else {
    const n = config.sample_size,
      x = Array.from({ length: n }, () => [normal(), normal()]),
      t = Array.from({ length: n }, (_, i) => i % 2);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [t[i], t[j]] = [t[j], t[i]];
    }
    for (let i = 0; i < n; i++) {
      if (design.method === "aipw")
        t[i] =
          random() <
          sigmoid(
            (config.overlap_failure ? 7 : config.confounding) *
              (x[i][0] + 0.5 * x[i][1]),
          )
            ? 1
            : 0;
      else if (config.imbalance) x[i][0] += t[i] * 0.9;
      const segment = x[i][0] < -0.43 ? 0 : x[i][0] < 0.43 ? 1 : 2,
        effect =
          config.true_effect + (config.heterogeneous ? (segment - 1) * 0.8 : 0);
      rows.push({
        unit_id: `user_${String(i).padStart(6, "0")}`,
        treatment: t[i] ? "treatment" : "control",
        outcome:
          10 +
          config.confounding * x[i][0] +
          0.5 * x[i][1] +
          effect * t[i] +
          normal() * config.noise,
        guardrail: 2 + config.guardrail_effect * t[i] + normal() * 0.3,
        engagement: x[i][0],
        age_score: x[i][1],
        segment: ["New", "Returning", "Power"][segment],
      });
    }
  }
  for (const row of rows)
    if (
      random() <
      config.missing_rate +
        (row.treatment === "treatment" ? config.treatment_missing_extra : 0)
    )
      row.outcome = null;
  if (config.duplicate_units)
    rows.push({ ...rows[0], outcome: Number(rows[0].outcome) + 1 });
  return rows;
}
function requiredColumns(design: ResearchDesign) {
  return [
    "unit_id",
    "treatment",
    "outcome",
    "guardrail",
    ...design.covariates,
    ...(design.method === "did" ? ["time"] : []),
  ];
}
export function deviceProfile(
  rows: ResearchRow[],
  design: ResearchDesign,
): Profile {
  const columns = Object.keys(rows[0] ?? {}),
    required = requiredColumns(design),
    missing = (row: ResearchRow) =>
      required.some(
        (name) =>
          row[name] === null || row[name] === undefined || row[name] === "",
      ),
    numeric = [
      "outcome",
      "guardrail",
      ...design.covariates,
      ...(design.method === "did" ? ["time"] : []),
    ],
    invalid: Record<string, number> = {};
  for (const name of numeric) {
    const count = rows.filter(
      (row) =>
        row[name] !== null &&
        row[name] !== "" &&
        row[name] !== undefined &&
        !Number.isFinite(Number(row[name])),
    ).length;
    if (count) invalid[name] = count;
  }
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const key = JSON.stringify(
      design.method === "did" ? [row.unit_id, row.time] : [row.unit_id],
    );
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return {
    row_count: rows.length,
    columns,
    missing_columns: required.filter((name) => !columns.includes(name)),
    invalid_numeric: invalid,
    unknown_groups: [
      ...new Set(rows.map((row) => String(row.treatment))),
    ].filter((arm) => !["control", "treatment"].includes(arm)),
    missing_rows: rows.filter(missing).length,
    duplicate_grain_rows: [...counts.values()]
      .filter((count) => count > 1)
      .reduce((a, b) => a + b, 0),
    arms: ["control", "treatment"].map((arm) => {
      const group = rows.filter((row) => row.treatment === arm),
        excluded = group.filter(missing).length;
      return {
        arm,
        source_rows: group.length,
        excluded_rows: excluded,
        analyzed_rows: group.length - excluded,
        missing_rate: group.length ? excluded / group.length : 0,
      };
    }),
    preview: rows.slice(0, 8),
    policy:
      "Only confirmed complete-case removal is allowed. Outcomes are never imputed; conflicting duplicate units block identification.",
  };
}
const check = (
  code: string,
  status: string,
  title: string,
  message: string,
  details: Record<string, unknown> = {},
): CriticCheck => ({ code, status, title, message, details });
function decisionFor(
  primary: Estimate | null,
  guardrail: Estimate | null,
  design: ResearchDesign,
) {
  if (!primary || !guardrail)
    return {
      status: "insufficient_evidence",
      summary: "No reliable effect estimate is available.",
      rationale: ["Resolve the blocking evidence gates."],
    };
  if (primary.ci_upper < 0 || guardrail.ci_lower > design.harm_tolerance)
    return {
      status: "stop",
      summary: "Credible harm exceeds the frozen tolerance.",
      rationale: [
        "The primary or guardrail confidence interval establishes harm.",
      ],
    };
  if (
    primary.ci_lower > design.minimum_effect &&
    guardrail.ci_upper < design.harm_tolerance
  )
    return {
      status: "go",
      summary:
        "The effect clears the business threshold and the guardrail remains safe.",
      rationale: [
        "The primary lower confidence bound clears the frozen minimum effect.",
        "The guardrail upper confidence bound stays within tolerance.",
      ],
    };
  return {
    status: "hold",
    summary: "The evidence does not clear every frozen rollout threshold.",
    rationale: ["A positive point estimate alone is insufficient for rollout."],
  };
}
export async function numericalHash(value: unknown) {
  const canonicalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(canonicalize);
    if (item && typeof item === "object")
      return Object.fromEntries(
        Object.entries(item)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, entry]) => [key, canonicalize(entry)]),
      );
    return item;
  };
  const digest = await crypto.subtle.digest(
    "SHA-256",
    value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : new TextEncoder().encode(
          typeof value === "string"
            ? value
            : JSON.stringify(canonicalize(value)),
        ),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
export function rowsToCsv(rows: ResearchRow[]) {
  const columns = Object.keys(rows[0] ?? {}),
    escape = (value: unknown) => {
      const text = value === null || value === undefined ? "" : String(value);
      return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    };
  return (
    [
      columns.join(","),
      ...rows.map((row) =>
        columns.map((column) => escape(row[column])).join(","),
      ),
    ].join("\n") + "\n"
  );
}
export function parseResearchCsv(text: string): ResearchRow[] {
  const records: string[][] = [];
  let record: string[] = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      record.push(field);
      field = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      if (record.some((value) => value !== "")) records.push(record);
      record = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw new Error("Unterminated quoted CSV field.");
  if (field || record.length) {
    record.push(field);
    records.push(record);
  }
  const columns = (records.shift() ?? []).map((name) =>
    name.replace(/^\uFEFF/, ""),
  );
  if (columns.length !== new Set(columns).size)
    throw new Error("CSV column names must be unique.");
  if (!records.length || records.length > 10000)
    throw new Error("Upload between 1 and 10,000 CSV rows.");
  return records.map((record) => {
    if (record.length !== columns.length)
      throw new Error("CSV rows have inconsistent column counts.");
    return Object.fromEntries(
      columns.map((name, i) => [
        name,
        record[i] === ""
          ? null
          : ["unit_id", "treatment", "segment"].includes(name)
            ? record[i]
            : Number.isFinite(Number(record[i]))
              ? Number(record[i])
              : record[i],
      ]),
    );
  });
}
export async function deviceAnalyze(
  rows: ResearchRow[],
  design: ResearchDesign,
  confirmed = false,
  simulation: Simulation | null = null,
): Promise<ResearchResult> {
  const profile = deviceProfile(rows, design);
  if (
    profile.missing_columns.length ||
    Object.keys(profile.invalid_numeric).length ||
    profile.unknown_groups.length
  )
    throw new Error(
      "Resolve schema, numeric-value, and treatment-label issues before analysis.",
    );
  if (profile.missing_rows && !confirmed)
    throw new Error("Confirm the complete-case preparation policy first.");
  const required = requiredColumns(design),
    working = rows.filter((row) =>
      required.every(
        (name) =>
          row[name] !== null && row[name] !== undefined && row[name] !== "",
      ),
    );
  const checks: CriticCheck[] = [],
    diagnostics: ResearchResult["diagnostics"] = [],
    windows: (Estimate & { label: string })[] = [];
  let primary: Estimate | null = null,
    guardrail: Estimate | null = null,
    naive: Estimate | null = null,
    observational: ResearchResult["observational"] = null,
    event: ResearchResult["event_study"] = [];
  let subgroups: ResearchResult["dimension_analyses"] = [];
  if (profile.duplicate_grain_rows)
    diagnostics.push({
      code: "unit_grain",
      status: "fail",
      message:
        "Conflicting duplicate analysis units must be resolved at source.",
    });
  else if (
    working.length < 40 ||
    Math.min(
      ...["control", "treatment"].map(
        (arm) => working.filter((row) => row.treatment === arm).length,
      ),
    ) < 20
  )
    diagnostics.push({
      code: "sample_support",
      status: "fail",
      message: "Each arm needs at least 20 complete observations.",
    });
  else {
    naive = deviceNaive(working);
    if (design.method === "aipw") {
      const adjusted = deviceAipw(working, design.covariates);
      primary = adjusted.estimate;
      observational = adjusted.info;
      guardrail = deviceAipw(working, design.covariates, "guardrail").estimate;
      diagnostics.push({
        code: "propensity_overlap",
        status:
          observational.tail_fraction > design.overlap_tail_threshold
            ? "fail"
            : "pass",
        message:
          "Compare the fraction of scores outside [0.05, 0.95] with the frozen overlap tolerance.",
      });
      const maximum = Math.max(
        ...observational.balance.map((row) => Math.abs(row.after ?? 0)),
      );
      checks.push(
        check(
          "weighted_balance",
          maximum > design.balance_threshold ? "warn" : "pass",
          "Balance after weighting",
          "Inspect remaining standardized baseline imbalance.",
          { max_smd: maximum, threshold: design.balance_threshold },
        ),
      );
    } else if (design.method === "rct") {
      primary = naive;
      guardrail = deviceNaive(working, "guardrail");
      const counts = ["control", "treatment"].map(
          (arm) => working.filter((row) => row.treatment === arm).length,
        ),
        srm = chiSquareP(
          counts.reduce(
            (sum, count) =>
              sum + (count - working.length / 2) ** 2 / (working.length / 2),
            0,
          ),
          1,
        );
      diagnostics.push({
        code: "sample_ratio_mismatch",
        status: srm < 0.001 ? "fail" : "pass",
        message: `SRM p=${srm.toPrecision(4)} against equal frozen allocation.`,
      });
      const requiredSample =
        2 *
        Math.ceil(
          Math.ceil(
            (4 * (1.959963984540054 + 0.8416212335729143) ** 2) /
              design.minimum_effect ** 2,
          ) / 2,
        );
      diagnostics.push({
        code: "planned_sample_size",
        status: working.length < requiredSample ? "warn" : "pass",
        message: `Observed ${working.length}; frozen normal-approximation target ${requiredSample} (planning SD=1).`,
      });
      const balance = deviceBalance(working, design.covariates),
        maximum = Math.max(0, ...balance.map((row) => Math.abs(row.before)));
      checks.push(
        check(
          "covariate_balance",
          maximum > design.balance_threshold ? "warn" : "pass",
          "Pre-treatment covariate balance",
          "Compare standardized mean differences with the frozen tolerance.",
          { balance, max_smd: maximum, threshold: design.balance_threshold },
        ),
      );
    } else {
      const times = [...new Set(working.map((row) => Number(row.time)))].sort(
          (a, b) => a - b,
        ),
        pre = times.filter((time) => time < design.treatment_start),
        post = times.filter((time) => time >= design.treatment_start),
        assignments = new Map<string, Set<string>>();
      working.forEach((row) => {
        const id = String(row.unit_id);
        if (!assignments.has(id)) assignments.set(id, new Set());
        assignments.get(id)!.add(String(row.treatment));
      });
      const armUnits = ["control", "treatment"].map(
        (arm) =>
          new Set(
            working
              .filter((row) => row.treatment === arm)
              .map((row) => row.unit_id),
          ).size,
      );
      if (assignments.size > 150)
        throw new Error("DiD supports at most 150 independent units.");
      if (
        pre.length < 4 ||
        post.length < 1 ||
        Math.min(...armUnits) < 20 ||
        [...assignments.values()].some((arms) => arms.size !== 1) ||
        times.some((time) =>
          ["control", "treatment"].some(
            (arm) =>
              !working.some(
                (row) => row.time === time && row.treatment === arm,
              ),
          ),
        )
      )
        diagnostics.push({
          code: "panel_identification",
          status: "fail",
          message:
            "Require stable assignment, 20 units per arm, four pre-periods, and both groups in every period.",
        });
      else {
        primary = deviceDid(working, design.treatment_start);
        guardrail = deviceDid(working, design.treatment_start, "guardrail");
        const eventResult = eventStudy(working, design.treatment_start);
        event = eventResult.points;
        diagnostics.push({
          code: "parallel_trends",
          status: eventResult.preP < 0.05 ? "fail" : "pass",
          message: `Joint pre-trend Wald test p=${eventResult.preP.toPrecision(4)}. Non-rejection is not proof of parallel trends.`,
        });
        for (const [label, selected] of [
          ["All post periods", times],
          ["First three post periods", [...pre, ...post.slice(0, 3)]],
          ["Last three post periods", [...pre, ...post.slice(-3)]],
        ] as [string, number[]][])
          windows.push({
            label,
            ...deviceDid(
              working.filter((row) => selected.includes(Number(row.time))),
              design.treatment_start,
            ),
          });
        const placeboStart = pre[Math.floor(pre.length / 2)],
          placebo = deviceDid(
            working.filter((row) => Number(row.time) < design.treatment_start),
            placeboStart,
          );
        checks.push(
          check(
            "placebo_date",
            placebo.p_value < 0.05 ? "warn" : "pass",
            "Pre-period placebo intervention",
            "A fake intervention uses pre-treatment rows only; a non-significant result does not prove identification.",
            { ...placebo, treatment_start: placeboStart },
          ),
        );
        checks.push(
          check(
            "window_stability",
            windows.some((row) => row.ci_lower <= design.minimum_effect)
              ? "warn"
              : "pass",
            "Predeclared event windows",
            "Compare the full, first-three and last-three post-period windows.",
          ),
        );
      }
    }
    if (
      primary &&
      design.method !== "did" &&
      working.some((row) => row.segment)
    ) {
      const levels = [...new Set(working.map((row) => String(row.segment)))],
        groups = levels.flatMap((level) => {
          const subset = working.filter((row) => row.segment === level);
          if (
            ["control", "treatment"].some(
              (arm) =>
                subset.filter((row) => row.treatment === arm).length < 20,
            )
          )
            return [];
          const estimate =
            design.method === "aipw"
              ? deviceAipw(subset, design.covariates).estimate
              : deviceNaive(subset);
          return [
            {
              level,
              estimate,
              adjusted_p_value: 0,
              significant: false,
              recommendation:
                "Exploratory subgroup evidence; validate in a new targeted study.",
            },
          ];
        });
      const order = groups
        .map((group, i) => ({ p: group.estimate.p_value, i }))
        .sort((a, b) => a.p - b.p);
      let previous = 0;
      order.forEach((entry, i) => {
        previous = Math.max(
          previous,
          Math.min(1, entry.p * (order.length - i)),
        );
        groups[entry.i].adjusted_p_value = previous;
        groups[entry.i].significant = previous < 0.05;
      });
      let consistency = null;
      if (
        groups.length >= 3 &&
        groups.every((group) => group.estimate.standard_error > 0)
      ) {
        const weights = groups.map(
            (group) => 1 / group.estimate.standard_error ** 2,
          ),
          average =
            groups.reduce(
              (sum, group, i) => sum + weights[i] * group.estimate.effect,
              0,
            ) / weights.reduce((a, b) => a + b, 0),
          q = groups.reduce(
            (sum, group, i) =>
              sum + weights[i] * (group.estimate.effect - average) ** 2,
            0,
          ),
          p = chiSquareP(q, groups.length - 1);
        consistency = { consistent: p >= 0.05, p_value: p };
        checks.push(
          check(
            "subgroup_consistency",
            p < 0.05 ? "warn" : "pass",
            "Exploratory subgroup consistency",
            "Holm-adjusted subgroup tests and Cochran’s Q detect evidence that needs confirmation.",
          ),
        );
      }
      subgroups = [{ dimension: "segment", consistency, subgroups: groups }];
    }
  }
  const gap = Math.abs(
    profile.arms[0].missing_rate - profile.arms[1].missing_rate,
  );
  checks.push(
    check(
      "differential_missingness",
      gap > design.missingness_gap_threshold ? "warn" : "pass",
      "Required-field attrition by arm",
      "Complete-case deletion does not establish ignorability of missing outcomes.",
      { gap, threshold: design.missingness_gap_threshold, arms: profile.arms },
    ),
  );
  const base = decisionFor(primary, guardrail, design),
    failed = diagnostics.filter((row) => row.status === "fail"),
    warnings = [
      ...checks.filter((row) => row.status === "warn").map((row) => row.code),
      ...diagnostics
        .filter((row) => row.status === "warn")
        .map((row) => row.code),
    ];
  let decision = { ...base };
  if (failed.length)
    decision = {
      status: "insufficient_evidence",
      summary:
        "Identification or data-quality gates block a causal rollout claim.",
      rationale: failed.map((row) => `${row.code}: ${row.message}`),
    };
  else if (warnings.length && base.status === "go")
    decision = {
      status: "hold",
      summary:
        "The effect clears the threshold, but the frozen Critic policy requires review.",
      rationale: [...base.rationale, `Review: ${warnings.join(", ")}.`],
    };
  const sorted = [...working].sort(
    (a, b) =>
      String(a.unit_id).localeCompare(String(b.unit_id)) ||
      Number(a.time ?? 0) - Number(b.time ?? 0),
  );
  return {
    design,
    profile,
    dataset: {
      sha256: await numericalHash(rowsToCsv(sorted)),
      row_count: working.length,
      source_rows: rows.length,
      excluded_rows: rows.length - working.length,
    },
    primary_estimate: primary,
    guardrail_estimate: guardrail,
    naive_estimate: naive,
    observational,
    diagnostics,
    event_study: event,
    dimension_analyses: subgroups,
    decision,
    critic: {
      status: failed.length ? "blocked" : warnings.length ? "review" : "clear",
      checks,
      windows,
      base_decision: base.status,
      final_decision: decision.status,
      policy_version: "critic-device-1.0",
      limitation:
        "Diagnostics cannot prove causal assumptions or establish absence of unmeasured confounding.",
    },
    truth: simulation
      ? {
          true_effect: simulation.true_effect,
          known: true,
          heterogeneous: simulation.heterogeneous,
          note: "Known generator parameter; heterogeneous subgroup effects vary around it.",
        }
      : null,
    trace: [
      "validate_frozen_design",
      "profile_data",
      "confirm_complete_case_policy",
      "estimate_" + design.method,
      "critic_review",
      "apply_frozen_decision",
    ].map((tool) => ({ tool, status: "completed" })),
  };
}
export async function deviceEvaluate(
  design: ResearchDesign,
  simulation: Simulation,
  repetitions: number,
): Promise<Evaluation> {
  const runs: Evaluation["runs"] = [];
  let flagged = 0;
  if (!Number.isInteger(repetitions) || repetitions < 5 || repetitions > 50)
    throw new Error("Use 5–50 repetitions.");
  if (simulation.duplicate_units)
    throw new Error("Calibration requires independent units.");
  for (let index = 0; index < repetitions; index++) {
    const config = {
        ...simulation,
        seed: (simulation.seed + index) % 2147483648,
      },
      full = deviceGenerate(design, config),
      rows = full.filter((row) =>
        requiredColumns(design).every(
          (name) =>
            row[name] !== null && row[name] !== undefined && row[name] !== "",
        ),
      ),
      adjusted =
        design.method === "aipw" ? deviceAipw(rows, design.covariates) : null,
      estimate = adjusted ? adjusted.estimate : deviceNaive(rows),
      naive = deviceNaive(rows);
    if (adjusted && adjusted.info.tail_fraction > design.overlap_tail_threshold)
      flagged++;
    const truth =
      config.true_effect +
      (config.heterogeneous
        ? 0.8 *
          mean(
            full.map((row) =>
              row.segment === "New" ? -1 : row.segment === "Power" ? 1 : 0,
            ),
          )
        : 0);
    runs.push({
      seed: config.seed,
      truth,
      estimate: estimate.effect,
      naive: naive.effect,
      ci_lower: estimate.ci_lower,
      ci_upper: estimate.ci_upper,
      covered: estimate.ci_lower <= truth && estimate.ci_upper >= truth,
    });
    if (index % 3 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const errors = runs.map((run) => run.estimate - run.truth),
    naiveErrors = runs.map((run) => run.naive - run.truth),
    coverage = runs.filter((run) => run.covered).length / repetitions;
  return {
    method: design.method,
    repetitions,
    bias: mean(errors),
    rmse: Math.sqrt(mean(errors.map((error) => error * error))),
    naive_bias: mean(naiveErrors),
    naive_rmse: Math.sqrt(mean(naiveErrors.map((error) => error * error))),
    coverage,
    coverage_monte_carlo_se: Math.sqrt(
      (coverage * (1 - coverage)) / repetitions,
    ),
    overlap_flag_rate: flagged / repetitions,
    runs,
    note: "Computed on this device with independent deterministic seeds. Nominal 95% intervals; small Monte Carlo samples have substantial uncertainty. This evaluates estimators, not a language model.",
  };
}
