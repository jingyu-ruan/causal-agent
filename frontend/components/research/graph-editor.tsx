"use client";

import { Input } from "@/components/ui/input";

import { useId, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inspectGraph } from "@/lib/causal-graph";
import type { CausalGraph, GraphNode } from "@/lib/research-api";

export function GraphVisual({ graph }: { graph: CausalGraph }) {
  const marker = useId().replaceAll(":", "");
  const positions = useMemo(() => {
    const levels = new Map(graph.nodes.map((node) => [node.id, 0]));
    for (let index = 0; index < graph.nodes.length; index++) {
      let changed = false;
      for (const edge of graph.edges) {
        const level = Math.min(
          graph.nodes.length - 1,
          (levels.get(edge.source) ?? 0) + 1,
        );
        if ((levels.get(edge.target) ?? 0) < level) {
          levels.set(edge.target, level);
          changed = true;
        }
      }
      if (!changed) break;
    }
    const max = Math.max(1, ...levels.values());
    const used = new Map<number, number>();
    return new Map(
      graph.nodes.map((node) => {
        const level = levels.get(node.id) ?? 0;
        const row = used.get(level) ?? 0;
        used.set(level, row + 1);
        return [node.id, { x: 100 + (level / max) * 580, y: 65 + row * 100 }];
      }),
    );
  }, [graph]);
  const height = Math.max(
    230,
    ...[...positions.values()].map((position) => position.y + 80),
  );
  const colors: Record<string, string> = {
    treatment: "var(--chart-1)",
    outcome: "var(--chart-2)",
    confounder: "var(--chart-3)",
    mediator: "var(--chart-4)",
    collider: "#be123c",
    context: "#64748b",
  };
  return (
    <div
      className="graph-canvas"
      tabIndex={0}
      aria-label="Causal graph; scroll horizontally on small screens"
    >
      <svg
        role="img"
        aria-label={graph.edges
          .map((edge) => `${edge.source} causes ${edge.target}`)
          .join(". ")}
        viewBox={`0 0 800 ${height}`}
        style={{ minWidth: 640 }}
      >
        <defs>
          <marker
            id={marker}
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
          >
            <path d="M0,0 L8,4 L0,8" fill="currentColor" />
          </marker>
        </defs>
        {graph.edges.map((edge) => {
          const source = positions.get(edge.source),
            target = positions.get(edge.target);
          if (!source || !target) return null;
          return (
            <path
              key={`${edge.source}-${edge.target}`}
              d={`M ${source.x + 80} ${source.y} C ${source.x + 140} ${source.y}, ${target.x - 140} ${target.y}, ${target.x - 86} ${target.y}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              markerEnd={`url(#${marker})`}
              className="text-muted-foreground/60"
            />
          );
        })}
        {graph.nodes.map((node) => {
          const position = positions.get(node.id)!;
          return (
            <g
              key={node.id}
              transform={`translate(${position.x},${position.y})`}
            >
              <rect
                x="-80"
                y="-30"
                width="160"
                height="60"
                rx="12"
                fill="var(--card)"
                stroke={colors[node.role]}
                strokeWidth="2"
                strokeDasharray={node.observed === false ? "5 4" : undefined}
              />
              <text
                y="-2"
                textAnchor="middle"
                fill="currentColor"
                fontSize="15"
                fontWeight="600"
              >
                {node.label.slice(0, 20)}
              </text>
              <text
                y="18"
                textAnchor="middle"
                fill={colors[node.role]}
                fontSize="14"
              >
                {node.observed === false ? "unobserved · " : ""}
                {node.role}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function GraphEditor({
  value,
  onChange,
}: {
  value: CausalGraph;
  onChange: (graph: CausalGraph) => void;
}) {
  const [source, setSource] = useState(""),
    [target, setTarget] = useState("");
  const [nodeId, setNodeId] = useState(""),
    [nodeLabel, setNodeLabel] = useState("");
  const [nodeRole, setNodeRole] = useState<GraphNode["role"]>("confounder");
  const [error, setError] = useState("");
  let advice = null,
    graphError = "";
  try {
    advice = inspectGraph(value);
  } catch (caught) {
    graphError = caught instanceof Error ? caught.message : "Invalid graph";
  }
  function update(graph: CausalGraph) {
    onChange({ ...graph, confirmed: false });
    setError("");
  }
  function addNode() {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(nodeId) || !nodeLabel.trim()) {
      setError("Enter a valid column ID and a readable label.");
      return;
    }
    if (
      value.nodes.some((node) => node.id === nodeId) ||
      value.nodes.length >= 12
    ) {
      setError("Choose a unique node ID. Up to 12 nodes are supported.");
      return;
    }
    update({
      ...value,
      nodes: [
        ...value.nodes,
        { id: nodeId, label: nodeLabel.trim(), role: nodeRole, observed: true },
      ],
    });
    setNodeId("");
    setNodeLabel("");
  }
  return (
    <div className="space-y-5">
      <GraphVisual graph={value} />
      <p className="research-note">
        This is a candidate model of your assumptions. Review every arrow. Node
        IDs used for adjustment must match pre-treatment dataset columns.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {value.nodes.map((node) => (
          <div
            className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3"
            key={node.id}
          >
            <label className="min-w-0 flex-1">
              <span className="research-note">{node.id}</span>
              <Input
                className="study-input mt-1"
                aria-label={`Label for ${node.id}`}
                value={node.label}
                maxLength={100}
                onChange={(event) =>
                  update({
                    ...value,
                    nodes: value.nodes.map((item) =>
                      item.id === node.id
                        ? { ...item, label: event.target.value }
                        : item,
                    ),
                  })
                }
              />
            </label>
            {!["treatment", "outcome"].includes(node.role) && (
              <>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={node.observed !== false}
                    onChange={(event) =>
                      update({
                        ...value,
                        nodes: value.nodes.map((item) =>
                          item.id === node.id
                            ? { ...item, observed: event.target.checked }
                            : item,
                        ),
                      })
                    }
                  />
                  Observed
                </label>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${node.label}`}
                  onClick={() =>
                    update({
                      ...value,
                      nodes: value.nodes.filter((item) => item.id !== node.id),
                      edges: value.edges.filter(
                        (edge) =>
                          edge.source !== node.id && edge.target !== node.id,
                      ),
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="research-inline-form">
        <Input
          className="study-input"
          placeholder="Column ID, e.g. prior_spend"
          aria-label="New node ID"
          value={nodeId}
          onChange={(event) => setNodeId(event.target.value)}
        />
        <Input
          className="study-input"
          placeholder="Variable label"
          aria-label="New variable label"
          value={nodeLabel}
          onChange={(event) => setNodeLabel(event.target.value)}
        />
        <select
          className="study-input"
          aria-label="Variable role"
          value={nodeRole}
          onChange={(event) =>
            setNodeRole(event.target.value as GraphNode["role"])
          }
        >
          {["confounder", "mediator", "collider", "context"].map((role) => (
            <option key={role}>{role}</option>
          ))}
        </select>
        <Button variant="outline" onClick={addNode}>
          <Plus className="h-4 w-4" />
          Add variable
        </Button>
      </div>
      <div className="research-inline-form">
        <select
          className="study-input"
          aria-label="Arrow source"
          value={source}
          onChange={(event) => setSource(event.target.value)}
        >
          <option value="">Cause variable</option>
          {value.nodes.map((node) => (
            <option key={node.id} value={node.id}>
              {node.label}
            </option>
          ))}
        </select>
        <ArrowRight className="hidden h-5 w-5 sm:block" />
        <select
          className="study-input"
          aria-label="Arrow target"
          value={target}
          onChange={(event) => setTarget(event.target.value)}
        >
          <option value="">Effect variable</option>
          {value.nodes.map((node) => (
            <option key={node.id} value={node.id}>
              {node.label}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          disabled={!source || !target}
          onClick={() => {
            const next = {
              ...value,
              edges: [...value.edges, { source, target }],
            };
            try {
              inspectGraph(next);
              update(next);
            } catch (caught) {
              setError(
                caught instanceof Error ? caught.message : "Invalid edge",
              );
            }
          }}
        >
          Add arrow
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {value.edges.map((edge) => (
          <button
            className="research-edge-chip"
            key={`${edge.source}-${edge.target}`}
            onClick={() =>
              update({
                ...value,
                edges: value.edges.filter((item) => item !== edge),
              })
            }
            aria-label={`Remove arrow ${edge.source} to ${edge.target}`}
          >
            {edge.source} → {edge.target}
            <span aria-hidden> ×</span>
          </button>
        ))}
      </div>
      {(error || graphError) && (
        <p className="research-error" role="alert">
          {error || graphError}
        </p>
      )}
      {advice && (
        <div className="research-callout">
          <p className="font-semibold">
            Candidate adjustment set:{" "}
            {advice.suggested_adjustment.join(", ") ||
              "No observed confounders declared"}
          </p>
          <p className="mt-2">{advice.explanation}</p>
          {advice.warnings.map((warning) => (
            <p className="mt-2" key={warning}>
              {warning}
            </p>
          ))}
          {advice.unobserved.length > 0 && (
            <p className="mt-2">
              Unobserved variables: {advice.unobserved.join(", ")}
            </p>
          )}
        </div>
      )}
      <label className="flex items-start gap-3 rounded-xl border border-border p-4">
        <input
          className="mt-1 h-4 w-4"
          type="checkbox"
          checked={value.confirmed}
          disabled={!!graphError}
          onChange={(event) =>
            onChange({ ...value, confirmed: event.target.checked })
          }
        />
        <span>
          <span className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="h-4 w-4" />I have reviewed these causal
            assumptions.
          </span>
          <span className="research-note mt-1 block">
            Confirmation freezes this graph with the design. It does not
            establish that the assumptions are true.
          </span>
        </span>
      </label>
    </div>
  );
}
