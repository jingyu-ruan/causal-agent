# Causal Agent on Sites

This is the Vinext/Cloudflare Worker deployment source for the Capstone research
workspace. The hosting identity is in `.openai/hosting.json`. Preserve the
starter's Sites Vite integration and scripts when changing the deployment.

The canonical interface lives in `../frontend`. Synchronize it with
`python scripts/sync_sites_frontend.py` from the repository root. The script
preserves `worker/` and the hosting configuration.

The Worker proxies `/backend` to the existing Python analysis service. The
fixed-seed synthetic generator supplies demo inputs only; Python performs the
cleaning, diagnostics, causal estimates, and decision rules. The generator
includes stable dimensions for report drilldowns. The reference routes provide
Go, Hold, and a deliberate duplicate-unit evidence gate, plus a DiD event study.

Run `node --test tests/*.test.mjs` and `node node_modules/typescript/bin/tsc --noEmit`
for checks. Use the Sites plugin's install, build, source, and archive helpers
for publishing. The Site starts with private access.
