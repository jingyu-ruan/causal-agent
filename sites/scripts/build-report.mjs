import { build } from "esbuild";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await build({
  absWorkingDir: root,
  entryPoints: ["report/entry.tsx"],
  outfile: "public/report-runtime.js",
  bundle: true,
  minify: true,
  format: "iife",
  platform: "browser",
  alias: { "next/navigation": resolve(root, "report/navigation.ts") },
  target: ["es2022"],
  jsx: "automatic",
  tsconfig: resolve(root, "tsconfig.json"),
  define: {
    "process.env.NEXT_RUNTIME": "undefined",
    "process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS": "false",
    "process.env.NEXT_PUBLIC_RESEARCH_ON_DEVICE": '"true"',
    "process.env.NODE_ENV": '"production"',
    "process.env.NEXT_PUBLIC_API_URL": '""',
  },
  legalComments: "inline",
  logLevel: "info",
});
