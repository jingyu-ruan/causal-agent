"use client";
import type { ReportView } from "@/lib/report-export";
import { useState } from "react";
import { GitBranch, Eye, ShieldCheck, SlidersHorizontal } from "lucide-react";
import {
  policyValue,
  type Exploration,
  type EffectNode,
} from "@/lib/effect-explorer";

const percent = (v: number) => `${(v * 100).toFixed(1)}%`;
const count = (v: number) => Math.round(v).toLocaleString();
const pText = (v?: number) =>
  v === undefined ? "—" : v < 0.001 ? "<0.001" : v.toFixed(3);
export function EffectExplorerPanel({
  exploration,
  binary,
  initialView,
  indices = { segments: "04", rollout: "05", truth: "06" },
}: {
  exploration: Exploration;
  binary: boolean;
  initialView?: ReportView;
  indices?: { segments: string; rollout: string; truth: string };
}) {
  const [selected, setSelected] = useState<number | null>(
    initialView?.selected ?? null,
  );
  const [reveal, setReveal] = useState(initialView?.reveal ?? false);
  const [budget, setBudget] = useState(initialView?.budget ?? 50),
    [population, setPopulation] = useState(initialView?.population ?? 10000),
    [cost, setCost] = useState(initialView?.cost ?? 0.5),
    [value, setValue] = useState(initialView?.value ?? 25);
  const confidence = Math.round(100 * (1 - (exploration.alpha ?? 0.05)));
  const fmt = (v?: number) =>
    v === undefined
      ? "—"
      : `${v > 0 ? "+" : ""}${(v * (binary ? 100 : 1)).toFixed(2)}${binary ? " pp" : ""}`;
  const leaf =
    exploration.leaves.find((n) => n.id === selected) ?? exploration.leaves[0];
  const root = exploration.nodes.find((n) => n.depth === 0);
  const nodeLabel = (n: EffectNode) =>
    n.rules.length
      ? n.rules
          .map(
            (r) =>
              `${r.feature.replaceAll("_", " ")} ${{ "==": "is", "!=": "is not", "<=": "≤", ">": ">" }[r.op]} ${r.value}`,
          )
          .join(" · ")
      : "All eligible units";
  function renderTree(id: number) {
    const n = exploration.nodes.find((n) => n.id === id);
    if (!n) return null;
    const leftRule = exploration.nodes
      .find((child) => child.id === n.left)
      ?.rules.at(-1);
    return (
      <li key={id}>
        <button
          disabled={!n.leaf}
          type="button"
          className={`effect-tree-node ${n.leaf ? "is-leaf" : ""} ${leaf?.id === n.id ? "is-selected" : ""}`}
          onClick={() => {
            if (n.leaf) setSelected(n.id);
          }}
          aria-pressed={n.leaf ? leaf?.id === n.id : undefined}
          aria-label={`${n.leaf ? "Select segment" : "Branch"} ${nodeLabel(n)}`}
        >
          <span>
            {n.leaf
              ? `Segment ${exploration.leaves.findIndex((l) => l.id === n.id) + 1}`
              : leftRule
                ? `${leftRule.feature} ${leftRule.op} ${typeof leftRule.value === "number" ? leftRule.value.toFixed(1) : leftRule.value}?`
                : "All eligible units"}
          </span>
          <strong
            className={
              n.significant && n.direction === "harmful" ? "effect-harm" : ""
            }
          >
            {fmt(n.effect)}
          </strong>
          <small>
            {n.leaf
              ? n.significant
                ? `${n.direction} · Holm p ${pText(n.adjusted_p_value)}`
                : "Effect remains uncertain"
              : "Independent estimation sample"}
          </small>
        </button>
        {!n.leaf && (
          <ul>
            {renderTree(n.left!)}
            {renderTree(n.right!)}
          </ul>
        )}
      </li>
    );
  }
  const rows = exploration.leaves.filter((l) => l.effect !== undefined);
  const extent =
    Math.max(
      0.001,
      ...rows.flatMap((l) => [
        Math.abs(l.ci_lower ?? 0),
        Math.abs(l.ci_upper ?? 0),
      ]),
    ) * 1.2;
  const scale = (v: number) => 50 + (v / extent) * 45;
  const minDifference = exploration.comparisons?.length
    ? Math.min(...exploration.comparisons.map((c) => c.adjusted_p_value))
    : null;
  return (
    <>
      <section
        className="report-section"
        id="segments"
        data-selected={leaf?.id}
        data-reveal={reveal}
        data-budget={budget}
        data-population={population}
        data-cost={cost}
        data-value={value}
      >
        <div className="report-section-title">
          <span>{indices.segments}</span>
          <div>
            <h2>Who benefits from the intervention?</h2>
          </div>
          <GitBranch size={18} />
        </div>
        {exploration.reason ? (
          <div className="report-note">{exploration.reason}</div>
        ) : (
          <>
            <div className="split-provenance">
              {[
                ["Discovery", exploration.discovery_n],
                ["Effect estimation", exploration.estimation_n],
                ["Policy evaluation", exploration.policy_n],
              ].map(([name, n]) => (
                <div key={name}>
                  <span>{name}</span>
                  <strong>{count(Number(n))}</strong>
                </div>
              ))}
            </div>
            <div className="effect-tree-scroll">
              <ul
                className="effect-tree"
                aria-label="Treatment effect segmentation rules"
              >
                {root && renderTree(root.id)}
              </ul>
            </div>
            <div className="report-note">
              <strong>How to read the tree.</strong> Follow the condition at
              each branch. Left means yes; right means no. Select a segment to
              inspect its full rule and evidence. Numbers in nodes are effects
              from the independent estimation sample.
            </div>
            {leaf && (
              <div className="segment-inspector">
                <div>
                  <span className="report-caption">
                    Selected segment {exploration.leaves.indexOf(leaf) + 1}
                  </span>
                  <h3>{nodeLabel(leaf)}</h3>
                  <p>
                    {leaf.effect === undefined
                      ? "This segment has insufficient treatment or control support for inference."
                      : leaf.significant
                        ? leaf.direction === "harmful"
                          ? "Evidence of harm in this segment. Investigate before expanding the intervention."
                          : "A favorable effect is supported in this segment. Confirm the rule in a targeted follow-up experiment."
                        : "The interval includes effects that remain uncertain. A non-significant result does not establish no effect."}
                  </p>
                </div>
                <div className="segment-facts">
                  <div>
                    <span>Estimated effect</span>
                    <strong>{fmt(leaf.effect)}</strong>
                  </div>
                  <div>
                    <span>{confidence}% confidence interval</span>
                    <strong>
                      {fmt(leaf.ci_lower)} to {fmt(leaf.ci_upper)}
                    </strong>
                  </div>
                  <div>
                    <span>Control / treatment n</span>
                    <strong>
                      {count(leaf.n_control)} / {count(leaf.n_treatment)}
                    </strong>
                  </div>
                  <div>
                    <span>Raw / Holm p</span>
                    <strong>
                      {pText(leaf.p_value)} / {pText(leaf.adjusted_p_value)}
                    </strong>
                  </div>
                </div>
              </div>
            )}
            <div
              className="forest-plot"
              aria-label="Segment effects and confidence intervals"
            >
              <div className="forest-heading">
                <span>Independent subgroup estimates</span>
                <span>{confidence}% CI · zero = no effect</span>
              </div>
              {rows.map((n, i) => (
                <button
                  className={`forest-row ${leaf?.id === n.id ? "is-selected" : ""}`}
                  type="button"
                  onClick={() => setSelected(n.id)}
                  key={n.id}
                >
                  <span>Segment {exploration.leaves.indexOf(n) + 1}</span>
                  <svg
                    viewBox="0 0 100 16"
                    role="img"
                    aria-label={`Segment ${i + 1}: ${fmt(n.effect)}, confidence interval ${fmt(n.ci_lower)} to ${fmt(n.ci_upper)}`}
                  >
                    <line
                      x1="50"
                      x2="50"
                      y1="0"
                      y2="16"
                      stroke="var(--border)"
                    />
                    <line
                      x1={scale(n.ci_lower!)}
                      x2={scale(n.ci_upper!)}
                      y1="8"
                      y2="8"
                      stroke="currentColor"
                      strokeWidth=".6"
                    />
                    <circle
                      cx={scale(n.effect!)}
                      cy="8"
                      r="1.5"
                      fill="currentColor"
                    />
                  </svg>
                  <strong>{fmt(n.effect)}</strong>
                </button>
              ))}
            </div>
            <p className="report-caption">
              Leaf p-values test each effect against zero and use Holm
              correction across leaves. Pairwise effect differences are tested
              separately
              {minDifference !== null
                ? `; smallest adjusted pairwise p ${pText(minDifference)}`
                : ""}
              . A significant result in one group and an uncertain result in
              another do not establish a difference.
            </p>
          </>
        )}
      </section>
      {exploration.policy_n && (
        <section className="report-section" id="rollout">
          <div className="report-section-title">
            <span>{indices.rollout}</span>
            <div>
              <h2>Compare rollout strategies</h2>
            </div>
            <SlidersHorizontal size={18} />
          </div>
          <div className="simulator-inputs report-controls">
            <label>
              Eligible population
              <input
                type="number"
                min="100"
                max="10000000"
                step="100"
                value={population}
                onChange={(e) => {
                  const v = e.target.valueAsNumber;
                  if (Number.isFinite(v))
                    setPopulation(Math.max(100, Math.min(1e7, v)));
                }}
              />
            </label>
            <label>
              Coverage cap · {budget}%
              <input
                aria-label="Coverage cap"
                type="range"
                min="0"
                max="100"
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
              />
            </label>
            <label>
              Value per{" "}
              {binary ? "additional outcome" : "beneficial outcome unit"} ($)
              <input
                type="number"
                min="0"
                max="100000"
                step="1"
                value={value}
                onChange={(e) => {
                  const v = e.target.valueAsNumber;
                  if (Number.isFinite(v))
                    setValue(Math.max(0, Math.min(1e5, v)));
                }}
              />
            </label>
            <label>
              Cost per treated unit ($)
              <input
                type="number"
                min="0"
                max="100000"
                step="0.1"
                value={cost}
                onChange={(e) => {
                  const v = e.target.valueAsNumber;
                  if (Number.isFinite(v))
                    setCost(Math.max(0, Math.min(1e5, v)));
                }}
              />
            </label>
          </div>
          <p className="report-caption">
            Scenario assumptions: {count(population)} eligible units; {budget}%
            coverage cap; ${value.toFixed(2)} per beneficial outcome unit; $
            {cost.toFixed(2)} cost per treated unit.
          </p>
          <div className="report-table-scroll">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Strategy</th>
                  <th>Units covered</th>
                  <th>{binary ? "Incremental outcomes" : "Outcome change"}</th>
                  <th>Projected net value</th>
                  <th>95% value interval</th>
                </tr>
              </thead>
              <tbody>
                {(["none", "all", "random", "targeted"] as const).map(
                  (mode) => {
                    const r = policyValue(
                      exploration,
                      mode,
                      budget / 100,
                      cost,
                      value,
                    )!;
                    const money = (n: number) =>
                      new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: "USD",
                        maximumFractionDigits: 0,
                      }).format(n * population);
                    return (
                      <tr
                        key={mode}
                        className={mode === "targeted" ? "is-highlighted" : ""}
                      >
                        <td>
                          <strong>
                            {
                              {
                                none: "No rollout",
                                all: "Treat all · benchmark",
                                random: "Random coverage",
                                targeted: "Target by discovered effect",
                              }[mode]
                            }
                          </strong>
                          {mode === "targeted" && (
                            <small>Rule fixed on discovery sample</small>
                          )}
                        </td>
                        <td>
                          {count(r.coverage * population)}{" "}
                          <small>{percent(r.coverage)}</small>
                        </td>
                        <td>{count(r.effect * population)}</td>
                        <td>{money(r.net)}</td>
                        <td>
                          {money(r.netLower)} to {money(r.netUpper)}
                        </td>
                      </tr>
                    );
                  },
                )}
              </tbody>
            </table>
          </div>
          <div className="report-note">
            <ShieldCheck size={16} />
            <p>
              Strategies are evaluated on the untouched policy sample using
              centered inverse-probability scores and the frozen allocation.
              Targeting ranks segments by discovery effect, requires the minimum
              beneficial effect, and respects the coverage cap. Treat-all is an
              uncapped benchmark. Partial segments imply random coverage within
              that segment.
            </p>
          </div>
          <p className="report-caption">
            Population, value and cost are editable business assumptions.
            Intervals reflect sampling uncertainty conditional on those
            assumptions; they do not include uncertainty in costs, prices or
            transport to a new population. This scenario does not replace the
            overall study decision or guardrail review.
          </p>
        </section>
      )}
      {exploration.truth && (
        <section className="report-section" id="simulation-truth">
          <div className="report-section-title">
            <span>{indices.truth}</span>
            <div>
              <h2>Simulation validation</h2>
            </div>
            <Eye size={18} />
          </div>
          <div className="truth-reveal">
            <div>
              <h3>
                {reveal
                  ? "The simulation reference is revealed"
                  : "Did the model recover the signal?"}
              </h3>
              <p>
                Reference effects are stored separately from the analysis
                features and never used to choose branches.
              </p>
            </div>
            <button
              type="button"
              className="report-button"
              onClick={() => setReveal(!reveal)}
              aria-expanded={reveal}
              aria-controls="simulation-reference"
            >
              <Eye size={15} />
              {reveal ? "Hide reference" : "Reveal ground truth"}
            </button>
          </div>
          {reveal && (
            <div id="simulation-reference">
              <div className="report-note">
                Scenario: {exploration.truth.scenario}. Population reference
                effect: <strong>{fmt(exploration.truth.overall_effect)}</strong>
                . {exploration.truth.source}
              </div>
              <div className="report-table-scroll">
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Segment</th>
                      <th>Estimated effect</th>
                      <th>True average effect</th>
                      <th>Estimation error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exploration.truth.leaves.map((truth) => {
                      const n = exploration.leaves.find(
                        (l) => l.id === truth.id,
                      )!;
                      return (
                        <tr key={truth.id}>
                          <td>{nodeLabel(n)}</td>
                          <td>{fmt(n.effect)}</td>
                          <td>{fmt(truth.effect)}</td>
                          <td>
                            {n.effect === undefined
                              ? "—"
                              : fmt(n.effect - truth.effect)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}
