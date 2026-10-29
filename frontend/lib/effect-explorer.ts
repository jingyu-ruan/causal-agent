/** Deterministic compatibility estimator for the hosted Worker. No LLM or raw-row persistence. */
export type Rule = {
  feature: string;
  op: "<=" | ">" | "==" | "!=";
  value: string | number;
};
export type EffectNode = {
  id: number;
  depth: number;
  leaf: boolean;
  rules: Rule[];
  n_control: number;
  n_treatment: number;
  effect?: number;
  standard_error?: number;
  ci_lower?: number;
  ci_upper?: number;
  p_value?: number;
  adjusted_p_value?: number;
  significant?: boolean;
  direction?: string;
  control_mean?: number;
  treatment_mean?: number;
  split_feature?: string;
  threshold?: number;
  category?: string | null;
  left?: number;
  right?: number;
  discovery_effect?: number;
  share?: number;
  policy_n?: number;
  policy_sum?: number;
  policy_sum_sq?: number;
};
export type Exploration = {
  version: number;
  seed?: number;
  method?: string;
  features?: string[];
  reason?: string;
  nodes: EffectNode[];
  leaves: EffectNode[];
  discovery_n?: number;
  estimation_n?: number;
  policy_n?: number;
  alpha?: number;
  minimum_effect?: number;
  benefit_sign?: number;
  warnings?: string[];
  comparisons?: {
    a: number;
    b: number;
    difference: number;
    adjusted_p_value: number;
  }[];
  truth?: {
    scenario: string;
    overall_effect: number;
    source: string;
    leaves: { id: number; effect: number }[];
  };
};
export type Row = Record<string, string | number>;
export type ExplorerInput = {
  rows: Row[];
  unit: string;
  treatment: string;
  outcome: string;
  treatmentLabel: string;
  probability: number;
  features: string[];
  excluded: string[];
  seed: number;
  alpha: number;
  minimumEffect: number;
  benefitSign: number;
  truth?: { scenario: string; effect: (row: Row) => number };
};
export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let v = Math.imul(state ^ (state >>> 15), 1 | state);
    v = (v + Math.imul(v ^ (v >>> 7), 61 | v)) ^ v;
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}
function pValue(z: number) {
  const x = Math.abs(z) / Math.SQRT2,
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
export function adjustHolm(values: number[]) {
  const result = values.map(() => 1);
  let previous = 0;
  values
    .map((p, i) => ({ p, i }))
    .sort((a, b) => a.p - b.p)
    .forEach(({ p, i }, rank) => {
      previous = Math.max(previous, Math.min(1, (values.length - rank) * p));
      result[i] = previous;
    });
  return result;
}
const mean = (values: number[]) =>
  values.reduce((a, b) => a + b, 0) / values.length;
const variance = (values: number[]) => {
  if (values.length < 2) return 0;
  const m = mean(values);
  return values.reduce((a, b) => a + (b - m) ** 2, 0) / (values.length - 1);
};
export function matches(row: Row, rule: Rule): boolean {
  const v = row[rule.feature];
  if (rule.op === "==") return String(v) === String(rule.value);
  if (rule.op === "!=") return String(v) !== String(rule.value);
  return rule.op === "<="
    ? Number(v) <= Number(rule.value)
    : Number(v) > Number(rule.value);
}
export function discoverEffects(input: ExplorerInput): Exploration {
  const {
    unit,
    treatment,
    outcome,
    treatmentLabel,
    probability: p,
    seed,
  } = input;
  const features = input.features.filter(
    (f) => !input.excluded.includes(f) && !f.startsWith("__"),
  );
  const base: Exploration = {
    version: 1,
    seed,
    method: "Honest transformed-outcome tree",
    features,
    nodes: [],
    leaves: [],
    alpha: input.alpha,
    minimum_effect: input.minimumEffect,
    benefit_sign: input.benefitSign,
    warnings: [
      "Exploratory segments do not replace the frozen overall decision.",
      "Use pre-treatment features only. Confirm discovered segments in a new experiment.",
    ],
  };
  if (!features.length || input.rows.length < 1000)
    return {
      ...base,
      reason:
        "Select pre-treatment features and supply at least 1,000 analysis units.",
    };
  if (!(p > 0 && p < 1))
    return {
      ...base,
      reason: "A valid randomized treatment probability is required.",
    };
  const rows = [...input.rows].sort((a, b) =>
    String(a[unit]).localeCompare(String(b[unit])),
  );
  const seen = new Set<string>();
  for (const row of rows) {
    const id = String(row[unit]);
    if (seen.has(id) || !Number.isFinite(Number(row[outcome])))
      return {
        ...base,
        reason: "Unique units and finite outcomes are required.",
      };
    seen.add(id);
  }
  const t = rows.map((r) => Number(String(r[treatment]) === treatmentLabel)),
    y = rows.map((r) => Number(r[outcome]));
  const random = seededRandom(seed),
    parts: number[][] = [[], [], []];
  for (const arm of [0, 1]) {
    const indices = rows.map((_, i) => i).filter((i) => t[i] === arm);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const a = Math.floor(0.4 * indices.length),
      b = Math.floor(0.7 * indices.length);
    parts[0].push(...indices.slice(0, a));
    parts[1].push(...indices.slice(a, b));
    parts[2].push(...indices.slice(b));
  }
  const [train, infer, evaluate] = parts;
  if (
    parts.some((part) =>
      [0, 1].some((arm) => part.filter((i) => t[i] === arm).length < 30),
    )
  )
    return {
      ...base,
      reason:
        "Each independent split needs at least 30 treatment and control units.",
    };
  const baseline = mean(train.filter((i) => !t[i]).map((i) => y[i]));
  const score = rows.map(
    (_, i) => ((y[i] - baseline) * (t[i] - p)) / (p * (1 - p)),
  );
  Object.assign(base, {
    discovery_n: train.length,
    estimation_n: infer.length,
    policy_n: evaluate.length,
  });
  const candidates: Rule[] = [];
  for (const feature of features) {
    const values = train.map((i) => rows[i][feature]);
    if (values.some((v) => v == null || v === ""))
      return { ...base, reason: `Feature ${feature} contains missing values.` };
    const numeric = values.every((v) => Number.isFinite(Number(v)));
    const unique = [...new Set(values.map(String))];
    if (numeric) {
      const sorted = [...new Set(values.map(Number))].sort((a, b) => a - b);
      for (let q = 1; q < 10; q++) {
        const value =
          sorted[
            Math.min(sorted.length - 2, Math.floor((q * sorted.length) / 10))
          ];
        if (value !== undefined) candidates.push({ feature, op: "<=", value });
      }
    } else if (unique.length <= 20)
      for (const value of unique.sort())
        candidates.push({ feature, op: "==", value });
    else
      return {
        ...base,
        reason: `Feature ${feature} has more than 20 categories.`,
      };
  }
  let zLow = 0,
    zHigh = 9;
  for (let i = 0; i < 60; i++) {
    const mid = (zLow + zHigh) / 2;
    if (pValue(mid) > input.alpha) zLow = mid;
    else zHigh = mid;
  }
  const critical = (zLow + zHigh) / 2;
  const minLeaf = Math.max(100, Math.floor(0.08 * train.length));
  function grow(
    discovery: number[],
    estimation: number[],
    policy: number[],
    rules: Rule[],
    depth: number,
  ): number {
    const id = base.nodes.length;
    const control = estimation.filter((i) => !t[i]).map((i) => y[i]),
      treated = estimation.filter((i) => t[i]).map((i) => y[i]);
    const node: EffectNode = {
      id,
      depth,
      leaf: true,
      rules,
      n_control: control.length,
      n_treatment: treated.length,
    };
    if (Math.min(control.length, treated.length) >= 30) {
      const effect = mean(treated) - mean(control),
        se = Math.sqrt(
          variance(treated) / treated.length +
            variance(control) / control.length,
        );
      Object.assign(node, {
        effect,
        standard_error: se,
        ci_lower: effect - critical * se,
        ci_upper: effect + critical * se,
        p_value: se > 0 ? pValue(effect / se) : effect === 0 ? 1 : 0,
        control_mean: mean(control),
        treatment_mean: mean(treated),
      });
    }
    base.nodes.push(node);
    let best: {
      rule: Rule;
      gain: number;
      left: number[];
      right: number[];
    } | null = null;
    if (depth < 2)
      for (const rule of candidates) {
        const left: number[] = [],
          right: number[] = [];
        for (const i of discovery)
          (matches(rows[i], rule) ? left : right).push(i);
        if (Math.min(left.length, right.length) < minLeaf) continue;
        if (
          [left, right].some((part) =>
            [0, 1].some((arm) => part.filter((i) => t[i] === arm).length < 30),
          )
        )
          continue;
        const gain =
          ((left.length * right.length) / discovery.length ** 2) *
          (mean(left.map((i) => score[i])) -
            mean(right.map((i) => score[i]))) **
            2;
        if (gain > 0.00005 && (!best || gain > best.gain))
          best = { rule, gain, left, right };
      }
    if (best) {
      const { rule, left, right } = best;
      const inverse: Rule = { ...rule, op: rule.op === "==" ? "!=" : ">" };
      node.leaf = false;
      node.split_feature = rule.feature;
      node.category = rule.op === "==" ? String(rule.value) : null;
      node.threshold = rule.op === "==" ? 0.5 : Number(rule.value);
      node.left = grow(
        left,
        estimation.filter((i) => matches(rows[i], rule)),
        policy.filter((i) => matches(rows[i], rule)),
        [...rules, rule],
        depth + 1,
      );
      node.right = grow(
        right,
        estimation.filter((i) => !matches(rows[i], rule)),
        policy.filter((i) => !matches(rows[i], rule)),
        [...rules, inverse],
        depth + 1,
      );
    } else {
      Object.assign(node, {
        discovery_effect: mean(discovery.map((i) => score[i])),
        policy_n: policy.length,
        policy_sum: policy.reduce((a, i) => a + score[i], 0),
        policy_sum_sq: policy.reduce((a, i) => a + score[i] ** 2, 0),
        share: policy.length / evaluate.length,
      });
      base.leaves.push(node);
    }
    return id;
  }
  grow(train, infer, evaluate, [], 0);
  const valid = base.leaves.filter((l) => l.p_value !== undefined),
    adjusted = adjustHolm(valid.map((l) => l.p_value!));
  valid.forEach((leaf, i) =>
    Object.assign(leaf, {
      adjusted_p_value: adjusted[i],
      significant: adjusted[i] < input.alpha,
      direction: input.benefitSign * leaf.effect! > 0 ? "favorable" : "harmful",
    }),
  );
  const pairs: {
    a: number;
    b: number;
    difference: number;
    p: number;
    adjusted_p_value: number;
  }[] = [];
  valid.forEach((a, i) =>
    valid.slice(i + 1).forEach((b) => {
      const se = Math.hypot(a.standard_error!, b.standard_error!);
      pairs.push({
        a: a.id,
        b: b.id,
        difference: a.effect! - b.effect!,
        p: se > 0 ? pValue((a.effect! - b.effect!) / se) : 1,
        adjusted_p_value: 1,
      });
    }),
  );
  const corrected = adjustHolm(pairs.map((pair) => pair.p));
  pairs.forEach((pair, i) => (pair.adjusted_p_value = corrected[i]));
  base.comparisons = pairs;
  if (input.truth) {
    const truth = input.truth;
    base.truth = {
      scenario: truth.scenario,
      overall_effect: mean(rows.map(truth.effect)),
      source:
        "Verified generator manifest matched to the uploaded CSV SHA-256.",
      leaves: base.leaves.map((leaf) => ({
        id: leaf.id,
        effect: mean(
          rows
            .filter((row) => leaf.rules.every((rule) => matches(row, rule)))
            .map(truth.effect),
        ),
      })),
    };
  }
  return base;
}
/** RFC 4180 scalar CSV reader, including quoted fields, embedded newlines and escaped quotes. */
export function parseCsv(text: string): Row[] {
  const records: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some(Boolean)) records.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("Unclosed CSV quote");
  if (cell || row.length) {
    row.push(cell);
    records.push(row);
  }
  const header = records.shift() ?? [];
  return records.map((values) =>
    Object.fromEntries(
      header.map((key, i) => [key.replace(/^\uFEFF/, ""), values[i] ?? ""]),
    ),
  );
}
export function policyValue(
  exploration: Exploration,
  mode: "all" | "none" | "random" | "targeted",
  budget: number,
  cost: number,
  value: number,
) {
  const n = exploration.policy_n ?? 0;
  if (n < 2) return null;
  const sign = exploration.benefit_sign ?? 1;
  let remaining = Math.min(1, Math.max(0, budget)),
    sum = 0,
    sumSq = 0,
    coverage = 0;
  const ranked = [...exploration.leaves].sort(
    (a, b) =>
      sign * (b.discovery_effect ?? 0) - sign * (a.discovery_effect ?? 0),
  );
  for (const leaf of ranked) {
    const share = leaf.share ?? 0;
    let weight =
      mode === "all" ? 1 : mode === "none" ? 0 : mode === "random" ? budget : 0;
    if (
      mode === "targeted" &&
      sign * (leaf.discovery_effect ?? 0) >= (exploration.minimum_effect ?? 0)
    ) {
      weight = share > 0 ? Math.min(1, remaining / share) : 0;
      remaining = Math.max(0, remaining - weight * share);
    }
    coverage += weight * share;
    sum += weight * (leaf.policy_sum ?? 0);
    sumSq += weight * weight * (leaf.policy_sum_sq ?? 0);
  }
  const effect = sum / n,
    se = Math.sqrt(Math.max(0, (sumSq - (sum * sum) / n) / (n - 1) / n));
  return {
    coverage,
    effect,
    se,
    lower: effect - 1.96 * se,
    upper: effect + 1.96 * se,
    net: effect * sign * value - coverage * cost,
    netLower: (effect * sign - 1.96 * se) * value - coverage * cost,
    netUpper: (effect * sign + 1.96 * se) * value - coverage * cost,
  };
}
