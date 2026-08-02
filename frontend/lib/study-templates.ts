import type { StudyDesignInput } from "@/lib/studies-api"

export type StudyTemplate = {
  id: "onboarding" | "game-rollout"
  label: string
  eyebrow: string
  description: string
  design: StudyDesignInput
}

export const STUDY_TEMPLATES: StudyTemplate[] = [
  {
    id: "onboarding",
    label: "Onboarding A/B test",
    eyebrow: "Product · randomized",
    description: "Evaluate a guided setup flow against the current onboarding experience.",
    design: {
      name: "Guided onboarding impact review",
      mode: "prospective",
      business_question: "Should we roll out guided onboarding to all eligible new users?",
      hypothesis: "Guided onboarding increases activation by helping new users reach first value faster.",
      population: "Eligible new users during the enrollment window",
      intervention: "Guided onboarding with a personalized setup checklist",
      comparison: "Current onboarding experience",
      primary_metric: "activated_within_7d",
      metric_type: "binary",
      success_threshold: 0.01,
      guardrails: [
        { name: "support_contact_rate", direction: "increase", tolerance: 0.002 },
      ],
      design_type: "rct",
      randomization_unit: "user_id",
      baseline_rate: 0.2,
      mde: 0.01,
      alpha: 0.05,
      power: 0.8,
      allocation_treatment: 0.5,
      traffic_per_day: 5000,
      metric_window_days: 7,
    },
  },
  {
    id: "game-rollout",
    label: "Game server rollout",
    eyebrow: "Game · phased intervention",
    description: "Review a server-level feature rollout while checking pre-trends and stability guardrails.",
    design: {
      name: "New-player reward rollout",
      mode: "prospective",
      business_question: "Should the new-player reward be expanded to the remaining servers?",
      hypothesis: "The reward improves early progression and increases D7 retention without harming monetization or stability.",
      population: "New players on eligible servers",
      intervention: "New-player mission reward enabled at the server level",
      comparison: "Comparable servers that retain the current reward",
      primary_metric: "d7_retention_rate",
      metric_type: "binary",
      success_threshold: 0.01,
      guardrails: [
        { name: "d7_payer_rate", direction: "decrease", tolerance: 0.005 },
        { name: "crash_rate", direction: "increase", tolerance: 0.001 },
      ],
      design_type: "did",
      randomization_unit: "server_id",
      baseline_rate: 0.28,
      mde: 0.01,
      alpha: 0.05,
      power: 0.8,
      allocation_treatment: 0.5,
      traffic_per_day: 8000,
      metric_window_days: 7,
      treatment_start: "2026-09-01",
      minimum_pre_periods: 4,
      notes: "Requires multiple pre-intervention periods and stable comparison servers.",
    },
  },
]

export const EMPTY_STUDY: StudyDesignInput = {
  name: "",
  mode: "prospective",
  business_question: "",
  hypothesis: "",
  population: "",
  intervention: "",
  comparison: "",
  primary_metric: "",
  metric_type: "binary",
  success_threshold: 0.01,
  guardrails: [],
  design_type: "rct",
  randomization_unit: "user_id",
  baseline_rate: 0.1,
  mde: 0.01,
  alpha: 0.05,
  power: 0.8,
  allocation_treatment: 0.5,
  traffic_per_day: 1000,
  metric_window_days: 7,
}

export function cloneTemplate(id: string): StudyDesignInput {
  const template = STUDY_TEMPLATES.find((item) => item.id === id)
  const source = template?.design ?? EMPTY_STUDY
  return JSON.parse(JSON.stringify(source)) as StudyDesignInput
}
