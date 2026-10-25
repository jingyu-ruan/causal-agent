import { redirect } from "next/navigation"

export default function LegacyObservationalPage() {
  redirect("/studies/new?mode=retrospective&template=game-rollout")
}
