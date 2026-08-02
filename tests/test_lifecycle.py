from __future__ import annotations

import numpy as np
import pandas as pd
import pytest
from pydantic import ValidationError

from causal_agent.lifecycle import (
    AnalysisOptions,
    ColumnMapping,
    DecisionStatus,
    DiagnosticStatus,
    MetricKind,
    StudyDesignArtifact,
    StudyDesignRequest,
    TransformationLogEntry,
    analyze_study,
    create_study_design,
)


def _continuous_rct_request(*, cuped: bool = False) -> StudyDesignRequest:
    return StudyDesignRequest(
        title="Onboarding experiment",
        business_question="Does guided onboarding improve activation without hurting latency?",
        hypothesis="Guidance increases activation by at least 0.5 points.",
        design_type="randomized_ab",
        population="Eligible new users",
        unit="user_id",
        intervention="Guided onboarding",
        comparator="Current onboarding",
        primary_metric={
            "name": "activation_score",
            "kind": "continuous",
            "direction": "higher_is_better",
            "minimum_effect": 0.5,
        },
        guardrails=(
            {
                "name": "latency",
                "kind": "continuous",
                "direction": "lower_is_better",
                "harm_tolerance": 0.4,
            },
        ),
        observation_window_days=7,
        expected_daily_units=100,
        notes="Primary metric is measured seven days after assignment.",
        baseline_value=10.0,
        outcome_standard_deviation=1.0,
        cuped_covariate="pre_score" if cuped else None,
        cuped_expected_correlation=0.7 if cuped else None,
    )


def _continuous_rct_data(n_per_group: int = 200) -> pd.DataFrame:
    rng = np.random.default_rng(20250802)
    total = n_per_group * 2
    group = np.array(["control"] * n_per_group + ["treatment"] * n_per_group)
    pre = rng.normal(size=total)
    outcome = 10.0 + pre + rng.normal(scale=0.3, size=total)
    outcome += (group == "treatment") * 1.0
    latency = 5.0 + rng.normal(scale=0.2, size=total)
    return pd.DataFrame(
        {
            "id": np.arange(total),
            "group": group,
            "outcome": outcome,
            "latency_ms": latency,
            "pre": pre,
        }
    )


def _rct_mapping(*, cuped: bool = False) -> ColumnMapping:
    return ColumnMapping(
        unit_col="id",
        treatment_col="group",
        metric_cols={"activation_score": "outcome", "latency": "latency_ms"},
        covariate_cols={"pre_score": "pre"} if cuped else {},
    )


def _did_request() -> StudyDesignRequest:
    return StudyDesignRequest(
        title="Regional rollout",
        business_question="Did the regional rollout improve the target outcome?",
        hypothesis="The rollout increases the outcome by at least one point.",
        design_type="difference_in_differences",
        population="Eligible regions",
        unit="region_id",
        intervention="New product rollout",
        comparator="Business as usual",
        primary_metric={
            "name": "outcome",
            "kind": "continuous",
            "direction": "higher_is_better",
            "minimum_effect": 1.0,
        },
        estimand="att",
        observation_window_days=7,
        treatment_start=5,
        minimum_pre_periods=3,
    )


def _did_data(*, non_parallel_slope: float = 0.0) -> pd.DataFrame:
    rng = np.random.default_rng(20250802)
    rows: list[dict[str, float | int | str]] = []
    for unit in range(40):
        group = "treatment" if unit < 20 else "control"
        for period in range(10):
            outcome = 10.0 + 0.2 * unit + 0.3 * period
            if group == "treatment":
                outcome += non_parallel_slope * period
                if period >= 5:
                    outcome += 2.0
            outcome += rng.normal(scale=0.2)
            rows.append({"unit": unit, "period": period, "group": group, "outcome": outcome})
    return pd.DataFrame(rows)


def _did_mapping() -> ColumnMapping:
    return ColumnMapping(
        unit_col="unit",
        treatment_col="group",
        time_col="period",
        metric_cols={"outcome": "outcome"},
    )


def _diagnostic(result, code: str):
    return next(item for item in result.diagnostics if item.code == code)


def test_design_compilation_is_deterministic_frozen_and_serializable() -> None:
    request = _continuous_rct_request(cuped=True)

    first = create_study_design(request)
    second = create_study_design(request)

    assert first == second
    assert first.study_id.startswith("study_")
    assert first.design.is_frozen is True
    assert first.design.required_total_sample_size is not None
    assert first.design.expected_daily_units == 100
    assert first.design.estimated_duration_days == 1
    assert len(first.design.spec_hash) == 64
    assert first.contract.hypothesis.startswith("Guidance")
    assert first.contract.observation_window_days == 7
    assert first.contract.notes.startswith("Primary metric")
    assert [event.sequence for event in first.trace] == [1, 2, 3, 4]
    assert {field.role for field in first.data_contract.fields} >= {
        "unit",
        "treatment",
        "metric",
        "covariate",
    }
    assert StudyDesignArtifact.model_validate_json(first.model_dump_json()) == first
    with pytest.raises(ValidationError):
        first.design.alpha = 0.1
    with pytest.raises(TypeError):
        first.trace[2].details["tampered"] = True
    with pytest.raises(ValidationError):
        StudyDesignRequest.model_validate({**request.model_dump(), "ignored_option": True})


def test_did_design_declares_unit_time_contract() -> None:
    artifact = create_study_design(_did_request())

    assert artifact.design.design_type.value == "difference_in_differences"
    assert artifact.design.required_total_sample_size is None
    assert artifact.design.treatment_start == 5
    assert artifact.contract.estimand.value == "att"
    assert artifact.data_contract.expected_grain == "one row per region_id x time period"
    assert any(field.role == "time" for field in artifact.data_contract.fields)
    assert (
        StudyDesignRequest.model_validate_json(_did_request().model_dump_json()) == _did_request()
    )


@pytest.mark.parametrize(
    "field",
    [
        "baseline_value",
        "outcome_standard_deviation",
        "expected_daily_units",
        "expected_control_allocation",
        "expected_treatment_allocation",
        "cuped_covariate",
        "cuped_expected_correlation",
    ],
)
def test_did_explicit_rct_only_fields_are_rejected(field: str) -> None:
    payload = _did_request().model_dump(exclude_unset=True)
    supplied_value = {
        "baseline_value": 0.2,
        "outcome_standard_deviation": 1.0,
        "expected_daily_units": 100,
        "expected_control_allocation": 0.5,
        "expected_treatment_allocation": 0.5,
        "cuped_covariate": "pre",
        "cuped_expected_correlation": 0.5,
    }[field]

    with pytest.raises(ValidationError, match="RCT-only fields"):
        StudyDesignRequest.model_validate({**payload, field: supplied_value})


def test_rct_continuous_ground_truth_cuped_guardrail_and_go_decision() -> None:
    artifact = create_study_design(_continuous_rct_request(cuped=True))
    data = _continuous_rct_data()

    result = analyze_study(data, artifact, _rct_mapping(cuped=True))

    assert result.primary_estimate is not None
    assert result.primary_estimate.effect == pytest.approx(1.0, abs=0.08)
    assert result.primary_estimate.ci_lower > 0.5
    assert result.primary_estimate.cuped_applied is True
    assert result.primary_estimate.method == "cuped_adjusted_welch_t"
    assert len(result.guardrail_estimates) == 1
    assert result.decision.status == DecisionStatus.GO
    assert _diagnostic(result, "sample_ratio_mismatch").status == DiagnosticStatus.PASS
    assert (
        result.dataset.sha256
        == analyze_study(
            data.sample(frac=1.0, random_state=7), artifact, _rct_mapping(cuped=True)
        ).dataset.sha256
    )
    assert result.dataset.transformations[-1].operation == "cuped_adjustment"
    assert result.dataset.transformations[-1].persisted is False


def test_rct_binary_effect_ci_and_p_value() -> None:
    request = StudyDesignRequest(
        title="Binary conversion experiment",
        business_question="Does treatment improve conversion?",
        hypothesis="Treatment increases conversion by at least three percentage points.",
        design_type="randomized_ab",
        population="Eligible users",
        unit="user_id",
        intervention="Treatment",
        comparator="Control",
        primary_metric={
            "name": "converted",
            "kind": "binary",
            "minimum_effect": 0.03,
        },
        observation_window_days=1,
        expected_daily_units=2_000,
        baseline_value=0.10,
    )
    artifact = create_study_design(request)
    n = 2_000
    data = pd.DataFrame(
        {
            "id": np.arange(2 * n),
            "group": ["control"] * n + ["treatment"] * n,
            "converted": [1] * 200 + [0] * 1_800 + [1] * 320 + [0] * 1_680,
        }
    )

    result = analyze_study(
        data,
        artifact,
        ColumnMapping(unit_col="id", treatment_col="group", metric_cols={"converted": "converted"}),
    )

    assert result.primary_estimate is not None
    assert result.primary_estimate.metric_kind == MetricKind.BINARY
    assert result.primary_estimate.method == "difference_in_proportions"
    assert result.primary_estimate.effect == pytest.approx(0.06)
    assert result.primary_estimate.ci_lower > 0.03
    assert result.primary_estimate.p_value < 0.001
    assert result.decision.status == DecisionStatus.GO


def test_expected_allocation_srm_is_a_blocking_failure_gate() -> None:
    artifact = create_study_design(_continuous_rct_request())
    data = _continuous_rct_data()
    data["group"] = ["control"] * 360 + ["treatment"] * 40

    result = analyze_study(data, artifact, _rct_mapping())

    assert _diagnostic(result, "sample_ratio_mismatch").status == DiagnosticStatus.FAIL
    assert result.primary_estimate is not None
    assert result.decision.status == DecisionStatus.INSUFFICIENT_EVIDENCE
    assert "sample_ratio_mismatch" in result.decision.blocking_diagnostics


def test_valid_but_inconclusive_primary_metric_returns_hold() -> None:
    artifact = create_study_design(_continuous_rct_request())
    data = _continuous_rct_data()
    treated = data["group"] == "treatment"
    data.loc[treated, "outcome"] -= 0.8

    result = analyze_study(data, artifact, _rct_mapping())

    assert result.primary_estimate is not None
    assert 0.0 < result.primary_estimate.effect < 0.5
    assert result.decision.status == DecisionStatus.HOLD


def test_harmful_guardrail_returns_stop() -> None:
    artifact = create_study_design(_continuous_rct_request())
    data = _continuous_rct_data()
    treated = data["group"] == "treatment"
    data.loc[treated, "latency_ms"] += 1.0

    result = analyze_study(data, artifact, _rct_mapping())

    assert result.guardrail_estimates[0].ci_lower > 0.4
    assert result.decision.status == DecisionStatus.STOP


def test_transformation_log_must_match_the_analyzed_dataset() -> None:
    artifact = create_study_design(_continuous_rct_request())
    options = AnalysisOptions(
        transformation_log=(
            TransformationLogEntry(
                sequence=1,
                operation="filter_eligible_users",
                rows_before=500,
                rows_after=399,
            ),
        )
    )

    result = analyze_study(_continuous_rct_data(), artifact, _rct_mapping(), options)

    assert _diagnostic(result, "transformation_lineage").status == DiagnosticStatus.FAIL
    assert result.primary_estimate is None
    assert result.decision.status == DecisionStatus.INSUFFICIENT_EVIDENCE


def test_planned_sample_size_warning_prevents_an_early_go() -> None:
    artifact = create_study_design(_continuous_rct_request())
    data = _continuous_rct_data(n_per_group=20)
    data.loc[data["group"] == "treatment", "outcome"] += 4.0

    result = analyze_study(data, artifact, _rct_mapping())

    assert result.primary_estimate is not None
    assert result.primary_estimate.ci_lower > 0.5
    assert _diagnostic(result, "planned_sample_size").status == DiagnosticStatus.WARN
    assert result.decision.status == DecisionStatus.HOLD


def test_missing_metric_mapping_returns_a_failure_result_not_key_error() -> None:
    artifact = create_study_design(_continuous_rct_request())
    mapping = ColumnMapping(
        unit_col="id",
        treatment_col="group",
        metric_cols={"activation_score": "outcome"},
    )

    result = analyze_study(_continuous_rct_data(), artifact, mapping)

    assert _diagnostic(result, "column_mapping").status == DiagnosticStatus.FAIL
    assert result.primary_estimate is None
    assert result.decision.status == DecisionStatus.INSUFFICIENT_EVIDENCE


def test_non_finite_metric_is_a_failure_result_not_an_output_validation_crash() -> None:
    artifact = create_study_design(_continuous_rct_request())
    data = _continuous_rct_data()
    data.loc[0, "outcome"] = np.inf

    result = analyze_study(data, artifact, _rct_mapping())

    assert _diagnostic(result, "finite_metric_values").status == DiagnosticStatus.FAIL
    assert result.primary_estimate is None
    assert result.decision.status == DecisionStatus.INSUFFICIENT_EVIDENCE


@pytest.mark.parametrize(
    ("mutation", "expected_code"),
    [
        (lambda frame: frame.assign(id=lambda value: [0] * len(value)), "unit_grain"),
        (
            lambda frame: frame.assign(
                outcome=lambda value: value["outcome"].mask(value.index == 0)
            ),
            "missing_required_values",
        ),
    ],
)
def test_rct_invalid_grain_or_missing_values_never_produces_a_decision(
    mutation, expected_code: str
) -> None:
    artifact = create_study_design(_continuous_rct_request())
    result = analyze_study(mutation(_continuous_rct_data()), artifact, _rct_mapping())

    assert _diagnostic(result, expected_code).status == DiagnosticStatus.FAIL
    assert result.primary_estimate is None
    assert result.decision.status == DecisionStatus.INSUFFICIENT_EVIDENCE


def test_invalid_binary_outcome_is_rejected_instead_of_coerced() -> None:
    request = StudyDesignRequest(
        title="Binary validation",
        business_question="Is the binary outcome improved?",
        hypothesis="Treatment increases the binary outcome.",
        design_type="randomized_ab",
        population="Users",
        unit="user",
        intervention="Treatment",
        comparator="Control",
        primary_metric={"name": "outcome", "kind": "binary", "minimum_effect": 0.1},
        observation_window_days=1,
        expected_daily_units=40,
        baseline_value=0.2,
    )
    artifact = create_study_design(request)
    data = pd.DataFrame(
        {
            "id": range(40),
            "group": ["control"] * 20 + ["treatment"] * 20,
            "outcome": [0, 1] * 19 + [2, 0],
        }
    )

    result = analyze_study(
        data,
        artifact,
        ColumnMapping(unit_col="id", treatment_col="group", metric_cols={"outcome": "outcome"}),
    )

    assert _diagnostic(result, "binary_metric_values").status == DiagnosticStatus.FAIL
    assert result.primary_estimate is None
    assert result.decision.status == DecisionStatus.INSUFFICIENT_EVIDENCE


def test_did_ground_truth_twfe_clustered_se_event_study_and_go() -> None:
    artifact = create_study_design(_did_request())

    result = analyze_study(_did_data(), artifact, _did_mapping())

    assert result.primary_estimate is not None
    assert result.primary_estimate.method == "two_way_fixed_effects_unit_clustered_se"
    assert result.primary_estimate.effect == pytest.approx(2.0, abs=0.12)
    assert result.primary_estimate.ci_lower > 1.0
    assert result.primary_estimate.details["cluster_degrees_freedom"] == 39
    assert len(result.event_study) == 10
    assert sum(point.is_reference for point in result.event_study) == 1
    assert _diagnostic(result, "parallel_trends").status == DiagnosticStatus.PASS
    assert result.decision.status == DecisionStatus.GO


def test_did_nonparallel_pretrend_blocks_causal_decision() -> None:
    artifact = create_study_design(_did_request())

    result = analyze_study(_did_data(non_parallel_slope=1.0), artifact, _did_mapping())

    pretrend = _diagnostic(result, "parallel_trends")
    assert pretrend.status == DiagnosticStatus.FAIL
    assert pretrend.details["p_value"] < 0.05
    assert result.primary_estimate is not None
    assert result.decision.status == DecisionStatus.INSUFFICIENT_EVIDENCE
    assert "parallel_trends" in result.decision.blocking_diagnostics


def test_did_without_time_group_overlap_is_not_identified() -> None:
    artifact = create_study_design(_did_request())
    data = _did_data()
    data = data[~((data["group"] == "control") & (data["period"] >= 5))].copy()

    result = analyze_study(data, artifact, _did_mapping())

    assert _diagnostic(result, "time_group_overlap").status == DiagnosticStatus.FAIL
    assert _diagnostic(result, "identification_rank").status == DiagnosticStatus.FAIL
    assert result.primary_estimate is None
    assert result.decision.status == DecisionStatus.INSUFFICIENT_EVIDENCE


def test_did_unparseable_string_periods_are_rejected() -> None:
    artifact = create_study_design(_did_request())
    data = _did_data()
    data["period"] = data["period"].map(lambda value: f"period-{value}")

    result = analyze_study(data, artifact, _did_mapping())

    assert _diagnostic(result, "time_values").status == DiagnosticStatus.FAIL
    assert result.primary_estimate is None
    assert result.decision.status == DecisionStatus.INSUFFICIENT_EVIDENCE


def test_did_duplicate_unit_time_is_a_fatal_failure_gate() -> None:
    artifact = create_study_design(_did_request())
    data = _did_data()
    data = pd.concat([data, data.iloc[[0]]], ignore_index=True)

    result = analyze_study(data, artifact, _did_mapping())

    assert _diagnostic(result, "unit_time_grain").status == DiagnosticStatus.FAIL
    assert result.primary_estimate is None
    assert result.event_study == ()
    assert result.decision.status == DecisionStatus.INSUFFICIENT_EVIDENCE


def test_artifact_rejects_tampered_design_hash_or_contract_policy_mismatch() -> None:
    artifact = create_study_design(_continuous_rct_request())
    tampered_design = artifact.model_dump(mode="json")
    tampered_design["design"]["alpha"] = 0.10
    with pytest.raises(ValidationError, match="spec_hash"):
        StudyDesignArtifact.model_validate(tampered_design)

    tampered_contract = artifact.model_dump(mode="json")
    tampered_contract["contract"]["primary_metric"]["minimum_effect"] = 0.8
    with pytest.raises(ValidationError, match="primary metric"):
        StudyDesignArtifact.model_validate(tampered_contract)

    bypassed_design = artifact.design.model_copy(update={"alpha": 0.10})
    bypassed_artifact = artifact.model_copy(update={"design": bypassed_design})
    with pytest.raises(ValidationError, match="spec_hash"):
        analyze_study(_continuous_rct_data(), bypassed_artifact, _rct_mapping())
