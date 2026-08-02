import { redirect } from "next/navigation"

export default function LegacyAnalysisPage() {
  redirect("/studies/new?mode=retrospective")
}
