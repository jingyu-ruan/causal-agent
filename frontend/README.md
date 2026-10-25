# Causal Agent frontend

Next.js 16 and React 19 interface for a causal research workspace.

Run `npm run dev` with `NEXT_PUBLIC_API_URL=http://localhost:8000`, or launch
both services using `python start.py` from the repository root. Dependencies must
already be installed in the project's virtual environment and `frontend`.

- `npm run build`: production build.
- `npm run test:unit`: column-mapping regression checks.
- `node node_modules/typescript/bin/tsc --noEmit`: type checking.

`/studies/replay` runs a real study with synthetic input and explicit preparation
review. It uses the same statistical endpoints as the conversational workbench.
See `../docs/frontend-design.md` for design references and presentation routes.

The Sites deployment is in `../sites`. Synchronize application changes using
`python scripts/sync_sites_frontend.py` from the repository root, then follow the
Sites plugin build and publishing workflow.
