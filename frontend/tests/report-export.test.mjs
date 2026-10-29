import assert from "node:assert/strict";
import test from "node:test";
import { createInteractiveReportHtml } from "../lib/report-export.ts";

function browserFixture(t, { embedded = null, fontOk = true } = {}) {
  const requests = [];
  const values = {
    CSSRule: { IMPORT_RULE: 3 },
    document: {
      getElementById(id) {
        if (id === "report-runtime")
          return { textContent: "window.reportReady = true" };
        if (id === "report-styles" && embedded)
          return { textContent: embedded };
        return null;
      },
      styleSheets: [
        {
          cssRules: [
            {
              type: 1,
              cssText: "body { font-family: var(--font-interface); }",
            },
          ],
        },
      ],
    },
    fetch: async (url) => {
      requests.push(url);
      return {
        ok: fontOk,
        text: async () => ".exported-control{border-radius:18px}",
        arrayBuffer: async () => Uint8Array.from([0, 1, 2, 255]).buffer,
      };
    },
  };
  for (const [key, value] of Object.entries(values)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    });
  }
  return requests;
}

const report = {
  dataset: { dimension: "platform" },
  querySelector: () => ({ dataset: { selected: "1", reveal: "false" } }),
  cloneNode: () => ({
    querySelectorAll: () => [],
    outerHTML: '<article class="decision-report">Report</article>',
  }),
};

test("downloaded reports embed both font families and preserve safe interactive state", async (t) => {
  const requests = browserFixture(t);
  const html = await createInteractiveReportHtml(
    report,
    { id: "study_a", name: "</script><script>unsafe()</script>" },
    "A < B",
  );
  assert.deepEqual(
    requests.sort(),
    [
      "/report-runtime.css",
      "/fonts/geist-latin-ext-variable.woff2",
      "/fonts/geist-latin-variable.woff2",
      "/fonts/inter-latin-ext-variable.woff2",
      "/fonts/inter-latin-variable.woff2",
    ].sort(),
  );
  assert.equal(
    (html.match(/data:font\/woff2;base64,AAEC\/w==/g) ?? []).length,
    4,
  );
  assert.match(html, /font-family:"Inter Variable"/);
  assert.match(html, /exported-control/);
  assert.match(html, /font-family:"Geist Variable"/);
  assert.match(html, /<title>A &lt; B<\/title>/);
  const data = JSON.parse(
    html.match(
      /<script type="application\/json" id="report-data">(.*?)<\/script>/s,
    )[1],
  );
  assert.equal(data.view.dimension, "platform");
  assert.equal(data.view.selected, 1);
  assert.equal(data.study.name, "</script><script>unsafe()</script>");
  assert.doesNotMatch(html, /<script>unsafe\(\)<\/script>/);
});

test("re-exporting an offline report reuses its embedded fonts without network requests", async (t) => {
  const requests = browserFixture(t, {
    embedded:
      '@font-face{font-family:"Inter Variable";src:url(data:font/woff2;base64,AAEC/w==)}',
  });
  const html = await createInteractiveReportHtml(
    report,
    { id: "study_a" },
    "Report",
  );
  assert.deepEqual(requests, []);
  assert.match(html, /data:font\/woff2;base64,AAEC\/w==/);
});

test("missing report fonts surface an export error", async (t) => {
  browserFixture(t, { fontOk: false });
  await assert.rejects(
    createInteractiveReportHtml(report, { id: "study_a" }, "Report"),
    /Report fonts could not be loaded/,
  );
});
