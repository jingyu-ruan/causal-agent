import type { EvidenceAnswer, ResearchResult } from "./research-api";

/** Offline reference reports use the same bounded, explicitly labelled retrieval. */
export function referenceAnswer(
  result: ResearchResult,
  question: string,
  runId: string,
): EvidenceAnswer {
  const text = question.toLowerCase();
  const citations: EvidenceAnswer["citations"] = [];
  let answer = "",
    tool = "retrieve_decision",
    supported = true;
  const zh = /[\u4e00-\u9fff]/.test(question);
  function cite(path: string, value: unknown) {
    citations.push({ path, value });
  }
  if (/individual|this user|个人|保证|guarantee/.test(text)) {
    answer = zh
      ? "这些总体证据无法识别个人因果效应，也不能保证不存在未观测混杂。"
      : "These aggregate results cannot identify an individual causal effect or guarantee the absence of unmeasured confounding.";
    tool = "check_identifiability_scope";
  } else if (
    /why|decision|hold|stop|rollout|为什么|上线|决策|结论/.test(text)
  ) {
    cite("decision", result.decision);
    cite("critic.final_decision", result.critic.final_decision);
    answer = `${result.decision.status.toUpperCase()}: ${result.decision.summary}\n\n${result.decision.rationale.join("\n")}`;
  } else if (/subgroup|audience|segment|分群|人群|群体/.test(text)) {
    cite("dimension_analyses", result.dimension_analyses);
    tool = "retrieve_subgroup_evidence";
    answer =
      result.dimension_analyses
        .flatMap((dimension) =>
          dimension.subgroups.map(
            (group) =>
              `${dimension.dimension} / ${group.level}: ${group.estimate.effect.toFixed(4)}; 95% CI [${group.estimate.ci_lower.toFixed(4)}, ${group.estimate.ci_upper.toFixed(4)}]; Holm p=${group.adjusted_p_value.toPrecision(3)}.`,
          ),
        )
        .join("\n") ||
      (zh
        ? "本次分析没有可用的分群估计。"
        : "No subgroup estimates are available for this run.");
    answer += zh
      ? "\n\n分群结果属于探索性证据。"
      : "\n\nSubgroup findings are exploratory.";
  } else if (/effect|estimate|lift|效果|效应|提升|数值/.test(text)) {
    cite("primary_estimate", result.primary_estimate);
    cite("naive_estimate", result.naive_estimate);
    tool = "retrieve_effect_estimate";
    const effect = result.primary_estimate;
    answer = effect
      ? `${effect.method}: ${effect.effect.toFixed(4)}; 95% CI [${effect.ci_lower.toFixed(4)}, ${effect.ci_upper.toFixed(4)}]; p=${effect.p_value.toPrecision(3)}.\n\nNaive difference: ${result.naive_estimate?.effect.toFixed(4)}.`
      : zh
        ? "诊断检查阻止了效应估计。"
        : "Evidence gates prevented effect estimation.";
  } else if (/guardrail|cost|护栏|成本|风险/.test(text)) {
    cite("guardrail_estimate", result.guardrail_estimate);
    cite("design.harm_tolerance", result.design.harm_tolerance);
    tool = "retrieve_guardrail";
    const guardrail = result.guardrail_estimate;
    answer = guardrail
      ? `Guardrail effect: ${guardrail.effect.toFixed(4)}; 95% CI [${guardrail.ci_lower.toFixed(4)}, ${guardrail.ci_upper.toFixed(4)}]. Frozen harm tolerance: ${result.design.harm_tolerance.toFixed(4)}.`
      : "No guardrail estimate is available.";
  } else if (/missing|clean|data|缺失|清洗|数据/.test(text)) {
    cite("dataset", result.dataset);
    cite("profile.arms", result.profile.arms);
    tool = "retrieve_preparation_lineage";
    answer = `Source rows: ${result.dataset.source_rows}; excluded: ${result.dataset.excluded_rows}; analyzed: ${result.dataset.row_count}.\n\nDataset SHA-256: ${result.dataset.sha256}`;
  } else if (/next|follow|improve|下一步|接下来|建议/.test(text)) {
    cite("decision.status", result.decision.status);
    cite("critic.checks", result.critic.checks);
    tool = "derive_followup_from_evidence";
    const flagged = result.critic.checks
      .filter((check) => check.status !== "pass")
      .map((check) => check.title);
    answer =
      result.decision.status === "insufficient_evidence"
        ? zh
          ? "先解决阻断诊断，重新设计可识别的研究并收集数据。"
          : "Resolve the blocking diagnostics and collect data that supports identification."
        : flagged.length
          ? `Investigate: ${flagged.join(", ")}.`
          : zh
            ? "在新的研究中验证当前结果。"
            : "Validate the finding in a new study.";
    answer += zh
      ? "\n\n使用探索分支比较新的假设，保留当前记录。"
      : "\n\nUse an exploratory branch to compare changed assumptions while preserving this record.";
  } else if (
    /assumption|limitation|robust|critic|overlap|假设|局限|稳健|审查|重叠/.test(
      text,
    )
  ) {
    cite("critic", result.critic);
    tool = "retrieve_assumptions_and_critic";
    answer = [
      ...result.critic.checks
        .filter((check) => check.status !== "pass")
        .map((check) => `${check.title}: ${check.message}`),
      ...(result.observational?.assumptions ?? []),
      result.critic.limitation,
    ].join("\n\n");
  } else {
    supported = false;
    tool = "check_supported_intent";
    answer = zh
      ? "我可以回答本次分析的效应、决策、护栏、数据处理、分群、假设和下一步建议。这个问题超出了当前证据范围。"
      : "I can retrieve this run’s effects, decision, guardrails, preparation, subgroups, assumptions, and next steps. This question is outside the available evidence.";
  }
  return {
    answer,
    supported,
    citations,
    tools: [tool],
    mode: "deterministic_evidence_retrieval",
    run_id: runId,
  };
}
