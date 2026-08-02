import { StudyDetail } from "@/components/study-detail"

export default async function StudyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <StudyDetail studyId={id} />
}
