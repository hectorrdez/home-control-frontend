# Home Control (frontend)

Private home panel for the home-control stack: a 3D house view with device control and telemetry.
Built with React 19, Vite, Tailwind 4 and Playwright.

## Scripts

- `npm run dev` - Vite dev server.
- `npm run build` - typecheck and production build.
- `npm run lint` - oxlint.
- `npx playwright test` - E2E specs (`e2e/specs`), served on port 5174.
- `node .claude/scripts/test.cjs` - full gate (typecheck, lint, build, E2E).

## Environment variables

- `VITE_API_URL` - backend base URL (empty = same origin).
- `VITE_API_TOKEN` - bearer token sent on every `/api` call.
- `VITE_API_MODE` - `live` or `mock`. Unset: `mock` in dev and Playwright, `live` in production builds (the mock is never in the prod bundle).
- `VITE_PROXY_TARGET` - backend the Vite dev proxy forwards `/api` to (default `http://localhost:3003`).

Mock scenarios (dev/Playwright, `?mock=`): `default`, `empty`, `error`, `slow`, `action-error`, `stream-drop`, `offline`, `unauthorized`, `no-history`. `?seed=<n>` changes the generated data.

## Design

- Rules: `.claude/DESIGN.md`.
- Reference: `design/stitch/` (open the `code.html` files in a browser).
