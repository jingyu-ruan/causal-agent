export type LabScenario = "homogeneous" | "concentrated" | "mixed" | "null";
export const LAB_SCENARIOS: {
  id: LabScenario;
  name: string;
  description: string;
}[] = [
  {
    id: "mixed",
    name: "Benefits and hidden harm",
    description: "A positive average can conceal a group that is worse off.",
  },
  {
    id: "concentrated",
    name: "One group benefits",
    description:
      "Discover a useful intervention whose benefits are concentrated.",
  },
  {
    id: "homogeneous",
    name: "Broad benefit",
    description: "Check whether apparent subgroup differences are just noise.",
  },
  {
    id: "null",
    name: "No treatment effect",
    description: "Test whether the workflow resists finding a signal in noise.",
  },
];
export function scenarioEffect(
  row: Record<string, string | number>,
  metric: { kind: string; minimum_effect: number; direction: string },
  parameters: { scenario?: LabScenario; baseline_value?: number },
) {
  const scale =
    metric.kind === "binary"
      ? Math.max(0.06, 4 * metric.minimum_effect)
      : 3 * metric.minimum_effect;
  const scenario = parameters.scenario ?? "homogeneous";
  let effect =
    scenario === "null"
      ? 0
      : scenario === "homogeneous"
        ? metric.minimum_effect * 1.5
        : row.audience === "new"
          ? scale
          : scenario === "mixed" && row.platform === "web"
            ? -scale
            : 0;
  effect *= metric.direction === "higher_is_better" ? 1 : -1;
  if (metric.kind === "binary") {
    const base = Math.max(
      0.02,
      Math.min(0.98, parameters.baseline_value ?? 0.2),
    );
    effect = Math.max(0.02, Math.min(0.98, base + effect)) - base;
  }
  return effect;
}
