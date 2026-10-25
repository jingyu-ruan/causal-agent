import type { RctDemoScenario } from "@/lib/studies-api"

export type DemoScenarioId = RctDemoScenario | "did"

export type DemoScenario = {
  id: DemoScenarioId
  label: string
  eyebrow: string
  description: string
  action: string
  status: string
  tone: "go" | "hold" | "blocked" | "method"
}

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "go",
    label: "Guided onboarding",
    eyebrow: "RCT · rollout ready",
    description: "The threshold clears and guardrails remain safe.",
    action: "Open Go report",
    status: "Go",
    tone: "go",
  },
  {
    id: "hold",
    label: "Small lift",
    eyebrow: "RCT · keep collecting",
    description: "The result is valid, but the frozen minimum effect is not met.",
    action: "Open Hold report",
    status: "Hold",
    tone: "hold",
  },
  {
    id: "insufficient_evidence",
    label: "Broken grain",
    eyebrow: "Evidence gate · blocked",
    description: "A duplicate unit stops estimation before a misleading decision.",
    action: "Open blocked report",
    status: "Insufficient evidence",
    tone: "blocked",
  },
  {
    id: "did",
    label: "Regional rollout",
    eyebrow: "DiD · event study",
    description: "A panel analysis with pre-trend checks and a readable event-study view.",
    action: "Open DiD report",
    status: "Method showcase",
    tone: "method",
  },
]

export function getDemoScenario(id: string | null | undefined): DemoScenario {
  return DEMO_SCENARIOS.find((scenario) => scenario.id === id) ?? DEMO_SCENARIOS[0]
}
