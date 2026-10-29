"use client";

import { useEffect, useState } from "react";
import Link from "@/components/page-link";
import { ArrowLeft, LoaderCircle } from "lucide-react";

import { useBackendReadiness } from "@/components/backend-readiness";
import { normalizeEvidence } from "@/components/study-evidence";
import { StudyReport } from "@/components/study-report";
import { Button } from "@/components/ui/button";
import { getStudy, type StudyRecord } from "@/lib/studies-api";

export function StudyDetail({ studyId }: { studyId: string }) {
  const readiness = useBackendReadiness();
  const [study, setStudy] = useState<StudyRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (readiness.state !== "ready") return;
    let active = true;
    getStudy(studyId)
      .then((value) => {
        if (active) setStudy(value);
      })
      .catch((caught) => {
        if (active)
          setError(
            caught instanceof Error ? caught.message : "Could not load study",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [readiness.state, studyId]);

  if (readiness.state !== "ready" || loading)
    return (
      <div className="grid min-h-[65vh] place-items-center text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          {readiness.state === "ready"
            ? "Loading evidence record…"
            : "Waiting for analysis engine…"}
        </span>
      </div>
    );
  if (error || !study)
    return (
      <div className="mx-auto max-w-xl px-6 py-24 text-center">
        <p className="text-lg font-semibold">Study unavailable</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {error ?? "No record was returned."}
        </p>
        <Button asChild variant="outline" className="mt-6 rounded-full">
          <Link href="/studies">
            <ArrowLeft /> Back to studies
          </Link>
        </Button>
      </div>
    );

  const evidence = normalizeEvidence(study);
  return (
    <div className="page-shell report-page">
      <Link href="/studies" className="report-back-link">
        <ArrowLeft size={14} />
        Back to study library
      </Link>
      <StudyReport evidence={evidence} />
    </div>
  );
}
