import type { StudyRecord } from "./studies-api";

export type ReportView = {
  researchTab?: string;
  researchTruth?: boolean;
  researchAudience?: string;
  dimension?: string;
  selected?: number | null;
  reveal?: boolean;
  budget?: number;
  population?: number;
  cost?: number;
  value?: number;
};
export type ReportDocument = { study: StudyRecord; view: ReportView };
const escapeHtml = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
export function serializeReportData(data: ReportDocument) {
  return JSON.stringify(data)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}
function reportView(report: HTMLElement): ReportView {
  const state = report.querySelector<HTMLElement>("#segments")?.dataset;
  const number = (name: string) =>
    state?.[name] === undefined ? undefined : Number(state[name]);
  return {
    researchTab: report.dataset.researchTab,
    researchTruth:
      report.querySelector<HTMLElement>(".research-report-state")?.dataset
        .truth === "true",
    researchAudience: report.querySelector<HTMLElement>(
      ".research-report-state",
    )?.dataset.audience,
    dimension: report.dataset.dimension,
    selected: number("selected"),
    reveal: state?.reveal === "true",
    budget: number("budget"),
    population: number("population"),
    cost: number("cost"),
    value: number("value"),
  };
}
function reportStyles() {
  const embedded = document.getElementById("report-styles");
  if (embedded) return embedded.textContent ?? "";
  return Array.from(document.styleSheets)
    .flatMap((sheet) => {
      try {
        return Array.from(sheet.cssRules)
          .filter((rule) => rule.type !== CSSRule.IMPORT_RULE)
          .map((rule) => rule.cssText);
      } catch {
        return [];
      }
    })
    .join("\n");
}

// Keep the same typography when a downloaded report is opened offline.
async function reportFontStyles() {
  const faces = await Promise.all(
    ["inter", "geist"].flatMap((family) =>
      ["latin", "latin-ext"].map(async (subset) => {
        const response = await fetch(
          `/fonts/${family}-${subset}-variable.woff2`,
        );
        if (!response.ok)
          throw new Error(
            "Report fonts could not be loaded. Please retry the export.",
          );
        const bytes = new Uint8Array(await response.arrayBuffer());
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 8192) {
          binary += String.fromCharCode(
            ...bytes.subarray(offset, offset + 8192),
          );
        }
        const range =
          subset === "latin-ext"
            ? "unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF;"
            : "";
        return `@font-face{font-family:"${family === "inter" ? "Inter" : "Geist"} Variable";font-style:normal;font-weight:100 900;font-display:swap;src:url(data:font/woff2;base64,${btoa(binary)}) format("woff2");${range}}`;
      }),
    ),
  );
  return faces.join("\n");
}
export async function createInteractiveReportHtml(
  report: HTMLElement,
  study: StudyRecord,
  title: string,
): Promise<string> {
  let runtime = document.getElementById("report-runtime")?.textContent;
  if (!runtime) {
    const response = await fetch("/report-runtime.js", { cache: "no-cache" });
    if (!response.ok)
      throw new Error(
        "The HTML report runtime could not be loaded. Please retry the export.",
      );
    runtime = await response.text();
  }
  const snapshot = report.cloneNode(true) as HTMLElement;
  snapshot
    .querySelectorAll(".report-actions")
    .forEach((element) => element.remove());
  const data: ReportDocument = { study, view: reportView(report) };
  const standalone = `html{color-scheme:light}body{margin:0;background:var(--background);color:var(--foreground);font-family:var(--font-interface)}.decision-report{max-width:1050px;margin:0 auto;border:0;border-radius:0}.report-contents{top:24px}@media print{.decision-report{max-width:none}}`;
  const fonts = document.getElementById("report-styles")
    ? ""
    : await reportFontStyles();
  let runtimeStyles = "";
  if (!document.getElementById("report-styles")) {
    const response = await fetch("/report-runtime.css");
    if (!response.ok)
      throw new Error(
        "Report control styles could not be loaded. Please retry the export.",
      );
    runtimeStyles = await response.text();
  }
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style id="report-styles">${(reportStyles() + "\n" + runtimeStyles + "\n" + fonts + "\n" + standalone).replace(/<\/style/gi, "<\\/style")}</style></head><body><main id="report-root">${snapshot.outerHTML}</main><noscript>Enable JavaScript to use the report controls.</noscript><script type="application/json" id="report-data">${serializeReportData(data)}</script><script id="report-runtime">${runtime.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;
}
export function downloadReportFile(
  content: string,
  filename: string,
  type: string,
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
