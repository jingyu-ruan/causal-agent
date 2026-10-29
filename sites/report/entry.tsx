import { createRoot } from "react-dom/client";
import { StudyReport } from "../components/study-report";
import { normalizeEvidence } from "../components/study-evidence";
import type { ReportDocument } from "../lib/report-export";
import type { ResearchProject } from "../lib/research-api";
import { StandaloneResearchReport } from "../components/research/research-evidence";

const dataElement = document.getElementById("report-data");
const root = document.getElementById("report-root");
if (dataElement && root) {
  const data = JSON.parse(dataElement.textContent ?? "{}") as ReportDocument;
  const research = data.study.__research_project as ResearchProject | undefined;
  createRoot(root).render(
    research ? (
      <StandaloneResearchReport
        project={research}
        runId={data.study.__research_run as string | undefined}
        initialView={data.view}
      />
    ) : (
      <StudyReport
        evidence={normalizeEvidence(data.study)}
        initialView={data.view}
        standalone
      />
    ),
  );
}
