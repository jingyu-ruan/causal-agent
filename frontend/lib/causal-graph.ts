import type { CausalGraph, GraphAdvice } from "./research-api";

/** The same backdoor-graph moralization as the Python validation boundary. */
export function inspectGraph(
  graph: CausalGraph,
  adjustment?: string[],
): GraphAdvice {
  const ids = graph.nodes.map((node) => node.id);
  if (ids.length !== new Set(ids).size)
    throw new Error("Node IDs must be unique.");
  for (const role of ["treatment", "outcome"])
    if (graph.nodes.filter((node) => node.role === role).length !== 1)
      throw new Error(`Declare exactly one ${role} node.`);
  const children = new Map(ids.map((id) => [id, new Set<string>()]));
  const pairs = new Set<string>();
  for (const edge of graph.edges) {
    if (!children.has(edge.source) || !children.has(edge.target))
      throw new Error("Every edge must refer to an existing node.");
    const pair = `${edge.source}>${edge.target}`;
    if (pairs.has(pair)) throw new Error("Duplicate graph edge.");
    pairs.add(pair);
    children.get(edge.source)!.add(edge.target);
  }
  const visiting = new Set<string>(),
    visited = new Set<string>();
  function visit(id: string) {
    if (visiting.has(id))
      throw new Error(
        "This graph contains a cycle. Remove an arrow before continuing.",
      );
    if (visited.has(id)) return;
    visiting.add(id);
    children.get(id)!.forEach(visit);
    visiting.delete(id);
    visited.add(id);
  }
  ids.forEach(visit);
  const treatment = graph.nodes.find((node) => node.role === "treatment")!.id;
  const outcome = graph.nodes.find((node) => node.role === "outcome")!.id;
  const descendants = new Set<string>();
  const pending = [...children.get(treatment)!];
  while (pending.length) {
    const id = pending.pop()!;
    if (!descendants.has(id)) {
      descendants.add(id);
      pending.push(...children.get(id)!);
    }
  }
  const suggested = graph.nodes
    .filter(
      (node) =>
        node.role === "confounder" &&
        node.observed !== false &&
        !descendants.has(node.id),
    )
    .map((node) => node.id);
  const selected = adjustment ?? suggested;
  const unsafe = selected.filter(
    (id) =>
      descendants.has(id) ||
      !ids.includes(id) ||
      id === treatment ||
      id === outcome ||
      graph.nodes.find((node) => node.id === id)?.observed === false,
  );
  const parents = new Map(ids.map((id) => [id, new Set<string>()]));
  graph.edges
    .filter((edge) => edge.source !== treatment)
    .forEach((edge) => parents.get(edge.target)!.add(edge.source));
  const ancestors = new Set([treatment, outcome, ...selected]);
  const ancestorQueue = [...ancestors].filter((id) => parents.has(id));
  while (ancestorQueue.length)
    parents.get(ancestorQueue.pop()!)!.forEach((id) => {
      if (!ancestors.has(id)) {
        ancestors.add(id);
        ancestorQueue.push(id);
      }
    });
  const moral = new Map(
    [...ancestors]
      .filter((id) => ids.includes(id))
      .map((id) => [id, new Set<string>()]),
  );
  moral.forEach((neighbors, id) => {
    const pa = [...parents.get(id)!].filter((parent) => ancestors.has(parent));
    pa.forEach((parent) => {
      neighbors.add(parent);
      moral.get(parent)!.add(id);
      pa.filter((other) => other !== parent).forEach((other) =>
        moral.get(parent)!.add(other),
      );
    });
  });
  const reached = new Set(selected),
    queue = [treatment];
  while (queue.length) {
    const id = queue.pop()!;
    if (!reached.has(id)) {
      reached.add(id);
      queue.push(
        ...[...(moral.get(id) ?? [])].filter((next) => !reached.has(next)),
      );
    }
  }
  const blocked = unsafe.length === 0 && !reached.has(outcome);
  return {
    suggested_adjustment: suggested,
    selected_adjustment: selected,
    backdoor_blocked: blocked,
    unsafe_adjustment: unsafe,
    unobserved: graph.nodes
      .filter((node) => node.observed === false)
      .map((node) => node.label),
    warnings: graph.nodes
      .filter((node) => ["mediator", "collider"].includes(node.role))
      .map((node) => `Do not adjust for ${node.label}: ${node.role}.`),
    explanation: blocked
      ? "The selected variables block backdoor paths under the supplied DAG."
      : "The selected variables do not establish a valid backdoor adjustment set under the supplied DAG.",
    limitation:
      "Arrows are causal assumptions you supply. Passing a graph check does not prove those assumptions or rule out unmeasured confounding.",
  };
}
