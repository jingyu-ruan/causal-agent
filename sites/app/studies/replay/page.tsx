import { DemoReplay } from "@/components/demo-replay"

export const metadata = { title: "Live demonstration" }

export default async function DemonstrationPage({ searchParams }: { searchParams: Promise<{ method?: string }> }) {
  const { method } = await searchParams
  const initialMethod = method === "did" ? "did" : "rct"
  return <DemoReplay key={initialMethod} initialMethod={initialMethod} />
}
